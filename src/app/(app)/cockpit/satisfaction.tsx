import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { StatusBadge } from '@/components/ui/status';
import { aggregateByGroup, aggregateRatings } from '@/domain/surveys/aggregation';
import {
  detectJourneySignals,
  detectRecurringThemes,
  type SurveyResponse,
  type WeakSignal,
  type WeakSignalPolicy,
} from '@/domain/surveys/satisfaction';
import type { SurveyMilestone } from '@/domain/surveys/survey-schedule';
import { createSupabaseServerClient } from '@/infrastructure/supabase/server-client';
import type { JourneyRow } from './types';

interface SurveyRow {
  id: string;
  journey_id: string;
  milestone: SurveyMilestone;
}
interface ResponseRow {
  survey_id: string;
  rating: number;
  comment: string | null;
  themes: string[];
}
interface SettingsRow {
  low_rating_at_or_below: number;
  drop_at_least: number;
  recurring_theme_at_least: number;
  minimum_respondents: number;
}
interface AiSummaryRow {
  group_key: string;
  summary_text: string;
  generated_at: string;
  based_on_respondent_count: number;
}

const MILESTONE_LABEL: Record<SurveyMilestone, string> = { day_7: 'J+7', day_30: 'J+30' };

/**
 * `detectJourneySignals` ne renvoie jamais `recurring_theme` (c'est
 * `detectRecurringThemes` qui le fait, sur un tout autre périmètre), mais le
 * type `WeakSignal` reste l'union complète : le commutateur reste exhaustif
 * pour rester vrai si cela change un jour.
 */
function describeSignal(signal: WeakSignal): string {
  switch (signal.code) {
    case 'low_rating':
      return `Note ${signal.rating}/5 au ${MILESTONE_LABEL[signal.milestone]}`;
    case 'rating_drop':
      return `Satisfaction en baisse : ${signal.from}/5 → ${signal.to}/5 entre J+7 et J+30`;
    case 'recurring_theme':
      return `Thème récurrent : ${signal.theme} (${signal.occurrences} mentions)`;
  }
}

/**
 * Les seuils par défaut de la migration : filet de sécurité si une société n'a
 * pas encore de ligne `survey_settings`. En pratique le jeu de démo en pose
 * une pour chaque société ; ce repli évite seulement un écran cassé si ce
 * n'était pas le cas.
 */
const FALLBACK_POLICY: WeakSignalPolicy = { lowRatingAtOrBelow: 2, dropAtLeast: 2, recurringThemeAtLeast: 3 };
const FALLBACK_MINIMUM_RESPONDENTS = 5;

export async function SatisfactionCard({
  companyId,
  journeys,
  siteNameById,
}: {
  readonly companyId: string;
  readonly journeys: readonly JourneyRow[];
  readonly siteNameById: ReadonlyMap<string, string>;
}) {
  const journeyIds = journeys.map((journey) => journey.id);

  if (journeyIds.length === 0) {
    return (
      <Card>
        <CardHeader title="Satisfaction J+7 / J+30" description="Signaux faibles et moyennes par site." />
        <CardBody>
          <EmptyState title="Aucun parcours à examiner" description="Aucun parcours ne correspond aux filtres actuels." />
        </CardBody>
      </Card>
    );
  }

  const client = await createSupabaseServerClient();

  const [{ data: settingsRow }, { data: surveyRows, error: surveysError }, { data: aiSummaryRows }] = await Promise.all([
    client
      .from('survey_settings')
      .select('low_rating_at_or_below, drop_at_least, recurring_theme_at_least, minimum_respondents')
      .eq('company_id', companyId)
      .maybeSingle(),
    client.from('surveys').select('id, journey_id, milestone').in('journey_id', journeyIds).eq('status', 'answered'),
    // Lecture seule du cache : une synthese IA absente ou une erreur ne doit
    // jamais empecher le reste du cockpit de s'afficher (DoD T-26, "service
    // indisponible : le cockpit reste utilisable sans la synthese").
    client
      .from('ai_satisfaction_summaries')
      .select('group_key, summary_text, generated_at, based_on_respondent_count')
      .eq('company_id', companyId),
  ]);

  const aiSummaryByGroup = new Map(((aiSummaryRows ?? []) as AiSummaryRow[]).map((row) => [row.group_key, row]));

  if (surveysError) {
    return (
      <Card>
        <CardHeader title="Satisfaction J+7 / J+30" />
        <CardBody>
          <ErrorState description="Impossible de charger les questionnaires pour le moment." />
        </CardBody>
      </Card>
    );
  }

  const settings = settingsRow as SettingsRow | null;
  const policy: WeakSignalPolicy = settings
    ? {
        lowRatingAtOrBelow: settings.low_rating_at_or_below,
        dropAtLeast: settings.drop_at_least,
        recurringThemeAtLeast: settings.recurring_theme_at_least,
      }
    : FALLBACK_POLICY;
  const minimumRespondents = settings?.minimum_respondents ?? FALLBACK_MINIMUM_RESPONDENTS;

  const surveys = (surveyRows ?? []) as SurveyRow[];
  const surveyIds = surveys.map((survey) => survey.id);
  const { data: responseRows, error: responsesError } = surveyIds.length
    ? await client.from('survey_responses').select('survey_id, rating, comment, themes').in('survey_id', surveyIds)
    : { data: [] as ResponseRow[], error: null };

  if (responsesError) {
    return (
      <Card>
        <CardHeader title="Satisfaction J+7 / J+30" />
        <CardBody>
          <ErrorState description="Impossible de charger les réponses pour le moment." />
        </CardBody>
      </Card>
    );
  }

  const responses = (responseRows ?? []) as ResponseRow[];
  const surveyById = new Map(surveys.map((survey) => [survey.id, survey]));
  const journeyById = new Map(journeys.map((journey) => [journey.id, journey]));

  const responsesByJourney = new Map<string, SurveyResponse[]>();
  const allResponses: SurveyResponse[] = [];
  const groupedRatings: { groupKey: string; rating: number }[] = [];

  for (const response of responses) {
    const survey = surveyById.get(response.survey_id);
    if (!survey) continue;
    const surveyResponse: SurveyResponse = {
      milestone: survey.milestone,
      rating: response.rating,
      comment: response.comment,
      themes: response.themes,
    };
    responsesByJourney.set(survey.journey_id, [...(responsesByJourney.get(survey.journey_id) ?? []), surveyResponse]);
    allResponses.push(surveyResponse);
    const journey = journeyById.get(survey.journey_id);
    groupedRatings.push({ groupKey: journey?.site_id ?? 'none', rating: response.rating });
  }

  if (allResponses.length === 0) {
    return (
      <Card>
        <CardHeader title="Satisfaction J+7 / J+30" description="Signaux faibles et moyennes par site." />
        <CardBody>
          <EmptyState
            title="Aucune réponse pour le moment"
            description="Les questionnaires J+7 et J+30 n’ont pas encore été remplis pour les parcours sélectionnés."
          />
        </CardBody>
      </Card>
    );
  }

  const signalsByJourney = [...responsesByJourney.entries()]
    .map(([journeyId, journeyResponses]) => ({
      journey: journeyById.get(journeyId),
      signals: detectJourneySignals(journeyResponses, policy),
    }))
    .filter((entry) => entry.journey && entry.signals.length > 0);

  const siteIds = [...new Set(journeys.map((journey) => journey.site_id ?? 'none'))];
  const aggregates = aggregateByGroup(groupedRatings, siteIds, minimumRespondents);
  const companyWideAggregate = aggregateRatings(
    groupedRatings.map((entry) => entry.rating),
    minimumRespondents,
  );
  // detectRecurringThemes ne produit que des signaux « recurring_theme » ; le
  // filtre-prédicat rend ce fait visible au typage plutôt que de le supposer.
  const recurringThemes = detectRecurringThemes(allResponses, policy).filter(
    (signal): signal is Extract<WeakSignal, { code: 'recurring_theme' }> => signal.code === 'recurring_theme',
  );

  return (
    <Card>
      <CardHeader
        title="Satisfaction J+7 / J+30"
        description="Signaux faibles remontés individuellement, moyennes publiées seulement au-dessus du seuil d’anonymat."
      />
      <CardBody className="space-y-6">
        <div>
          <h3 className="mb-2 text-sm font-medium text-text">Signaux faibles</h3>
          {signalsByJourney.length === 0 ? (
            <p className="text-sm text-text-muted">Aucun signal faible détecté pour le moment.</p>
          ) : (
            <ul className="space-y-2">
              {signalsByJourney.map(({ journey, signals }) => (
                <li key={journey!.id} className="rounded-[var(--radius)] border border-border px-3 py-2">
                  <p className="mb-1 text-sm font-medium text-text">{journey!.employee_name}</p>
                  <ul className="space-y-1">
                    {signals.map((signal, index) => (
                      <li key={index} className="flex items-center gap-2 text-sm text-text-muted">
                        <StatusBadge tone="warning" label="Signal faible" />
                        {describeSignal(signal)}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="mb-2 text-sm font-medium text-text">Moyennes par site</h3>
          <ul className="space-y-1.5">
            {siteIds.map((siteId) => {
              const aggregate = aggregates.get(siteId);
              const siteName = siteId === 'none' ? 'Site non renseigné' : (siteNameById.get(siteId) ?? 'Site inconnu');
              return (
                <li key={siteId} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-text">{siteName}</span>
                  {aggregate?.kind === 'available' ? (
                    <span className="text-text-muted">
                      {aggregate.average}/5 · {aggregate.respondents} réponses
                    </span>
                  ) : aggregate?.kind === 'too_few' ? (
                    <span className="text-text-subtle">Trop peu de réponses pour publier une moyenne</span>
                  ) : (
                    <span className="text-text-subtle">Aucune réponse</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {recurringThemes.length > 0 ? (
          <div>
            <h3 className="mb-2 text-sm font-medium text-text">Thèmes qui reviennent</h3>
            <ul className="flex flex-wrap gap-2">
              {recurringThemes.map((theme) => (
                <li
                  key={theme.theme}
                  className="rounded-full border border-border bg-surface-sunken px-2.5 py-1 text-xs text-text-muted"
                >
                  {theme.theme} · {theme.occurrences} mentions
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div>
          <h3 className="mb-2 text-sm font-medium text-text">Synthèse IA des verbatims</h3>
          <ul className="space-y-2">
            {[
              { key: 'company', label: 'Toute la société', aggregate: companyWideAggregate },
              ...siteIds
                .filter((siteId) => siteId !== 'none')
                .map((siteId) => ({
                  key: siteId,
                  label: siteNameById.get(siteId) ?? 'Site inconnu',
                  aggregate: aggregates.get(siteId),
                })),
            ].map(({ key, label, aggregate }) => {
              const cached = aiSummaryByGroup.get(key);
              return (
                <li key={key} className="rounded-[var(--radius)] border border-border px-3 py-2">
                  <p className="mb-1 text-sm font-medium text-text">{label}</p>
                  {aggregate?.kind !== 'available' ? (
                    <p className="text-sm text-text-subtle">
                      {aggregate?.kind === 'too_few'
                        ? 'Trop peu de réponses pour produire une synthèse.'
                        : 'Aucune réponse pour le moment.'}
                    </p>
                  ) : cached ? (
                    <div>
                      <div className="mb-1 flex items-center gap-2">
                        <StatusBadge tone="progress" label="Synthèse générée automatiquement" />
                        <span className="text-xs text-text-subtle">
                          Basée sur {cached.based_on_respondent_count} répondants · agrégée, pas un fait individuel
                        </span>
                      </div>
                      <p className="text-sm text-text-muted">{cached.summary_text}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-text-subtle">
                      Synthèse pas encore disponible pour ce groupe (génération à venir ou service indisponible).
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </CardBody>
    </Card>
  );
}
