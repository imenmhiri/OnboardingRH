import { isOpen, settlesDependency, type OwnerRole, type Task, type TaskStatus } from './task';
import type { PlainDate } from '../scheduling/plain-date';

/**
 * The dependency graph answers the only question a stuck onboarding really
 * raises: blocked by what, and who owns it. That answer is computed here, never
 * assembled in a component.
 */

export interface TaskGraph {
  readonly tasks: ReadonlyMap<string, Task>;
  readonly dependents: ReadonlyMap<string, readonly string[]>;
}

export type GraphDefect =
  | { readonly code: 'unknown_dependency'; readonly taskId: string; readonly dependsOn: string }
  | { readonly code: 'self_dependency'; readonly taskId: string }
  | { readonly code: 'cycle'; readonly taskIds: readonly string[] }
  | { readonly code: 'duplicate_task'; readonly taskId: string };

export type GraphResult =
  | { readonly ok: true; readonly graph: TaskGraph }
  | { readonly ok: false; readonly defects: readonly GraphDefect[] };

export function buildTaskGraph(tasks: readonly Task[]): GraphResult {
  const defects: GraphDefect[] = [];
  const byId = new Map<string, Task>();

  for (const task of tasks) {
    if (byId.has(task.id)) {
      defects.push({ code: 'duplicate_task', taskId: task.id });
      continue;
    }
    byId.set(task.id, task);
  }

  const dependents = new Map<string, string[]>();
  for (const task of byId.values()) {
    for (const dependency of task.dependsOn) {
      if (dependency === task.id) {
        defects.push({ code: 'self_dependency', taskId: task.id });
        continue;
      }
      if (!byId.has(dependency)) {
        defects.push({ code: 'unknown_dependency', taskId: task.id, dependsOn: dependency });
        continue;
      }
      const existing = dependents.get(dependency);
      if (existing) {
        existing.push(task.id);
      } else {
        dependents.set(dependency, [task.id]);
      }
    }
  }

  for (const cycle of findCycles(byId)) {
    defects.push({ code: 'cycle', taskIds: cycle });
  }

  if (defects.length > 0) {
    return { ok: false, defects };
  }
  return { ok: true, graph: { tasks: byId, dependents } };
}

function findCycles(byId: ReadonlyMap<string, Task>): readonly (readonly string[])[] {
  const cycles: string[][] = [];
  const state = new Map<string, 'visiting' | 'visited'>();
  const stack: string[] = [];

  const visit = (taskId: string): void => {
    const current = state.get(taskId);
    if (current === 'visited') {
      return;
    }
    if (current === 'visiting') {
      const from = stack.indexOf(taskId);
      cycles.push(stack.slice(from === -1 ? 0 : from));
      return;
    }
    state.set(taskId, 'visiting');
    stack.push(taskId);
    for (const dependency of byId.get(taskId)?.dependsOn ?? []) {
      if (byId.has(dependency) && dependency !== taskId) {
        visit(dependency);
      }
    }
    stack.pop();
    state.set(taskId, 'visited');
  };

  for (const taskId of byId.keys()) {
    visit(taskId);
  }
  return cycles;
}

export function taskOf(graph: TaskGraph, taskId: string): Task {
  const task = graph.tasks.get(taskId);
  if (!task) {
    throw new RangeError(`Unknown task "${taskId}" in this graph.`);
  }
  return task;
}

export interface Blocker {
  readonly taskId: string;
  readonly title: string;
  readonly ownerRole: OwnerRole;
  readonly ownerId: string | null;
  readonly status: TaskStatus;
  readonly dueDate: PlainDate;
  /** False when this blocker is itself waiting on something else. */
  readonly isRootCause: boolean;
}

export interface BlockingExplanation {
  readonly taskId: string;
  /** Unmet dependencies declared directly by the task. */
  readonly directBlockers: readonly Blocker[];
  /** The ones nobody else is waiting on — where the chain actually starts. */
  readonly rootCauses: readonly Blocker[];
}

function unmetDependencies(graph: TaskGraph, task: Task): readonly Task[] {
  return task.dependsOn
    .map((id) => graph.tasks.get(id))
    .filter((dependency): dependency is Task => dependency !== undefined)
    .filter((dependency) => !settlesDependency(dependency));
}

export function isBlocked(graph: TaskGraph, taskId: string): boolean {
  return unmetDependencies(graph, taskOf(graph, taskId)).length > 0;
}

export function isActionable(graph: TaskGraph, taskId: string): boolean {
  const task = taskOf(graph, taskId);
  return isOpen(task) && !isBlocked(graph, taskId);
}

/**
 * Walks the chain of unmet dependencies. Returns null when nothing holds the
 * task up, so the caller never has to interpret an empty explanation.
 */
export function explainBlocking(graph: TaskGraph, taskId: string): BlockingExplanation | null {
  const task = taskOf(graph, taskId);
  const direct = unmetDependencies(graph, task);
  if (direct.length === 0) {
    return null;
  }

  const roots = new Map<string, Task>();
  const seen = new Set<string>([task.id]);
  const queue = [...direct];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || seen.has(current.id)) {
      continue;
    }
    seen.add(current.id);
    const upstream = unmetDependencies(graph, current);
    if (upstream.length === 0) {
      roots.set(current.id, current);
    } else {
      queue.push(...upstream);
    }
  }

  const rootIds = new Set(roots.keys());
  const toBlocker = (candidate: Task): Blocker => ({
    taskId: candidate.id,
    title: candidate.title,
    ownerRole: candidate.ownerRole,
    ownerId: candidate.ownerId,
    status: candidate.status,
    dueDate: candidate.dueDate,
    isRootCause: rootIds.has(candidate.id),
  });

  return {
    taskId: task.id,
    directBlockers: direct.map(toBlocker),
    rootCauses: [...roots.values()].map(toBlocker),
  };
}

/** Open tasks whose dependencies are all settled — what an owner can act on today. */
export function actionableTasks(graph: TaskGraph): readonly Task[] {
  return [...graph.tasks.values()].filter((task) => isActionable(graph, task.id));
}

/** Tasks that would become actionable if the given task were settled. */
export function unlockedBy(graph: TaskGraph, taskId: string): readonly Task[] {
  const settled = taskOf(graph, taskId);
  return (graph.dependents.get(settled.id) ?? [])
    .map((id) => taskOf(graph, id))
    .filter((dependent) => isOpen(dependent))
    .filter((dependent) =>
      unmetDependencies(graph, dependent).every((dependency) => dependency.id === settled.id),
    );
}
