import type { Clock } from '@/application/ports/clock';
import { parsePlainDate, type PlainDate } from '@/domain/scheduling/plain-date';

/**
 * Seule implementation autorisee a lire l'heure systeme. Le fuseau vient de la
 * societe ou du site : c'est une donnee, pas une constante du code.
 *
 * `now` est injectable pour que les scenarios temporels restent reproductibles.
 */
export function createSystemClock(timeZone: string, now: () => Date = () => new Date()): Clock {
  // 'en-CA' formate en AAAA-MM-JJ, ce qui evite un decoupage manuel de la date.
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  return {
    today(): PlainDate {
      return parsePlainDate(formatter.format(now()));
    },
  };
}
