import { describe, expect, it } from 'vitest';
import { parsePlainDate } from '@/domain/scheduling/plain-date';
import { createWorkingCalendar } from '@/domain/scheduling/working-calendar';
import {
  deleteTemplateTask,
  duplicateTemplate,
  findDependentTasks,
  listJourneyTemplates,
  loadTemplateForEditing,
  previewTemplateSchedule,
  saveTemplateTask,
} from './manage-journey-templates';
import { fakeTemplateRepository, newTask, templateDetail, templateTask } from './template-test-fixtures';

const d = parsePlainDate;
const calendar = createWorkingCalendar({ holidays: [d('2026-04-06')] });

describe('listJourneyTemplates', () => {
  it('ne liste que les templates de la societe demandee', async () => {
    const { repository } = fakeTemplateRepository([
      templateDetail({ id: 't1', companyId: 'company-1' }),
      templateDetail({ id: 't2', companyId: 'company-2' }),
    ]);
    const result = await listJourneyTemplates(repository, 'company-1');
    expect(result.map((t) => t.id)).toEqual(['t1']);
  });
});

describe('previewTemplateSchedule', () => {
  it('calcule les echeances reelles pour une date d arrivee donnee', () => {
    const detail = templateDetail({
      id: 't1',
      tasks: [
        templateTask({ id: 'r1', key: 'contract', title: 'Contrat signé', offsetInWorkingDays: -5 }),
        templateTask({ id: 'r2', key: 'welcome', title: 'Accueil', offsetInWorkingDays: 0, dependsOn: ['contract'] }),
      ],
    });
    const result = previewTemplateSchedule(detail, d('2026-04-07'), calendar);
    expect(result.ok).toBe(true);
    expect(result.ok && result.tasks.map((t) => t.dueDate)).toEqual(['2026-03-30', '2026-04-07']);
  });

  it('cas limite : delai negatif, place la tache avant l arrivee', () => {
    const detail = templateDetail({
      id: 't1',
      tasks: [templateTask({ id: 'r1', key: 'contract', offsetInWorkingDays: -10 })],
    });
    const result = previewTemplateSchedule(detail, d('2026-04-07'), calendar);
    expect(result.ok && result.tasks[0]?.dueDate).toBe('2026-03-23');
  });

  it('cas limite : template sans aucune tache', () => {
    const detail = templateDetail({ id: 't1', tasks: [] });
    const result = previewTemplateSchedule(detail, d('2026-04-07'), calendar);
    expect(result).toEqual({ ok: true, tasks: [] });
  });

  it('detecte un cycle plutot que de produire un parcours infinissable', () => {
    const detail = templateDetail({
      id: 't1',
      tasks: [
        templateTask({ id: 'r1', key: 'a', dependsOn: ['b'] }),
        templateTask({ id: 'r2', key: 'b', dependsOn: ['a'] }),
      ],
    });
    const result = previewTemplateSchedule(detail, d('2026-04-07'), calendar);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.defects[0]?.code).toBe('invalid_graph');
  });
});

describe('cas limite : dependance supprimee alors qu une autre tache s y refere', () => {
  it('signale les taches qui dependent de celle qu on s apprete a supprimer', () => {
    const detail = templateDetail({
      id: 't1',
      tasks: [
        templateTask({ id: 'r1', key: 'contract', title: 'Contrat signé' }),
        templateTask({ id: 'r2', key: 'it-account', title: 'Compte IT', dependsOn: ['contract'] }),
        templateTask({ id: 'r3', key: 'badge', title: 'Badge', dependsOn: ['contract'] }),
      ],
    });
    expect(findDependentTasks(detail, 'r1').map((t) => t.title)).toEqual(['Compte IT', 'Badge']);
  });

  it('ne signale rien pour une tache que personne ne referme', () => {
    const detail = templateDetail({
      id: 't1',
      tasks: [templateTask({ id: 'r1', key: 'contract' }), templateTask({ id: 'r2', key: 'welcome' })],
    });
    expect(findDependentTasks(detail, 'r1')).toEqual([]);
  });

  it('la suppression retire bien la tache du template', async () => {
    const { repository, templates } = fakeTemplateRepository([
      templateDetail({
        id: 't1',
        tasks: [
          templateTask({ id: 'r1', key: 'contract' }),
          templateTask({ id: 'r2', key: 'welcome', dependsOn: ['contract'] }),
        ],
      }),
    ]);
    await deleteTemplateTask(repository, 'r1');
    expect(templates.get('t1')?.tasks.map((t) => t.id)).toEqual(['r2']);
  });
});

describe('saveTemplateTask', () => {
  it('ajoute une nouvelle tache', async () => {
    const { repository } = fakeTemplateRepository([templateDetail({ id: 't1', tasks: [] })]);
    const id = await saveTemplateTask(repository, 't1', null, newTask, 0);
    const detail = await loadTemplateForEditing(repository, 't1');
    expect(detail?.tasks.map((t) => t.id)).toEqual([id]);
  });

  it('remplace une tache existante sans dupliquer la ligne', async () => {
    const { repository } = fakeTemplateRepository([
      templateDetail({ id: 't1', tasks: [templateTask({ id: 'r1', key: 'contract', title: 'Ancien titre' })] }),
    ]);
    await saveTemplateTask(repository, 't1', 'r1', { ...newTask, title: 'Nouveau titre' }, 0);
    const detail = await loadTemplateForEditing(repository, 't1');
    expect(detail?.tasks).toHaveLength(1);
    expect(detail?.tasks[0]?.title).toBe('Nouveau titre');
  });
});

describe('duplicateTemplate', () => {
  it('copie les taches vers un nouveau template avec d autres criteres', async () => {
    const { repository } = fakeTemplateRepository([
      templateDetail({
        id: 't1',
        name: 'Atelier — Lille',
        criteria: { jobFamily: 'atelier', siteId: 'site-lille', contractType: 'cdi' },
        tasks: [templateTask({ id: 'r1', key: 'contract' })],
      }),
    ]);
    const newId = await duplicateTemplate(repository, 't1', 'Atelier — Strasbourg', {
      jobFamily: 'atelier',
      siteId: 'site-strasbourg',
      contractType: 'cdi',
    });
    const duplicate = await loadTemplateForEditing(repository, newId);
    expect(duplicate?.name).toBe('Atelier — Strasbourg');
    expect(duplicate?.criteria.siteId).toBe('site-strasbourg');
    expect(duplicate?.tasks).toHaveLength(1);

    const original = await loadTemplateForEditing(repository, 't1');
    expect(original?.criteria.siteId).toBe('site-lille');
  });
});
