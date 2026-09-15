import type { OwnerRole } from '@/domain/tasks/task';
import type { JourneyTemplate, TaskDefinition } from '@/domain/templates/journey-template';

/**
 * Un template tel que l'ecran de creation de parcours le manipule. Une tache
 * de template porte un identifiant stable en base, en plus de la cle qui sert
 * aux dependances dans le domaine — l'ecran a besoin des deux : la cle pour
 * exprimer « depend de », l'id pour editer ou supprimer une ligne precise.
 */
export interface TemplateTaskRecord extends TaskDefinition {
  readonly id: string;
  readonly criticality: 'standard' | 'critical';
  readonly position: number;
}

export interface TemplateSummary {
  readonly id: string;
  readonly companyId: string;
  readonly name: string;
  readonly criteria: JourneyTemplate['criteria'];
  readonly taskCount: number;
}

export interface TemplateDetail {
  readonly id: string;
  readonly companyId: string;
  readonly name: string;
  readonly criteria: JourneyTemplate['criteria'];
  readonly tasks: readonly TemplateTaskRecord[];
}

export interface NewTemplateTaskInput {
  readonly key: string;
  readonly title: string;
  readonly ownerRole: OwnerRole;
  readonly offsetInWorkingDays: number;
  readonly dependsOn: readonly string[];
  readonly expectedDocument: string | null;
  readonly sharedKey: string | null;
  readonly criticality: 'standard' | 'critical';
}

export interface TemplateRepository {
  listByCompany(companyId: string): Promise<readonly TemplateSummary[]>;
  findById(templateId: string): Promise<TemplateDetail | null>;
  create(input: { companyId: string; name: string; criteria: JourneyTemplate['criteria'] }): Promise<string>;
  rename(templateId: string, name: string): Promise<void>;

  /** Cree ou remplace une tache de template, identifiee par sa position dans la liste. */
  upsertTask(templateId: string, taskId: string | null, task: NewTemplateTaskInput, position: number): Promise<string>;
  deleteTask(taskId: string): Promise<void>;

  /**
   * Duplique un template entier — taches et dependances comprises — vers de
   * nouveaux criteres, et renvoie l'identifiant du nouveau template.
   */
  duplicate(templateId: string, name: string, criteria: JourneyTemplate['criteria']): Promise<string>;
}
