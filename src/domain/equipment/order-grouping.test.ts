import { describe, expect, it } from 'vitest';
import { parsePlainDate, type PlainDate } from '../scheduling/plain-date';
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

function arrivals(entries: Record<string, string>): ReadonlyMap<string, PlainDate> {
  return new Map(Object.entries(entries).map(([journeyId, date]) => [journeyId, parsePlainDate(date)]));
}

const SAME_WEEK = arrivals({
  'journey-1': '2026-09-28',
  'journey-2': '2026-09-28',
  'journey-3': '2026-10-01',
  'journey-r1': '2026-09-28',
  'journey-r2': '2026-09-28',
  'journey-r3': '2026-09-28',
});

describe('cas limite : meme modele commande pour plusieurs arrivees simultanees', () => {
  it('regroupe trois demandes du meme modele arrivant la meme semaine en une seule commande', () => {
    const groups = groupRequestsForOrder(
      [
        request({ id: 'r1', journeyId: 'journey-1' }),
        request({ id: 'r2', journeyId: 'journey-2' }),
        request({ id: 'r3', journeyId: 'journey-3' }),
      ],
      SAME_WEEK,
    );

    expect(groups).toEqual([
      {
        companyId: 'company-1',
        catalogItemId: 'laptop-standard',
        arrivalWeekStart: '2026-09-28',
        requestIds: ['r1', 'r2', 'r3'],
        journeyIds: ['journey-1', 'journey-2', 'journey-3'],
        quantity: 3,
      },
    ]);
  });

  it('ne regroupe pas une arrivee deja passee avec une arrivee dans trois semaines', () => {
    const groups = groupRequestsForOrder(
      [
        request({ id: 'diego', journeyId: 'journey-diego' }),
        request({ id: 'claire', journeyId: 'journey-claire' }),
      ],
      arrivals({ 'journey-diego': '2026-09-08', 'journey-claire': '2026-09-28' }),
    );

    expect(groups).toHaveLength(2);
    expect(groups.map((g) => [g.arrivalWeekStart, g.requestIds])).toEqual([
      ['2026-09-07', ['diego']],
      ['2026-09-28', ['claire']],
    ]);
  });

  it('separe deux semaines consecutives, meme a un jour d ecart', () => {
    const groups = groupRequestsForOrder(
      [request({ id: 'sunday', journeyId: 'j-sun' }), request({ id: 'monday', journeyId: 'j-mon' })],
      arrivals({ 'j-sun': '2026-10-04', 'j-mon': '2026-10-05' }),
    );
    expect(groups).toHaveLength(2);
  });

  it('garde a part une demande dont l arrivee est inconnue, sans l ecarter', () => {
    const groups = groupRequestsForOrder(
      [request({ id: 'known', journeyId: 'journey-1' }), request({ id: 'unknown', journeyId: 'journey-x' })],
      SAME_WEEK,
    );
    expect(groups.map((g) => [g.arrivalWeekStart, g.requestIds])).toEqual([
      ['2026-09-28', ['known']],
      [null, ['unknown']],
    ]);
  });

  it('separe les modeles differents en groupes distincts', () => {
    const groups = groupRequestsForOrder(
      [
        request({ id: 'r1', catalogItemId: 'laptop-standard' }),
        request({ id: 'r2', catalogItemId: 'badge' }),
      ],
      SAME_WEEK,
    );
    expect(groups).toHaveLength(2);
  });

  it('ne regroupe jamais deux societes, meme pour le meme identifiant de modele', () => {
    const groups = groupRequestsForOrder(
      [
        request({ id: 'r1', companyId: 'company-1' }),
        request({ id: 'r2', companyId: 'company-2' }),
      ],
      SAME_WEEK,
    );
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.companyId).sort()).toEqual(['company-1', 'company-2']);
  });

  it('ignore les demandes deja au-dela de requested', () => {
    const groups = groupRequestsForOrder(
      [
        request({ id: 'r1', status: 'requested' }),
        request({ id: 'r2', status: 'ordered' }),
        request({ id: 'r3', status: 'assigned' }),
      ],
      SAME_WEEK,
    );
    expect(groups).toEqual([
      {
        companyId: 'company-1',
        catalogItemId: 'laptop-standard',
        arrivalWeekStart: '2026-09-28',
        requestIds: ['r1'],
        journeyIds: ['journey-r1'],
        quantity: 1,
      },
    ]);
  });

  it('ne produit aucun groupe sans demande a commander', () => {
    expect(groupRequestsForOrder([request({ id: 'r1', status: 'acknowledged' })], SAME_WEEK)).toEqual([]);
  });
});
