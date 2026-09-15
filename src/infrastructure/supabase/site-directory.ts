import type { CompanySite, SiteDirectory } from '@/application/ports/site-directory';
import { createSupabaseServerClient } from './server-client';

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export function supabaseSiteDirectory(client: SupabaseClient): SiteDirectory {
  return {
    async listByCompany(companyId: string): Promise<readonly CompanySite[]> {
      const { data, error } = await client.from('sites').select('id, slug, name').eq('company_id', companyId).order('name');
      if (error || !data) return [];
      return data;
    },
  };
}
