import type {
  CalendarEventRecord,
  CalendarEventRepository,
  CalendarEventStatus,
  CalendarEventTiming,
  NewCalendarEventRecord,
} from '@/application/ports/calendar-event-repository';
import { createSupabaseServiceClient } from './service-client';

type SupabaseClient = ReturnType<typeof createSupabaseServiceClient>;

interface CalendarEventRow {
  readonly id: string;
  readonly company_id: string;
  readonly journey_id: string;
  readonly task_id: string | null;
  readonly external_event_id: string | null;
  readonly title: string;
  readonly starts_at: string;
  readonly ends_at: string;
  readonly time_zone: string;
  readonly status: CalendarEventStatus;
}

function toRecord(row: CalendarEventRow): CalendarEventRecord {
  return {
    id: row.id,
    companyId: row.company_id,
    journeyId: row.journey_id,
    taskId: row.task_id,
    externalEventId: row.external_event_id,
    title: row.title,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    timeZone: row.time_zone,
    status: row.status,
  };
}

const COLUMNS = 'id, company_id, journey_id, task_id, external_event_id, title, starts_at, ends_at, time_zone, status';

export function supabaseCalendarEventRepository(client: SupabaseClient): CalendarEventRepository {
  return {
    async listByJourney(journeyId: string): Promise<readonly CalendarEventRecord[]> {
      const { data, error } = await client.from('calendar_events').select(COLUMNS).eq('journey_id', journeyId);
      if (error || !data) return [];
      return (data as CalendarEventRow[]).map(toRecord);
    },

    async findByTask(taskId: string): Promise<CalendarEventRecord | null> {
      const { data, error } = await client.from('calendar_events').select(COLUMNS).eq('task_id', taskId).maybeSingle();
      if (error || !data) return null;
      return toRecord(data as CalendarEventRow);
    },

    async create(record: NewCalendarEventRecord): Promise<CalendarEventRecord> {
      const { data, error } = await client
        .from('calendar_events')
        .insert({
          company_id: record.companyId,
          journey_id: record.journeyId,
          task_id: record.taskId,
          external_event_id: record.externalEventId,
          title: record.title,
          starts_at: record.startsAt,
          ends_at: record.endsAt,
          time_zone: record.timeZone,
          status: 'scheduled',
        })
        .select(COLUMNS)
        .single();
      if (error || !data) {
        throw new Error(`Creation de l'evenement d'agenda impossible : ${error?.message}`);
      }
      return toRecord(data as CalendarEventRow);
    },

    async updateTiming(id: string, timing: CalendarEventTiming): Promise<void> {
      const { error } = await client
        .from('calendar_events')
        .update({
          starts_at: timing.startsAt,
          ends_at: timing.endsAt,
          external_event_id: timing.externalEventId,
        })
        .eq('id', id);
      if (error) {
        throw new Error(`Deplacement de l'evenement d'agenda impossible pour ${id} : ${error.message}`);
      }
    },

    async markCancelled(id: string): Promise<void> {
      const { error } = await client.from('calendar_events').update({ status: 'cancelled' }).eq('id', id);
      if (error) {
        throw new Error(`Annulation de l'evenement d'agenda impossible pour ${id} : ${error.message}`);
      }
    },
  };
}
