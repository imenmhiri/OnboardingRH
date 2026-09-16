import { parsePlainDate, type PlainDate } from '@/domain/scheduling/plain-date';
import type { SurveyMilestone } from '@/domain/surveys/survey-schedule';
import type {
  PlannedSurveyWrite,
  SurveyChannelKind,
  SurveyJourneySource,
  SurveyRecord,
  SurveyRepository,
  SurveyStatus,
} from '@/application/ports/survey-repository';
import { createSupabaseServiceClient } from './service-client';

type SupabaseClient = ReturnType<typeof createSupabaseServiceClient>;

interface SurveyRow {
  id: string;
  company_id: string;
  journey_id: string;
  milestone: SurveyMilestone;
  scheduled_on: string;
  status: SurveyStatus;
  cancelled_reason: string | null;
  channel: SurveyChannelKind | null;
  sent_at: string | null;
  answered_at: string | null;
  reminder_sent_at: string | null;
}

function toRecord(row: SurveyRow): SurveyRecord {
  return {
    id: row.id,
    companyId: row.company_id,
    journeyId: row.journey_id,
    milestone: row.milestone,
    scheduledOn: parsePlainDate(row.scheduled_on),
    status: row.status,
    cancelledReason: row.cancelled_reason,
    channel: row.channel,
    sentAt: row.sent_at,
    answeredAt: row.answered_at,
    reminderSentAt: row.reminder_sent_at,
  };
}

const SURVEY_COLUMNS =
  'id, company_id, journey_id, milestone, scheduled_on, status, cancelled_reason, channel, sent_at, answered_at, reminder_sent_at';

/**
 * Statuts de parcours qu'un bilan J+30 doit encore surveiller : un parcours
 * `completed` ou `cancelled` a deja atteint (ou n'atteindra jamais) son etat
 * terminal, W3 ne le reconsidere plus (voir `run-day-30-review-scan.ts`).
 */
const OPEN_JOURNEY_STATUSES = ['draft', 'scheduled', 'in_progress'];

export function supabaseSurveyRepository(client: SupabaseClient): SurveyRepository {
  return {
    async activeJourneySources(companyId: string): Promise<readonly SurveyJourneySource[]> {
      const { data: journeyRows, error } = await client
        .from('journeys')
        .select('id, company_id, site_id, employee_id, employee_name, personal_email, arrival_date, end_date, status')
        .eq('company_id', companyId)
        .in('status', OPEN_JOURNEY_STATUSES);

      if (error || !journeyRows) {
        return [];
      }

      const sources: SurveyJourneySource[] = [];
      for (const row of journeyRows) {
        let workEmail: string | null = null;
        if (row.employee_id) {
          const { data: account } = await client.auth.admin.getUserById(row.employee_id);
          workEmail = account.user?.email ?? null;
        }
        sources.push({
          journeyId: row.id,
          companyId: row.company_id,
          siteId: row.site_id,
          employeeName: row.employee_name,
          workEmail,
          personalEmail: row.personal_email,
          arrivalDate: parsePlainDate(row.arrival_date),
          endDate: row.end_date ? parsePlainDate(row.end_date) : null,
          status: row.status,
        });
      }
      return sources;
    },

    async surveysForJourney(journeyId: string): Promise<readonly SurveyRecord[]> {
      const { data, error } = await client.from('surveys').select(SURVEY_COLUMNS).eq('journey_id', journeyId);
      if (error || !data) {
        return [];
      }
      return (data as SurveyRow[]).map(toRecord);
    },

    async reconcilePlannedSurvey(input: PlannedSurveyWrite): Promise<SurveyRecord> {
      const { data: existing, error: findError } = await client
        .from('surveys')
        .select(SURVEY_COLUMNS)
        .eq('journey_id', input.journeyId)
        .eq('milestone', input.milestone)
        .maybeSingle();

      if (findError) {
        throw new Error(`Lecture du questionnaire impossible pour ${input.journeyId}/${input.milestone} : ${findError.message}`);
      }

      if (!existing) {
        const { data: created, error: insertError } = await client
          .from('surveys')
          .insert({
            company_id: input.companyId,
            journey_id: input.journeyId,
            milestone: input.milestone,
            scheduled_on: input.scheduledOn,
            status: input.status,
            cancelled_reason: input.cancelledReason,
          })
          .select(SURVEY_COLUMNS)
          .single();
        if (insertError || !created) {
          throw new Error(`Creation du questionnaire impossible pour ${input.journeyId}/${input.milestone} : ${insertError?.message ?? 'inconnue'}`);
        }
        return toRecord(created as SurveyRow);
      }

      const row = existing as SurveyRow;
      // Un questionnaire deja envoye ou rempli ne se reecrit jamais : seul un
      // questionnaire encore `scheduled` peut etre recale par un report
      // d'arrivee (voir la reconciliation dediee, T-23).
      if (row.status !== 'scheduled') {
        return toRecord(row);
      }
      if (row.scheduled_on === input.scheduledOn && row.status === input.status) {
        return toRecord(row);
      }

      const { data: updated, error: updateError } = await client
        .from('surveys')
        .update({ scheduled_on: input.scheduledOn, status: input.status, cancelled_reason: input.cancelledReason })
        .eq('id', row.id)
        .select(SURVEY_COLUMNS)
        .single();
      if (updateError || !updated) {
        throw new Error(`Reconciliation du questionnaire impossible pour ${row.id} : ${updateError?.message ?? 'inconnue'}`);
      }
      return toRecord(updated as SurveyRow);
    },

    async dueToSend(companyId: string, today: PlainDate): Promise<readonly SurveyRecord[]> {
      const { data, error } = await client
        .from('surveys')
        .select(SURVEY_COLUMNS)
        .eq('company_id', companyId)
        .eq('status', 'scheduled')
        .lte('scheduled_on', today);
      if (error || !data) {
        return [];
      }
      return (data as SurveyRow[]).map(toRecord);
    },

    async dueForReminder(companyId: string, sentBefore: string): Promise<readonly SurveyRecord[]> {
      const { data, error } = await client
        .from('surveys')
        .select(SURVEY_COLUMNS)
        .eq('company_id', companyId)
        .eq('status', 'sent')
        .is('reminder_sent_at', null)
        .lte('sent_at', sentBefore);
      if (error || !data) {
        return [];
      }
      return (data as SurveyRow[]).map(toRecord);
    },

    async markSent(surveyId: string, channel: SurveyChannelKind): Promise<void> {
      const { error } = await client
        .from('surveys')
        .update({ status: 'sent', channel, sent_at: new Date().toISOString() })
        .eq('id', surveyId);
      if (error) {
        throw new Error(`Marquage de l'envoi impossible pour ${surveyId} : ${error.message}`);
      }
    },

    async markReminderSent(surveyId: string): Promise<void> {
      const { error } = await client
        .from('surveys')
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq('id', surveyId);
      if (error) {
        throw new Error(`Marquage de la relance impossible pour ${surveyId} : ${error.message}`);
      }
    },
  };
}
