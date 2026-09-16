import type {
  InsertJourneyResult,
  JourneyRepository,
  JourneySummary,
  NewJourneyInput,
  OpenTaskSchedule,
  TaskDueDateChange,
} from '@/application/ports/journey-repository';
import { parsePlainDate } from '@/domain/scheduling/plain-date';
import type { Task } from '@/domain/tasks/task';
import { createSupabaseServiceClient } from './service-client';

type SupabaseClient = ReturnType<typeof createSupabaseServiceClient>;

/** Code Postgres d'une violation de contrainte unique. */
const UNIQUE_VIOLATION = '23505';

export function supabaseJourneyRepository(client: SupabaseClient): JourneyRepository {
  return {
    async findByHireReference(companyId, hireReference) {
      const { data, error } = await client
        .from('journeys')
        .select('id')
        .eq('company_id', companyId)
        .eq('hire_reference', hireReference)
        .maybeSingle();
      if (error || !data) return null;
      return { journeyId: data.id };
    },

    async insertJourney(input: NewJourneyInput): Promise<InsertJourneyResult> {
      const { error } = await client.from('journeys').insert({
        id: input.id,
        company_id: input.companyId,
        site_id: input.siteId,
        template_id: input.templateId,
        employee_id: input.employeeId,
        employee_name: input.employeeName,
        job_family: input.jobFamily,
        contract_type: input.contractType,
        manager_id: input.managerId,
        arrival_date: input.arrivalDate,
        hire_reference: input.hireReference,
        personal_email: input.personalEmail,
        status: 'scheduled',
      });

      if (error) {
        if (error.code === UNIQUE_VIOLATION) {
          return { ok: false, reason: 'duplicate_hire_reference' };
        }
        throw new Error(`Creation du parcours impossible : ${error.message}`);
      }
      return { ok: true };
    },

    async insertTasks(
      companyId: string,
      journeyId: string,
      tasks: readonly Task[],
      offsetsByTaskId: ReadonlyMap<string, number>,
    ): Promise<void> {
      if (tasks.length === 0) return;

      const rows = tasks.map((task) => ({
        id: task.id,
        company_id: companyId,
        journey_id: journeyId,
        title: task.title,
        owner_role: task.ownerRole,
        owner_id: task.ownerId,
        due_on: task.dueDate,
        offset_working_days: offsetsByTaskId.get(task.id) ?? 0,
        status: task.status,
        expected_document: task.expectedDocument,
        shared_key: task.sharedKey,
        criticality: task.criticality,
      }));
      const { error } = await client.from('tasks').insert(rows);
      if (error) {
        throw new Error(`Creation des taches impossible pour ${journeyId} : ${error.message}`);
      }

      const dependencyRows = tasks.flatMap((task) =>
        task.dependsOn.map((dependsOnId) => ({ task_id: task.id, depends_on_id: dependsOnId })),
      );
      if (dependencyRows.length > 0) {
        const { error: depError } = await client.from('task_dependencies').insert(dependencyRows);
        if (depError) {
          throw new Error(`Creation des dependances impossible pour ${journeyId} : ${depError.message}`);
        }
      }
    },

    async assignOwner(taskId: string, ownerId: string | null): Promise<void> {
      const { error } = await client.from('tasks').update({ owner_id: ownerId }).eq('id', taskId);
      if (error) {
        throw new Error(`Attribution du responsable impossible pour ${taskId} : ${error.message}`);
      }
    },

    async updateJourneyStatus(journeyId: string, status: 'completed' | 'cancelled'): Promise<void> {
      const { error } = await client.from('journeys').update({ status }).eq('id', journeyId);
      if (error) {
        throw new Error(`Changement de statut impossible pour ${journeyId} : ${error.message}`);
      }
    },

    async findById(journeyId: string): Promise<JourneySummary | null> {
      const { data, error } = await client
        .from('journeys')
        .select('id, company_id, site_id, arrival_date, status')
        .eq('id', journeyId)
        .maybeSingle();
      if (error || !data) return null;
      return {
        id: data.id,
        companyId: data.company_id,
        siteId: data.site_id,
        arrivalDate: parsePlainDate(data.arrival_date),
        status: data.status,
      };
    },

    async updateArrivalDate(journeyId: string, arrivalDate): Promise<void> {
      const { error } = await client.from('journeys').update({ arrival_date: arrivalDate }).eq('id', journeyId);
      if (error) {
        throw new Error(`Report d'arrivee impossible pour ${journeyId} : ${error.message}`);
      }
    },

    async openTaskSchedules(journeyId: string): Promise<readonly OpenTaskSchedule[]> {
      const { data, error } = await client
        .from('tasks')
        .select('id, title, owner_id, offset_working_days, due_on')
        .eq('journey_id', journeyId)
        .in('status', ['pending', 'in_progress']);
      if (error || !data) return [];
      return data.map((row) => ({
        taskId: row.id,
        title: row.title,
        ownerId: row.owner_id,
        offsetInWorkingDays: row.offset_working_days,
        dueDate: parsePlainDate(row.due_on),
      }));
    },

    async updateTaskDueDates(changes: readonly TaskDueDateChange[]): Promise<void> {
      for (const change of changes) {
        const { error } = await client.from('tasks').update({ due_on: change.dueDate }).eq('id', change.taskId);
        if (error) {
          throw new Error(`Report d'echeance impossible pour ${change.taskId} : ${error.message}`);
        }
      }
    },
  };
}
