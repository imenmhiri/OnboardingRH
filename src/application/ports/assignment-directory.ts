import type { OwnerRole } from '@/domain/tasks/task';
import type { Absence, AssignmentContext, OwnerSlot } from '@/domain/tasks/owner-resolution';

/**
 * De quoi resoudre les responsables d'un parcours : la chaine de repli de la
 * societe, les personnes que le parcours permet de designer, et les absences a
 * consulter aux dates d'echeance.
 */
export interface AssignmentDirectory {
  /** La chaine configuree pour ce role dans cette societe, vide si aucune. */
  fallbackChainFor(companyId: string, ownerRole: OwnerRole): Promise<readonly OwnerSlot[]>;
  /** Les personnes designables pour ce parcours precis. */
  contextFor(journeyId: string): Promise<AssignmentContext | null>;
  /**
   * Les absences de la societe chevauchant la periode demandee. On charge la
   * periode en une fois plutot qu'une requete par tache.
   */
  absencesBetween(companyId: string, from: string, to: string): Promise<readonly Absence[]>;
}
