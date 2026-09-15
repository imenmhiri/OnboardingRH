import { comparePlainDates, type PlainDate } from './plain-date';
import { addWorkingDays, countWorkingDaysBetween, type WorkingCalendar } from './working-calendar';

/**
 * A template task expresses its deadline relative to the arrival date, in
 * working days: -2 for the IT account that must exist two days before the
 * employee shows up, +5 for the first-week feedback point.
 */
export interface DeadlineRule {
  readonly taskId: string;
  readonly offsetInWorkingDays: number;
}

export interface Deadline {
  readonly taskId: string;
  readonly dueDate: PlainDate;
}

export interface DeadlineChange extends Deadline {
  readonly previousDueDate: PlainDate | null;
  readonly shiftedByWorkingDays: number;
}

export function computeDueDate(
  arrivalDate: PlainDate,
  offsetInWorkingDays: number,
  calendar: WorkingCalendar,
): PlainDate {
  return addWorkingDays(arrivalDate, offsetInWorkingDays, calendar);
}

export function scheduleDeadlines(
  rules: readonly DeadlineRule[],
  arrivalDate: PlainDate,
  calendar: WorkingCalendar,
): readonly Deadline[] {
  return rules.map((rule) => ({
    taskId: rule.taskId,
    dueDate: computeDueDate(arrivalDate, rule.offsetInWorkingDays, calendar),
  }));
}

/**
 * A postponed arrival date moves the whole journey: every deadline is
 * recomputed from the rules rather than translated by the gap, because the
 * weekends and holidays crossed are not the same ones.
 */
export function rescheduleForArrivalDate(
  rules: readonly DeadlineRule[],
  previousDeadlines: readonly Deadline[],
  newArrivalDate: PlainDate,
  calendar: WorkingCalendar,
): readonly DeadlineChange[] {
  const previousByTask = new Map(previousDeadlines.map((d) => [d.taskId, d.dueDate]));
  return scheduleDeadlines(rules, newArrivalDate, calendar).map((deadline) => {
    const previousDueDate = previousByTask.get(deadline.taskId) ?? null;
    return {
      ...deadline,
      previousDueDate,
      shiftedByWorkingDays:
        previousDueDate === null
          ? 0
          : countWorkingDaysBetween(previousDueDate, deadline.dueDate, calendar),
    };
  });
}

export function hasMoved(change: DeadlineChange): boolean {
  return change.previousDueDate !== null && comparePlainDates(change.previousDueDate, change.dueDate) !== 0;
}

/** Working days past the deadline; zero while the task is still on time. */
export function workingDaysLate(
  dueDate: PlainDate,
  today: PlainDate,
  calendar: WorkingCalendar,
): number {
  return Math.max(0, countWorkingDaysBetween(dueDate, today, calendar));
}

export function isOverdue(
  dueDate: PlainDate,
  today: PlainDate,
  calendar: WorkingCalendar,
): boolean {
  return workingDaysLate(dueDate, today, calendar) > 0;
}
