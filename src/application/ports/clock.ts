import type { PlainDate } from '@/domain/scheduling/plain-date';

/**
 * L'horloge est un port, jamais un appel direct. Deux raisons : le domaine ne
 * doit pas dependre de l'heure systeme pour rester testable, et "aujourd'hui"
 * n'est pas le meme jour partout — une arrivee a Dubai a change de date quand
 * il est encore la veille a Lille.
 */
export interface Clock {
  /** Le jour civil courant, dans le fuseau de la societe concernee. */
  today(): PlainDate;
}
