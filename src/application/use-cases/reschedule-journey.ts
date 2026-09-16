import { hasMoved, rescheduleForArrivalDate } from '@/domain/scheduling/due-date';
import { eventWindowFor } from '@/domain/scheduling/event-window';
import type { PlainDate } from '@/domain/scheduling/plain-date';
import type { AuditTrail } from '@/application/ports/audit-trail';
import type { Calendar } from '@/application/ports/calendar';
import type { CalendarDirectory } from '@/application/ports/calendar-directory';
import type { CalendarEventContextDirectory } from '@/application/ports/calendar-event-context';
import type { CalendarEventRepository } from '@/application/ports/calendar-event-repository';
import type { JourneyRepository } from '@/application/ports/journey-repository';
import { createFirstWeekCalendarEvents } from './create-first-week-calendar-events';

/**
 * Réponse au cas limite « date d'arrivée reportée » du cahier des charges,
 * couvert par T-09 (recalcul pur, `rescheduleForArrivalDate`) et resté sans
 * appelant en production jusqu'à ce ticket (T-25) : aucun point de la
 * plateforme ne pouvait jusqu'ici changer `journeys.arrival_date`. Ce cas
 * d'usage est ce point — recalcule les échéances des tâches encore ouvertes,
 * puis déplace (jamais ne duplique) les évènements d'agenda déjà créés.
 */

export interface RescheduleJourneyInput {
  readonly companyId: string;
  readonly journeyId: string;
  readonly newArrivalDate: PlainDate;
}

export type RescheduleJourneyResult =
  | {
      readonly ok: true;
      readonly movedTaskCount: number;
      readonly movedEventCount: number;
      readonly failedEventTaskIds: readonly string[];
    }
  | { readonly ok: false; readonly reason: 'not_found' }
  | { readonly ok: false; readonly reason: 'terminal_status' };

export interface RescheduleJourneyPorts {
  readonly journeys: JourneyRepository;
  readonly calendarDirectory: CalendarDirectory;
  readonly calendarEvents: CalendarEventRepository;
  readonly calendar: Calendar;
  readonly context: CalendarEventContextDirectory;
  readonly audit: AuditTrail;
}

const SYSTEM_ACTOR = null;
const TERMINAL_STATUSES = new Set(['completed', 'cancelled']);

export async function rescheduleJourney(
  ports: RescheduleJourneyPorts,
  input: RescheduleJourneyInput,
): Promise<RescheduleJourneyResult> {
  const journey = await ports.journeys.findById(input.journeyId);
  if (!journey || journey.companyId !== input.companyId) {
    return { ok: false, reason: 'not_found' };
  }
  if (TERMINAL_STATUSES.has(journey.status)) {
    return { ok: false, reason: 'terminal_status' };
  }

  const previousArrivalDate = journey.arrivalDate;
  const workingCalendar = await ports.calendarDirectory.calendarFor(input.companyId, journey.siteId);
  const openSchedules = await ports.journeys.openTaskSchedules(input.journeyId);

  const changes = rescheduleForArrivalDate(
    openSchedules.map((task) => ({ taskId: task.taskId, offsetInWorkingDays: task.offsetInWorkingDays })),
    openSchedules.map((task) => ({ taskId: task.taskId, dueDate: task.dueDate })),
    input.newArrivalDate,
    workingCalendar,
  );
  const newDueDateByTask = new Map(changes.map((change) => [change.taskId, change.dueDate]));
  const movedTaskCount = changes.filter(hasMoved).length;

  await ports.journeys.updateArrivalDate(input.journeyId, input.newArrivalDate);
  await ports.journeys.updateTaskDueDates(changes.map((change) => ({ taskId: change.taskId, dueDate: change.dueDate })));

  await ports.audit.record({
    companyId: input.companyId,
    actorId: SYSTEM_ACTOR,
    action: 'journey.rescheduled',
    journeyId: input.journeyId,
    payload: { previousArrivalDate, newArrivalDate: input.newArrivalDate, movedTaskCount },
  });

  const timeZone = await ports.context.timeZoneFor(input.companyId, journey.siteId);
  const existingEvents = await ports.calendarEvents.listByJourney(input.journeyId);

  let movedEventCount = 0;
  const failedEventTaskIds: string[] = [];

  for (const event of existingEvents) {
    if (event.status !== 'scheduled' || !event.taskId) continue;
    const newDueDate = newDueDateByTask.get(event.taskId);
    if (!newDueDate) continue;

    const { startsAt, endsAt } = eventWindowFor(newDueDate);
    if (startsAt === event.startsAt && endsAt === event.endsAt) continue;

    if (!event.externalEventId) {
      failedEventTaskIds.push(event.taskId);
      await ports.audit.record({
        companyId: input.companyId,
        actorId: SYSTEM_ACTOR,
        action: 'calendar.event_move_failed',
        journeyId: input.journeyId,
        taskId: event.taskId,
        payload: { reason: 'no_external_event_id' },
      });
      continue;
    }

    const result = await ports.calendar.updateEvent(event.externalEventId, {
      title: event.title,
      description: event.title,
      startsAt,
      endsAt,
      timeZone,
      attendeeEmails: [],
    });

    if (!result.ok) {
      failedEventTaskIds.push(event.taskId);
      await ports.audit.record({
        companyId: input.companyId,
        actorId: SYSTEM_ACTOR,
        action: 'calendar.event_move_failed',
        journeyId: input.journeyId,
        taskId: event.taskId,
        payload: { reason: result.reason, detail: result.detail },
      });
      continue;
    }

    await ports.calendarEvents.updateTiming(event.id, {
      startsAt,
      endsAt,
      externalEventId: result.externalEventId,
    });
    movedEventCount += 1;
    await ports.audit.record({
      companyId: input.companyId,
      actorId: SYSTEM_ACTOR,
      action: 'calendar.event_moved',
      journeyId: input.journeyId,
      taskId: event.taskId,
      payload: { externalEventId: result.externalEventId, newDueDate },
    });
  }

  // Une tache qui entre dans la premiere semaine a cause du report (elle n'en
  // faisait pas partie avant) n'a encore aucun evenement : on retente une
  // creation, idempotente pour celles deja deplacees ci-dessus.
  await createFirstWeekCalendarEvents(
    { calendar: ports.calendar, calendarEvents: ports.calendarEvents, context: ports.context, audit: ports.audit },
    {
      companyId: input.companyId,
      journeyId: input.journeyId,
      siteId: journey.siteId,
      arrivalDate: input.newArrivalDate,
      tasks: openSchedules.map((task) => ({
        id: task.taskId,
        title: task.title,
        ownerId: task.ownerId,
        dueDate: newDueDateByTask.get(task.taskId) ?? task.dueDate,
      })),
    },
  );

  return { ok: true, movedTaskCount, movedEventCount, failedEventTaskIds };
}
