'use client';

import { useState } from 'react';
import { saveTask } from '../actions';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import type { OwnerRole } from '@/domain/tasks/task';
import type { TemplateTaskRecord } from '@/application/ports/template-repository';

const ROLE_LABELS: Record<OwnerRole, string> = {
  hr_admin: 'Ressources humaines',
  manager: 'Manager',
  it: 'Informatique',
  employee: 'Employé',
};

export function TaskFormDialog({
  templateId,
  task,
  otherTasks,
  position,
  trigger,
}: {
  readonly templateId: string;
  /** Null : creation d'une nouvelle tache. */
  readonly task: TemplateTaskRecord | null;
  /** Les autres taches du template, pour choisir les dependances — jamais soi-meme. */
  readonly otherTasks: readonly TemplateTaskRecord[];
  readonly position: number;
  readonly trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // Radix Select ne pose pas de champ de formulaire natif : on garde sa
  // valeur en etat, et on la reporte dans un input cache au moment de
  // soumettre. Une valeur par defaut statique aurait ignore le choix reel.
  const [ownerRole, setOwnerRole] = useState<OwnerRole>(task?.ownerRole ?? 'hr_admin');
  const [criticality, setCriticality] = useState<'standard' | 'critical'>(task?.criticality ?? 'standard');
  const boundAction = saveTask.bind(null, templateId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        title={task ? `Modifier « ${task.title} »` : 'Ajouter une tâche'}
        description="Le responsable est un rôle : la personne exacte est résolue au moment de l’embauche."
      >
        <form action={boundAction} className="space-y-5">
          {task ? <input type="hidden" name="taskId" value={task.id} /> : null}
          <input type="hidden" name="position" value={position} />
          <input type="hidden" name="ownerRole" value={ownerRole} />
          <input type="hidden" name="criticality" value={criticality} />

          <Field label="Clé technique" description="Stable dans ce template : les dépendances s’expriment avec elle." required>
            <Input
              name="key"
              defaultValue={task?.key}
              required
              pattern="[a-z0-9-]+"
              placeholder="ex. it-account"
              title="Lettres minuscules, chiffres et tirets uniquement."
            />
          </Field>

          <Field label="Titre" required>
            <Input name="title" defaultValue={task?.title} required placeholder="ex. Créer le compte IT" />
          </Field>

          <Field label="Responsable" description="Un rôle, jamais une personne nommée.">
            <Select value={ownerRole} onValueChange={(value) => setOwnerRole(value as OwnerRole)}>
              <SelectTrigger placeholder="Choisir un rôle" aria-label="Responsable" />
              <SelectContent>
                {Object.entries(ROLE_LABELS).map(([role, label]) => (
                  <SelectItem key={role} value={role}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field
            label="Délai, en jours ouvrés"
            description="Négatif avant l’arrivée, positif après. 0 le jour même."
            required
          >
            <Input name="offsetInWorkingDays" type="number" step={1} defaultValue={task?.offsetInWorkingDays ?? 0} required />
          </Field>

          {otherTasks.length > 0 ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-text">Dépend de</legend>
              <div className="space-y-1.5 rounded-[var(--radius)] border border-border p-3">
                {otherTasks.map((other) => (
                  <label key={other.key} className="flex items-center gap-2 text-sm text-text">
                    <input
                      type="checkbox"
                      name="dependsOn"
                      value={other.key}
                      defaultChecked={task?.dependsOn.includes(other.key)}
                      className="size-4 rounded border-border-strong text-brand"
                    />
                    {other.title}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          <Field label="Pièce attendue" description="Laissez vide si aucune pièce n’est nécessaire.">
            <Input name="expectedDocument" defaultValue={task?.expectedDocument ?? ''} placeholder="ex. contrat-signe" />
          </Field>

          <Field
            label="Clé de mutualisation"
            description="Deux tâches partageant la même clé servent plusieurs arrivées à la fois."
          >
            <Input name="sharedKey" defaultValue={task?.sharedKey ?? ''} placeholder="ex. badge-atelier-nord" />
          </Field>

          <Field label="Criticité">
            <Select value={criticality} onValueChange={(value) => setCriticality(value as 'standard' | 'critical')}>
              <SelectTrigger placeholder="Criticité" aria-label="Criticité" />
              <SelectContent>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="critical">Critique</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Annuler
              </Button>
            </DialogClose>
            <Button type="submit">{task ? 'Enregistrer' : 'Ajouter la tâche'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
