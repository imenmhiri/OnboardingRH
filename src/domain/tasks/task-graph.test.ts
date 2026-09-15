import { describe, expect, it } from 'vitest';
import { d, makeTask } from './task-fixtures';
import {
  actionableTasks,
  buildTaskGraph,
  explainBlocking,
  isActionable,
  isBlocked,
  type TaskGraph,
  unlockedBy,
} from './task-graph';
import type { Task } from './task';

function graphOf(tasks: readonly Task[]): TaskGraph {
  const result = buildTaskGraph(tasks);
  if (!result.ok) {
    throw new Error(`Graphe invalide : ${JSON.stringify(result.defects)}`);
  }
  return result.graph;
}

// Chaine reelle : sans contrat signe, pas de compte IT ; sans compte IT, pas de
// poste de travail ; sans poste de travail, pas d'acces aux outils.
const chain: readonly Task[] = [
  makeTask({ id: 'contract', title: 'Contrat signé', ownerRole: 'hr_admin', ownerId: 'user-rh', dueDate: d('2026-02-24') }),
  makeTask({ id: 'it-account', title: 'Compte IT créé', ownerRole: 'it', ownerId: 'user-it', dependsOn: ['contract'], dueDate: d('2026-02-26') }),
  makeTask({ id: 'workstation', title: 'Poste préparé', ownerRole: 'it', ownerId: 'user-it', dependsOn: ['it-account'], dueDate: d('2026-02-27') }),
  makeTask({ id: 'tools-access', title: 'Accès aux outils métier', ownerRole: 'manager', ownerId: 'user-manager', dependsOn: ['workstation'], dueDate: d('2026-03-02') }),
];

describe('buildTaskGraph', () => {
  it('construit un graphe valide', () => {
    expect(buildTaskGraph(chain).ok).toBe(true);
  });

  it('signale une dependance vers une tache inconnue', () => {
    const result = buildTaskGraph([makeTask({ id: 't1', dependsOn: ['fantome'] })]);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.defects).toEqual([
      { code: 'unknown_dependency', taskId: 't1', dependsOn: 'fantome' },
    ]);
  });

  it('signale une tache qui depend d elle-meme', () => {
    const result = buildTaskGraph([makeTask({ id: 't1', dependsOn: ['t1'] })]);
    expect(!result.ok && result.defects[0]?.code).toBe('self_dependency');
  });

  it('signale un cycle', () => {
    const result = buildTaskGraph([
      makeTask({ id: 'a', dependsOn: ['b'] }),
      makeTask({ id: 'b', dependsOn: ['a'] }),
    ]);
    expect(!result.ok && result.defects.some((defect) => defect.code === 'cycle')).toBe(true);
  });

  it('signale un identifiant en double', () => {
    const result = buildTaskGraph([makeTask({ id: 'a' }), makeTask({ id: 'a' })]);
    expect(!result.ok && result.defects[0]?.code).toBe('duplicate_task');
  });
});

describe('blocage', () => {
  it('considere bloquee une tache dont une dependance est ouverte', () => {
    const graph = graphOf(chain);
    expect(isBlocked(graph, 'it-account')).toBe(true);
    expect(isBlocked(graph, 'contract')).toBe(false);
    expect(isActionable(graph, 'contract')).toBe(true);
    expect(isActionable(graph, 'it-account')).toBe(false);
  });

  it('debloque la suite des qu une dependance est terminee', () => {
    const graph = graphOf(
      chain.map((task) => (task.id === 'contract' ? { ...task, status: 'done' as const } : task)),
    );
    expect(isBlocked(graph, 'it-account')).toBe(false);
    expect(actionableTasks(graph).map((task) => task.id)).toEqual(['it-account']);
  });

  it('debloque aussi quand la dependance est annulee', () => {
    const graph = graphOf(
      chain.map((task) => (task.id === 'contract' ? { ...task, status: 'cancelled' as const } : task)),
    );
    expect(isBlocked(graph, 'it-account')).toBe(false);
  });
});

describe('explainBlocking', () => {
  it('repond a : bloquee par quoi, et qui en est le proprietaire', () => {
    const graph = graphOf(chain);
    const explanation = explainBlocking(graph, 'tools-access');

    expect(explanation?.directBlockers).toEqual([
      {
        taskId: 'workstation',
        title: 'Poste préparé',
        ownerRole: 'it',
        ownerId: 'user-it',
        status: 'pending',
        dueDate: '2026-02-27',
        isRootCause: false,
      },
    ]);
    // La cause racine n'est pas la dependance directe : c'est le contrat.
    expect(explanation?.rootCauses.map((blocker) => blocker.taskId)).toEqual(['contract']);
    expect(explanation?.rootCauses[0]?.ownerRole).toBe('hr_admin');
    expect(explanation?.rootCauses[0]?.ownerId).toBe('user-rh');
  });

  it('renvoie null quand rien ne bloque', () => {
    expect(explainBlocking(graphOf(chain), 'contract')).toBeNull();
  });

  it('remonte plusieurs causes racines quand les dependances divergent', () => {
    const graph = graphOf([
      makeTask({ id: 'badge', ownerRole: 'it' }),
      makeTask({ id: 'desk', ownerRole: 'hr_admin' }),
      makeTask({ id: 'welcome', dependsOn: ['badge', 'desk'] }),
    ]);
    const explanation = explainBlocking(graph, 'welcome');

    expect(explanation?.rootCauses.map((blocker) => blocker.taskId).sort()).toEqual(['badge', 'desk']);
    expect(explanation?.directBlockers.every((blocker) => blocker.isRootCause)).toBe(true);
  });
});

describe('unlockedBy', () => {
  it('liste ce qui devient faisable une fois la tache soldee', () => {
    const graph = graphOf(chain);
    expect(unlockedBy(graph, 'contract').map((task) => task.id)).toEqual(['it-account']);
  });

  it('ne promet rien qui reste bloque par ailleurs', () => {
    const graph = graphOf([
      makeTask({ id: 'badge' }),
      makeTask({ id: 'desk' }),
      makeTask({ id: 'welcome', dependsOn: ['badge', 'desk'] }),
    ]);
    expect(unlockedBy(graph, 'badge')).toEqual([]);
  });
});
