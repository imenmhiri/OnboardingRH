import type { KnownIdentifiers } from '@/domain/privacy/anonymize-comment';
import type { RosterDirectory } from '@/application/ports/roster-directory';
import { createSupabaseServiceClient } from './service-client';

type SupabaseClient = ReturnType<typeof createSupabaseServiceClient>;

/**
 * Assemble le roster d'identifiants connus d'une societe : noms de tous les
 * membres (RH, IT, managers, employes) et de tous les arrivants nommes sur
 * un parcours (meme sans compte cree), emails connus, noms de site et de
 * societe. Purement de la lecture — aucune decision d'anonymisation ici,
 * c'est `domain/privacy/anonymize-comment` qui l'applique.
 */
export function supabaseRosterDirectory(client: SupabaseClient): RosterDirectory {
  return {
    async rosterFor(companyId: string): Promise<KnownIdentifiers> {
      const [{ data: companyRow }, { data: memberRows }, { data: journeyRows }, { data: siteRows }] = await Promise.all([
        client.from('companies').select('name').eq('id', companyId).maybeSingle(),
        client.from('company_members').select('user_id, profiles (full_name)').eq('company_id', companyId),
        client.from('journeys').select('employee_name, personal_email').eq('company_id', companyId),
        client.from('sites').select('name').eq('company_id', companyId),
      ]);

      const names = new Set<string>();
      const emails = new Set<string>();
      const teamLabels = new Set<string>();

      if (companyRow?.name) teamLabels.add(companyRow.name);
      for (const site of (siteRows ?? []) as { name: string }[]) {
        teamLabels.add(site.name);
      }

      type MemberRow = { user_id: string; profiles: { full_name: string } | null };
      const members = (memberRows ?? []) as unknown as MemberRow[];
      for (const member of members) {
        if (member.profiles?.full_name) names.add(member.profiles.full_name);
      }
      // Les emails d'authentification exigent l'API admin, appelee une fois
      // par membre : le volume (quelques dizaines de personnes par societe
      // de demo) ne justifie pas une jointure SQL sur auth.users.
      for (const member of members) {
        const { data: account } = await client.auth.admin.getUserById(member.user_id);
        if (account.user?.email) emails.add(account.user.email);
      }

      type JourneyRow = { employee_name: string; personal_email: string | null };
      for (const journey of (journeyRows ?? []) as JourneyRow[]) {
        if (journey.employee_name) names.add(journey.employee_name);
        if (journey.personal_email) emails.add(journey.personal_email);
      }

      return { names: [...names], emails: [...emails], teamLabels: [...teamLabels] };
    },
  };
}
