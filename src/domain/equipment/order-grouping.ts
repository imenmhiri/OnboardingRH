import { mondayOf, type PlainDate } from '../scheduling/plain-date';
import type { EquipmentRequest } from './equipment';

/**
 * Regroupe les demandes d'un meme modele en une seule commande. Cas limite du
 * cahier des charges : trois arrivees simultanees qui demandent chacune un
 * « ordinateur standard » ne doivent pas produire trois bons de commande.
 *
 * « Simultanees » veut dire la meme semaine d'arrivee : une arrivee deja en
 * retard et une autre dans trois semaines n'ont pas la meme urgence, les
 * reunir dans une commande ferait attendre l'une ou presser l'autre.
 *
 * Le regroupement ne traverse jamais une societe : deux filiales qui ont
 * chacune une ligne « ordinateur standard » dans leur catalogue restent deux
 * commandes distinctes, meme si le nom du modele est identique par hasard.
 */

export interface EquipmentOrderGroup {
  readonly companyId: string;
  readonly catalogItemId: string;
  /** Lundi de la semaine d'arrivee commune ; null si la date est inconnue. */
  readonly arrivalWeekStart: PlainDate | null;
  readonly requestIds: readonly string[];
  readonly journeyIds: readonly string[];
  readonly quantity: number;
}

/** Seules les demandes encore « requested » ont besoin d'etre commandees. */
export function groupRequestsForOrder(
  requests: readonly EquipmentRequest[],
  arrivalDateByJourneyId: ReadonlyMap<string, PlainDate>,
): readonly EquipmentOrderGroup[] {
  const groups = new Map<string, { weekStart: PlainDate | null; members: EquipmentRequest[] }>();

  for (const request of requests) {
    if (request.status !== 'requested') {
      continue;
    }
    const arrival = arrivalDateByJourneyId.get(request.journeyId);
    const weekStart = arrival ? mondayOf(arrival) : null;
    const key = `${request.companyId}:${request.catalogItemId}:${weekStart ?? 'unknown'}`;
    const group = groups.get(key) ?? { weekStart, members: [] };
    group.members.push(request);
    groups.set(key, group);
  }

  return [...groups.values()].map(({ weekStart, members }) => {
    const first = members[0];
    if (!first) {
      throw new RangeError('Unreachable: a group is never built from zero requests.');
    }
    return {
      companyId: first.companyId,
      catalogItemId: first.catalogItemId,
      arrivalWeekStart: weekStart,
      requestIds: members.map((m) => m.id),
      journeyIds: [...new Set(members.map((m) => m.journeyId))],
      quantity: members.length,
    };
  });
}
