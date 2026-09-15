import { describe, expect, it } from 'vitest';
import { brandContrastRatios, brandPalette, brandVariables, type CompanyBranding } from './branding';
import { meetsAA } from './color';

function company(primary: string): CompanyBranding {
  return { name: 'Société test', primary, accent: '#0d9488', logoUrl: null };
}

// Marques volontairement difficiles : pale, mi-ton, saturee, extremes.
const BRANDS = [
  '#f6d55c',
  '#e63946',
  '#1d3557',
  '#0d9488',
  '#ffffff',
  '#000000',
  'oklch(0.48 0.16 264)',
  'oklch(0.85 0.18 95)',
];

describe('brandVariables', () => {
  it('produit exactement les variables attendues', () => {
    expect(Object.keys(brandVariables(company('#1d3557'))).sort()).toEqual([
      '--accent',
      '--brand',
      '--brand-soft',
      '--brand-soft-text',
      '--brand-text',
    ]);
  });

  it('laisse une marque deja lisible telle quelle', () => {
    expect(brandVariables(company('#1d3557'))['--brand']).toBe('#1d3557');
  });

  it('exprime les fonds tamises en light-dark, pour ne pas ecraser le theme sombre', () => {
    const vars = brandVariables(company('#f6d55c'));
    expect(vars['--brand-soft']).toMatch(/^light-dark\(oklch\(.+\), oklch\(.+\)\)$/);
    expect(vars['--brand-soft-text']).toMatch(/^light-dark\(/);
  });
});

describe('cas limite : couleur de marque claire', () => {
  it('choisit un texte sombre sur une marque pale', () => {
    expect(brandVariables(company('#f6d55c'))['--brand-text']).toBe('#111827');
  });

  it('atteint AA sur la marque, en clair et en sombre, quelle que soit la marque', () => {
    for (const primary of BRANDS) {
      const ratios = brandContrastRatios(company(primary));
      expect(meetsAA(ratios.onBrand), `${primary} sur la marque : ${ratios.onBrand.toFixed(2)}`).toBe(true);
      expect(meetsAA(ratios.onSoftLight), `${primary} tamise clair : ${ratios.onSoftLight.toFixed(2)}`).toBe(true);
      expect(meetsAA(ratios.onSoftDark), `${primary} tamise sombre : ${ratios.onSoftDark.toFixed(2)}`).toBe(true);
    }
  });

  it('garde un fond tamise clair en theme clair et sombre en theme sombre', () => {
    const palette = brandPalette(company('#f6d55c'));
    expect(palette.softLight).toMatch(/^oklch\(0\.95/);
    expect(palette.softDark).toMatch(/^oklch\(0\.30/);
  });
});
