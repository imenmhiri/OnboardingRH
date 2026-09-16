import type { WorkingCalendar } from '@/domain/scheduling/working-calendar';

/**
 * Resout le calendrier ouvre d'une societe et, le cas echeant, d'un site :
 * semaine de travail et feries. `domain/companies/working-calendar-resolution`
 * fait le calcul ; ce port ne fait que charger les lignes necessaires.
 */
export interface CalendarDirectory {
  calendarFor(companyId: string, siteId: string | null): Promise<WorkingCalendar>;
}
