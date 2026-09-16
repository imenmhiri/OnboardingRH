import type { AuditEvent, AuditTrail } from '@/application/ports/audit-trail';
import type { Calendar, CalendarEventInput, CalendarEventResult, CalendarVoidResult } from '@/application/ports/calendar';
import type { CalendarEventContextDirectory } from '@/application/ports/calendar-event-context';
import type {
  CalendarEventRecord,
  CalendarEventRepository,
  CalendarEventTiming,
  NewCalendarEventRecord,
} from '@/application/ports/calendar-event-repository';

/** Doublures en memoire — de vraies implementations des ports, pas des mocks. */

let nextId = 1;

export function fakeCalendarEventRepository(seed: readonly CalendarEventRecord[] = []) {
  const rows = new Map(seed.map((row) => [row.id, row]));
  const byTask = new Map(seed.filter((row) => row.taskId).map((row) => [row.taskId as string, row.id]));

  const repository: CalendarEventRepository = {
    async listByJourney(journeyId: string) {
      return [...rows.values()].filter((row) => row.journeyId === journeyId);
    },
    async findByTask(taskId: string) {
      const id = byTask.get(taskId);
      return id ? (rows.get(id) ?? null) : null;
    },
    async create(record: NewCalendarEventRecord): Promise<CalendarEventRecord> {
      const id = `evt-row-${nextId++}`;
      const row: CalendarEventRecord = { id, status: 'scheduled', ...record };
      rows.set(id, row);
      if (record.taskId) byTask.set(record.taskId, id);
      return row;
    },
    async updateTiming(id: string, timing: CalendarEventTiming) {
      const row = rows.get(id);
      if (row) {
        rows.set(id, { ...row, startsAt: timing.startsAt, endsAt: timing.endsAt, externalEventId: timing.externalEventId });
      }
    },
    async markCancelled(id: string) {
      const row = rows.get(id);
      if (row) rows.set(id, { ...row, status: 'cancelled' });
    },
  };

  return { repository, rows };
}

export function fakeCalendar(overrides: Partial<Calendar> = {}): Calendar {
  let nextEventId = 1;
  return {
    async createEvent(_input: CalendarEventInput): Promise<CalendarEventResult> {
      return { ok: true, externalEventId: `ext-${nextEventId++}` };
    },
    async updateEvent(externalEventId: string, _input: CalendarEventInput): Promise<CalendarEventResult> {
      return { ok: true, externalEventId };
    },
    async cancelEvent(_externalEventId: string): Promise<CalendarVoidResult> {
      return { ok: true };
    },
    ...overrides,
  };
}

export function fakeCalendarEventContext(
  timeZone = 'Europe/Paris',
  emails: Record<string, string | null> = {},
): CalendarEventContextDirectory {
  return {
    async timeZoneFor() {
      return timeZone;
    },
    async emailFor(personId: string) {
      return emails[personId] ?? null;
    },
  };
}

export function fakeAuditTrail() {
  const events: AuditEvent[] = [];
  const audit: AuditTrail = {
    async record(event: AuditEvent) {
      events.push(event);
    },
  };
  return { audit, events };
}
