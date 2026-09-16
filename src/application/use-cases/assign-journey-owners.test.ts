import { describe, expect, it } from 'vitest';
import { parsePlainDate } from '@/domain/scheduling/plain-date';
import type { Absence, AssignmentContext, OwnerSlot } from '@/domain/tasks/owner-resolution';
import type { OwnerRole, Task } from '@/domain/tasks/task';
import type { AssignmentDirectory } from '@/application/ports/assignment-directory';
import { assignJourneyOwners } from './assign-journey-owners';
import { fakeAudit } from './document-test-fixtures';

const d = parsePlainDate;

const CONTEXT: AssignmentContext = {
  employeeId: 'user-employe',
  managerId: 'user-manager',
  managerOfManagerId: 'user-directeur',
  hrAdminIds: ['user-rh'],
  itMemberIds: ['user-it'],
};

const CHAINS: Record<string, readonly OwnerSlot[]> = {
  manager: ['manager', 'manager_of_manager', 'hr_admin'],
  it: ['it_team', 'hr_admin'],
  hr_admin: ['hr_admin'],
  employee: ['employee'],
};

function directory(overrides: Partial<AssignmentDirectory> = {}, absences: readonly Absence[] = []): AssignmentDirectory {
  return {
    fallbackChainFor: async (_companyId: string, role: OwnerRole) => CHAINS[role] ?? [],
    contextFor: async () => CONTEXT,
    absencesBetween: async () => absences,
    ...overrides,
  };
}

function task(overrides: Partial<Task> & Pick<Task, 'id' | 'ownerRole'>): Task {
  return {
    journeyId: 'journey-1',
    title: `Tâche ${overrides.id}`,
    ownerId: null,
    dependsOn: [],
    status: 'pending',
    dueDate: d('2026-04-07'),
    expectedDocument: null,
    sharedKey: null,
    criticality: 'standard',
    ...overrides,
  };
}

const input = { companyId: 'company-1', journeyId: 'journey-1', actorId: 'user-rh' };

describe('assignJourneyOwners', () => {
  it('attribue chaque tache selon la chaine de son role', async () => {
    const { audit } = fakeAudit();
    const tasks = [task({ id: 't1', ownerRole: 'manager' }), task({ id: 't2', ownerRole: 'it' })];

    const result = await assignJourneyOwners({ directory: directory(), audit }, { ...input, tasks });

    expect(result.assignments[0]?.assignment).toMatchObject({ kind: 'person', ownerId: 'user-manager' });
    expect(result.assignments[1]?.assignment).toMatchObject({ kind: 'team', role: 'it' });
    expect(result.unassignable).toEqual([]);
  });

  it('ne recharge pas la chaine une fois par tache', async () => {
    let appels = 0;
    const compteur = directory({
      fallbackChainFor: async (_companyId: string, role: OwnerRole) => {
        appels += 1;
        return CHAINS[role] ?? [];
      },
    });
    const tasks = [
      task({ id: 't1', ownerRole: 'manager' }),
      task({ id: 't2', ownerRole: 'manager' }),
      task({ id: 't3', ownerRole: 'manager' }),
    ];

    await assignJourneyOwners({ directory: compteur, audit: fakeAudit().audit }, { ...input, tasks });
    expect(appels).toBe(1);
  });
});

describe('cas limite : manager absent', () => {
  const absences: readonly Absence[] = [
    { personId: 'user-manager', from: d('2026-04-06'), to: d('2026-04-17') },
  ];

  it('replie sur le maillon suivant et trace la substitution', async () => {
    const { audit, events } = fakeAudit();
    const tasks = [task({ id: 't1', ownerRole: 'manager', dueDate: d('2026-04-07') })];

    const result = await assignJourneyOwners(
      { directory: directory({}, absences), audit },
      { ...input, tasks },
    );

    expect(result.assignments[0]?.assignment).toMatchObject({ ownerId: 'user-directeur' });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ action: 'task.owner_substituted', taskId: 't1' });
    // La trace dit qui remplace qui, et pourquoi.
    expect(events[0]?.payload?.['skipped']).toEqual([
      { skipped: 'manager', reason: 'absent_on_due_date', absentPersonId: 'user-manager' },
    ]);
  });

  it('n ecrit aucune trace quand le premier maillon tient', async () => {
    const { audit, events } = fakeAudit();
    // Echeance avant le depart du manager : pas de substitution, donc rien a tracer.
    const tasks = [task({ id: 't1', ownerRole: 'manager', dueDate: d('2026-04-03') })];

    await assignJourneyOwners({ directory: directory({}, absences), audit }, { ...input, tasks });
    expect(events).toEqual([]);
  });

  it('consulte les absences sur la periode reelle des echeances', async () => {
    let periode: { from: string; to: string } | null = null;
    const espion = directory({
      absencesBetween: async (_companyId: string, from: string, to: string) => {
        periode = { from, to };
        return [];
      },
    });
    const tasks = [
      task({ id: 't1', ownerRole: 'manager', dueDate: d('2026-04-17') }),
      task({ id: 't2', ownerRole: 'manager', dueDate: d('2026-03-30') }),
      task({ id: 't3', ownerRole: 'manager', dueDate: d('2026-04-07') }),
    ];

    await assignJourneyOwners({ directory: espion, audit: fakeAudit().audit }, { ...input, tasks });
    expect(periode).toEqual({ from: '2026-03-30', to: '2026-04-17' });
  });
});

describe('tache non attribuable', () => {
  it('la remonte et la trace, sans interrompre les autres', async () => {
    const { audit, events } = fakeAudit();
    const orphelin = directory({
      contextFor: async () => ({ ...CONTEXT, managerId: null, managerOfManagerId: null, hrAdminIds: [] }),
    });
    const tasks = [task({ id: 't1', ownerRole: 'manager' }), task({ id: 't2', ownerRole: 'it' })];

    const result = await assignJourneyOwners({ directory: orphelin, audit }, { ...input, tasks });

    expect(result.unassignable).toEqual(['t1']);
    // La tache d'equipe passe quand meme : une chaine cassee n'arrete pas tout.
    expect(result.assignments[1]?.assignment).toMatchObject({ kind: 'team' });
    expect(events.map((e) => e.action)).toEqual(['task.unassignable']);
  });

  it('declare tout non attribuable quand le parcours est introuvable', async () => {
    const { audit } = fakeAudit();
    const vide = directory({ contextFor: async () => null });
    const tasks = [task({ id: 't1', ownerRole: 'manager' })];

    const result = await assignJourneyOwners({ directory: vide, audit }, { ...input, tasks });
    expect(result.unassignable).toEqual(['t1']);
  });

  it('accepte un parcours sans aucune tache', async () => {
    const { audit } = fakeAudit();
    const result = await assignJourneyOwners({ directory: directory(), audit }, { ...input, tasks: [] });
    expect(result).toEqual({ assignments: [], unassignable: [] });
  });
});
