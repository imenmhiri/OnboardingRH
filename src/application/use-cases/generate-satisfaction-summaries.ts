import { anonymizeComment } from '@/domain/privacy/anonymize-comment';
import type { RosterDirectory } from '@/application/ports/roster-directory';
import type { SatisfactionSummarizer } from '@/application/ports/satisfaction-summarizer';
import type { SatisfactionSummaryRepository } from '@/application/ports/satisfaction-summary-repository';

/**
 * Genere (ou refuse de generer) une synthese IA anonymisee par groupe
 * (site, plus un groupe "toute la societe"), pour une societe donnee.
 *
 * C'est ce cas d'usage, jamais le port ni le composant du cockpit, qui
 * porte la regle metier du seuil : en dessous de `minimum_respondents`
 * (meme colonne que `domain/surveys/aggregation`, T-14 — aucun second seuil
 * invente ici), aucune synthese n'est meme tentee. Le modele ne voit jamais
 * un commentaire qui n'a pas d'abord ete anonymise par
 * `domain/privacy/anonymize-comment`.
 *
 * Ce cas d'usage n'est jamais appele depuis la lecture du cockpit : il
 * tourne a part (voir `run-satisfaction-summary-scan` / route dediee), pour
 * que le cockpit ne bloque jamais sur un appel IA en direct.
 */

export interface SurveyCommentSource {
  readonly siteId: string | null;
  readonly comment: string;
}

export interface GenerateSatisfactionSummariesInput {
  readonly companyId: string;
  readonly companyLabel: string;
  readonly siteLabelById: ReadonlyMap<string, string>;
  /** Commentaires des questionnaires repondus (day_7 et day_30 confondus), avec leur site. */
  readonly comments: readonly SurveyCommentSource[];
  readonly minimumRespondents: number;
  readonly generatedAt: string;
}

export type SummaryOutcome =
  | { readonly groupKey: string; readonly groupLabel: string; readonly status: 'generated'; readonly respondentCount: number }
  | { readonly groupKey: string; readonly groupLabel: string; readonly status: 'below_threshold'; readonly respondentCount: number }
  | { readonly groupKey: string; readonly groupLabel: string; readonly status: 'unavailable'; readonly reason: string };

export interface GenerateSatisfactionSummariesPorts {
  readonly roster: RosterDirectory;
  readonly summarizer: SatisfactionSummarizer;
  readonly summaries: SatisfactionSummaryRepository;
}

const COMPANY_WIDE_GROUP_KEY = 'company';

function groupComments(
  comments: readonly SurveyCommentSource[],
  siteLabelById: ReadonlyMap<string, string>,
  companyLabel: string,
): ReadonlyMap<string, { readonly label: string; readonly comments: readonly string[] }> {
  const bySite = new Map<string, string[]>();
  for (const entry of comments) {
    const key = entry.siteId ?? 'none';
    bySite.set(key, [...(bySite.get(key) ?? []), entry.comment]);
  }

  const groups = new Map<string, { readonly label: string; readonly comments: readonly string[] }>();
  for (const [siteId, siteComments] of bySite) {
    if (siteId === 'none') continue;
    const label = siteLabelById.get(siteId) ?? 'Site inconnu';
    groups.set(siteId, { label, comments: siteComments });
  }
  // Le groupe societe entiere agrege tous les commentaires, quel que soit le site.
  groups.set(COMPANY_WIDE_GROUP_KEY, {
    label: `${companyLabel} — toutes localisations`,
    comments: comments.map((entry) => entry.comment),
  });
  return groups;
}

export async function generateSatisfactionSummaries(
  ports: GenerateSatisfactionSummariesPorts,
  input: GenerateSatisfactionSummariesInput,
): Promise<readonly SummaryOutcome[]> {
  const groups = groupComments(input.comments, input.siteLabelById, input.companyLabel);
  const roster = await ports.roster.rosterFor(input.companyId);

  const outcomes: SummaryOutcome[] = [];

  for (const [groupKey, group] of groups) {
    const respondentCount = group.comments.filter((comment) => comment.trim().length > 0).length;

    if (respondentCount < input.minimumRespondents) {
      outcomes.push({ groupKey, groupLabel: group.label, status: 'below_threshold', respondentCount });
      continue;
    }

    const anonymized = group.comments
      .filter((comment) => comment.trim().length > 0)
      .map((comment) => anonymizeComment(comment, roster));

    const result = await ports.summarizer.summarize({ groupLabel: group.label, anonymizedComments: anonymized });

    if (result.kind === 'unavailable') {
      outcomes.push({ groupKey, groupLabel: group.label, status: 'unavailable', reason: result.reason });
      continue;
    }

    await ports.summaries.upsert({
      companyId: input.companyId,
      groupKey,
      summaryText: result.narrative,
      generatedAt: input.generatedAt,
      basedOnRespondentCount: respondentCount,
    });
    outcomes.push({ groupKey, groupLabel: group.label, status: 'generated', respondentCount });
  }

  return outcomes;
}
