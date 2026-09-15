import type { PlainDate, Weekday } from '../scheduling/plain-date';
import {
  createWorkingCalendar,
  mergeHolidays,
  type WorkingCalendar,
} from '../scheduling/working-calendar';

/**
 * Turns the rows read from the database into the calendar the scheduling
 * engine consumes. Everything that differs between subsidiaries — the working
 * week, the holidays observed — arrives here as data; adding a subsidiary is an
 * insert, and this function never learns its name.
 */

export interface CompanyCalendarConfig {
  readonly id: string;
  readonly weekend: readonly Weekday[];
}

export interface SiteCalendarConfig {
  readonly id: string;
  /** Null when the site follows the company working week. */
  readonly weekend: readonly Weekday[] | null;
}

export interface HolidayRecord {
  readonly observedOn: PlainDate;
  /** Null when the holiday applies to every site of the company. */
  readonly siteId: string | null;
  readonly label: string;
}

export function resolveWorkingCalendar(
  company: CompanyCalendarConfig,
  site: SiteCalendarConfig | null,
  holidays: readonly HolidayRecord[],
): WorkingCalendar {
  const companyWide = holidays.filter((holiday) => holiday.siteId === null);
  const siteSpecific =
    site === null ? [] : holidays.filter((holiday) => holiday.siteId === site.id);

  return createWorkingCalendar({
    weekend: site?.weekend ?? company.weekend,
    holidays: mergeHolidays(
      companyWide.map((holiday) => holiday.observedOn),
      siteSpecific.map((holiday) => holiday.observedOn),
    ),
  });
}

/** Why a given day is not worked — an interface never shows a bare "indisponible". */
export function explainNonWorkingDay(
  date: PlainDate,
  holidays: readonly HolidayRecord[],
): string | null {
  const holiday = holidays.find((candidate) => candidate.observedOn === date);
  return holiday ? holiday.label : null;
}
