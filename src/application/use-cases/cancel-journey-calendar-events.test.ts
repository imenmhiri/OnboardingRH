import { describe, expect, it } from 'vitest';
import { cancelJourneyCalendarEvents } from './cancel-journey-calendar-events';
import { fakeAuditTrail, fakeCalendar, fakeCalendarEventRepository } from './calendar-test-fixtures';

describe('cancelJourneyCalendarEvents', () => {
  it('cancels every scheduled event of the journey, leaving nothing dangling', async () => {
    const { repository, rows } = fakeCalendarEventRepository([
      {
        id: 'evt-1',
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
      {
        id: 'evt-2',
        companyId: 'company-1',
        journeyId: 'journey-1',
        taskId: 'task-b',
        externalEventId: 'ext-2',
        title: 'Accueil',
        startsAt: '2026-09-18T09:00:00',
        endsAt: '2026-09-18T10:00:00',
        timeZone: 'Europe/Paris',
        status: 'cancelled',
      },
    ]);
    const { audit, events } = fakeAuditTrail();

    const result = await cancelJourneyCalendarEvents(
      { calendar: fakeCalendar(), calendarEvents: repository, audit },
      { companyId: 'company-1', journeyId: 'journey-1' },
    );

    expect(result.cancelledTaskIds).toEqual(['task-a']);
    expect(rows.get('evt-1')?.status).toBe('cancelled');
    // Deja annule avant : ne touche pas une seconde fois.
    expect(events.filter((e) => e.action === 'calendar.event_cancelled')).toHaveLength(1);
  });

  it('never crashes the batch on a provider failure', async () => {
    const { repository, rows } = fakeCalendarEventRepository([
      {
        id: 'evt-1',
        companyId: 'company-1',
        journeyId: 'journey-1',
        taskId: 'task-a',
        externalEventId: 'ext-1',
        title: 'A',
        startsAt: '2026-09-17T09:00:00',
        endsAt: '2026-09-17T10:00:00',
        timeZone: 'Europe/Paris',
        status: 'scheduled',
      },
    ]);
    const { audit, events } = fakeAuditTrail();
    const calendar = fakeCalendar({
      async cancelEvent() {
        return { ok: false, reason: 'provider_error', detail: 'panne' };
      },
    });

    const result = await cancelJourneyCalendarEvents(
      { calendar, calendarEvents: repository, audit },
      { companyId: 'company-1', journeyId: 'journey-1' },
    );

    expect(result.failedTaskIds).toEqual(['task-a']);
    expect(rows.get('evt-1')?.status).toBe('scheduled');
    expect(events.some((e) => e.action === 'calendar.event_cancellation_failed')).toBe(true);
  });
});
