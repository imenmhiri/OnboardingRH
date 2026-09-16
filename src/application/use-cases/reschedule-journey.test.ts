import { describe, expect, it } from 'vitest';
import { parsePlainDate } from '@/domain/scheduling/plain-date';
import { createWorkingCalendar } from '@/domain/scheduling/working-calendar';
import type { CalendarDirectory } from '@/application/ports/calendar-directory';
import type { JourneyRepository, JourneySummary, OpenTaskSchedule, TaskDueDateChange } from '@/application/ports/journey-repository';
import { rescheduleJourney } from './reschedule-journey';
import { fakeAuditTrail, fakeCalendar, fakeCalendarEventContext, fakeCalendarEventRepository } from './calendar-test-fixtures';

function fakeJourneyRepository(
  journey: JourneySummary,
  schedules: OpenTaskSchedule[],
): { repository: JourneyRepository; state: { journey: JourneySummary; schedules: OpenTaskSchedule[] } } {
  const state = { journey: { ...journey }, schedules: schedules.map((s) => ({ ...s })) };
  const repository: JourneyRepository = {
    async findByHireReference() {
      throw new Error('non utilise');
    },
    async insertJourney() {
      throw new Error('non utilise');
    },
    async insertTasks() {
      throw new Error('non utilise');
    },
    async assignOwner() {
      throw new Error('non utilise');
    },
    async updateJourneyStatus() {
      throw new Error('non utilise');
    },
    async findById(journeyId: string) {
      return journeyId === state.journey.id ? state.journey : null;
    },
    async updateArrivalDate(_journeyId: string, arrivalDate) {
      state.journey = { ...state.journey, arrivalDate };
    },
    async openTaskSchedules() {
      return state.schedules;
    },
    async updateTaskDueDates(changes: readonly TaskDueDateChange[]) {
      state.schedules = state.schedules.map((s) => {
        const change = changes.find((c) => c.taskId === s.taskId);
        return change ? { ...s, dueDate: change.dueDate } : s;
      });
    },
  };
  return { repository, state };
}

function fakeCalendarDirectory(): CalendarDirectory {
  return { async calendarFor() { return createWorkingCalendar(); } };
}

describe('rescheduleJourney', () => {
  it('moves due dates and moves (never duplicates) existing calendar events', async () => {
    const journey: JourneySummary = {
      id: 'journey-1',
      companyId: 'company-1',
      siteId: null,
      arrivalDate: parsePlainDate('2026-09-21'),
      status: 'scheduled',
    };
    const schedules: OpenTaskSchedule[] = [
      { taskId: 'task-a', title: 'Créer le compte IT', ownerId: 'user-it', offsetInWorkingDays: -2, dueDate: parsePlainDate('2026-09-17') },
    ];
    const { repository, state } = fakeJourneyRepository(journey, schedules);
    const { repository: calendarEvents, rows } = fakeCalendarEventRepository([
      {
        id: 'evt-row-1',
        companyId: 'company-1',
        journeyId: 'journey-1',
        taskId: 'task-a',
        externalEventId: 'ext-1',
        title: 'Créer le compte IT',
        startsAt: '2026-09-17T09:00:00',
        endsAt: '2026-09-17T10:00:00',
        timeZone: 'Europe/Paris',
        status: 'scheduled',
      },
    ]);
    const { audit, events } = fakeAuditTrail();

    const result = await rescheduleJourney(
      {
        journeys: repository,
        calendarDirectory: fakeCalendarDirectory(),
        calendarEvents,
        calendar: fakeCalendar(),
        context: fakeCalendarEventContext(),
        audit,
      },
      { companyId: 'company-1', journeyId: 'journey-1', newArrivalDate: parsePlainDate('2026-10-05') },
    );

    expect(result).toMatchObject({ ok: true, movedTaskCount: 1, movedEventCount: 1 });
    expect(state.journey.arrivalDate).toBe('2026-10-05');
    expect(state.schedules[0]?.dueDate).not.toBe('2026-09-17');

    const movedRow = rows.get('evt-row-1');
    // Meme id, meme identifiant externe : deplace, jamais duplique.
    expect(movedRow?.id).toBe('evt-row-1');
    expect(movedRow?.externalEventId).toBe('ext-1');
    expect(movedRow?.startsAt).not.toBe('2026-09-17T09:00:00');
    expect([...rows.values()]).toHaveLength(1);
    expect(events.some((e) => e.action === 'journey.rescheduled')).toBe(true);
    expect(events.some((e) => e.action === 'calendar.event_moved')).toBe(true);
  });

  it('refuses to reschedule a journey in a terminal status', async () => {
    const journey: JourneySummary = {
      id: 'journey-1',
      companyId: 'company-1',
      siteId: null,
      arrivalDate: parsePlainDate('2026-09-21'),
      status: 'cancelled',
    };
    const { repository } = fakeJourneyRepository(journey, []);
    const { repository: calendarEvents } = fakeCalendarEventRepository();
    const { audit } = fakeAuditTrail();

    const result = await rescheduleJourney(
      {
        journeys: repository,
        calendarDirectory: fakeCalendarDirectory(),
        calendarEvents,
        calendar: fakeCalendar(),
        context: fakeCalendarEventContext(),
        audit,
      },
      { companyId: 'company-1', journeyId: 'journey-1', newArrivalDate: parsePlainDate('2026-10-05') },
    );

    expect(result).toEqual({ ok: false, reason: 'terminal_status' });
  });

  it('returns not_found for an unknown journey', async () => {
    const { repository } = fakeJourneyRepository(
      { id: 'other', companyId: 'company-1', siteId: null, arrivalDate: parsePlainDate('2026-09-21'), status: 'scheduled' },
      [],
    );
    const { repository: calendarEvents } = fakeCalendarEventRepository();
    const { audit } = fakeAuditTrail();

    const result = await rescheduleJourney(
      {
        journeys: repository,
        calendarDirectory: fakeCalendarDirectory(),
        calendarEvents,
        calendar: fakeCalendar(),
        context: fakeCalendarEventContext(),
        audit,
      },
      { companyId: 'company-1', journeyId: 'journey-1', newArrivalDate: parsePlainDate('2026-10-05') },
    );

    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });
});
