import type { PlainDate } from '../scheduling/plain-date';
import { computeDueDate } from '../scheduling/due-date';
import type { WorkingCalendar } from '../scheduling/working-calendar';
import { buildTaskGraph, type GraphDefect } from '../tasks/task-graph';
import type { Task } from '../tasks/task';
import type { JourneyTemplate, TaskDefinition } from './journey-template';

/**
 * Turns a selected template into the tasks of one journey: deadlines computed
 * on the company's working calendar, dependencies rewritten from template keys
 * to task ids. Identifiers are produced by an injected function — the domain
 * generates no randomness of its own, which is what lets a test assert on exact
 * ids.
 */

export interface InstantiationInput {
  readonly template: JourneyTemplate;
  readonly journeyId: string;
  readonly arrivalDate: PlainDate;
  readonly calendar: WorkingCalendar;
  /** Defaults to `<journeyId>:<key>`. */
  readonly idFor?: (definitionKey: string) => string;
}

export type InstantiationDefect =
  | { readonly code: 'unknown_dependency_key'; readonly key: string; readonly dependsOn: string }
  | { readonly code: 'duplicate_definition_key'; readonly key: string }
  | { readonly code: 'invalid_graph'; readonly defects: readonly GraphDefect[] };

export type InstantiationResult =
  | { readonly ok: true; readonly tasks: readonly Task[] }
  | { readonly ok: false; readonly defects: readonly InstantiationDefect[] };

function defaultIdFor(journeyId: string): (key: string) => string {
  return (key) => `${journeyId}:${key}`;
}

export function instantiateJourney(input: InstantiationInput): InstantiationResult {
  const { template, journeyId, arrivalDate, calendar } = input;
  const idFor = input.idFor ?? defaultIdFor(journeyId);
  const defects: InstantiationDefect[] = [];

  const keys = new Set<string>();
  for (const definition of template.taskDefinitions) {
    if (keys.has(definition.key)) {
      defects.push({ code: 'duplicate_definition_key', key: definition.key });
    }
    keys.add(definition.key);
  }

  for (const definition of template.taskDefinitions) {
    for (const dependency of definition.dependsOn) {
      if (!keys.has(dependency)) {
        defects.push({
          code: 'unknown_dependency_key',
          key: definition.key,
          dependsOn: dependency,
        });
      }
    }
  }

  if (defects.length > 0) {
    return { ok: false, defects };
  }

  const tasks = template.taskDefinitions.map((definition) =>
    toTask(definition, { journeyId, arrivalDate, calendar, idFor }),
  );

  // A template carrying a cycle would produce a journey nobody can ever finish.
  const graph = buildTaskGraph(tasks);
  if (!graph.ok) {
    return { ok: false, defects: [{ code: 'invalid_graph', defects: graph.defects }] };
  }

  return { ok: true, tasks };
}

function toTask(
  definition: TaskDefinition,
  context: {
    journeyId: string;
    arrivalDate: PlainDate;
    calendar: WorkingCalendar;
    idFor: (key: string) => string;
  },
): Task {
  return {
    id: context.idFor(definition.key),
    journeyId: context.journeyId,
    title: definition.title,
    ownerRole: definition.ownerRole,
    // Resolving the actual person is a separate concern: a task can exist
    // before anyone is assigned to it.
    ownerId: null,
    dependsOn: definition.dependsOn.map(context.idFor),
    status: 'pending',
    dueDate: computeDueDate(context.arrivalDate, definition.offsetInWorkingDays, context.calendar),
    expectedDocument: definition.expectedDocument,
    sharedKey: definition.sharedKey,
    criticality: definition.criticality,
  };
}
