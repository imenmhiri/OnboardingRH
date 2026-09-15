import { parsePlainDate, type PlainDate } from '../scheduling/plain-date';
import type { Task } from './task';

/** Shared across the task test files; a fixture, never imported by production code. */
export function makeTask(overrides: Partial<Task> & Pick<Task, 'id'>): Task {
  return {
    journeyId: 'journey-1',
    title: `Tâche ${overrides.id}`,
    ownerRole: 'it',
    ownerId: null,
    dependsOn: [],
    status: 'pending',
    dueDate: parsePlainDate('2026-03-02'),
    expectedDocument: null,
    sharedKey: null,
    ...overrides,
  };
}

export const d = (iso: string): PlainDate => parsePlainDate(iso);
