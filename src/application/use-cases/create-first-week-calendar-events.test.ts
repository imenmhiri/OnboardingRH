import { describe, expect, it } from 'vitest';
import { parsePlainDate } from '@/domain/scheduling/plain-date';
import { createFirstWeekCalendarEvents } from './create-first-week-calendar-events';
import { fakeAuditTrail, fakeCalendar, fakeCalendarEventContext, fakeCalendarEventRepository } from './calendar-test-fixtures';

const ARRIVAL = parsePlainDate('2026-09-21');

describe('createFirstWeekCalendarEvents', () => {
  it('creates one event per first-week task, skipping tasks outside the window', async () => {
    const { repository, rows } = fakeCalendarEventRepository();
    const { audit, events } = fakeAuditTrail();

    const result = await createFirstWeekCalendarEvents(
      { calendar: fakeCalendar(), calendarEvents: repository, context: fakeCalendarEventContext(), audit },
      {
        companyId: 'company-1',
        journeyId: 'journey-1',
        siteId: null,
        arrivalDate: ARRIVAL,
        tasks: [
          { id: 'task-in-week', title: 'Créer le compte IT', dueDate: parsePlainDate('2026-09-22'), ownerId: 'user-it' },
          { id: 'task-later', title: 'Bilan à 30 jours', dueDate: parsePlainDate('2026-10-21'), ownerId: 'user-hr' },
        ],
      },
    );

    expect(result.createdTaskIds).toEqual(['task-in-week']);
    expect([...rows.values()]).toHaveLength(1);
    expect(events.some((e) => e.action === 'calendar.event_created')).toBe(true);
  });

  it('is idempotent: a task that already has a scheduled event is not created twice', async () => {
    const { repository, rows } = fakeCalendarEventRepository([
      {
        id: 'evt-row-existing',
        companyId: 'company-1',
        journeyId: 'journey-1',
        taskId: 'task-in-week',
        externalEventId: 'ext-existing',
        title: 'Créer le compte IT',
        startsAt: '2026-09-22T09:00:00',
        endsAt: '2026-09-22T10:00:00',
        timeZone: 'Europe/Paris',
        status: 'scheduled',
      },
    ]);
    const { audit } = fakeAuditTrail();

    const result = await createFirstWeekCalendarEvents(
      { calendar: fakeCalendar(), calendarEvents: repository, context: fakeCalendarEventContext(), audit },
      {
        companyId: 'company-1',
        journeyId: 'journey-1',
        siteId: null,
        arrivalDate: ARRIVAL,
        tasks: [{ id: 'task-in-week', title: 'Créer le compte IT', dueDate: parsePlainDate('2026-09-22'), ownerId: 'user-it' }],
      },
    );

    expect(result.createdTaskIds).toEqual([]);
    expect([...rows.values()]).toHaveLength(1);
  });

  it('degrades gracefully when the owner has no company calendar account: event still created without attendee', async () => {
    const { repository, rows } = fakeCalendarEventRepository();
    const { audit } = fakeAuditTrail();

    await createFirstWeekCalendarEvents(
      { calendar: fakeCalendar(), calendarEvents: repository, context: fakeCalendarEventContext('Europe/Paris', {}), audit },
      {
        companyId: 'company-1',
        journeyId: 'journey-1',
        siteId: null,
        arrivalDate: ARRIVAL,
        tasks: [{ id: 'task-no-owner', title: 'Préparer le poste', dueDate: parsePlainDate('2026-09-21'), ownerId: 'user-unknown' }],
      },
    );

    expect([...rows.values()]).toHaveLength(1);
  });

  it('never crashes the batch: one failing event does not block the others', async () => {
    const { repository, rows } = fakeCalendarEventRepository();
    const { audit, events } = fakeAuditTrail();
    let calls = 0;
    const calendar = fakeCalendar({
      async createEvent() {
        calls += 1;
        if (calls === 1) {
          return { ok: false, reason: 'provider_error', detail: 'panne du fournisseur' };
        }
        return { ok: true, externalEventId: 'ext-ok' };
      },
    });

    const result = await createFirstWeekCalendarEvents(
      { calendar, calendarEvents: repository, context: fakeCalendarEventContext(), audit },
      {
        companyId: 'company-1',
        journeyId: 'journey-1',
        siteId: null,
        arrivalDate: ARRIVAL,
        tasks: [
          { id: 'task-a', title: 'Tâche A', dueDate: parsePlainDate('2026-09-21'), ownerId: null },
          { id: 'task-b', title: 'Tâche B', dueDate: parsePlainDate('2026-09-22'), ownerId: null },
        ],
      },
    );

    expect(result.failedTaskIds).toEqual(['task-a']);
    expect(result.createdTaskIds).toEqual(['task-b']);
    expect([...rows.values()]).toHaveLength(1);
    expect(events.some((e) => e.action === 'calendar.event_creation_failed')).toBe(true);
  });

  it('resolves the site time zone over the company one for the event window', async () => {
    const { repository } = fakeCalendarEventRepository();
    const { audit } = fakeAuditTrail();
    let capturedTimeZone: string | undefined;
    const calendar = fakeCalendar({
      async createEvent(input) {
        capturedTimeZone = input.timeZone;
        return { ok: true, externalEventId: 'ext-1' };
      },
    });

    await createFirstWeekCalendarEvents(
      { calendar, calendarEvents: repository, context: fakeCalendarEventContext('Asia/Dubai'), audit },
      {
        companyId: 'company-1',
        journeyId: 'journey-1',
        siteId: 'site-dubai',
        arrivalDate: ARRIVAL,
        tasks: [{ id: 'task-a', title: 'Tâche A', dueDate: ARRIVAL, ownerId: null }],
      },
    );

    expect(capturedTimeZone).toBe('Asia/Dubai');
  });
});
