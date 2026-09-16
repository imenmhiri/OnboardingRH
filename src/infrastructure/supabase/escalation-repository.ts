import { parsePlainDate, type PlainDate } from '@/domain/scheduling/plain-date';
import type { OwnerRole, Task } from '@/domain/tasks/task';
import type { JourneyStatusForEscalation } from '@/domain/escalation/escalation-candidates';
import type { Criticality, EscalationLevel, EscalationPolicy } from '@/domain/escalation/escalation-policy';
import type {
  EscalationJourneySource,
  EscalationRepository,
  PersonContact,
} from '@/application/ports/escalation-repository';
import { createSupabaseServiceClient } from './service-client';

type SupabaseClient = ReturnType<typeof createSupabaseServiceClient>;

/**
 * Une societe qui n'a pas encore de statut d'escalade "active" ou "interrompue"
 * mappee ne relance jamais silencieusement au hasard : `draft` et tout statut
 * imprevu sont traites comme interrompus, jamais comme actifs par defaut.
 */
function toEscalationStatus(status: string): JourneyStatusForEscalation {
  return status === 'scheduled' || status === 'in_progress' ? 'active' : 'interrupted';
}

export function supabaseEscalationRepository(client: SupabaseClient): EscalationRepository {
  return {
    async journeysWithTasks(companyId: string): Promise<readonly EscalationJourneySource[]> {
      const { data: journeyRows, error: journeyError } = await client
        .from('journeys')
        .select('id, site_id, employee_name, manager_id, status')
        .eq('company_id', companyId);

      if (journeyError || !journeyRows || journeyRows.length === 0) {
        return [];
      }

      const journeyIds = journeyRows.map((row) => row.id as string);

      const { data: taskRows, error: taskError } = await client
        .from('tasks')
        .select('id, journey_id, title, owner_role, owner_id, status, due_on, expected_document, shared_key, criticality')
        .in('journey_id', journeyIds);

      if (taskError) {
        return [];
      }

      const taskIds = (taskRows ?? []).map((row) => row.id as string);
      const { data: depRows } = taskIds.length
        ? await client.from('task_dependencies').select('task_id, depends_on_id').in('task_id', taskIds)
        : { data: [] as { task_id: string; depends_on_id: string }[] };

      const dependsOnByTask = new Map<string, string[]>();
      for (const dep of depRows ?? []) {
        dependsOnByTask.set(dep.task_id, [...(dependsOnByTask.get(dep.task_id) ?? []), dep.depends_on_id]);
      }

      const tasksByJourney = new Map<string, Task[]>();
      for (const row of taskRows ?? []) {
        const task: Task = {
          id: row.id,
          journeyId: row.journey_id,
          title: row.title,
          ownerRole: row.owner_role as OwnerRole,
          ownerId: row.owner_id,
          dependsOn: dependsOnByTask.get(row.id) ?? [],
          status: row.status,
          dueDate: parsePlainDate(row.due_on),
          expectedDocument: row.expected_document,
          sharedKey: row.shared_key,
          criticality: row.criticality as Criticality,
        };
        tasksByJourney.set(row.journey_id, [...(tasksByJourney.get(row.journey_id) ?? []), task]);
      }

      return journeyRows.map((row) => ({
        journeyId: row.id,
        employeeName: row.employee_name,
        siteId: row.site_id,
        managerId: row.manager_id,
        status: toEscalationStatus(row.status),
        tasks: tasksByJourney.get(row.id) ?? [],
      }));
    },

    async policyFor(companyId: string): Promise<EscalationPolicy | null> {
      const { data, error } = await client
        .from('escalation_levels')
        .select('criticality, after_working_days_late, recipient')
        .eq('company_id', companyId);

      if (error || !data || data.length === 0) {
        // Aucun seuil configure : on ne devine jamais une politique par
        // defaut, la societe n'a simplement pas encore ete parametree.
        return null;
      }

      const rows = data as { criticality: Criticality; after_working_days_late: number; recipient: EscalationLevel['recipient'] }[];
      const toLevel = (row: (typeof rows)[number]): EscalationLevel => ({
        afterWorkingDaysLate: row.after_working_days_late,
        recipient: row.recipient,
      });

      return {
        companyId,
        standard: rows.filter((row) => row.criticality === 'standard').map(toLevel),
        critical: rows.filter((row) => row.criticality === 'critical').map(toLevel),
      };
    },

    async hrAdminIds(companyId: string): Promise<readonly string[]> {
      const { data, error } = await client
        .from('company_members')
        .select('user_id, role')
        .eq('company_id', companyId)
        .eq('role', 'hr_admin');

      if (error || !data) {
        return [];
      }
      return data.map((row) => row.user_id as string);
    },

    async lastReminderDates(
      companyId: string,
      taskIds: readonly string[],
    ): Promise<ReadonlyMap<string, PlainDate>> {
      if (taskIds.length === 0) {
        return new Map();
      }
      const { data, error } = await client
        .from('audit_events')
        .select('task_id, created_at')
        .eq('company_id', companyId)
        .eq('action', 'task.reminder_sent')
        .in('task_id', taskIds)
        .order('created_at', { ascending: false });

      if (error || !data) {
        return new Map();
      }

      // Trie du plus recent au plus ancien : la premiere ligne rencontree
      // pour une tache est donc sa derniere relance.
      const result = new Map<string, PlainDate>();
      for (const row of data as { task_id: string | null; created_at: string }[]) {
        if (!row.task_id || result.has(row.task_id)) {
          continue;
        }
        result.set(row.task_id, parsePlainDate(row.created_at.slice(0, 10)));
      }
      return result;
    },

    async personContact(personId: string): Promise<PersonContact | null> {
      const { data: profile } = await client.from('profiles').select('full_name').eq('id', personId).maybeSingle();
      const { data: account } = await client.auth.admin.getUserById(personId);
      if (!profile && !account.user) {
        return null;
      }
      return {
        id: personId,
        name: profile?.full_name ?? null,
        email: account.user?.email ?? null,
      };
    },
  };
}
