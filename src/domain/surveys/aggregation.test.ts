import { describe, expect, it } from 'vitest';
import { aggregateByGroup, aggregateRatings } from './aggregation';

describe('aggregateRatings', () => {
  it('calcule la moyenne au-dessus du seuil', () => {
    expect(aggregateRatings([4, 5, 3, 4, 4], 5)).toEqual({ kind: 'available', respondents: 5, average: 4 });
  });

  it('arrondit la moyenne au dixieme', () => {
    const result = aggregateRatings([4, 4, 5, 5, 5, 3], 5);
    expect(result).toEqual({ kind: 'available', respondents: 6, average: 4.3 });
  });
});

describe('cas limite : aucun repondant', () => {
  it('affiche une absence de donnee, pas un zero', () => {
    const result = aggregateRatings([], 5);
    expect(result).toEqual({ kind: 'no_data' });
    expect(result).not.toHaveProperty('average');
  });
});

describe('protection contre la re-identification', () => {
  it('ne publie ni moyenne ni nombre exact sous le seuil', () => {
    const result = aggregateRatings([2, 5], 5);
    expect(result).toEqual({ kind: 'too_few', minimum: 5 });
    expect(result).not.toHaveProperty('average');
    // « 2 reponses sur ce site » suffirait deja a savoir de qui il s'agit.
    expect(result).not.toHaveProperty('respondents');
  });

  it('ne laisse pas une seule reponse passer pour un agregat', () => {
    expect(aggregateRatings([1], 5).kind).toBe('too_few');
  });

  it('exclut les notes invalides du decompte du seuil', () => {
    // Quatre notes valides et une invalide : on reste sous le seuil de 5.
    expect(aggregateRatings([4, 4, 4, 4, 99], 5).kind).toBe('too_few');
  });
});

describe('aggregateByGroup', () => {
  it('applique le seuil a chaque site independamment', () => {
    const result = aggregateByGroup(
      [
        ...[4, 5, 4, 4, 5].map((rating) => ({ groupKey: 'lille', rating })),
        { groupKey: 'strasbourg', rating: 1 },
      ],
      ['lille', 'strasbourg', 'dubai'],
      5,
    );

    expect(result.get('lille')).toMatchObject({ kind: 'available' });
    expect(result.get('strasbourg')).toEqual({ kind: 'too_few', minimum: 5 });
    // Un site sans reponse reste visible, en absence de donnee.
    expect(result.get('dubai')).toEqual({ kind: 'no_data' });
  });
});
