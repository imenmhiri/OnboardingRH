import type { PlainDate } from '@/domain/scheduling/plain-date';

/** « 28 septembre » — formatted in UTC so the civil date never shifts with the reader's timezone. */
export function formatDayMonth(date: PlainDate): string {
  const [year = 1970, month = 1, day = 1] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}
