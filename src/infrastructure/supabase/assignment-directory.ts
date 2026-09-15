import type { AssignmentDirectory } from '@/application/ports/assignment-directory';
import { parsePlainDate } from '@/domain/scheduling/plain-date';
import type { Absence, AssignmentContext, OwnerSlot } from '@/domain/tasks/owner-resolution';
import type { OwnerRole } from '@/domain/tasks/task';
import { createSupabaseServerClient } from './server-client';

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export function supabaseAssignmentDirectory(client: SupabaseClient): AssignmentDirectory {
  return {
    async fallbackChainFor(companyId: string, ownerRole: OwnerRole): Promise<readonly OwnerSlot[]> {
      const { data, error } = await client
        .from('assignment_rules')
        .select('fallback_chain')
        .eq('company_id', companyId)
        .eq('owner_role', ownerRole)
        .maybeSingle();

      // Aucune chaine configuree : on ne devine pas. La tache remontera comme
      // non attribuable, ce qui est visible, plutot que d'etre attribuee au
      // hasard, ce qui ne l'est pas.
      if (error || !data) {
        return [];
      }
      return data.fallback_chain as OwnerSlot[];
    },

    async contextFor(journeyId: string): Promise<AssignmentContext | null> {
      const { data: journey, error } = await client
        .from('journeys')
        .select('company_id, employee_id, manager_id')
        .eq('id', journeyId)
        .maybeSingle();

      if (error || !journey) {
        return null;
      }

      const { data: members } = await client
        .from('company_members')
        .select('user_id, role, reports_to')
        .eq('company_id', journey.company_id);

      const rows = (members ?? []) as { user_id: string; role: OwnerRole; reports_to: string | null }[];
      const managerRow = rows.find((row) => row.user_id === journey.manager_id);

      return {
        employeeId: journey.employee_id,
        managerId: journey.manager_id,
        managerOfManagerId: managerRow?.reports_to ?? null,
        hrAdminIds: rows.filter((row) => row.role === 'hr_admin').map((row) => row.user_id),
        itMemberIds: rows.filter((row) => row.role === 'it').map((row) => row.user_id),
      };
    },

    async absencesBetween(companyId: string, from: string, to: string): Promise<readonly Absence[]> {
      // Chevauchement de periodes : une absence compte des qu'elle croise la
      // fenetre, meme si elle commence avant ou finit apres.
      const { data, error } = await client
        .from('absences')
        .select('person_id, starts_on, ends_on')
        .eq('company_id', companyId)
        .lte('starts_on', to)
        .gte('ends_on', from);

      if (error || !data) {
        return [];
      }
      return (data as { person_id: string; starts_on: string; ends_on: string }[]).map((row) => ({
        personId: row.person_id,
        from: parsePlainDate(row.starts_on),
        to: parsePlainDate(row.ends_on),
      }));
    },
  };
}
