import { AlertTriangle, ArrowRight, Plus } from 'lucide-react';
import { notFound, redirect } from 'next/navigation';
import { ArrivalPreview } from './arrival-preview';
import { DeleteTaskDialog } from './delete-task-dialog';
import { DuplicateTemplateDialog } from './duplicate-template-dialog';
import { TaskFormDialog } from './task-form-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status';
import { EmptyState } from '@/components/ui/states';
import { canAccess } from '@/domain/companies/access';
import { createWorkingCalendar } from '@/domain/scheduling/working-calendar';
import { parsePlainDate } from '@/domain/scheduling/plain-date';
import { findDependentTasks, loadTemplateForEditing, previewTemplateSchedule } from '@/application/use-cases/manage-journey-templates';
import { supabaseTemplateRepository } from '@/infrastructure/supabase/template-repository';
import { supabaseSiteDirectory } from '@/infrastructure/supabase/site-directory';
import { createSupabaseServerClient } from '@/infrastructure/supabase/server-client';
import { currentSession } from '@/lib/session';

export const metadata = { title: 'Modifier le parcours — OnboardingRH' };

const ROLE_LABELS: Record<string, string> = {
  hr_admin: 'RH',
  manager: 'Manager',
  it: 'Informatique',
  employee: 'Employé',
};

function offsetLabel(offset: number): string {
  if (offset === 0) return "le jour de l’arrivée";
  const days = Math.abs(offset);
  const unit = days > 1 ? 'jours ouvrés' : 'jour ouvré';
  return offset < 0 ? `${days} ${unit} avant l’arrivée` : `${days} ${unit} après l’arrivée`;
}

export default async function TemplateDetailPage({ params }: { readonly params: Promise<{ templateId: string }> }) {
  const { templateId } = await params;
  const session = await currentSession();
  if (!session.ok) {
    redirect('/connexion');
  }
  if (!canAccess(session.context.membership.role, 'journey_builder')) {
    redirect('/');
  }

  const client = await createSupabaseServerClient();
  const repository = supabaseTemplateRepository(client);
  const detail = await loadTemplateForEditing(repository, templateId);
  if (!detail) {
    notFound();
  }
  const sites = await supabaseSiteDirectory(client).listByCompany(session.context.membership.companyId);

  // Detection de structure independante de toute date : une cle dupliquee, une
  // dependance inconnue ou un cycle sont des defauts du template lui-meme, pas
  // de l'embauche qu'on simulera plus bas.
  const structureCheck = previewTemplateSchedule(detail, parsePlainDate('2026-01-05'), createWorkingCalendar());
  const taskTitleByKey = new Map(detail.tasks.map((t) => [t.key, t.title]));
  const sortedTasks = [...detail.tasks].sort((a, b) => a.position - b.position);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-display text-3xl tracking-tight text-text">{detail.name}</h1>
          <p className="text-text-muted">
            {[detail.criteria.jobFamily, detail.criteria.contractType].filter(Boolean).join(' · ') ||
              'Tous métiers, tous contrats'}
          </p>
        </div>
        <DuplicateTemplateDialog templateId={detail.id} templateName={detail.name} sites={sites} />
      </header>

      {!structureCheck.ok ? (
        <div role="alert" className="flex gap-3 rounded-[var(--radius)] border border-danger/30 bg-danger-soft p-4">
          <AlertTriangle aria-hidden className="size-5 shrink-0 text-danger" />
          <div className="text-sm text-text">
            <p className="font-medium">Ce template ne peut pas être utilisé pour une embauche.</p>
            <ul className="mt-1 list-disc pl-4 text-text-muted">
              {structureCheck.defects.map((defect, index) => (
                <li key={index}>
                  {defect.code === 'duplicate_definition_key' && `La clé « ${defect.key} » est utilisée deux fois.`}
                  {defect.code === 'unknown_dependency_key' &&
                    `« ${defect.key} » dépend de « ${defect.dependsOn} », qui n’existe pas.`}
                  {defect.code === 'invalid_graph' && 'Les dépendances forment un cycle : aucune tâche ne peut commencer.'}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <Card>
        <CardHeader
          title="Tâches du parcours"
          description="L’enchaînement des dépendances, dans l’ordre où elles s’exécutent."
          action={
            <TaskFormDialog
              templateId={detail.id}
              task={null}
              otherTasks={detail.tasks}
              position={sortedTasks.length}
              trigger={
                <Button size="sm">
                  <Plus aria-hidden className="size-4" />
                  Ajouter une tâche
                </Button>
              }
            />
          }
        />
        <CardBody>
          {sortedTasks.length === 0 ? (
            <EmptyState
              title="Ce template n’a encore aucune tâche"
              description="Ajoutez la première étape du parcours : un contrat à signer, un compte à créer, un accueil à préparer."
            />
          ) : (
            <ol className="space-y-3">
              {sortedTasks.map((task) => (
                <li key={task.id} className="rounded-[var(--radius)] border border-border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1.5">
                      <p className="font-medium text-text">{task.title}</p>
                      <p className="text-sm text-text-muted">
                        {ROLE_LABELS[task.ownerRole] ?? task.ownerRole} · {offsetLabel(task.offsetInWorkingDays)}
                      </p>
                      {task.dependsOn.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <span className="text-xs text-text-subtle">Dépend de</span>
                          {task.dependsOn.map((key) => (
                            <span
                              key={key}
                              className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-sunken px-2 py-0.5 text-xs text-text-muted"
                            >
                              <ArrowRight aria-hidden className="size-3" />
                              {taskTitleByKey.get(key) ?? key}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <div className="flex flex-wrap gap-2 pt-1">
                        {task.criticality === 'critical' ? <StatusBadge tone="danger" label="Critique" /> : null}
                        {task.expectedDocument ? (
                          <StatusBadge tone="neutral" label={`Pièce : ${task.expectedDocument}`} />
                        ) : null}
                        {task.sharedKey ? <StatusBadge tone="progress" label="Mutualisée" /> : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <TaskFormDialog
                        templateId={detail.id}
                        task={task}
                        otherTasks={detail.tasks.filter((t) => t.id !== task.id)}
                        position={task.position}
                        trigger={<Button variant="secondary" size="sm">Modifier</Button>}
                      />
                      <DeleteTaskDialog
                        templateId={detail.id}
                        taskId={task.id}
                        taskTitle={task.title}
                        dependents={findDependentTasks(detail, task.id)}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Aperçu"
          description="Pour une date d’arrivée donnée, les échéances réelles que ce template produirait."
        />
        <CardBody>
          <ArrivalPreview templateId={detail.id} />
        </CardBody>
      </Card>
    </div>
  );
}
