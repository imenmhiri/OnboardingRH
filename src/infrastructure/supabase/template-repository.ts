import type { OwnerRole } from '@/domain/tasks/task';
import type { JourneyTemplate } from '@/domain/templates/journey-template';
import type {
  NewTemplateTaskInput,
  TemplateRepository,
  TemplateTaskRecord,
} from '@/application/ports/template-repository';
import { createSupabaseServerClient } from './server-client';

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

interface TemplateRow {
  readonly id: string;
  readonly company_id: string;
  readonly name: string;
  readonly job_family: string | null;
  readonly site_id: string | null;
  readonly contract_type: string | null;
}

interface TaskRow {
  readonly id: string;
  readonly key: string;
  readonly title: string;
  readonly owner_role: OwnerRole;
  readonly offset_working_days: number;
  readonly expected_document: string | null;
  readonly shared_key: string | null;
  readonly criticality: 'standard' | 'critical';
  readonly position: number;
}

function toCriteria(row: TemplateRow): JourneyTemplate['criteria'] {
  return { jobFamily: row.job_family, siteId: row.site_id, contractType: row.contract_type };
}

async function loadTasks(client: SupabaseClient, templateId: string): Promise<TemplateTaskRecord[]> {
  const [{ data: taskRows }, { data: depRows }] = await Promise.all([
    client
      .from('template_tasks')
      .select('id, key, title, owner_role, offset_working_days, expected_document, shared_key, criticality, position')
      .eq('template_id', templateId)
      .order('position'),
    client
      .from('template_task_dependencies')
      .select('template_task_id, depends_on_id, template_tasks!template_task_dependencies_template_task_id_fkey(template_id)')
      .eq('template_tasks.template_id', templateId),
  ]);

  const rows = (taskRows ?? []) as TaskRow[];
  const keyById = new Map(rows.map((r) => [r.id, r.key]));
  const depsByTask = new Map<string, string[]>();
  for (const dep of (depRows ?? []) as { template_task_id: string; depends_on_id: string }[]) {
    const dependsOnKey = keyById.get(dep.depends_on_id);
    if (!dependsOnKey) continue;
    depsByTask.set(dep.template_task_id, [...(depsByTask.get(dep.template_task_id) ?? []), dependsOnKey]);
  }

  return rows.map((row) => ({
    id: row.id,
    key: row.key,
    title: row.title,
    ownerRole: row.owner_role,
    offsetInWorkingDays: row.offset_working_days,
    dependsOn: depsByTask.get(row.id) ?? [],
    expectedDocument: row.expected_document,
    sharedKey: row.shared_key,
    criticality: row.criticality,
    position: row.position,
  }));
}

export function supabaseTemplateRepository(client: SupabaseClient): TemplateRepository {
  return {
    async listByCompany(companyId) {
      const { data, error } = await client
        .from('journey_templates')
        .select('id, company_id, name, job_family, site_id, contract_type, template_tasks(count)')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('name');
      if (error || !data) return [];
      return (data as (TemplateRow & { template_tasks: { count: number }[] })[]).map((row) => ({
        id: row.id,
        companyId: row.company_id,
        name: row.name,
        criteria: toCriteria(row),
        taskCount: row.template_tasks[0]?.count ?? 0,
      }));
    },

    async findById(templateId) {
      const { data, error } = await client
        .from('journey_templates')
        .select('id, company_id, name, job_family, site_id, contract_type')
        .eq('id', templateId)
        .maybeSingle();
      if (error || !data) return null;

      const tasks = await loadTasks(client, templateId);
      return { id: data.id, companyId: data.company_id, name: data.name, criteria: toCriteria(data), tasks };
    },

    async create({ companyId, name, criteria }) {
      const { data, error } = await client
        .from('journey_templates')
        .insert({ company_id: companyId, name, job_family: criteria.jobFamily, site_id: criteria.siteId, contract_type: criteria.contractType })
        .select('id')
        .single();
      if (error || !data) throw new Error(`Création du template impossible : ${error?.message ?? 'inconnu'}`);
      return data.id;
    },

    async rename(templateId, name) {
      const { error } = await client.from('journey_templates').update({ name }).eq('id', templateId);
      if (error) throw new Error(`Renommage impossible : ${error.message}`);
    },

    async upsertTask(templateId, taskId, task: NewTemplateTaskInput, position) {
      const row = {
        template_id: templateId,
        key: task.key,
        title: task.title,
        owner_role: task.ownerRole,
        offset_working_days: task.offsetInWorkingDays,
        expected_document: task.expectedDocument,
        shared_key: task.sharedKey,
        criticality: task.criticality,
        position,
      };

      const { data, error } = taskId
        ? await client.from('template_tasks').update(row).eq('id', taskId).select('id').single()
        : await client.from('template_tasks').insert(row).select('id').single();
      if (error || !data) throw new Error(`Enregistrement de la tâche impossible : ${error?.message ?? 'inconnu'}`);

      // Reecrit les dependances : plus simple et plus sur qu'un diff ligne a
      // ligne, pour un nombre de dependances qui reste toujours petit.
      await client.from('template_task_dependencies').delete().eq('template_task_id', data.id);
      if (task.dependsOn.length > 0) {
        const { data: siblings } = await client.from('template_tasks').select('id, key').eq('template_id', templateId);
        const idByKey = new Map((siblings ?? []).map((s: { id: string; key: string }) => [s.key, s.id]));
        const depRows = task.dependsOn
          .map((key) => idByKey.get(key))
          .filter((id): id is string => Boolean(id))
          .map((dependsOnId) => ({ template_task_id: data.id, depends_on_id: dependsOnId }));
        if (depRows.length > 0) {
          await client.from('template_task_dependencies').insert(depRows);
        }
      }
      return data.id;
    },

    async deleteTask(taskId) {
      const { error } = await client.from('template_tasks').delete().eq('id', taskId);
      if (error) throw new Error(`Suppression impossible : ${error.message}`);
    },

    async duplicate(templateId, name, criteria) {
      const source = await this.findById(templateId);
      if (!source) throw new Error('Template source introuvable.');

      const newId = await this.create({ companyId: source.companyId, name, criteria });
      // Les cles sont copiees telles quelles : elles ne servent qu'au sein d'un
      // template, jamais entre deux templates distincts.
      for (const [index, task] of source.tasks.entries()) {
        await this.upsertTask(newId, null, {
          key: task.key,
          title: task.title,
          ownerRole: task.ownerRole,
          offsetInWorkingDays: task.offsetInWorkingDays,
          dependsOn: task.dependsOn,
          expectedDocument: task.expectedDocument,
          sharedKey: task.sharedKey,
          criticality: task.criticality,
        }, index);
      }
      return newId;
    },
  };
}
