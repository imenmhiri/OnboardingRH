import { parsePlainDate, type Weekday } from '@/domain/scheduling/plain-date';
import type { WorkingCalendar } from '@/domain/scheduling/working-calendar';
import { resolveWorkingCalendar, type HolidayRecord } from '@/domain/companies/working-calendar-resolution';
import type { CalendarDirectory } from '@/application/ports/calendar-directory';
import { createSupabaseServiceClient } from './service-client';

type SupabaseClient = ReturnType<typeof createSupabaseServiceClient>;

function asWeekdayArray(value: unknown): readonly Weekday[] {
  if (Array.isArray(value)) return value as Weekday[];
  return String(value ?? '')
    .replace(/^\{|\}$/g, '')
    .split(',')
    .filter(Boolean) as Weekday[];
}

/** Meme lecture que l'ecran de creation de parcours (T-11) : une seule facon de resoudre un calendrier. */
export function supabaseCalendarDirectory(client: SupabaseClient): CalendarDirectory {
  return {
    async calendarFor(companyId: string, siteId: string | null): Promise<WorkingCalendar> {
      const { data: company } = await client.from('companies').select('weekend').eq('id', companyId).maybeSingle();
      const { data: siteRow } = siteId
        ? await client.from('sites').select('id, weekend').eq('id', siteId).maybeSingle()
        : { data: null };
      const { data: holidayRows } = await client
        .from('holidays')
        .select('observed_on, site_id, label')
        .eq('company_id', companyId);

      if (!company) {
        // Une societe introuvable ne doit jamais degrader silencieusement vers
        // un calendrier par defaut : le webhook aurait alors calcule des
        // echeances fausses sans que personne ne le sache.
        throw new Error(`Societe introuvable pour le calcul du calendrier : ${companyId}`);
      }

      const holidays: HolidayRecord[] = (
        (holidayRows ?? []) as { observed_on: string; site_id: string | null; label: string }[]
      ).map((row) => ({
        observedOn: parsePlainDate(row.observed_on),
        siteId: row.site_id,
        label: row.label,
      }));

      return resolveWorkingCalendar(
        { id: companyId, weekend: asWeekdayArray(company.weekend) },
        siteRow ? { id: siteRow.id, weekend: siteRow.weekend ? asWeekdayArray(siteRow.weekend) : null } : null,
        holidays,
      );
    },
  };
}

