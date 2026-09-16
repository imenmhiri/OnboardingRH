import { addCalendarDays, comparePlainDates, type PlainDate } from './plain-date';

/**
 * « La première semaine » couvre l'arrivée et les six jours civils suivants —
 * la même fenêtre que le portail employé (T-17) affiche déjà. Extrait ici pour
 * que le portail et la création des évènements d'agenda (T-25) ne recalculent
 * jamais deux fois la même règle.
 */
export const FIRST_WEEK_SPAN_IN_CALENDAR_DAYS = 7;

export function firstWeekEnd(arrivalDate: PlainDate): PlainDate {
  return addCalendarDays(arrivalDate, FIRST_WEEK_SPAN_IN_CALENDAR_DAYS);
}

export function isWithinFirstWeek(dueDate: PlainDate, arrivalDate: PlainDate): boolean {
  const end = firstWeekEnd(arrivalDate);
  return comparePlainDates(dueDate, arrivalDate) >= 0 && comparePlainDates(dueDate, end) <= 0;
}
