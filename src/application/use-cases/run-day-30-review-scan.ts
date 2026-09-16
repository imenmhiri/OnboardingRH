import { toEpochDay, type PlainDate } from '@/domain/scheduling/plain-date';
import { countWorkingDaysBetween, type WorkingCalendar } from '@/domain/scheduling/working-calendar';
import { planSurveys, resolveSurveyChannel, type SurveyMilestone } from '@/domain/surveys/survey-schedule';
import { FALLBACK_BRANDING } from '@/lib/branding';
import { createSurveyAccessToken } from '@/application/security/survey-access-token';
import type { AuditTrail } from '@/application/ports/audit-trail';
import type { CalendarDirectory } from '@/application/ports/calendar-directory';
import type { CompanyDirectory } from '@/application/ports/company-directory';
import type { EmailTemplates } from '@/application/ports/email-templates';
import type { JourneyRepository } from '@/application/ports/journey-repository';
import type { Mailer } from '@/application/ports/mailer';
import type { SurveyChannelKind, SurveyRecord, SurveyRepository } from '@/application/ports/survey-repository';

/**
 * W3 : le bilan J+30 (et son jalon J+7, plani­fies ensemble par
 * `planSurveys`, T-14). Ce cas d'usage n'invente aucune regle de
 * planification ni de scoring : il appelle `planSurveys` /
 * `resolveSurveyChannel` (domain/surveys, non modifies), envoie via T-24,
 * trace dans l'audit (T-06), et clot le parcours quand le jalon J+30 a
 * atteint un etat terminal.
 *
 * Quatre passes, dans cet ordre, pour un `companyId` et un `today` donnes :
 *   1. reconciliation — une ligne `day_7`/`day_30` par parcours actif,
 *      recalee si le parcours a ete reporte (voir `reconcilePlannedSurvey`) ;
 *   2. envoi des questionnaires dont l'echeance est atteinte ;
 *   3. relance unique des questionnaires envoyes restes sans reponse ;
 *   4. cloture des parcours dont le jalon J+30 a atteint son etat terminal.
 *
 * Decisions ecrites ici (voir aussi le journal de cloture T-23) :
 * - Relance a J+3 jours ouvres apres l'envoi, une seule fois
 *   (`reminder_sent_at` non nul l'empeche a jamais).
 * - Un parcours se clot quand son J+30 est `answered`, `cancelled` (fin de
 *   contrat avant l'echeance), ou `sent` depuis au moins 5 jours ouvres
 *   apres sa relance sans reponse — jamais a l'instant de l'envoi, pour
 *   laisser une vraie fenetre de reponse.
 * - Le lien du questionnaire porte un jeton signe (HMAC, TTL 30 jours),
 *   genere a partir de `today` (jamais d'horloge lue ici) — voir
 *   `application/security/survey-access-token.ts`.
 */

const REMINDER_OFFSET_WORKING_DAYS = 3;
const CLOSE_GRACE_WORKING_DAYS_AFTER_REMINDER = 5;
const TOKEN_TTL_DAYS = 30;
const SECONDS_PER_DAY = 86_400;

const MILESTONE_LABELS: Record<SurveyMilestone, string> = { day_7: 'J+7', day_30: 'J+30' };

export interface Day30ReviewScanInput {
  readonly companyId: string;
  readonly today: PlainDate;
  readonly dryRun: boolean;
}

export interface SurveySendOutcome {
  readonly journeyId: string;
  readonly employeeName: string;
  readonly surveyId: string;
  readonly milestone: SurveyMilestone;
  readonly channel: SurveyChannelKind;
  readonly sent: boolean;
  readonly sendReason?: 'invalid_recipient' | 'provider_error';
}

export interface SurveyReminderOutcome {
  readonly journeyId: string;
  readonly employeeName: string;
  readonly surveyId: string;
  readonly milestone: SurveyMilestone;
  readonly sent: boolean;
  readonly sendReason?: 'invalid_recipient' | 'provider_error';
}

export interface JourneyClosureOutcome {
  readonly journeyId: string;
  readonly employeeName: string;
  readonly reason: 'day30_answered' | 'day30_cancelled_contract_ended' | 'day30_reminder_window_elapsed';
}

export interface Day30ReviewScanResult {
  readonly companyId: string;
  readonly today: PlainDate;
  readonly dryRun: boolean;
  readonly reconciledMilestones: number;
  readonly sent: readonly SurveySendOutcome[];
  readonly reminded: readonly SurveyReminderOutcome[];
  readonly closedJourneys: readonly JourneyClosureOutcome[];
}

export interface Day30ReviewScanPorts {
  readonly surveys: SurveyRepository;
  readonly journeys: JourneyRepository;
  readonly calendar: CalendarDirectory;
  readonly branding: CompanyDirectory;
  readonly templates: EmailTemplates;
  readonly mailer: Mailer;
  readonly audit: AuditTrail;
  readonly portalUrl: string;
  readonly tokenSecret: string;
}

const SYSTEM_ACTOR = null;

export async function runDay30ReviewScan(
  ports: Day30ReviewScanPorts,
  input: Day30ReviewScanInput,
): Promise<Day30ReviewScanResult> {
  const { companyId, today, dryRun } = input;

  const journeySources = await ports.surveys.activeJourneySources(companyId);
  const journeyById = new Map(journeySources.map((journey) => [journey.journeyId, journey]));

  let reconciledMilestones = 0;
  // La ligne day_30 de chaque parcours, pour decider la cloture en fin de passage.
  const day30ByJourney = new Map<string, SurveyRecord>();

  for (const journey of journeySources) {
    const calendar = await ports.calendar.calendarFor(companyId, journey.siteId);
    const plan = planSurveys({ arrivalDate: journey.arrivalDate, endDate: journey.endDate, calendar });

    for (const planned of plan) {
      const reconciled = dryRun
        ? null
        : await ports.surveys.reconcilePlannedSurvey({
            companyId,
            journeyId: journey.journeyId,
            milestone: planned.milestone,
            scheduledOn: planned.scheduledOn,
            status: planned.status === 'cancelled' ? 'cancelled' : 'scheduled',
            cancelledReason: planned.status === 'cancelled' ? planned.reason : null,
          });
      if (reconciled) {
        reconciledMilestones += 1;
        if (planned.milestone === 'day_30') {
          day30ByJourney.set(journey.journeyId, reconciled);
        }
      }
    }
  }

  const sent: SurveySendOutcome[] = [];
  const reminded: SurveyReminderOutcome[] = [];
  const closedJourneys: JourneyClosureOutcome[] = [];

  if (!dryRun) {
    const dueToSend = await ports.surveys.dueToSend(companyId, today);
    for (const survey of dueToSend) {
      const journey = journeyById.get(survey.journeyId);
      if (!journey) continue;

      const outcome = await sendQuestionnaire(ports, companyId, today, journey, survey);
      sent.push(outcome);
      if (outcome.sent && survey.milestone === 'day_30') {
        day30ByJourney.set(survey.journeyId, { ...survey, status: 'sent', channel: outcome.channel });
      }
    }

    // Fenetre large (tout ce qui est encore `sent`) : le filtrage precis par
    // jours ouvres reste une regle metier, calculee ici avec le calendrier de
    // chaque parcours, jamais dans la requete SQL.
    const candidatesForReminder = await ports.surveys.dueForReminder(companyId, `${today}T23:59:59.999Z`);
    for (const survey of candidatesForReminder) {
      const journey = journeyById.get(survey.journeyId);
      if (!journey || !survey.sentAt) continue;
      const calendar = await ports.calendar.calendarFor(companyId, journey.siteId);
      const sentOn = survey.sentAt.slice(0, 10) as PlainDate;
      if (countWorkingDaysBetween(sentOn, today, calendar) < REMINDER_OFFSET_WORKING_DAYS) continue;

      const outcome = await sendReminder(ports, companyId, journey, survey);
      reminded.push(outcome);
      if (outcome.sent && survey.milestone === 'day_30') {
        const current = day30ByJourney.get(survey.journeyId) ?? survey;
        day30ByJourney.set(survey.journeyId, { ...current, reminderSentAt: `${today}T00:00:00.000Z` });
      }
    }

    for (const [journeyId, day30] of day30ByJourney) {
      const journey = journeyById.get(journeyId);
      if (!journey) continue;
      const calendar = await ports.calendar.calendarFor(companyId, journey.siteId);
      const closure = evaluateClosure(day30, today, calendar);
      if (!closure) continue;

      await ports.journeys.updateJourneyStatus(journeyId, 'completed');
      await ports.audit.record({
        companyId,
        actorId: SYSTEM_ACTOR,
        action: 'journey.closed',
        journeyId,
        payload: { reason: closure, origin: 'w3-day-30-review' },
      });
      closedJourneys.push({ journeyId, employeeName: journey.employeeName, reason: closure });
    }
  }

  return { companyId, today, dryRun, reconciledMilestones, sent, reminded, closedJourneys };
}

interface SurveyJourneyContact {
  readonly journeyId: string;
  readonly employeeName: string;
  readonly workEmail: string | null;
  readonly personalEmail: string | null;
}

function evaluateClosure(
  day30: SurveyRecord,
  today: PlainDate,
  calendar: WorkingCalendar,
): JourneyClosureOutcome['reason'] | null {
  if (day30.status === 'answered') return 'day30_answered';
  if (day30.status === 'cancelled') return 'day30_cancelled_contract_ended';
  if (day30.status === 'sent' && day30.reminderSentAt) {
    const remindedOn = day30.reminderSentAt.slice(0, 10) as PlainDate;
    if (countWorkingDaysBetween(remindedOn, today, calendar) >= CLOSE_GRACE_WORKING_DAYS_AFTER_REMINDER) {
      return 'day30_reminder_window_elapsed';
    }
  }
  return null;
}

async function sendQuestionnaire(
  ports: Day30ReviewScanPorts,
  companyId: string,
  today: PlainDate,
  journey: SurveyJourneyContact,
  survey: SurveyRecord,
): Promise<SurveySendOutcome> {
  const channel = resolveSurveyChannel({ workEmail: journey.workEmail, personalEmail: journey.personalEmail });

  if (channel.kind === 'portal_link') {
    await ports.surveys.markSent(survey.id, 'portal_link');
    await ports.audit.record({
      companyId,
      actorId: SYSTEM_ACTOR,
      action: 'survey.sent',
      journeyId: journey.journeyId,
      payload: { surveyId: survey.id, milestone: survey.milestone, channel: 'portal_link', origin: 'w3-day-30-review' },
    });
    return {
      journeyId: journey.journeyId,
      employeeName: journey.employeeName,
      surveyId: survey.id,
      milestone: survey.milestone,
      channel: 'portal_link',
      sent: true,
    };
  }

  const branding = (await ports.branding.brandingOf(companyId)) ?? FALLBACK_BRANDING;
  const expiresAtEpochSeconds = (toEpochDay(today) + TOKEN_TTL_DAYS) * SECONDS_PER_DAY;
  const token = createSurveyAccessToken({ surveyId: survey.id, expiresAtEpochSeconds, secret: ports.tokenSecret });
  const surveyUrl = `${ports.portalUrl}/questionnaires/${survey.id}?token=${token}`;

  const rendered = ports.templates.renderQuestionnaire({
    employeeName: journey.employeeName,
    milestoneLabel: MILESTONE_LABELS[survey.milestone],
    surveyUrl,
    branding,
  });

  const result = await ports.mailer.send({
    to: { email: channel.address, name: journey.employeeName },
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });

  if (!result.ok) {
    await ports.audit.record({
      companyId,
      actorId: SYSTEM_ACTOR,
      action: 'email.delivery_failed',
      journeyId: journey.journeyId,
      payload: {
        template: 'questionnaire',
        surveyId: survey.id,
        milestone: survey.milestone,
        reason: result.reason,
        detail: result.detail,
        origin: 'w3-day-30-review',
      },
    });
    return {
      journeyId: journey.journeyId,
      employeeName: journey.employeeName,
      surveyId: survey.id,
      milestone: survey.milestone,
      channel: 'email',
      sent: false,
      sendReason: result.reason,
    };
  }

  await ports.surveys.markSent(survey.id, 'email');
  await ports.audit.record({
    companyId,
    actorId: SYSTEM_ACTOR,
    action: 'survey.sent',
    journeyId: journey.journeyId,
    payload: {
      surveyId: survey.id,
      milestone: survey.milestone,
      channel: 'email',
      channelSource: channel.source,
      messageId: result.messageId,
      origin: 'w3-day-30-review',
    },
  });

  return {
    journeyId: journey.journeyId,
    employeeName: journey.employeeName,
    surveyId: survey.id,
    milestone: survey.milestone,
    channel: 'email',
    sent: true,
  };
}

async function sendReminder(
  ports: Day30ReviewScanPorts,
  companyId: string,
  journey: SurveyJourneyContact,
  survey: SurveyRecord,
): Promise<SurveyReminderOutcome> {
  const channel = resolveSurveyChannel({ workEmail: journey.workEmail, personalEmail: journey.personalEmail });

  // Un canal portail n'a rien a relancer par email : la relance d'un lien
  // deja visible sur le portail est hors perimetre (pas d'envoi actif
  // possible sans adresse), le questionnaire reste simplement en attente.
  if (channel.kind === 'portal_link') {
    return {
      journeyId: journey.journeyId,
      employeeName: journey.employeeName,
      surveyId: survey.id,
      milestone: survey.milestone,
      sent: false,
    };
  }

  const branding = (await ports.branding.brandingOf(companyId)) ?? FALLBACK_BRANDING;
  const surveyUrl = `${ports.portalUrl}/questionnaires/${survey.id}`;
  const rendered = ports.templates.renderQuestionnaire({
    employeeName: journey.employeeName,
    milestoneLabel: `${MILESTONE_LABELS[survey.milestone]} (rappel)`,
    surveyUrl,
    branding,
  });

  const result = await ports.mailer.send({
    to: { email: channel.address, name: journey.employeeName },
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });

  if (!result.ok) {
    await ports.audit.record({
      companyId,
      actorId: SYSTEM_ACTOR,
      action: 'email.delivery_failed',
      journeyId: journey.journeyId,
      payload: {
        template: 'questionnaire_reminder',
        surveyId: survey.id,
        milestone: survey.milestone,
        reason: result.reason,
        detail: result.detail,
        origin: 'w3-day-30-review',
      },
    });
    return {
      journeyId: journey.journeyId,
      employeeName: journey.employeeName,
      surveyId: survey.id,
      milestone: survey.milestone,
      sent: false,
      sendReason: result.reason,
    };
  }

  await ports.surveys.markReminderSent(survey.id);
  await ports.audit.record({
    companyId,
    actorId: SYSTEM_ACTOR,
    action: 'survey.reminder_sent',
    journeyId: journey.journeyId,
    payload: { surveyId: survey.id, milestone: survey.milestone, messageId: result.messageId, origin: 'w3-day-30-review' },
  });

  return {
    journeyId: journey.journeyId,
    employeeName: journey.employeeName,
    surveyId: survey.id,
    milestone: survey.milestone,
    sent: true,
  };
}
