import type { CSSProperties } from 'react';
import { accessibleSurface, brandSurface, brandTint, contrastRatio } from './color';

/**
 * The visual identity of one company, as stored in its row. Turning it into CSS
 * variables is the only place a brand touches the interface: no component ever
 * names a colour, so onboarding a subsidiary stays an insert.
 */
export interface CompanyBranding {
  readonly name: string;
  readonly primary: string;
  readonly accent: string;
  readonly logoUrl: string | null;
}

export interface BrandVariables extends CSSProperties {
  readonly '--brand': string;
  readonly '--brand-text': string;
  readonly '--brand-soft': string;
  readonly '--brand-soft-text': string;
  readonly '--accent': string;
}

/** The quiet tints, one per theme. */
const SOFT_LIGHT = { lightness: 0.95, chroma: 0.05 } as const;
const SOFT_DARK = { lightness: 0.3, chroma: 0.06 } as const;

export interface BrandPalette {
  readonly brand: string;
  readonly brandText: string;
  readonly softLight: string;
  readonly softLightText: string;
  readonly softDark: string;
  readonly softDarkText: string;
}

export function brandPalette(branding: CompanyBranding): BrandPalette {
  // The stored colour may be unreadable under text; the usable variant is derived.
  const surface = brandSurface(branding.primary);
  const softLight = brandTint(branding.primary, SOFT_LIGHT.lightness, SOFT_LIGHT.chroma);
  const softDark = brandTint(branding.primary, SOFT_DARK.lightness, SOFT_DARK.chroma);

  return {
    brand: surface.background,
    brandText: surface.text,
    softLight,
    // Contrast is symmetric: moving the brand away from the tint gives readable ink.
    softLightText: accessibleSurface(branding.primary, softLight),
    softDark,
    softDarkText: accessibleSurface(branding.primary, softDark),
  };
}

export function brandVariables(branding: CompanyBranding): BrandVariables {
  const palette = brandPalette(branding);
  return {
    '--brand': palette.brand,
    '--brand-text': palette.brandText,
    // light-dark() keeps one inline style valid in both themes; an inline value
    // would otherwise override the dark theme and leave a bright chip in it.
    '--brand-soft': `light-dark(${palette.softLight}, ${palette.softDark})`,
    '--brand-soft-text': `light-dark(${palette.softLightText}, ${palette.softDarkText})`,
    '--accent': branding.accent,
  };
}

/** The three text-on-background pairs the brand produces, for checking. */
export function brandContrastRatios(branding: CompanyBranding): {
  readonly onBrand: number;
  readonly onSoftLight: number;
  readonly onSoftDark: number;
} {
  const palette = brandPalette(branding);
  return {
    onBrand: contrastRatio(palette.brandText, palette.brand),
    onSoftLight: contrastRatio(palette.softLightText, palette.softLight),
    onSoftDark: contrastRatio(palette.softDarkText, palette.softDark),
  };
}
