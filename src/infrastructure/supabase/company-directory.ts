import type {
  AuthenticatedUser,
  CompanyDirectory,
  SessionReader,
} from '@/application/ports/company-directory';
import type { Membership, Role } from '@/domain/companies/access';
import type { CompanyBranding } from '@/lib/branding';
import { createSupabaseServerClient } from './server-client';

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

interface MembershipRow {
  readonly company_id: string;
  readonly role: Role;
  readonly companies: { readonly slug: string; readonly name: string } | null;
}

export function supabaseSessionReader(client: SupabaseClient): SessionReader {
  return {
    async currentUser(): Promise<AuthenticatedUser | null> {
      const { data, error } = await client.auth.getUser();
      if (error || !data.user) {
        return null;
      }
      return {
        id: data.user.id,
        email: data.user.email ?? '',
        fullName: (data.user.user_metadata['full_name'] as string | undefined) ?? null,
      };
    },
  };
}

export function supabaseCompanyDirectory(client: SupabaseClient): CompanyDirectory {
  return {
    async membershipsOf(userId: string): Promise<readonly Membership[]> {
      // La RLS filtre deja ; le filtre explicite garde la requete lisible.
      const { data, error } = await client
        .from('company_members')
        .select('company_id, role, companies (slug, name)')
        .eq('user_id', userId)
        .order('company_id');

      if (error || !data) {
        return [];
      }

      return (data as unknown as MembershipRow[])
        .filter((row): row is MembershipRow & { companies: { slug: string; name: string } } =>
          row.companies !== null,
        )
        .map((row) => ({
          companyId: row.company_id,
          companySlug: row.companies.slug,
          companyName: row.companies.name,
          role: row.role,
        }));
    },

    async brandingOf(companyId: string): Promise<CompanyBranding | null> {
      const { data, error } = await client
        .from('companies')
        .select('name, brand_primary, brand_accent, logo_url')
        .eq('id', companyId)
        .maybeSingle();

      if (error || !data) {
        return null;
      }
      return {
        name: data.name,
        primary: data.brand_primary,
        accent: data.brand_accent,
        logoUrl: data.logo_url,
      };
    },
  };
}
