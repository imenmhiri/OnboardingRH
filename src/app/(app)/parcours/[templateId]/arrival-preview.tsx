'use client';

import { useActionState } from 'react';
import { previewSchedule, type PreviewState } from '../actions';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { ErrorState } from '@/components/ui/states';

const INITIAL: PreviewState = { result: null, arrivalDate: null, error: null };

const DEFECT_LABELS: Record<string, string> = {
  unknown_dependency_key: 'dépend d’une clé qui n’existe pas',
  duplicate_definition_key: 'utilisée par plusieurs tâches à la fois',
  invalid_graph: 'les dépendances forment un cycle',
};

/**
 * Rejoue exactement le calcul qu'une vraie embauche declencherait — memes
 * fonctions, meme calendrier — pour qu'un apercu ne promette jamais une date
 * que la production ne tiendrait pas.
 */
export function ArrivalPreview({ templateId }: { readonly templateId: string }) {
  const boundAction = previewSchedule.bind(null, templateId);
  const [state, action, pending] = useActionState(boundAction, INITIAL);

  return (
    <div className="space-y-4">
      <form action={action} className="flex flex-wrap items-end gap-3">
        <Field label="Date d’arrivée simulée" description="Les échéances réelles s’affichent en dessous.">
          <Input name="arrivalDate" type="date" required defaultValue={state.arrivalDate ?? ''} />
        </Field>
        <Button type="submit" variant="secondary" loading={pending}>
          Calculer les échéances
        </Button>
      </form>

      {state.error ? (
        <p role="alert" className="rounded-[var(--radius)] bg-danger-soft px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      ) : null}

      {state.result && !state.result.ok ? (
        <ErrorState
          title="Ce template ne peut pas être instancié"
          description={state.result.defects
            .map((defect) => DEFECT_LABELS[defect.code] ?? defect.code)
            .join(' — ')}
        />
      ) : null}

      {state.result && state.result.ok ? (
        state.result.tasks.length === 0 ? (
          <p className="text-sm text-text-muted">Ce template n’a aucune tâche à planifier.</p>
        ) : (
          <ul className="space-y-1.5" aria-label="Échéances calculées">
            {state.result.tasks
              .slice()
              .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
              .map((task) => (
                <li
                  key={task.id}
                  className="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-border bg-surface-sunken px-3 py-2 text-sm"
                >
                  <span className="text-text">{task.title}</span>
                  <span className="font-medium text-text-muted">{task.dueDate}</span>
                </li>
              ))}
          </ul>
        )
      ) : null}
    </div>
  );
}
