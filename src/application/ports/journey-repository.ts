import type { PlainDate } from '@/domain/scheduling/plain-date';
import type { Task } from '@/domain/tasks/task';

/**
 * Persiste un parcours instancie : la ligne journeys, ses taches, et les
 * responsables une fois resolus. Le domaine produit les taches en memoire
 * (voir `instantiateJourney`) ; ce port se contente d'ecrire ce qui a deja ete
 * decide.
 */

export interface NewJourneyInput {
  readonly id: string;
  readonly companyId: string;
  readonly siteId: string | null;
  readonly templateId: string;
  readonly employeeName: string;
  readonly employeeId: string | null;
  readonly jobFamily: string | null;
  readonly contractType: string | null;
  readonly managerId: string | null;
  readonly arrivalDate: PlainDate;
  /** Reference externe (ATS/HRIS) : c'est elle qui porte l'idempotence. */
  readonly hireReference: string;
  /** Seule adresse qui joint un employe sans compte encore cree (voir T-24). */
  readonly personalEmail: string | null;
}

export type InsertJourneyResult =
  | { readonly ok: true }
  /**
   * La contrainte unique a tranche a la place du controle applicatif — utile
   * quand deux requetes concurrentes passent toutes deux la verification
   * prealable avant que l'une des deux n'ecrive.
   */
  | { readonly ok: false; readonly reason: 'duplicate_hire_reference' };

export interface JourneyRepository {
  /** Cas limite « meme embauche recue deux fois » : verification avant ecriture. */
  findByHireReference(
    companyId: string,
    hireReference: string,
  ): Promise<{ readonly journeyId: string } | null>;

  insertJourney(input: NewJourneyInput): Promise<InsertJourneyResult>;

  /**
   * Ecrit les taches instanciees, dependances comprises, pour ce parcours.
   * `offsetsByTaskId` porte le decalage en jours ouvres de chaque tache
   * (`template_tasks.offset_working_days`, perdu autrement : `Task`, cote
   * domaine, ne garde que l'echeance deja calculee, pas la regle qui l'a
   * produite). Un report d'arrivee (T-25, `reschedule-journey.ts`) en a
   * besoin pour recalculer — jamais retraduire par un simple decalage de
   * jours civils, qui ignorerait les feries et week-ends traverses
   * differemment par la nouvelle date.
   */
  insertTasks(
    companyId: string,
    journeyId: string,
    tasks: readonly Task[],
    offsetsByTaskId: ReadonlyMap<string, number>,
  ): Promise<void>;

  /** Null efface l'attribution : la tache redevient portee par l'equipe du role. */
  assignOwner(taskId: string, ownerId: string | null): Promise<void>;

  /**
   * Fait avancer le statut d'un parcours (`journey_status`). Utilise par W3
   * (T-23) pour clore/archiver un parcours dont le bilan J+30 a atteint son
   * etat terminal — jamais pour revenir en arriere, ce que ce port ne
   * verifie pas lui-meme (au cas d'usage de ne demander que des transitions
   * valides).
   */
  updateJourneyStatus(journeyId: string, status: 'completed' | 'cancelled'): Promise<void>;

  /** Ce qu'un report d'arrivee (T-25) doit relire avant de recalculer quoi que ce soit. */
  findById(journeyId: string): Promise<JourneySummary | null>;

  /**
   * Ecrit la nouvelle date d'arrivee. Ne touche a rien d'autre : recalculer
   * les echeances et deplacer les evenements d'agenda restent la
   * responsabilite du cas d'usage appelant (`reschedule-journey.ts`), jamais
   * de ce port.
   */
  updateArrivalDate(journeyId: string, arrivalDate: PlainDate): Promise<void>;

  /**
   * Les taches encore ouvertes d'un parcours, avec ce qu'il faut pour les
   * replanifier : leur decalage en jours ouvres (fige a l'instanciation, voir
   * `template_tasks.offset_working_days`), leur echeance actuelle, leur titre
   * (reutilise tel quel comme titre d'evenement d'agenda — jamais invente) et
   * leur responsable eventuel.
   */
  openTaskSchedules(journeyId: string): Promise<readonly OpenTaskSchedule[]>;

  /** Ecrit les nouvelles echeances calculees par `rescheduleForArrivalDate` (domain/scheduling). */
  updateTaskDueDates(changes: readonly TaskDueDateChange[]): Promise<void>;
}

export interface JourneySummary {
  readonly id: string;
  readonly companyId: string;
  readonly siteId: string | null;
  readonly arrivalDate: PlainDate;
  readonly status: string;
}

export interface OpenTaskSchedule {
  readonly taskId: string;
  readonly title: string;
  readonly ownerId: string | null;
  readonly offsetInWorkingDays: number;
  readonly dueDate: PlainDate;
}

export interface TaskDueDateChange {
  readonly taskId: string;
  readonly dueDate: PlainDate;
}
