import type { CalendarEventContextDirectory } from '@/application/ports/calendar-event-context';
import { resolveTimeZone } from '@/domain/companies/time-zone-resolution';
import { createSupabaseServiceClient } from './service-client';

type SupabaseClient = ReturnType<typeof createSupabaseServiceClient>;

export function supabaseCalendarEventContextDirectory(client: SupabaseClient): CalendarEventContextDirectory {
  return {
    async timeZoneFor(companyId: string, siteId: string | null): Promise<string> {
      const { data: company } = await client.from('companies').select('time_zone').eq('id', companyId).maybeSingle();
      const { data: site } = siteId
        ? await client.from('sites').select('time_zone').eq('id', siteId).maybeSingle()
        : { data: null };
      if (!company) {
        // Meme discipline que le calendrier de jours ouvres (T-11) : une
        // societe introuvable ne doit jamais degrader silencieusement.
        throw new Error(`Societe introuvable pour la resolution du fuseau horaire : ${companyId}`);
      }
      return resolveTimeZone({ timeZone: company.time_zone }, site ? { timeZone: site.time_zone } : null);
    },

    async emailFor(personId: string): Promise<string | null> {
      const { data } = await client.auth.admin.getUserById(personId);
      return data.user?.email ?? null;
    },
  };
}
