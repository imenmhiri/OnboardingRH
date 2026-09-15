import { describe, expect, it } from 'vitest';
import { brandSurface, contrastRatio, INK, meetsAA, PAPER, parseColor, readableTextOn, rgbToOklch } from './color';

describe('parseColor', () => {
  it('lit l hexadecimal long et court', () => {
    expect(parseColor('#ffffff')).toEqual({ r: 1, g: 1, b: 1 });
    expect(parseColor('#000')).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('lit la notation oklch utilisee par les enregistrements societe', () => {
    const white = parseColor('oklch(1 0 0)');
    expect(white?.r).toBeCloseTo(1, 2);
    expect(white?.g).toBeCloseTo(1, 2);
    expect(white?.b).toBeCloseTo(1, 2);
  });

  it('accepte une clarte en pourcentage', () => {
    expect(parseColor('oklch(100% 0 0)')?.r).toBeCloseTo(1, 2);
  });

  it('refuse une notation inconnue', () => {
    expect(parseColor('rebeccapurple')).toBeNull();
    expect(parseColor('rgb(1,2,3)')).toBeNull();
  });
});

describe('contrastRatio', () => {
  it('donne 21 pour noir sur blanc', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
  });

  it('donne 1 pour deux couleurs identiques', () => {
    expect(contrastRatio('#3366cc', '#3366cc')).toBeCloseTo(1, 5);
  });

  it('est symetrique', () => {
    expect(contrastRatio('#ffffff', '#767676')).toBeCloseTo(contrastRatio('#767676', '#ffffff'), 5);
  });

  it('leve sur une notation non supportee', () => {
    expect(() => contrastRatio('bleu', '#ffffff')).toThrow(RangeError);
  });
});

describe('meetsAA', () => {
  it('exige 4.5 sur le texte courant et 3 sur le grand texte', () => {
    expect(meetsAA(4.5)).toBe(true);
    expect(meetsAA(4.49)).toBe(false);
    expect(meetsAA(3, 'large')).toBe(true);
    expect(meetsAA(2.9, 'large')).toBe(false);
  });
});

describe('cas limite : couleur de marque claire', () => {
  it('bascule sur du texte sombre quand la marque est pale', () => {
    // Un jaune de marque : du blanc dessus serait illisible.
    expect(readableTextOn('#f6d55c')).toBe(INK);
    expect(meetsAA(contrastRatio(readableTextOn('#f6d55c'), '#f6d55c'))).toBe(true);
  });

  it('garde du texte clair sur une marque sombre', () => {
    expect(readableTextOn('#1d3557')).toBe(PAPER);
  });

});

describe('rgbToOklch', () => {
  it('fait l aller-retour avec la notation oklch', () => {
    const rgb = parseColor('oklch(0.52 0.15 255)');
    const back = rgbToOklch(rgb!);
    expect(back.l).toBeCloseTo(0.52, 2);
    expect(back.c).toBeCloseTo(0.15, 2);
    expect(back.h).toBeCloseTo(255, 0);
  });
});

describe('brandSurface', () => {
  it('laisse la marque intacte quand elle est deja lisible', () => {
    expect(brandSurface('#1d3557').background).toBe('#1d3557');
  });

  it('assombrit une marque mi-ton qui n atteint AA avec aucun texte', () => {
    // Ce rouge plafonne a 4.26:1 en blanc comme en noir.
    const surface = brandSurface('#e63946');
    expect(surface.background).not.toBe('#e63946');
    expect(surface.ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('atteint AA sur toute marque, claire, sombre ou mi-ton', () => {
    const brands = [
      '#f6d55c',
      '#1d3557',
      '#0d9488',
      '#e63946',
      '#ffffff',
      '#000000',
      '#7f7f7f',
      'oklch(0.52 0.15 255)',
      'oklch(0.85 0.18 95)',
    ];
    for (const brand of brands) {
      const surface = brandSurface(brand);
      expect(surface.ratio, `marque ${brand} : ${surface.ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('conserve la teinte de la marque en ajustant la clarte', () => {
    const surface = brandSurface('#e63946');
    const original = rgbToOklch(parseColor('#e63946')!);
    const adjusted = rgbToOklch(parseColor(surface.background)!);
    expect(adjusted.h).toBeCloseTo(original.h, 0);
  });
});
