import { describe, expect, it } from 'vitest';
import { makeTask } from './task-fixtures';
import { canTransition, isOpen, settlesDependency, transitionTask } from './task';

describe('canTransition', () => {
  it('autorise les transitions du cycle de vie normal', () => {
    expect(canTransition('pending', 'in_progress')).toBe(true);
    expect(canTransition('in_progress', 'done')).toBe(true);
    expect(canTransition('pending', 'cancelled')).toBe(true);
  });

  it('autorise la reouverture d une tache terminee', () => {
    expect(canTransition('done', 'in_progress')).toBe(true);
  });

  it('fait de l annulation un etat terminal', () => {
    expect(canTransition('cancelled', 'pending')).toBe(false);
    expect(canTransition('cancelled', 'done')).toBe(false);
  });
});

describe('transitionTask', () => {
  it('renvoie la tache mise a jour sans muter l originale', () => {
    const task = makeTask({ id: 't1' });
    const result = transitionTask(task, 'in_progress');

    expect(result.ok).toBe(true);
    expect(result.ok && result.task.status).toBe('in_progress');
    expect(task.status).toBe('pending');
  });

  it('refuse une transition vers le meme statut', () => {
    const result = transitionTask(makeTask({ id: 't1' }), 'pending');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.refusal.code).toBe('same_status');
  });

  it('refuse de sortir d un statut terminal', () => {
    const result = transitionTask(makeTask({ id: 't1', status: 'cancelled' }), 'in_progress');
    expect(!result.ok && result.refusal.code).toBe('terminal_status');
  });

  it('refuse de terminer une tache dont les dependances ne sont pas levees', () => {
    const result = transitionTask(makeTask({ id: 't2', dependsOn: ['t1'] }), 'done', ['t1']);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.refusal.code).toBe('blocked_by_dependencies');
    expect(!result.ok && result.refusal.code === 'blocked_by_dependencies' && result.refusal.blockingTaskIds).toEqual([
      't1',
    ]);
  });

  it('autorise toujours l annulation, meme bloquee', () => {
    // Une embauche qui ne se fait pas ne doit pas laisser de tache impossible a solder.
    const result = transitionTask(makeTask({ id: 't2', dependsOn: ['t1'] }), 'cancelled', ['t1']);
    expect(result.ok).toBe(true);
  });
});

describe('settlesDependency', () => {
  it('considere une tache annulee comme levant la dependance', () => {
    expect(settlesDependency(makeTask({ id: 't1', status: 'cancelled' }))).toBe(true);
    expect(settlesDependency(makeTask({ id: 't1', status: 'done' }))).toBe(true);
    expect(settlesDependency(makeTask({ id: 't1', status: 'in_progress' }))).toBe(false);
  });

  it('distingue les taches encore ouvertes', () => {
    expect(isOpen(makeTask({ id: 't1', status: 'pending' }))).toBe(true);
    expect(isOpen(makeTask({ id: 't1', status: 'done' }))).toBe(false);
  });
});
