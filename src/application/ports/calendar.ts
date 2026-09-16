/**
 * Port agenda (T-25). Aucune dépendance à Google ici : le domaine et les cas
 * d'usage ne connaissent que cette interface, comme `Mailer` (T-24) pour
 * Resend. Un évènement se crée, se déplace (jamais dupliqué — voir
 * `reschedule-journey.ts`) et s'annule.
 *
 * Titre et description restent volontairement génériques : ce sont ceux de la
 * tâche du parcours (déjà un texte de gabarit, jamais un nom, une adresse ou
 * une référence de document), pour rester sûrs même si le calendrier est un
 * jour partagé ou exporté.
 */

export interface CalendarEventInput {
  readonly title: string;
  readonly description: string;
  /** Heure locale naïve, "YYYY-MM-DDTHH:mm:ss", interprétée dans `timeZone`. */
  readonly startsAt: string;
  readonly endsAt: string;
  /** Identifiant IANA — voir `domain/companies/time-zone-resolution`. */
  readonly timeZone: string;
  /** Vide si aucun compte agenda d'entreprise n'a pu être résolu pour le responsable. */
  readonly attendeeEmails: readonly string[];
}

export type CalendarWriteFailureReason = 'provider_error';

export type CalendarEventResult =
  | { readonly ok: true; readonly externalEventId: string }
  | { readonly ok: false; readonly reason: CalendarWriteFailureReason; readonly detail: string };

export type CalendarVoidResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: CalendarWriteFailureReason; readonly detail: string };

export interface Calendar {
  createEvent(input: CalendarEventInput): Promise<CalendarEventResult>;
  /** Déplace l'évènement existant — ne crée jamais une seconde occurrence. */
  updateEvent(externalEventId: string, input: CalendarEventInput): Promise<CalendarEventResult>;
  cancelEvent(externalEventId: string): Promise<CalendarVoidResult>;
}
