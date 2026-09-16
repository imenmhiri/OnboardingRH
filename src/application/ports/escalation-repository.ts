import type { PlainDate } from '@/domain/scheduling/plain-date';
import type { Task } from '@/domain/tasks/task';
import type { JourneyStatusForEscalation } from '@/domain/escalation/escalation-candidates';
import type { EscalationPolicy } from '@/domain/escalation/escalation-policy';

/**
 * Tout ce que W2 (T-22) doit lire pour construire les candidats a la relance :
 * les taches d'un parcours (toutes, pas une liste pre-filtree — c'est ce qui
 * permet au graphe de dependances de retrouver la cause racine, voir T-13),
 * la politique de seuils de la societe, et les dernieres relances envoyees.
 */

export interface EscalationJourneySource {
  readonly journeyId: string;
  readonly employeeName: string;
  readonly siteId: string | null;
  readonly managerId: string | null;
  readonly status: JourneyStatusForEscalation;
  readonly tasks: readonly Task[];
}

export interface PersonContact {
  readonly id: string;
  readonly name: string | null;
  readonly email: string | null;
}

export interface EscalationRepository {
  /** Tous les parcours d'une societe, actifs ou non — le filtrage revient au domaine. */
  journeysWithTasks(companyId: string): Promise<readonly EscalationJourneySource[]>;

  policyFor(companyId: string): Promise<EscalationPolicy | null>;

  hrAdminIds(companyId: string): Promise<readonly string[]>;

  /**
   * Date de la derniere relance ecrite dans le journal d'audit
   * (`task.reminder_sent`, T-13) pour chacune des taches demandees.
   */
  lastReminderDates(
    companyId: string,
    taskIds: readonly string[],
  ): Promise<ReadonlyMap<string, PlainDate>>;

  personContact(personId: string): Promise<PersonContact | null>;
}
