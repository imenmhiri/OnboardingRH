import type { EquipmentRequest } from './equipment';

/**
 * Regroupe les demandes d'un meme modele en une seule commande. Cas limite du
 * cahier des charges : trois arrivees simultanees qui demandent chacune un
 * « ordinateur standard » ne doivent pas produire trois bons de commande.
 *
 * Le regroupement ne traverse jamais une societe : deux filiales qui ont
 * chacune une ligne « ordinateur standard » dans leur catalogue restent deux
 * commandes distinctes, meme si le nom du modele est identique par hasard.
 */

export interface EquipmentOrderGroup {
  readonly companyId: string;
  readonly catalogItemId: string;
  readonly requestIds: readonly string[];
  readonly journeyIds: readonly string[];
  readonly quantity: number;
}

/** Seules les demandes encore « requested » ont besoin d'etre commandees. */
export function groupRequestsForOrder(
  requests: readonly EquipmentRequest[],
): readonly EquipmentOrderGroup[] {
  const groups = new Map<string, EquipmentRequest[]>();

  for (const request of requests) {
    if (request.status !== 'requested') {
      continue;
    }
    const key = `${request.companyId}:${request.catalogItemId}`;
    groups.set(key, [...(groups.get(key) ?? []), request]);
  }

  return [...groups.values()].map((members) => {
    const first = members[0];
    if (!first) {
      throw new RangeError('Unreachable: a group is never built from zero requests.');
    }
    return {
      companyId: first.companyId,
      catalogItemId: first.catalogItemId,
      requestIds: members.map((m) => m.id),
      journeyIds: [...new Set(members.map((m) => m.journeyId))],
      quantity: members.length,
    };
  });
}
