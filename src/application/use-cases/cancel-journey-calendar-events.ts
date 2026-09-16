import type { AuditTrail } from '@/application/ports/audit-trail';
import type { Calendar } from '@/application/ports/calendar';
import type { CalendarEventRepository } from '@/application/ports/calendar-event-repository';

/**
 * Un parcours annulé ne doit laisser aucun évènement d'agenda actif derrière
 * lui. Utilisable directement (pas encore branché à un déclencheur produit
 * réel : voir la clôture du ticket, aucun flux ne fait actuellement passer un
 * parcours au statut `cancelled`).
 */

export interface CancelJourneyCalendarEventsInput {
  readonly companyId: string;
  readonly journeyId: string;
}

export interface CancelJourneyCalendarEventsPorts {
  readonly calendar: Calendar;
  readonly calendarEvents: CalendarEventRepository;
  readonly audit: AuditTrail;
}

export interface CancelJourneyCalendarEventsResult {
  readonly cancelledTaskIds: readonly string[];
  readonly failedTaskIds: readonly string[];
}

const SYSTEM_ACTOR = null;

export async function cancelJourneyCalendarEvents(
  ports: CancelJourneyCalendarEventsPorts,
  input: CancelJourneyCalendarEventsInput,
): Promise<CancelJourneyCalendarEventsResult> {
  const events = await ports.calendarEvents.listByJourney(input.journeyId);
  const cancelled: string[] = [];
  const failed: string[] = [];

  for (const event of events) {
    if (event.status !== 'scheduled') continue;

    const result = event.externalEventId
      ? await ports.calendar.cancelEvent(event.externalEventId)
      : ({ ok: true } as const);

    if (!result.ok) {
      failed.push(event.taskId ?? event.id);
      await ports.audit.record({
        companyId: input.companyId,
        actorId: SYSTEM_ACTOR,
        action: 'calendar.event_cancellation_failed',
        journeyId: input.journeyId,
        ...(event.taskId ? { taskId: event.taskId } : {}),
        payload: { reason: result.reason, detail: result.detail },
      });
      continue;
    }

    await ports.calendarEvents.markCancelled(event.id);
    cancelled.push(event.taskId ?? event.id);
    await ports.audit.record({
      companyId: input.companyId,
      actorId: SYSTEM_ACTOR,
      action: 'calendar.event_cancelled',
      journeyId: input.journeyId,
      ...(event.taskId ? { taskId: event.taskId } : {}),
      payload: {},
    });
  }

  return { cancelledTaskIds: cancelled, failedTaskIds: failed };
}
