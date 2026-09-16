/**
 * Un site suit le fuseau horaire du siège sauf s'il en déclare un lui-même
 * (`sites.time_zone`, nullable). Une filiale étrangère ou un site en horaire
 * décalé n'est pas un cas particulier codé en dur : c'est une donnée qui
 * l'emporte simplement sur celle de la société quand elle existe.
 */

export interface TimeZoneSource {
  readonly timeZone: string | null;
}

const DEFAULT_TIME_ZONE = 'UTC';

export function resolveTimeZone(company: TimeZoneSource, site: TimeZoneSource | null): string {
  return site?.timeZone ?? company.timeZone ?? DEFAULT_TIME_ZONE;
}
