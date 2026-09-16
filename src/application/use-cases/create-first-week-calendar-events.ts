import { eventWindowFor } from '@/domain/scheduling/event-window';
import { isWithinFirstWeek } from '@/domain/scheduling/first-week';
import type { PlainDate } from '@/domain/scheduling/plain-date';
import type { AuditTrail } from '@/application/ports/audit-trail';
import type { Calendar } from '@/application/ports/calendar';
import type { CalendarEventContextDirectory } from '@/application/ports/calendar-event-context';
import type { CalendarEventRepository } from '@/application/ports/calendar-event-repository';

/**
 * W1 (T-21) déclenche ceci au point d'accroche `journey.calendar_events_pending`
 * qu'il enregistrait déjà — comme T-24 pour l'email de bienvenue, sauf qu'ici
 * la création est synchrone : rien n'exige de différer un évènement d'agenda
 * à l'inverse de l'email (voir `resolveWelcomeEmailSendDate`). Un report de
 * date ultérieur passe par `reschedule-journey.ts`, jamais par ici une
 * seconde fois pour les tâches déjà créées.
 *
 * Titre et description restent le texte de gabarit de la tâche : aucune
 * donnée personnelle n'entre jamais dans un évènement (voir la DoD du ticket).
 */
const EVENT_DESCRIPTION =
  "Étape de votre parcours d'intégration. Le détail se trouve dans votre portail employé.";

export interface FirstWeekTaskInput {
  readonly id: string;
  readonly title: string;
  readonly dueDate: PlainDate;
  /** Null tant que le responsable n'est pas encore resolu. */
  readonly ownerId: string | null;
}

export interface CreateFirstWeekCalendarEventsInput {
  readonly companyId: string;
  readonly journeyId: string;
  readonly siteId: string | null;
  readonly arrivalDate: PlainDate;
  readonly tasks: readonly FirstWeekTaskInput[];
}

export interface CreateFirstWeekCalendarEventsPorts {
  readonly calendar: Calendar;
  readonly calendarEvents: CalendarEventRepository;
  readonly context: CalendarEventContextDirectory;
  readonly audit: AuditTrail;
}

export interface CreateFirstWeekCalendarEventsResult {
  readonly createdTaskIds: readonly string[];
  readonly failedTaskIds: readonly string[];
}

const SYSTEM_ACTOR = null;

export async function createFirstWeekCalendarEvents(
  ports: CreateFirstWeekCalendarEventsPorts,
  input: CreateFirstWeekCalendarEventsInput,
): Promise<CreateFirstWeekCalendarEventsResult> {
  const timeZone = await ports.context.timeZoneFor(input.companyId, input.siteId);
  const firstWeekTasks = input.tasks.filter((task) => isWithinFirstWeek(task.dueDate, input.arrivalDate));

  const created: string[] = [];
  const failed: string[] = [];

  for (const task of firstWeekTasks) {
    // Idempotent : un rejeu ne cree jamais un second evenement pour la meme tache.
    const existing = await ports.calendarEvents.findByTask(task.id);
    if (existing && existing.status === 'scheduled') {
      continue;
    }

    // Participant sans compte agenda d'entreprise : on ne bloque jamais la
    // creation de l'evenement pour le reste de l'equipe — l'evenement se cree
    // sans participant nomme plutot que d'echouer tout le lot.
    const attendeeEmail = task.ownerId ? await ports.context.emailFor(task.ownerId) : null;

    const { startsAt, endsAt } = eventWindowFor(task.dueDate);

    const result = await ports.calendar.createEvent({
      title: task.title,
      description: EVENT_DESCRIPTION,
      startsAt,
      endsAt,
      timeZone,
      attendeeEmails: attendeeEmail ? [attendeeEmail] : [],
    });

    if (!result.ok) {
      failed.push(task.id);
      await ports.audit.record({
        companyId: input.companyId,
        actorId: SYSTEM_ACTOR,
        action: 'calendar.event_creation_failed',
        journeyId: input.journeyId,
        taskId: task.id,
        payload: { origin: 'first-week-agenda', reason: result.reason, detail: result.detail },
      });
      continue;
    }

    await ports.calendarEvents.create({
      companyId: input.companyId,
      journeyId: input.journeyId,
      taskId: task.id,
      externalEventId: result.externalEventId,
      title: task.title,
      startsAt,
      endsAt,
      timeZone,
    });

    created.push(task.id);
    await ports.audit.record({
      companyId: input.companyId,
      actorId: SYSTEM_ACTOR,
      action: 'calendar.event_created',
      journeyId: input.journeyId,
      taskId: task.id,
      payload: { origin: 'first-week-agenda', externalEventId: result.externalEventId },
    });
  }

  return { createdTaskIds: created, failedTaskIds: failed };
}
