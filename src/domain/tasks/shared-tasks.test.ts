import { describe, expect, it } from 'vitest';
import { d, makeTask } from './task-fixtures';
import { groupSharedTasks, transitionSharedGroup } from './shared-tasks';

// Cas limite : une commande de badges unique sert trois arrivees.
const badgeOrder = [
  makeTask({ id: 'badge-1', journeyId: 'journey-1', title: 'Commande de badges', sharedKey: 'badge-batch-03', dueDate: d('2026-03-09') }),
  makeTask({ id: 'badge-2', journeyId: 'journey-2', title: 'Commande de badges', sharedKey: 'badge-batch-03', dueDate: d('2026-03-02') }),
  makeTask({ id: 'badge-3', journeyId: 'journey-3', title: 'Commande de badges', sharedKey: 'badge-batch-03', dueDate: d('2026-03-16') }),
  makeTask({ id: 'laptop-1', journeyId: 'journey-1', title: 'Préparer le portable', dueDate: d('2026-03-02') }),
];

describe('cas limite : tache commune a plusieurs arrivees', () => {
  it('presente une seule entree pour les trois arrivees', () => {
    const { groups, standalone } = groupSharedTasks(badgeOrder);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.taskIds).toEqual(['badge-1', 'badge-2', 'badge-3']);
    expect(groups[0]?.journeyIds).toEqual(['journey-1', 'journey-2', 'journey-3']);
    expect(standalone.map((task) => task.id)).toEqual(['laptop-1']);
  });

  it('retient l echeance de l arrivee la plus proche', () => {
    const { groups } = groupSharedTasks(badgeOrder);
    expect(groups[0]?.dueDate).toBe('2026-03-02');
  });

  it('ne groupe pas une tache partagee qui ne sert qu une arrivee', () => {
    const { groups, standalone } = groupSharedTasks([
      makeTask({ id: 'badge-1', sharedKey: 'badge-batch-04' }),
    ]);
    expect(groups).toEqual([]);
    expect(standalone.map((task) => task.id)).toEqual(['badge-1']);
  });

  it('solde les trois arrivees en une fois', () => {
    const { tasks, refused } = transitionSharedGroup(badgeOrder, 'badge-batch-03', 'done');

    expect(refused).toEqual([]);
    expect(
      tasks.filter((task) => task.sharedKey === 'badge-batch-03').every((task) => task.status === 'done'),
    ).toBe(true);
    // La tache specifique a une arrivee n'est pas touchee.
    expect(tasks.find((task) => task.id === 'laptop-1')?.status).toBe('pending');
  });

  it('signale les membres qui refusent au lieu de les ignorer', () => {
    const withCancelled = badgeOrder.map((task) =>
      task.id === 'badge-2' ? { ...task, status: 'cancelled' as const } : task,
    );
    const { tasks, refused } = transitionSharedGroup(withCancelled, 'badge-batch-03', 'done');

    expect(refused).toEqual([{ taskId: 'badge-2', code: 'terminal_status' }]);
    expect(tasks.find((task) => task.id === 'badge-2')?.status).toBe('cancelled');
    expect(tasks.find((task) => task.id === 'badge-1')?.status).toBe('done');
  });

  it('agrege le statut et l echeance apres annulation d une arrivee', () => {
    const withCancelled = badgeOrder.map((task) =>
      task.id === 'badge-2' ? { ...task, status: 'cancelled' as const } : task,
    );
    const { groups } = groupSharedTasks(withCancelled);

    expect(groups[0]?.status).toBe('pending');
    expect(groups[0]?.openCount).toBe(2);
    // L'echeance suit desormais l'arrivee encore active la plus proche.
    expect(groups[0]?.dueDate).toBe('2026-03-09');
  });

  it('considere le groupe termine quand toutes les arrivees sont soldees', () => {
    const allDone = badgeOrder.map((task) =>
      task.sharedKey === 'badge-batch-03' ? { ...task, status: 'done' as const } : task,
    );
    expect(groupSharedTasks(allDone).groups[0]?.status).toBe('done');
  });
});
