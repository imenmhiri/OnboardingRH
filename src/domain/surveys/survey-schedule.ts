import { addWorkingDays, type WorkingCalendar } from '../scheduling/working-calendar';
import { comparePlainDates, type PlainDate } from '../scheduling/plain-date';

/**
 * Planifie les questionnaires de satisfaction d'un parcours. Un questionnaire
 * qui ne peut plus avoir de sens est annule a la planification, pas envoye
 * puis ignore : demander a quelqu'un parti depuis dix jours comment se passe
 * son premier mois n'est pas une mesure, c'est du bruit — et une maladresse.
 */

export const SURVEY_MILESTONES = ['day_7', 'day_30'] as const;

export type SurveyMilestone = (typeof SURVEY_MILESTONES)[number];

/** Les jalons du cahier des charges, en jours ouvres apres l'arrivee. */
export const DEFAULT_SURVEY_OFFSETS: Readonly<Record<SurveyMilestone, number>> = {
  day_7: 7,
  day_30: 30,
};

export type PlannedSurvey =
  | { readonly milestone: SurveyMilestone; readonly scheduledOn: PlainDate; readonly status: 'scheduled' }
  | {
      readonly milestone: SurveyMilestone;
      readonly scheduledOn: PlainDate;
      readonly status: 'cancelled';
      readonly reason: 'contract_ended_before';
    };

export interface SurveyPlanInput {
  readonly arrivalDate: PlainDate;
  /** Date de fin de contrat, null pour un contrat sans terme. */
  readonly endDate: PlainDate | null;
  readonly calendar: WorkingCalendar;
  readonly offsets?: Readonly<Record<SurveyMilestone, number>>;
}

export function planSurveys(input: SurveyPlanInput): readonly PlannedSurvey[] {
  const offsets = input.offsets ?? DEFAULT_SURVEY_OFFSETS;

  return SURVEY_MILESTONES.map((milestone): PlannedSurvey => {
    const scheduledOn = addWorkingDays(input.arrivalDate, offsets[milestone], input.calendar);

    // Le dernier jour du contrat compte encore : quelqu'un dont le contrat
    // s'arrete le jour meme du questionnaire peut toujours y repondre.
    if (input.endDate !== null && comparePlainDates(input.endDate, scheduledOn) < 0) {
      return { milestone, scheduledOn, status: 'cancelled', reason: 'contract_ended_before' };
    }
    return { milestone, scheduledOn, status: 'scheduled' };
  });
}

export interface EmployeeContact {
  readonly workEmail: string | null;
  readonly personalEmail: string | null;
}

export type SurveyChannel =
  | { readonly kind: 'email'; readonly address: string; readonly source: 'work' | 'personal' }
  /**
   * Aucune adresse utilisable : le questionnaire passe par un lien depose sur
   * le portail. Il n'est jamais abandonne faute d'email.
   */
  | { readonly kind: 'portal_link' };

/**
 * A J+7 et J+30 la personne est arrivee : l'adresse professionnelle passe en
 * premier. L'adresse personnelle ne sert qu'a defaut, et l'absence des deux
 * n'empeche pas le questionnaire d'exister.
 */
export function resolveSurveyChannel(contact: EmployeeContact): SurveyChannel {
  if (contact.workEmail) {
    return { kind: 'email', address: contact.workEmail, source: 'work' };
  }
  if (contact.personalEmail) {
    return { kind: 'email', address: contact.personalEmail, source: 'personal' };
  }
  return { kind: 'portal_link' };
}
