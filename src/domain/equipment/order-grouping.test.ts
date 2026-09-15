import { describe, expect, it } from 'vitest';
import type { EquipmentRequest } from './equipment';
import { groupRequestsForOrder } from './order-grouping';

function request(overrides: Partial<EquipmentRequest> & Pick<EquipmentRequest, 'id'>): EquipmentRequest {
  return {
    companyId: 'company-1',
    journeyId: `journey-${overrides.id}`,
    taskId: null,
    catalogItemId: 'laptop-standard',
    status: 'requested',
    ...overrides,
  };
}

describe('cas limite : meme modele commande pour plusieurs arrivees simultanees', () => {
  it('regroupe trois demandes du meme modele en une seule commande', () => {
    const groups = groupRequestsForOrder([
      request({ id: 'r1', journeyId: 'journey-1' }),
      request({ id: 'r2', journeyId: 'journey-2' }),
      request({ id: 'r3', journeyId: 'journey-3' }),
    ]);

    expect(groups).toEqual([
      {
        companyId: 'company-1',
        catalogItemId: 'laptop-standard',
        requestIds: ['r1', 'r2', 'r3'],
        journeyIds: ['journey-1', 'journey-2', 'journey-3'],
        quantity: 3,
      },
    ]);
  });

  it('separe les modeles differents en groupes distincts', () => {
    const groups = groupRequestsForOrder([
      request({ id: 'r1', catalogItemId: 'laptop-standard' }),
      request({ id: 'r2', catalogItemId: 'badge' }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it('ne regroupe jamais deux societes, meme pour le meme identifiant de modele', () => {
    const groups = groupRequestsForOrder([
      request({ id: 'r1', companyId: 'company-1' }),
      request({ id: 'r2', companyId: 'company-2' }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.companyId).sort()).toEqual(['company-1', 'company-2']);
  });

  it('ignore les demandes deja au-dela de requested', () => {
    const groups = groupRequestsForOrder([
      request({ id: 'r1', status: 'requested' }),
      request({ id: 'r2', status: 'ordered' }),
      request({ id: 'r3', status: 'assigned' }),
    ]);
    expect(groups).toEqual([
      {
        companyId: 'company-1',
        catalogItemId: 'laptop-standard',
        requestIds: ['r1'],
        journeyIds: ['journey-r1'],
        quantity: 1,
      },
    ]);
  });

  it('ne produit aucun groupe sans demande a commander', () => {
    expect(groupRequestsForOrder([request({ id: 'r1', status: 'acknowledged' })])).toEqual([]);
  });
});
