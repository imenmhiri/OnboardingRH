'use client';

import { AlertTriangle, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { removeTask } from '../actions';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import type { DependentTask } from '@/application/use-cases/manage-journey-templates';

/**
 * Cas limite : dependance supprimee alors qu'une autre tache s'y refere. La
 * base retirerait la ligne de dependance en silence ; ce dialogue nomme les
 * taches concernees avant que quiconque ne confirme.
 */
export function DeleteTaskDialog({
  templateId,
  taskId,
  taskTitle,
  dependents,
}: {
  readonly templateId: string;
  readonly taskId: string;
  readonly taskTitle: string;
  readonly dependents: readonly DependentTask[];
}) {
  const [open, setOpen] = useState(false);
  const boundAction = removeTask.bind(null, templateId, taskId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Trash2 aria-hidden className="size-4" />
          Supprimer
          <span className="sr-only"> la tâche « {taskTitle} »</span>
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Supprimer « ${taskTitle} » ?`}
        {...(dependents.length === 0 ? { description: 'Cette action est irréversible.' } : {})}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="ghost">Annuler</Button>
            </DialogClose>
            <form action={boundAction}>
              <Button type="submit" variant="danger">
                Supprimer quand même
              </Button>
            </form>
          </>
        }
      >
        {dependents.length > 0 ? (
          <div role="alert" className="flex gap-3 rounded-[var(--radius)] border border-warning/30 bg-warning-soft p-3 text-sm text-text">
            <AlertTriangle aria-hidden className="size-5 shrink-0 text-warning" />
            <div>
              <p className="font-medium">
                {dependents.length === 1 ? 'Une tâche dépend' : `${dependents.length} tâches dépendent`} de
                celle-ci :
              </p>
              <ul className="mt-1 list-disc pl-4">
                {dependents.map((dependent) => (
                  <li key={dependent.id}>{dependent.title}</li>
                ))}
              </ul>
              <p className="mt-2 text-text-muted">
                {dependents.length === 1 ? 'Elle' : 'Elles'} ne dépendra{dependents.length === 1 ? '' : 'ont'} plus de
                rien après cette suppression, sans qu’aucune autre étape ne la remplace.
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-text-muted">Aucune autre tâche n’en dépend.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
