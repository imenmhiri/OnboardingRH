import { describe, expect, it } from 'vitest';
import { parsePlainDate } from '../scheduling/plain-date';
import { createWorkingCalendar } from '../scheduling/working-calendar';
import { rescheduleForArrivalDate, type DeadlineRule } from '../scheduling/due-date';
import { buildTaskGraph, explainBlocking } from '../tasks/task-graph';
import type { JourneyTemplate, TaskDefinition } from './journey-template';
import { instantiateJourney } from './journey-instantiation';

const d = parsePlainDate;
const calendar = createWorkingCalendar({ holidays: [d('2026-04-06'), d('2026-05-01')] });

const definitions: readonly TaskDefinition[] = [
  {
    key: 'contract',
    title: 'Contrat signé',
    ownerRole: 'hr_admin',
    offsetInWorkingDays: -5,
    dependsOn: [],
    expectedDocument: 'contrat-signe',
    sharedKey: null,
    criticality: 'standard',
  },
  {
    key: 'it-account',
    title: 'Compte IT créé',
    ownerRole: 'it',
    offsetInWorkingDays: -2,
    dependsOn: ['contract'],
    expectedDocument: null,
    sharedKey: null,
    criticality: 'critical',
  },
  {
    key: 'badge',
    title: 'Commande de badge',
    ownerRole: 'it',
    offsetInWorkingDays: -2,
    dependsOn: ['contract'],
    expectedDocument: null,
    sharedKey: 'badge-batch-03',
    criticality: 'standard',
  },
  {
    key: 'welcome',
    title: 'Accueil et remise du matériel',
    ownerRole: 'manager',
    offsetInWorkingDays: 0,
    dependsOn: ['it-account', 'badge'],
    expectedDocument: 'accuse-reception',
    sharedKey: null,
    criticality: 'standard',
  },
];

const template: JourneyTemplate = {
  id: 'template-atelier',
  companyId: 'company-nord',
  name: 'Atelier — CDI',
  criteria: { jobFamily: 'atelier', siteId: null, contractType: 'cdi' },
  taskDefinitions: definitions,
};

const baseInput = {
  template,
  journeyId: 'journey-42',
  arrivalDate: d('2026-03-02'),
  calendar,
};

describe('instantiateJourney', () => {
  it('cree une tache par definition, avec un identifiant derive du parcours', () => {
    const result = instantiateJourney(baseInput);
    expect(result.ok).toBe(true);
    expect(result.ok && result.tasks.map((task) => task.id)).toEqual([
      'journey-42:contract',
      'journey-42:it-account',
      'journey-42:badge',
      'journey-42:welcome',
    ]);
  });

  it('calcule les echeances en jours ouvres autour de l arrivee', () => {
    const result = instantiateJourney(baseInput);
    const dueDates = result.ok
      ? Object.fromEntries(result.tasks.map((task) => [task.id, task.dueDate]))
      : {};

    expect(dueDates['journey-42:contract']).toBe('2026-02-23');
    expect(dueDates['journey-42:it-account']).toBe('2026-02-26');
    expect(dueDates['journey-42:welcome']).toBe('2026-03-02');
  });

  it('reecrit les dependances de cles de template vers identifiants de taches', () => {
    const result = instantiateJourney(baseInput);
    const welcome = result.ok ? result.tasks.find((task) => task.id === 'journey-42:welcome') : undefined;

    expect(welcome?.dependsOn).toEqual(['journey-42:it-account', 'journey-42:badge']);
  });

  it('reporte la piece attendue et la cle de mutualisation', () => {
    const result = instantiateJourney(baseInput);
    const tasks = result.ok ? result.tasks : [];

    expect(tasks.find((task) => task.id === 'journey-42:contract')?.expectedDocument).toBe('contrat-signe');
    expect(tasks.find((task) => task.id === 'journey-42:it-account')?.expectedDocument).toBeNull();
    expect(tasks.find((task) => task.id === 'journey-42:badge')?.sharedKey).toBe('badge-batch-03');
  });

  it('reporte la criticite de la definition de template vers la tache instanciee', () => {
    const result = instantiateJourney(baseInput);
    const tasks = result.ok ? result.tasks : [];

    expect(tasks.find((task) => task.id === 'journey-42:it-account')?.criticality).toBe('critical');
    expect(tasks.find((task) => task.id === 'journey-42:contract')?.criticality).toBe('standard');
  });

  it('laisse le responsable a resoudre plus tard mais fixe le role', () => {
    const result = instantiateJourney(baseInput);
    const tasks = result.ok ? result.tasks : [];

    expect(tasks.every((task) => task.ownerId === null)).toBe(true);
    expect(tasks.find((task) => task.id === 'journey-42:welcome')?.ownerRole).toBe('manager');
  });

  it('produit un graphe exploitable des l instanciation', () => {
    const result = instantiateJourney(baseInput);
    const graph = result.ok ? buildTaskGraph(result.tasks) : null;

    expect(graph?.ok).toBe(true);
    const explanation = graph?.ok ? explainBlocking(graph.graph, 'journey-42:welcome') : null;
    expect(explanation?.rootCauses.map((blocker) => blocker.taskId)).toEqual(['journey-42:contract']);
  });

  it('accepte un generateur d identifiants injecte', () => {
    const result = instantiateJourney({ ...baseInput, idFor: (key) => `task-${key}` });
    expect(result.ok && result.tasks[0]?.id).toBe('task-contract');
    expect(result.ok && result.tasks[3]?.dependsOn).toEqual(['task-it-account', 'task-badge']);
  });

  it('refuse un template dont une dependance ne designe rien', () => {
    const broken: JourneyTemplate = {
      ...template,
      taskDefinitions: [{ ...definitions[0]!, dependsOn: ['fantome'] }],
    };
    const result = instantiateJourney({ ...baseInput, template: broken });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.defects).toEqual([
      { code: 'unknown_dependency_key', key: 'contract', dependsOn: 'fantome' },
    ]);
  });

  it('refuse un template a cles dupliquees', () => {
    const broken: JourneyTemplate = {
      ...template,
      taskDefinitions: [definitions[0]!, definitions[0]!],
    };
    const result = instantiateJourney({ ...baseInput, template: broken });
    expect(!result.ok && result.defects[0]?.code).toBe('duplicate_definition_key');
  });

  it('refuse un template circulaire, qui produirait un parcours infinissable', () => {
    const broken: JourneyTemplate = {
      ...template,
      taskDefinitions: [
        { ...definitions[0]!, dependsOn: ['it-account'] },
        { ...definitions[1]! },
      ],
    };
    const result = instantiateJourney({ ...baseInput, template: broken });
    expect(!result.ok && result.defects[0]?.code).toBe('invalid_graph');
  });
});

describe('cas limite : date d arrivee reportee apres instanciation', () => {
  it('recalcule les echeances du parcours deja cree', () => {
    const created = instantiateJourney(baseInput);
    const tasks = created.ok ? created.tasks : [];

    const rules: readonly DeadlineRule[] = definitions.map((definition) => ({
      taskId: `journey-42:${definition.key}`,
      offsetInWorkingDays: definition.offsetInWorkingDays,
    }));
    const changes = rescheduleForArrivalDate(
      rules,
      tasks.map((task) => ({ taskId: task.id, dueDate: task.dueDate })),
      d('2026-04-07'),
      calendar,
    );

    expect(changes.find((change) => change.taskId === 'journey-42:welcome')).toMatchObject({
      previousDueDate: '2026-03-02',
      dueDate: '2026-04-07',
    });
    // Le contrat, a -5 jours ouvres, recule d un jour de plus que prevu :
    // le lundi de Paques ferie ne compte pas dans les cinq jours.
    expect(changes.find((change) => change.taskId === 'journey-42:contract')?.dueDate).toBe('2026-03-30');
  });
});
