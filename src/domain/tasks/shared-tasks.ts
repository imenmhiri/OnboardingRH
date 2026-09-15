import { comparePlainDates, type PlainDate } from '../scheduling/plain-date';
import { isOpen, type OwnerRole, type Task, type TaskStatus, transitionTask } from './task';

/**
 * Cas limite du cahier des charges : une même tâche sert plusieurs arrivées —
 * une seule commande de badges pour trois entrants. L'IT doit voir un élément,
 * pas trois, et le faire une fois pour toutes ; mais l'échéance qui compte est
 * celle de l'arrivée la plus proche.
 */
export interface SharedTaskGroup {
  readonly sharedKey: string;
  readonly title: string;
  readonly ownerRole: OwnerRole;
  readonly ownerId: string | null;
  readonly taskIds: readonly string[];
  readonly journeyIds: readonly string[];
  readonly dueDate: PlainDate;
  readonly status: TaskStatus;
  readonly openCount: number;
}

export interface GroupedTasks {
  readonly groups: readonly SharedTaskGroup[];
  readonly standalone: readonly Task[];
}

function aggregateStatus(tasks: readonly Task[]): TaskStatus {
  if (tasks.every((task) => task.status === 'cancelled')) {
    return 'cancelled';
  }
  if (tasks.every((task) => !isOpen(task))) {
    return 'done';
  }
  if (tasks.some((task) => task.status === 'in_progress')) {
    return 'in_progress';
  }
  return 'pending';
}

function earliestDueDate(tasks: readonly Task[]): PlainDate {
  const open = tasks.filter(isOpen);
  const considered = open.length > 0 ? open : tasks;
  return considered
    .map((task) => task.dueDate)
    .reduce((earliest, candidate) => (comparePlainDates(candidate, earliest) < 0 ? candidate : earliest));
}

export function groupSharedTasks(tasks: readonly Task[]): GroupedTasks {
  const byKey = new Map<string, Task[]>();
  const standalone: Task[] = [];

  for (const task of tasks) {
    if (task.sharedKey === null) {
      standalone.push(task);
      continue;
    }
    const existing = byKey.get(task.sharedKey);
    if (existing) {
      existing.push(task);
    } else {
      byKey.set(task.sharedKey, [task]);
    }
  }

  const groups: SharedTaskGroup[] = [];
  for (const [sharedKey, members] of byKey) {
    const first = members[0];
    if (!first) {
      continue;
    }
    // A single occurrence is not a shared workload yet; showing it as a group
    // would tell the owner about an arrival they do not serve.
    if (members.length === 1) {
      standalone.push(first);
      continue;
    }
    groups.push({
      sharedKey,
      title: first.title,
      ownerRole: first.ownerRole,
      ownerId: first.ownerId,
      taskIds: members.map((task) => task.id),
      journeyIds: [...new Set(members.map((task) => task.journeyId))],
      dueDate: earliestDueDate(members),
      status: aggregateStatus(members),
      openCount: members.filter(isOpen).length,
    });
  }

  return { groups, standalone };
}

export interface GroupTransitionOutcome {
  readonly tasks: readonly Task[];
  /** Members the transition could not be applied to, with the reason. */
  readonly refused: readonly { readonly taskId: string; readonly code: string }[];
}

/**
 * Applies one status change to every arrival served by a shared task. Members
 * that refuse — already cancelled, still blocked on their own journey — are
 * reported rather than silently skipped.
 */
export function transitionSharedGroup(
  tasks: readonly Task[],
  sharedKey: string,
  to: TaskStatus,
  blockersOf: (taskId: string) => readonly string[] = () => [],
): GroupTransitionOutcome {
  const refused: { taskId: string; code: string }[] = [];
  const updated = tasks.map((task) => {
    if (task.sharedKey !== sharedKey) {
      return task;
    }
    const result = transitionTask(task, to, blockersOf(task.id));
    if (result.ok) {
      return result.task;
    }
    refused.push({ taskId: task.id, code: result.refusal.code });
    return task;
  });
  return { tasks: updated, refused };
}
