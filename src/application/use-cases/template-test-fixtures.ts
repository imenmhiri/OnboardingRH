import type {
  NewTemplateTaskInput,
  TemplateDetail,
  TemplateRepository,
  TemplateSummary,
  TemplateTaskRecord,
} from '@/application/ports/template-repository';

/** Doublure en memoire, pas un mock : un vrai depot, jetable entre les tests. */
export function fakeTemplateRepository(seed: readonly TemplateDetail[] = []) {
  const templates = new Map(seed.map((t) => [t.id, t]));
  let nextTemplateId = 1;
  let nextTaskId = 1;

  const repository: TemplateRepository = {
    async listByCompany(companyId) {
      return [...templates.values()]
        .filter((t) => t.companyId === companyId)
        .map((t): TemplateSummary => ({ id: t.id, companyId: t.companyId, name: t.name, criteria: t.criteria, taskCount: t.tasks.length }));
    },

    async findById(templateId) {
      return templates.get(templateId) ?? null;
    },

    async create({ companyId, name, criteria }) {
      const id = `template-${nextTemplateId++}`;
      templates.set(id, { id, companyId, name, criteria, tasks: [] });
      return id;
    },

    async rename(templateId, name) {
      const template = templates.get(templateId);
      if (template) templates.set(templateId, { ...template, name });
    },

    async upsertTask(templateId, taskId, task, position) {
      const template = templates.get(templateId);
      if (!template) throw new Error('Template introuvable.');
      const record: TemplateTaskRecord = { id: taskId ?? `task-${nextTaskId++}`, position, ...task };
      const tasks = taskId
        ? template.tasks.map((t) => (t.id === taskId ? record : t))
        : [...template.tasks, record];
      templates.set(templateId, { ...template, tasks });
      return record.id;
    },

    async deleteTask(taskId) {
      for (const [id, template] of templates) {
        templates.set(id, { ...template, tasks: template.tasks.filter((t) => t.id !== taskId) });
      }
    },

    async duplicate(templateId, name, criteria) {
      const source = templates.get(templateId);
      if (!source) throw new Error('Template introuvable.');
      const id = `template-${nextTemplateId++}`;
      templates.set(id, { id, companyId: source.companyId, name, criteria, tasks: source.tasks });
      return id;
    },
  };

  return { repository, templates };
}

export function templateTask(overrides: Partial<TemplateTaskRecord> & Pick<TemplateTaskRecord, 'id' | 'key'>): TemplateTaskRecord {
  return {
    title: `Tâche ${overrides.key}`,
    ownerRole: 'it',
    offsetInWorkingDays: 0,
    dependsOn: [],
    expectedDocument: null,
    sharedKey: null,
    criticality: 'standard',
    position: 0,
    ...overrides,
  };
}

export function templateDetail(overrides: Partial<TemplateDetail> & Pick<TemplateDetail, 'id'>): TemplateDetail {
  return {
    companyId: 'company-1',
    name: 'Parcours standard',
    criteria: { jobFamily: null, siteId: null, contractType: null },
    tasks: [],
    ...overrides,
  };
}

export const newTask: NewTemplateTaskInput = {
  key: 'contract',
  title: 'Contrat signé',
  ownerRole: 'hr_admin',
  offsetInWorkingDays: -5,
  dependsOn: [],
  expectedDocument: 'contrat-signe',
  sharedKey: null,
  criticality: 'standard',
};
