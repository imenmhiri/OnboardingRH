/**
 * Persistance locale des évènements créés (T-25). C'est elle, et jamais un
 * appel direct à Google, que le portail employé lit pour afficher l'agenda —
 * une panne du fournisseur agenda ne doit jamais rendre le portail
 * inutilisable. C'est aussi elle qui permet de savoir, avant un report de
 * date, qu'un évènement existe déjà pour une tâche : condition du
 * "déplacé, jamais dupliqué" exigé par le ticket.
 */

export type CalendarEventStatus = 'scheduled' | 'cancelled';

export interface CalendarEventRecord {
  readonly id: string;
  readonly companyId: string;
  readonly journeyId: string;
  readonly taskId: string | null;
  readonly externalEventId: string | null;
  readonly title: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly timeZone: string;
  readonly status: CalendarEventStatus;
}

export interface NewCalendarEventRecord {
  readonly companyId: string;
  readonly journeyId: string;
  readonly taskId: string | null;
  readonly externalEventId: string | null;
  readonly title: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly timeZone: string;
}

export interface CalendarEventTiming {
  readonly startsAt: string;
  readonly endsAt: string;
  readonly externalEventId: string | null;
}

export interface CalendarEventRepository {
  listByJourney(journeyId: string): Promise<readonly CalendarEventRecord[]>;
  findByTask(taskId: string): Promise<CalendarEventRecord | null>;
  create(record: NewCalendarEventRecord): Promise<CalendarEventRecord>;
  updateTiming(id: string, timing: CalendarEventTiming): Promise<void>;
  markCancelled(id: string): Promise<void>;
}
