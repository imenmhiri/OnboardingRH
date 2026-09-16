import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { StatusBadge } from '@/components/ui/status';
import { parsePlainDate } from '@/domain/scheduling/plain-date';
import { buildTaskGraph, explainBlocking, type Blocker } from '@/domain/tasks/task-graph';
import { isUnassignable, resolveTaskOwner, type AssignmentOutcome } from '@/domain/tasks/owner-resolution';
import type { OwnerRole, Task, TaskStatus } from '@/domain/tasks/task';
import { supabaseAssignmentDirectory } from '@/infrastructure/supabase/assignment-directory';
import { createSupabaseServerClient } from '@/infrastructure/supabase/server-client';
import type { JourneyRow } from './types';

const ROLE_LABELS: Record<OwnerRole, string> = {
  hr_admin: 'Ressources humaines',
  manager: 'Manager',
  it: 'Informatique',
  employee: 'Employé',
};

const STATUS_TONE: Record<TaskStatus, 'neutral' | 'progress' | 'success' | 'cancelled'> = {
  pending: 'neutral',
  in_progress: 'progress',
  done: 'success',
  cancelled: 'cancelled',
};

const STATUS_LABEL: Record<TaskStatus, string> = {
  pending: 'À faire',
  in_progress: 'En cours',
  done: 'Faite',
  cancelled: 'Annulée',
};

interface TaskRow {
  id: string;
  journey_id: string;
  title: string;
  owner_role: OwnerRole;
  owner_id: string | null;
  status: TaskStatus;
  due_on: string;
}

/**
 * Tâches bloquées, cause racine et responsable — tout vient de
 * domain/tasks/task-graph, jamais recalculé ici. La seule chose que cet écran
 * ajoute, c'est la résolution du responsable quand `owner_id` est nul : cet
 * état recouvre deux réalités qu'il ne faut jamais confondre — « portée par
 * l'équipe, rien d'anormal » et « personne n'a pu être désigné, ça doit
 * remonter ». domain/tasks/owner-resolution est ce qui les distingue.
 */
export async function BlockedTasksCard({ journeys }: { readonly journeys: readonly JourneyRow[] }) {
  const journeyIds = journeys.map((journey) => journey.id);

  if (journeyIds.length === 0) {
    return (
      <Card>
        <CardHeader
          title="Tâches bloquées"
          description="Cause racine et responsable, calculés depuis le graphe de dépendances."
        />
        <CardBody>
          <EmptyState
            title="Aucun parcours à examiner"
            description="Aucun parcours ne correspond aux filtres actuels."
          />
        </CardBody>
      </Card>
    );
  }

  const client = await createSupabaseServerClient();
  const journeyById = new Map(journeys.map((journey) => [journey.id, journey]));

  const { data: taskRows, error: tasksError } = await client
    .from('tasks')
    .select('id, journey_id, title, owner_role, owner_id, status, due_on')
    .in('journey_id', journeyIds);

  if (tasksError) {
    return (
      <Card>
        <CardHeader title="Tâches bloquées" />
        <CardBody>
          <ErrorState description="Impossible de charger les tâches pour le moment. Réessayez dans un instant." />
        </CardBody>
      </Card>
    );
  }

  const rows = (taskRows ?? []) as TaskRow[];
  const taskIds = rows.map((row) => row.id);
  const { data: depRows } = taskIds.length
    ? await client.from('task_dependencies').select('task_id, depends_on_id').in('task_id', taskIds)
    : { data: [] as { task_id: string; depends_on_id: string }[] };

  const dependsOnByTask = new Map<string, string[]>();
  for (const dep of depRows ?? []) {
    dependsOnByTask.set(dep.task_id, [...(dependsOnByTask.get(dep.task_id) ?? []), dep.depends_on_id]);
  }

  const tasks: Task[] = rows.map((row) => ({
    id: row.id,
    journeyId: row.journey_id,
    title: row.title,
    ownerRole: row.owner_role,
    ownerId: row.owner_id,
    dependsOn: dependsOnByTask.get(row.id) ?? [],
    status: row.status,
    dueDate: parsePlainDate(row.due_on),
    expectedDocument: null,
    sharedKey: null,
  }));

  const graphResult = buildTaskGraph(tasks);
  if (!graphResult.ok) {
    return (
      <Card>
        <CardHeader title="Tâches bloquées" />
        <CardBody>
          <ErrorState description="Le graphe de dépendances contient une anomalie de données ; contactez le support technique." />
        </CardBody>
      </Card>
    );
  }
  const { graph } = graphResult;

  const blocked = tasks
    .filter((task) => task.status === 'pending' || task.status === 'in_progress')
    .map((task) => ({ task, explanation: explainBlocking(graph, task.id) }))
    .filter(
      (entry): entry is { task: Task; explanation: NonNullable<ReturnType<typeof explainBlocking>> } =>
        entry.explanation !== null,
    );

  if (blocked.length === 0) {
    return (
      <Card>
        <CardHeader
          title="Tâches bloquées"
          description="Cause racine et responsable, calculés depuis le graphe de dépendances."
        />
        <CardBody>
          <EmptyState
            title="Aucune tâche bloquée"
            description="Toutes les tâches ouvertes peuvent avancer aujourd’hui."
          />
        </CardBody>
      </Card>
    );
  }

  const taskById = new Map(tasks.map((task) => [task.id, task]));

  // Une même cause racine peut bloquer plusieurs tâches en aval (le cas
  // « compte IT jamais créé » du jeu de démo en bloque trois) : on ne la
  // résout qu'une fois.
  const uniqueRootBlockers = new Map<string, Blocker>();
  for (const entry of blocked) {
    for (const root of entry.explanation.rootCauses) {
      if (!uniqueRootBlockers.has(root.taskId)) {
        uniqueRootBlockers.set(root.taskId, root);
      }
    }
  }

  const ownerIds = new Set<string>();
  for (const entry of blocked) {
    if (entry.task.ownerId) ownerIds.add(entry.task.ownerId);
  }
  for (const root of uniqueRootBlockers.values()) {
    if (root.ownerId) ownerIds.add(root.ownerId);
  }
  const { data: ownerProfiles } = ownerIds.size
    ? await client.from('profiles').select('id, full_name').in('id', [...ownerIds])
    : { data: [] as { id: string; full_name: string }[] };
  const ownerNameById = new Map((ownerProfiles ?? []).map((profile) => [profile.id, profile.full_name]));

  const directory = supabaseAssignmentDirectory(client);
  const outcomeCache = new Map<string, Promise<AssignmentOutcome | null>>();

  async function outcomeFor(root: Blocker, journeyId: string, companyId: string): Promise<AssignmentOutcome | null> {
    const cacheKey = root.taskId;
    let promise = outcomeCache.get(cacheKey);
    if (!promise) {
      promise = (async () => {
        const [chain, context] = await Promise.all([
          directory.fallbackChainFor(companyId, root.ownerRole),
          directory.contextFor(journeyId),
        ]);
        if (!context) return null;
        const absences = await directory.absencesBetween(companyId, root.dueDate, root.dueDate);
        return resolveTaskOwner(chain, context, absences, root.dueDate);
      })();
      outcomeCache.set(cacheKey, promise);
    }
    return promise;
  }

  const rootLabels = new Map<string, { label: string; unassignable: boolean }>();
  await Promise.all(
    [...uniqueRootBlockers.entries()].map(async ([taskId, root]) => {
      if (root.ownerId) {
        rootLabels.set(taskId, { label: ownerNameById.get(root.ownerId) ?? 'Personne assignée', unassignable: false });
        return;
      }
      const rootTask = taskById.get(taskId);
      const journeyId = rootTask?.journeyId ?? '';
      const journey = journeyById.get(journeyId);
      if (!journey) {
        rootLabels.set(taskId, { label: `Équipe ${ROLE_LABELS[root.ownerRole].toLowerCase()}`, unassignable: false });
        return;
      }
      const outcome = await outcomeFor(root, journeyId, journey.company_id);
      if (!outcome) {
        rootLabels.set(taskId, { label: 'Résolution indisponible', unassignable: false });
        return;
      }
      if (isUnassignable(outcome)) {
        rootLabels.set(taskId, { label: 'Aucun responsable trouvé', unassignable: true });
        return;
      }
      if (outcome.assignment?.kind === 'team') {
        rootLabels.set(taskId, { label: `Équipe ${ROLE_LABELS[outcome.assignment.role].toLowerCase()}`, unassignable: false });
        return;
      }
      if (outcome.assignment?.kind === 'person') {
        rootLabels.set(taskId, {
          label: ownerNameById.get(outcome.assignment.ownerId) ?? 'Personne assignée',
          unassignable: false,
        });
        return;
      }
      rootLabels.set(taskId, { label: 'Résolution indisponible', unassignable: false });
    }),
  );

  return (
    <Card>
      <CardHeader
        title="Tâches bloquées"
        description={`${blocked.length} tâche${blocked.length > 1 ? 's' : ''} bloquée${blocked.length > 1 ? 's' : ''}, cause racine et responsable ci-dessous.`}
      />
      <CardBody>
        <ul className="space-y-4">
          {blocked.map(({ task, explanation }) => {
            const journey = journeyById.get(task.journeyId);
            return (
              <li key={task.id} className="rounded-[var(--radius)] border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-text-subtle">
                      {journey?.employee_name ?? 'Parcours inconnu'}
                    </p>
                    <p className="font-medium text-text">{task.title}</p>
                  </div>
                  <StatusBadge tone="danger" label="Bloquée" />
                </div>
                <ul className="mt-3 space-y-1.5 border-t border-border pt-3">
                  {explanation.rootCauses.map((root) => {
                    const resolved = rootLabels.get(root.taskId);
                    return (
                      <li key={root.taskId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="text-text">
                          Bloquée par : {root.title} — {resolved?.label ?? 'Résolution indisponible'}
                        </span>
                        <span className="flex flex-wrap items-center gap-2">
                          <StatusBadge tone={STATUS_TONE[root.status]} label={STATUS_LABEL[root.status]} />
                          {resolved?.unassignable ? <StatusBadge tone="danger" label="Non attribuable" /> : null}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      </CardBody>
    </Card>
  );
}
