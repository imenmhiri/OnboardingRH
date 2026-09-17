import { describe, expect, it } from 'vitest';
import { generateSatisfactionSummaries, type GenerateSatisfactionSummariesPorts } from './generate-satisfaction-summaries';
import type { RosterDirectory } from '@/application/ports/roster-directory';
import type { SatisfactionSummarizer, SatisfactionSummaryRequest } from '@/application/ports/satisfaction-summarizer';
import type { SatisfactionSummaryRecord, SatisfactionSummaryRepository } from '@/application/ports/satisfaction-summary-repository';

const SITE_LILLE = 'site-lille';

function makePorts(overrides?: {
  summarize?: (request: SatisfactionSummaryRequest) => ReturnType<SatisfactionSummarizer['summarize']>;
}): GenerateSatisfactionSummariesPorts & { readonly upserted: SatisfactionSummaryRecord[]; readonly summarizeCalls: SatisfactionSummaryRequest[] } {
  const upserted: SatisfactionSummaryRecord[] = [];
  const summarizeCalls: SatisfactionSummaryRequest[] = [];

  const roster: RosterDirectory = {
    async rosterFor() {
      return { names: ['Alice Arrivante'], emails: [], teamLabels: ['Atelier Nord', 'Lille'] };
    },
  };

  const summarizer: SatisfactionSummarizer = {
    async summarize(request) {
      summarizeCalls.push(request);
      if (overrides?.summarize) return overrides.summarize(request);
      return { kind: 'generated', narrative: 'Synthese agregee de test.' };
    },
  };

  const summaries: SatisfactionSummaryRepository = {
    async upsert(record) {
      upserted.push(record);
    },
    async listByCompany() {
      return upserted;
    },
  };

  return { roster, summarizer, summaries, upserted, summarizeCalls };
}

describe('generateSatisfactionSummaries', () => {
  it('never attempts a summary below the minimum respondent threshold', async () => {
    const ports = makePorts();
    const outcomes = await generateSatisfactionSummaries(ports, {
      companyId: 'company-1',
      companyLabel: 'Atelier Nord',
      siteLabelById: new Map([[SITE_LILLE, 'Lille']]),
      comments: [{ respondentKey: 'person-1', siteId: SITE_LILLE, comment: 'Tout va bien.' }],
      minimumRespondents: 2,
      generatedAt: '2026-09-16T00:00:00.000Z',
    });

    expect(ports.summarizeCalls).toHaveLength(0);
    expect(ports.upserted).toHaveLength(0);
    const siteOutcome = outcomes.find((o) => o.groupKey === SITE_LILLE);
    expect(siteOutcome?.status).toBe('below_threshold');
  });

  it('generates and persists a summary at or above the threshold, from anonymized text only', async () => {
    const ports = makePorts();
    const outcomes = await generateSatisfactionSummaries(ports, {
      companyId: 'company-1',
      companyLabel: 'Atelier Nord',
      siteLabelById: new Map([[SITE_LILLE, 'Lille']]),
      comments: [
        { respondentKey: 'person-2', siteId: SITE_LILLE, comment: "Alice Arrivante a trouve l'accueil chaleureux a Lille." },
        { respondentKey: 'person-3', siteId: SITE_LILLE, comment: 'Le materiel est arrive en retard.' },
      ],
      minimumRespondents: 2,
      generatedAt: '2026-09-16T00:00:00.000Z',
    });

    const sentTexts = ports.summarizeCalls.flatMap((call) => call.anonymizedComments);
    expect(sentTexts.some((text) => text.includes('Alice'))).toBe(false);
    expect(sentTexts.some((text) => text.includes('Lille'))).toBe(false);
    expect(sentTexts.some((text) => text.includes('[personne]'))).toBe(true);

    expect(ports.upserted.some((record) => record.groupKey === SITE_LILLE && record.basedOnRespondentCount === 2)).toBe(true);
    const siteOutcome = outcomes.find((o) => o.groupKey === SITE_LILLE);
    expect(siteOutcome?.status).toBe('generated');
  });

  it('also produces a company-wide group summary aggregating every site', async () => {
    const ports = makePorts();
    const outcomes = await generateSatisfactionSummaries(ports, {
      companyId: 'company-1',
      companyLabel: 'Atelier Nord',
      siteLabelById: new Map([[SITE_LILLE, 'Lille']]),
      comments: [
        { respondentKey: 'person-4', siteId: SITE_LILLE, comment: 'Commentaire un.' },
        { respondentKey: 'person-5', siteId: SITE_LILLE, comment: 'Commentaire deux.' },
      ],
      minimumRespondents: 2,
      generatedAt: '2026-09-16T00:00:00.000Z',
    });

    const companyOutcome = outcomes.find((o) => o.groupKey === 'company');
    expect(companyOutcome?.status).toBe('generated');
  });

  it('never persists anything when the AI service is unavailable, and reports it typed', async () => {
    const ports = makePorts({
      summarize: async () => ({ kind: 'unavailable', reason: 'provider_error', detail: 'boom' }),
    });

    const outcomes = await generateSatisfactionSummaries(ports, {
      companyId: 'company-1',
      companyLabel: 'Atelier Nord',
      siteLabelById: new Map([[SITE_LILLE, 'Lille']]),
      comments: [
        { respondentKey: 'person-6', siteId: SITE_LILLE, comment: 'Commentaire un.' },
        { respondentKey: 'person-7', siteId: SITE_LILLE, comment: 'Commentaire deux.' },
      ],
      minimumRespondents: 2,
      generatedAt: '2026-09-16T00:00:00.000Z',
    });

    expect(ports.upserted).toHaveLength(0);
    const siteOutcome = outcomes.find((o) => o.groupKey === SITE_LILLE);
    expect(siteOutcome).toEqual({ groupKey: SITE_LILLE, groupLabel: 'Lille', status: 'unavailable', reason: 'provider_error' });
  });

  it('ignores empty comments when counting respondents for the threshold', async () => {
    const ports = makePorts();
    const outcomes = await generateSatisfactionSummaries(ports, {
      companyId: 'company-1',
      companyLabel: 'Atelier Nord',
      siteLabelById: new Map([[SITE_LILLE, 'Lille']]),
      comments: [
        { respondentKey: 'person-8', siteId: SITE_LILLE, comment: 'Un vrai commentaire.' },
        { respondentKey: 'person-9', siteId: SITE_LILLE, comment: '   ' },
      ],
      minimumRespondents: 2,
      generatedAt: '2026-09-16T00:00:00.000Z',
    });

    const siteOutcome = outcomes.find((o) => o.groupKey === SITE_LILLE);
    expect(siteOutcome?.status).toBe('below_threshold');
  });
  it('counts people, not comments: two answers from the same person stay below a threshold of two', async () => {
    const ports = makePorts();
    const outcomes = await generateSatisfactionSummaries(ports, {
      companyId: 'company-1',
      companyLabel: 'Atelier Nord',
      siteLabelById: new Map([[SITE_LILLE, 'Lille']]),
      comments: [
        { respondentKey: 'same-person', siteId: SITE_LILLE, comment: 'Reponse a J+7.' },
        { respondentKey: 'same-person', siteId: SITE_LILLE, comment: 'Reponse a J+30.' },
      ],
      minimumRespondents: 2,
      generatedAt: '2026-09-16T00:00:00.000Z',
    });

    expect(ports.summarizeCalls).toHaveLength(0);
    expect(outcomes.find((o) => o.groupKey === SITE_LILLE)).toMatchObject({ status: 'below_threshold', respondentCount: 1 });
  });
});
