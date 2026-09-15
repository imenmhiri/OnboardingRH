import { describe, expect, it } from 'vitest';
import { parsePlainDate } from '../scheduling/plain-date';
import { createWorkingCalendar } from '../scheduling/working-calendar';
import { planSurveys, resolveSurveyChannel } from './survey-schedule';

const d = parsePlainDate;
const calendar = createWorkingCalendar({ holidays: [d('2026-04-06'), d('2026-05-01'), d('2026-05-14')] });

describe('planSurveys', () => {
  it('planifie J+7 et J+30 en jours ouvres, feries exclus', () => {
    // Arrivee lundi 30 mars. +7 ouvres saute le lundi de Paques : jeudi 9 avril.
    const plan = planSurveys({ arrivalDate: d('2026-03-30'), endDate: null, calendar });

    expect(plan).toEqual([
      { milestone: 'day_7', scheduledOn: '2026-04-09', status: 'scheduled' },
      { milestone: 'day_30', scheduledOn: '2026-05-13', status: 'scheduled' },
    ]);
  });

  it('accepte des jalons configures autrement', () => {
    const plan = planSurveys({
      arrivalDate: d('2026-03-30'),
      endDate: null,
      calendar,
      offsets: { day_7: 5, day_30: 20 },
    });
    expect(plan.map((p) => p.scheduledOn)).toEqual(['2026-04-07', '2026-04-28']);
  });
});

describe('cas limite : fin de contrat avant J+30', () => {
  it('annule le questionnaire J+30 au lieu de l envoyer', () => {
    const plan = planSurveys({ arrivalDate: d('2026-03-30'), endDate: d('2026-04-30'), calendar });

    expect(plan[0]).toMatchObject({ milestone: 'day_7', status: 'scheduled' });
    expect(plan[1]).toEqual({
      milestone: 'day_30',
      scheduledOn: '2026-05-13',
      status: 'cancelled',
      reason: 'contract_ended_before',
    });
  });

  it('annule les deux quand le contrat s arrete avant J+7', () => {
    const plan = planSurveys({ arrivalDate: d('2026-03-30'), endDate: d('2026-04-03'), calendar });
    expect(plan.every((p) => p.status === 'cancelled')).toBe(true);
  });

  it('maintient le questionnaire quand le contrat finit le jour meme', () => {
    const plan = planSurveys({ arrivalDate: d('2026-03-30'), endDate: d('2026-05-13'), calendar });
    expect(plan[1]?.status).toBe('scheduled');
  });
});

describe('cas limite : employe sans email personnel', () => {
  it('passe par l adresse professionnelle', () => {
    expect(resolveSurveyChannel({ workEmail: 'a@societe.fr', personalEmail: null })).toEqual({
      kind: 'email',
      address: 'a@societe.fr',
      source: 'work',
    });
  });

  it('se rabat sur l adresse personnelle sans adresse professionnelle', () => {
    expect(resolveSurveyChannel({ workEmail: null, personalEmail: 'a@perso.fr' })).toMatchObject({
      source: 'personal',
    });
  });

  it('bascule sur le portail sans aucune adresse, sans abandonner le questionnaire', () => {
    expect(resolveSurveyChannel({ workEmail: null, personalEmail: null })).toEqual({ kind: 'portal_link' });
  });
});
