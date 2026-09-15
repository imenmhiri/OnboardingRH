import { instantiateJourney, type InstantiationResult } from '@/domain/templates/journey-instantiation';
import type { JourneyTemplate } from '@/domain/templates/journey-template';
import type { PlainDate } from '@/domain/scheduling/plain-date';
import type { WorkingCalendar } from '@/domain/scheduling/working-calendar';
import type {
  NewTemplateTaskInput,
  TemplateDetail,
  TemplateRepository,
  TemplateSummary,
} from '@/application/ports/template-repository';

export async function listJourneyTemplates(
  repository: TemplateRepository,
  companyId: string,
): Promise<readonly TemplateSummary[]> {
  return repository.listByCompany(companyId);
}

export async function loadTemplateForEditing(
  repository: TemplateRepository,
  templateId: string,
): Promise<TemplateDetail | null> {
  return repository.findById(templateId);
}

function toJourneyTemplate(detail: TemplateDetail): JourneyTemplate {
  return {
    id: detail.id,
    companyId: detail.companyId,
    name: detail.name,
    criteria: detail.criteria,
    taskDefinitions: detail.tasks,
  };
}

/**
 * Rejoue exactement ce que produirait une vraie embauche pour une date
 * d'arrivee donnee : memes echeances, meme detection de cycle. C'est cette
 * reutilisation, plutot qu'une validation ecrite a part, qui garantit que
 * l'apercu ne ment jamais sur ce qui se passerait en production.
 */
export function previewTemplateSchedule(
  detail: TemplateDetail,
  arrivalDate: PlainDate,
  calendar: WorkingCalendar,
): InstantiationResult {
  return instantiateJourney({
    template: toJourneyTemplate(detail),
    journeyId: 'apercu',
    arrivalDate,
    calendar,
  });
}

export interface DependentTask {
  readonly id: string;
  readonly title: string;
}

/**
 * Cas limite : dependance supprimee alors qu'une autre tache s'y refere. La
 * base retire silencieusement la ligne de dependance (ON DELETE CASCADE) ;
 * sans cet avertissement prealable, une tache qui semblait correctement
 * subordonnee se retrouverait debloquee sans que personne ne l'ait decide.
 */
export function findDependentTasks(detail: TemplateDetail, taskId: string): readonly DependentTask[] {
  return detail.tasks
    .filter((task) => task.dependsOn.includes(detail.tasks.find((t) => t.id === taskId)?.key ?? '__none__'))
    .map((task) => ({ id: task.id, title: task.title }));
}

export async function saveTemplateTask(
  repository: TemplateRepository,
  templateId: string,
  taskId: string | null,
  input: NewTemplateTaskInput,
  position: number,
): Promise<string> {
  return repository.upsertTask(templateId, taskId, input, position);
}

export async function deleteTemplateTask(repository: TemplateRepository, taskId: string): Promise<void> {
  await repository.deleteTask(taskId);
}

export async function duplicateTemplate(
  repository: TemplateRepository,
  templateId: string,
  name: string,
  criteria: JourneyTemplate['criteria'],
): Promise<string> {
  return repository.duplicate(templateId, name, criteria);
}
