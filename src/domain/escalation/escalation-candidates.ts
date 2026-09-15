import type { PlainDate } from '../scheduling/plain-date';
import { workingDaysLate } from '../scheduling/due-date';
import type { WorkingCalendar } from '../scheduling/working-calendar';
import { actionableTasks, buildTaskGraph, type TaskGraph } from '../tasks/task-graph';
import type { Task } from '../tasks/task';
import type { Criticality, EscalationCandidateInput, EscalationRecipients } from './escalation-policy';

/**
 * Determine quelles taches sont eligibles a une relance, et avec quel retard.
 *
 * Une tache bloquee n'est jamais candidate directement : relancer son
 * proprietaire serait relancer une victime qui ne peut rien faire. Seules les
 * taches actionnables du graphe — ouvertes, et dont toutes les dependances
 * sont levees — peuvent generer une relance. Si une tache bloquee est en
 * retard, c'est necessairement parce que sa cause racine l'est aussi ; c'est
 * elle, actionnable, qui apparait ici.
 *
 * Une tache dont le parcours est annule ou termine n'est jamais candidate,
 * meme si elle est encore techniquement ouverte et actionnable.
 */

export type JourneyStatusForEscalation = 'active' | 'interrupted';

export interface EscalationSource {
  readonly task: Task;
  readonly journeyStatus: JourneyStatusForEscalation;
  readonly criticality: Criticality;
  readonly recipients: EscalationRecipients;
}

export function selectEscalationCandidates(
  sources: readonly EscalationSource[],
  calendar: WorkingCalendar,
  today: PlainDate,
  lastReminderByTaskId: ReadonlyMap<string, PlainDate>,
): readonly EscalationCandidateInput[] {
  const active = sources.filter((source) => source.journeyStatus === 'active');
  const byId = new Map(active.map((source) => [source.task.id, source]));

  const graphResult = buildTaskGraph(active.map((source) => source.task));
  if (!graphResult.ok) {
    // Un graphe invalide ne doit jamais faire planter une relance : mieux vaut
    // ne relancer personne que relancer au hasard sur des donnees incoherentes.
    return [];
  }
  const graph: TaskGraph = graphResult.graph;

  return actionableTasks(graph)
    .map((task) => byId.get(task.id))
    .filter((source): source is EscalationSource => source !== undefined)
    .map((source) => ({
      taskId: source.task.id,
      title: source.task.title,
      workingDaysLate: workingDaysLate(source.task.dueDate, today, calendar),
      criticality: source.criticality,
      recipients: source.recipients,
      lastReminderSentOn: lastReminderByTaskId.get(source.task.id) ?? null,
    }))
    .filter((candidate) => candidate.workingDaysLate > 0);
}
