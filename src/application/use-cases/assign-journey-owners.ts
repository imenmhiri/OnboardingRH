import { comparePlainDates, type PlainDate } from '@/domain/scheduling/plain-date';
import {
  isUnassignable,
  resolveTaskOwner,
  type Assignment,
  type Substitution,
} from '@/domain/tasks/owner-resolution';
import type { Task } from '@/domain/tasks/task';
import type { AssignmentDirectory } from '@/application/ports/assignment-directory';
import type { AuditTrail } from '@/application/ports/audit-trail';

/**
 * Attribue un responsable a chaque tache d'un parcours. Les regles vivent dans
 * le domaine ; ce cas d'usage charge ce qu'il faut, applique, et trace.
 *
 * Toute substitution est ecrite dans le journal d'audit : sans cela, une tache
 * changerait de main sans que personne ne puisse dire pourquoi six mois plus
 * tard.
 */

export interface TaskAssignment {
  readonly taskId: string;
  readonly assignment: Assignment | null;
  readonly substitutions: readonly Substitution[];
}

export interface AssignJourneyOwnersResult {
  readonly assignments: readonly TaskAssignment[];
  /** Les taches qu'aucun maillon n'a pu prendre : a remonter au cockpit. */
  readonly unassignable: readonly string[];
}

function periodOf(tasks: readonly Task[]): { from: PlainDate; to: PlainDate } | null {
  const [first] = tasks;
  if (!first) {
    return null;
  }
  let from = first.dueDate;
  let to = first.dueDate;
  for (const task of tasks) {
    if (comparePlainDates(task.dueDate, from) < 0) from = task.dueDate;
    if (comparePlainDates(task.dueDate, to) > 0) to = task.dueDate;
  }
  return { from, to };
}

export async function assignJourneyOwners(
  ports: { directory: AssignmentDirectory; audit: AuditTrail },
  input: {
    readonly companyId: string;
    readonly journeyId: string;
    readonly tasks: readonly Task[];
    readonly actorId: string;
  },
): Promise<AssignJourneyOwnersResult> {
  const context = await ports.directory.contextFor(input.journeyId);
  const period = periodOf(input.tasks);
  if (!context || !period) {
    return { assignments: [], unassignable: input.tasks.map((task) => task.id) };
  }

  // Une seule requete d'absences pour tout le parcours, puis filtrage en
  // memoire : les echeances d'un parcours tiennent dans quelques semaines.
  const absences = await ports.directory.absencesBetween(input.companyId, period.from, period.to);

  const chains = new Map<string, Awaited<ReturnType<AssignmentDirectory['fallbackChainFor']>>>();
  const assignments: TaskAssignment[] = [];
  const unassignable: string[] = [];

  for (const task of input.tasks) {
    let chain = chains.get(task.ownerRole);
    if (!chain) {
      chain = await ports.directory.fallbackChainFor(input.companyId, task.ownerRole);
      chains.set(task.ownerRole, chain);
    }

    const outcome = resolveTaskOwner(chain, context, absences, task.dueDate);
    assignments.push({ taskId: task.id, ...outcome });

    if (isUnassignable(outcome)) {
      unassignable.push(task.id);
      await ports.audit.record({
        companyId: input.companyId,
        actorId: input.actorId,
        action: 'task.unassignable',
        journeyId: input.journeyId,
        taskId: task.id,
        payload: { ownerRole: task.ownerRole, tried: outcome.substitutions },
      });
      continue;
    }

    if (outcome.substitutions.length > 0) {
      await ports.audit.record({
        companyId: input.companyId,
        actorId: input.actorId,
        action: 'task.owner_substituted',
        journeyId: input.journeyId,
        taskId: task.id,
        payload: {
          ownerRole: task.ownerRole,
          resolvedTo: outcome.assignment,
          skipped: outcome.substitutions,
        },
      });
    }
  }

  return { assignments, unassignable };
}
