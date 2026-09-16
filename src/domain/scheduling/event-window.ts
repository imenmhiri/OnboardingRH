import type { PlainDate } from './plain-date';

/**
 * Un créneau d'une heure, en heure locale du fuseau qui sera transmis à côté
 * (Google Calendar interprète `dateTime` dans le `timeZone` fourni séparément :
 * aucune conversion en instant UTC n'est nécessaire ici, ce qui évite de
 * réimplémenter une table de fuseaux horaires). 9h est arbitraire mais fixe,
 * pour que deux appels sur la même échéance produisent le même créneau.
 */
const EVENT_START_HOUR = '09:00:00';
const EVENT_END_HOUR = '10:00:00';

export interface EventWindow {
  readonly startsAt: string;
  readonly endsAt: string;
}

export function eventWindowFor(date: PlainDate): EventWindow {
  return {
    startsAt: `${date}T${EVENT_START_HOUR}`,
    endsAt: `${date}T${EVENT_END_HOUR}`,
  };
}
