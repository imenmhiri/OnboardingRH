import type { PlainDate } from '../scheduling/plain-date';
import { comparePlainDates } from '../scheduling/plain-date';
import type { OwnerRole } from './task';

/**
 * Un template designe un responsable *relatif* : « le manager de l'employe »,
 * « l'IT ». Ce module transforme ce role relatif en une personne reelle, ou
 * constate qu'aucune ne convient.
 *
 * Deux resultats sont legitimes, et il ne faut pas les confondre :
 * une tache portee par une equipe (l'IT) n'a pas de proprietaire nomme et ce
 * n'est pas un probleme — la RLS la rend visible a toute l'equipe du role. Une
 * tache que la chaine de repli n'a pas su attribuer, elle, est orpheline : elle
 * doit remonter au cockpit, sinon le parcours s'arrete sans que personne ne le
 * sache.
 */

export const OWNER_SLOTS = [
  'employee',
  'manager',
  'manager_of_manager',
  'hr_admin',
  'it_team',
] as const;

export type OwnerSlot = (typeof OWNER_SLOTS)[number];

/** Les personnes que le parcours permet de designer, a un instant donne. */
export interface AssignmentContext {
  readonly employeeId: string | null;
  readonly managerId: string | null;
  readonly managerOfManagerId: string | null;
  readonly hrAdminIds: readonly string[];
  readonly itMemberIds: readonly string[];
}

export interface Absence {
  readonly personId: string;
  readonly from: PlainDate;
  readonly to: PlainDate;
}

export type Assignment =
  | { readonly kind: 'person'; readonly ownerId: string; readonly slot: OwnerSlot }
  /**
   * Personne n'est nomme, et c'est voulu : l'equipe qui porte ce role voit la
   * tache. `owner_id` reste nul en base, la policy fait le reste.
   */
  | { readonly kind: 'team'; readonly role: OwnerRole; readonly slot: OwnerSlot };

export type SkipReason = 'no_such_person' | 'absent_on_due_date' | 'whole_team_absent';

/** Pourquoi un maillon de la chaine a ete saute — la trace exigee du ticket. */
export interface Substitution {
  readonly skipped: OwnerSlot;
  readonly reason: SkipReason;
  readonly absentPersonId?: string;
}

export interface AssignmentOutcome {
  /** Null quand la chaine entiere a ete parcourue sans trouver personne. */
  readonly assignment: Assignment | null;
  readonly substitutions: readonly Substitution[];
}

/**
 * L'absence se juge a la date d'echeance, pas au moment de la creation : un
 * manager present aujourd'hui peut etre en conges le jour ou la tache tombe.
 */
export function isAbsentOn(
  absences: readonly Absence[],
  personId: string,
  date: PlainDate,
): boolean {
  return absences.some(
    (absence) =>
      absence.personId === personId &&
      comparePlainDates(absence.from, date) <= 0 &&
      comparePlainDates(absence.to, date) >= 0,
  );
}

function personFor(slot: OwnerSlot, context: AssignmentContext): string | null {
  switch (slot) {
    case 'employee':
      return context.employeeId;
    case 'manager':
      return context.managerId;
    case 'manager_of_manager':
      return context.managerOfManagerId;
    case 'hr_admin':
      // Plusieurs RH possibles : on trie pour que deux executions donnent le
      // meme responsable, sans quoi l'attribution dependrait de l'ordre des
      // lignes renvoyees par la base.
      return [...context.hrAdminIds].sort()[0] ?? null;
    case 'it_team':
      return null;
  }
}

const TEAM_ROLE: Partial<Record<OwnerSlot, OwnerRole>> = {
  it_team: 'it',
};

/**
 * Parcourt la chaine de repli et s'arrete au premier maillon qui tient. La
 * chaine arrive en parametre : elle est configuree par societe, jamais ecrite
 * en dur ici.
 */
export function resolveTaskOwner(
  chain: readonly OwnerSlot[],
  context: AssignmentContext,
  absences: readonly Absence[],
  dueDate: PlainDate,
): AssignmentOutcome {
  const substitutions: Substitution[] = [];

  for (const slot of chain) {
    const teamRole = TEAM_ROLE[slot];
    if (teamRole) {
      const available = context.itMemberIds.filter((id) => !isAbsentOn(absences, id, dueDate));
      if (available.length === 0) {
        substitutions.push({ skipped: slot, reason: 'whole_team_absent' });
        continue;
      }
      return { assignment: { kind: 'team', role: teamRole, slot }, substitutions };
    }

    const personId = personFor(slot, context);
    if (!personId) {
      substitutions.push({ skipped: slot, reason: 'no_such_person' });
      continue;
    }
    if (isAbsentOn(absences, personId, dueDate)) {
      substitutions.push({ skipped: slot, reason: 'absent_on_due_date', absentPersonId: personId });
      continue;
    }
    return { assignment: { kind: 'person', ownerId: personId, slot }, substitutions };
  }

  return { assignment: null, substitutions };
}

/** Une tache qu'aucun maillon n'a pu prendre : elle doit remonter au cockpit. */
export function isUnassignable(outcome: AssignmentOutcome): boolean {
  return outcome.assignment === null;
}

/** Vrai quand le responsable obtenu n'est pas celui que le template visait. */
export function wasSubstituted(outcome: AssignmentOutcome): boolean {
  return outcome.assignment !== null && outcome.substitutions.length > 0;
}
