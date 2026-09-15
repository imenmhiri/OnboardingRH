import { describe, expect, it } from 'vitest';
import { parsePlainDate } from '../scheduling/plain-date';
import {
  type Absence,
  type AssignmentContext,
  isAbsentOn,
  isUnassignable,
  type OwnerSlot,
  resolveTaskOwner,
  wasSubstituted,
} from './owner-resolution';

const d = parsePlainDate;

const context: AssignmentContext = {
  employeeId: 'user-employe',
  managerId: 'user-manager',
  managerOfManagerId: 'user-directeur',
  hrAdminIds: ['user-rh-b', 'user-rh-a'],
  itMemberIds: ['user-it-1', 'user-it-2'],
};

// La chaine telle qu'elle sera stockee en base : manager, puis son manager,
// puis la RH.
const MANAGER_CHAIN: readonly OwnerSlot[] = ['manager', 'manager_of_manager', 'hr_admin'];

describe('isAbsentOn', () => {
  const absences: readonly Absence[] = [
    { personId: 'user-manager', from: d('2026-04-06'), to: d('2026-04-17') },
  ];

  it('couvre les bornes de la periode', () => {
    expect(isAbsentOn(absences, 'user-manager', d('2026-04-06'))).toBe(true);
    expect(isAbsentOn(absences, 'user-manager', d('2026-04-17'))).toBe(true);
  });

  it('ne deborde pas hors de la periode', () => {
    expect(isAbsentOn(absences, 'user-manager', d('2026-04-05'))).toBe(false);
    expect(isAbsentOn(absences, 'user-manager', d('2026-04-18'))).toBe(false);
  });

  it('ne confond pas deux personnes', () => {
    expect(isAbsentOn(absences, 'user-directeur', d('2026-04-07'))).toBe(false);
  });
});

describe('resolveTaskOwner', () => {
  it('prend le premier maillon quand il tient', () => {
    const outcome = resolveTaskOwner(MANAGER_CHAIN, context, [], d('2026-04-07'));
    expect(outcome.assignment).toEqual({ kind: 'person', ownerId: 'user-manager', slot: 'manager' });
    expect(outcome.substitutions).toEqual([]);
    expect(wasSubstituted(outcome)).toBe(false);
  });

  it('designe toujours la meme RH parmi plusieurs, sans dependre de l ordre des lignes', () => {
    const outcome = resolveTaskOwner(['hr_admin'], context, [], d('2026-04-07'));
    const inverted = resolveTaskOwner(
      ['hr_admin'],
      { ...context, hrAdminIds: ['user-rh-a', 'user-rh-b'] },
      [],
      d('2026-04-07'),
    );
    expect(outcome.assignment).toEqual(inverted.assignment);
  });
});

describe('cas limite : manager absent', () => {
  it('applique la chaine de repli et trace le remplacement', () => {
    const outcome = resolveTaskOwner(MANAGER_CHAIN, { ...context, managerId: null }, [], d('2026-04-07'));

    expect(outcome.assignment).toEqual({
      kind: 'person',
      ownerId: 'user-directeur',
      slot: 'manager_of_manager',
    });
    expect(outcome.substitutions).toEqual([{ skipped: 'manager', reason: 'no_such_person' }]);
    expect(wasSubstituted(outcome)).toBe(true);
  });

  it('descend jusqu a la RH quand les deux premiers maillons manquent', () => {
    const outcome = resolveTaskOwner(
      MANAGER_CHAIN,
      { ...context, managerId: null, managerOfManagerId: null },
      [],
      d('2026-04-07'),
    );

    expect(outcome.assignment).toMatchObject({ slot: 'hr_admin' });
    expect(outcome.substitutions.map((s) => s.skipped)).toEqual(['manager', 'manager_of_manager']);
  });
});

describe('cas limite : manager en conges a la date d echeance', () => {
  const absences: readonly Absence[] = [
    { personId: 'user-manager', from: d('2026-04-06'), to: d('2026-04-17') },
  ];

  it('repli quand l echeance tombe pendant l absence, alors que la personne existe', () => {
    const outcome = resolveTaskOwner(MANAGER_CHAIN, context, absences, d('2026-04-07'));

    expect(outcome.assignment).toMatchObject({ ownerId: 'user-directeur' });
    expect(outcome.substitutions).toEqual([
      { skipped: 'manager', reason: 'absent_on_due_date', absentPersonId: 'user-manager' },
    ]);
  });

  it('garde le manager quand l echeance tombe avant son depart', () => {
    // L'absence se juge a l'echeance, pas au moment de la creation de la tache.
    const outcome = resolveTaskOwner(MANAGER_CHAIN, context, absences, d('2026-04-03'));
    expect(outcome.assignment).toMatchObject({ ownerId: 'user-manager' });
    expect(outcome.substitutions).toEqual([]);
  });

  it('garde le manager quand l echeance tombe apres son retour', () => {
    const outcome = resolveTaskOwner(MANAGER_CHAIN, context, absences, d('2026-04-20'));
    expect(outcome.assignment).toMatchObject({ ownerId: 'user-manager' });
  });
});

describe('cas limite : role porte par une equipe', () => {
  it('attribue a l equipe sans nommer personne', () => {
    const outcome = resolveTaskOwner(['it_team'], context, [], d('2026-04-07'));

    // Pas de proprietaire nomme, et ce n'est pas un echec : la policy de T-06
    // rend la tache visible a toute l'equipe qui porte le role.
    expect(outcome.assignment).toEqual({ kind: 'team', role: 'it', slot: 'it_team' });
    expect(isUnassignable(outcome)).toBe(false);
  });

  it('tient tant qu un seul membre de l equipe est present', () => {
    const absences: readonly Absence[] = [
      { personId: 'user-it-1', from: d('2026-04-01'), to: d('2026-04-30') },
    ];
    expect(resolveTaskOwner(['it_team'], context, absences, d('2026-04-07')).assignment).toMatchObject({
      kind: 'team',
    });
  });

  it('repli quand toute l equipe est absente', () => {
    const absences: readonly Absence[] = [
      { personId: 'user-it-1', from: d('2026-04-01'), to: d('2026-04-30') },
      { personId: 'user-it-2', from: d('2026-04-01'), to: d('2026-04-30') },
    ];
    const outcome = resolveTaskOwner(['it_team', 'hr_admin'], context, absences, d('2026-04-07'));

    expect(outcome.assignment).toMatchObject({ slot: 'hr_admin' });
    expect(outcome.substitutions).toEqual([{ skipped: 'it_team', reason: 'whole_team_absent' }]);
  });
});

describe('tache non attribuable', () => {
  it('le signale explicitement quand la chaine entiere echoue', () => {
    const outcome = resolveTaskOwner(
      MANAGER_CHAIN,
      { employeeId: null, managerId: null, managerOfManagerId: null, hrAdminIds: [], itMemberIds: [] },
      [],
      d('2026-04-07'),
    );

    expect(isUnassignable(outcome)).toBe(true);
    expect(outcome.substitutions.map((s) => s.skipped)).toEqual([
      'manager',
      'manager_of_manager',
      'hr_admin',
    ]);
  });

  it('distingue une tache orpheline d une tache d equipe', () => {
    const orpheline = resolveTaskOwner(['manager'], { ...context, managerId: null }, [], d('2026-04-07'));
    const equipe = resolveTaskOwner(['it_team'], context, [], d('2026-04-07'));

    expect(isUnassignable(orpheline)).toBe(true);
    expect(isUnassignable(equipe)).toBe(false);
  });

  it('refuse une chaine vide plutot que d inventer un responsable', () => {
    expect(isUnassignable(resolveTaskOwner([], context, [], d('2026-04-07')))).toBe(true);
  });
});
