import type { PlainDate } from '../scheduling/plain-date';

/**
 * A task's stored status says what its owner did with it. Whether it is
 * *blocked* is never stored: it is derived from the dependency graph, because a
 * stored "blocked" flag goes stale the moment the blocking task is completed.
 */
export const TASK_STATUSES = ['pending', 'in_progress', 'done', 'cancelled'] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const OWNER_ROLES = ['hr_admin', 'manager', 'it', 'employee'] as const;

export type OwnerRole = (typeof OWNER_ROLES)[number];

export type Criticality = 'standard' | 'critical';

export interface Task {
  readonly id: string;
  readonly journeyId: string;
  readonly title: string;
  readonly ownerRole: OwnerRole;
  /** Null while the responsible person has not been resolved yet. */
  readonly ownerId: string | null;
  readonly dependsOn: readonly string[];
  readonly status: TaskStatus;
  readonly dueDate: PlainDate;
  /** Document the owner is expected to attach; null when none is required. */
  readonly expectedDocument: string | null;
  /**
   * Tasks sharing a key are the same piece of work serving several arrivals —
   * one badge order for three newcomers. Null when the task is specific.
   */
  readonly sharedKey: string | null;
  /** Drives escalation thresholds (T-13) — required so it can never be silently forgotten. */
  readonly criticality: Criticality;
}

const ALLOWED_TRANSITIONS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  pending: ['in_progress', 'done', 'cancelled'],
  in_progress: ['pending', 'done', 'cancelled'],
  // Reopening a completed task is allowed: an IT account can be undone.
  done: ['in_progress', 'cancelled'],
  // A cancelled task is terminal; it comes back as a new task, not a revival.
  cancelled: [],
};

export type TransitionRefusal =
  | { readonly code: 'same_status' }
  | { readonly code: 'terminal_status'; readonly from: TaskStatus }
  | { readonly code: 'illegal_transition'; readonly from: TaskStatus; readonly to: TaskStatus }
  | { readonly code: 'blocked_by_dependencies'; readonly blockingTaskIds: readonly string[] };

export type TransitionResult =
  | { readonly ok: true; readonly task: Task }
  | { readonly ok: false; readonly refusal: TransitionRefusal };

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * Applies a status change. Dependency checking is the graph's job, so callers
 * pass the blocking task ids they already computed rather than the whole graph.
 */
export function transitionTask(
  task: Task,
  to: TaskStatus,
  blockingTaskIds: readonly string[] = [],
): TransitionResult {
  if (task.status === to) {
    return { ok: false, refusal: { code: 'same_status' } };
  }
  if (ALLOWED_TRANSITIONS[task.status].length === 0) {
    return { ok: false, refusal: { code: 'terminal_status', from: task.status } };
  }
  if (!canTransition(task.status, to)) {
    return { ok: false, refusal: { code: 'illegal_transition', from: task.status, to } };
  }
  // Cancelling is always permitted: a hire that falls through must not leave
  // an undismissable task behind.
  if (blockingTaskIds.length > 0 && to !== 'cancelled') {
    return { ok: false, refusal: { code: 'blocked_by_dependencies', blockingTaskIds } };
  }
  return { ok: true, task: { ...task, status: to } };
}

export function isOpen(task: Task): boolean {
  return task.status === 'pending' || task.status === 'in_progress';
}

/** A cancelled dependency stops holding anything up — it will never complete. */
export function settlesDependency(task: Task): boolean {
  return task.status === 'done' || task.status === 'cancelled';
}
