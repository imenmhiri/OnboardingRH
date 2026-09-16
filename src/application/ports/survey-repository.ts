import type { PlainDate } from '@/domain/scheduling/plain-date';
import type { SurveyMilestone } from '@/domain/surveys/survey-schedule';

/**
 * Persiste les questionnaires de satisfaction (T-14 planifie, W3/T-23
 * orchestre l'envoi). Le domaine (`planSurveys`, `resolveSurveyChannel`) ne
 * change pas ; ce port se contente d'ecrire et de relire ce qu'il decide.
 */

export type SurveyStatus = 'scheduled' | 'sent' | 'answered' | 'cancelled';
export type SurveyChannelKind = 'email' | 'portal_link';

export interface SurveyRecord {
  readonly id: string;
  readonly companyId: string;
  readonly journeyId: string;
  readonly milestone: SurveyMilestone;
  readonly scheduledOn: PlainDate;
  readonly status: SurveyStatus;
  readonly cancelledReason: string | null;
  readonly channel: SurveyChannelKind | null;
  /** ISO instant, ou null si jamais envoye. */
  readonly sentAt: string | null;
  readonly answeredAt: string | null;
  readonly reminderSentAt: string | null;
}

/**
 * Ce que `planSurveys` doit connaitre d'un parcours, plus ce que le canal a
 * besoin pour joindre la personne (T-14 : adresse professionnelle d'abord,
 * personnelle a defaut, lien sur le portail sinon).
 */
export interface SurveyJourneySource {
  readonly journeyId: string;
  readonly companyId: string;
  readonly siteId: string | null;
  readonly employeeName: string;
  /** Adresse de connexion (auth.users) : n'existe que si un compte a deja ete cree. */
  readonly workEmail: string | null;
  readonly personalEmail: string | null;
  readonly arrivalDate: PlainDate;
  readonly endDate: PlainDate | null;
  /** Statut brut du parcours (journey_status) : le cas d'usage decide ce qui est "actif". */
  readonly status: string;
}

export interface PlannedSurveyWrite {
  readonly companyId: string;
  readonly journeyId: string;
  readonly milestone: SurveyMilestone;
  readonly scheduledOn: PlainDate;
  readonly status: 'scheduled' | 'cancelled';
  readonly cancelledReason: string | null;
}

export interface SurveyRepository {
  /** Tous les parcours d'une societe non definitivement clos — le filtrage fin reste au cas d'usage. */
  activeJourneySources(companyId: string): Promise<readonly SurveyJourneySource[]>;

  surveysForJourney(journeyId: string): Promise<readonly SurveyRecord[]>;

  /**
   * Cree la ligne du jalon si elle n'existe pas encore. Si elle existe et est
   * toujours `scheduled`, recale sa date/son statut sur le plan recalcule
   * (parcours reporte) ; une ligne deja `sent`/`answered` n'est jamais
   * reecrite silencieusement.
   */
  reconcilePlannedSurvey(input: PlannedSurveyWrite): Promise<SurveyRecord>;

  /** Questionnaires `scheduled`, echeance atteinte, pour une societe. */
  dueToSend(companyId: string, today: PlainDate): Promise<readonly SurveyRecord[]>;

  /** Questionnaires `sent`, sans reponse, sans relance deja envoyee, envoyes avant `sentBefore`. */
  dueForReminder(companyId: string, sentBefore: string): Promise<readonly SurveyRecord[]>;

  /** L'horodatage est pose par l'implementation (infra), jamais par l'application — voir CLAUDE.md. */
  markSent(surveyId: string, channel: SurveyChannelKind): Promise<void>;

  markReminderSent(surveyId: string): Promise<void>;
}
