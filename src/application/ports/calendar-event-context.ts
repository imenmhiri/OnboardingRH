/**
 * Ce dont la création d'évènements d'agenda a besoin et qui ne vit pas déjà
 * dans un autre port : le fuseau horaire résolu (site en priorité, société en
 * repli — `domain/companies/time-zone-resolution`) et l'adresse d'un
 * responsable, quand elle existe.
 */
export interface CalendarEventContextDirectory {
  timeZoneFor(companyId: string, siteId: string | null): Promise<string>;
  /** Null si la personne n'a pas de compte (pas encore créé) — jamais une erreur. */
  emailFor(personId: string): Promise<string | null>;
}
