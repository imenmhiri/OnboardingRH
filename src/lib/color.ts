/**
 * Contrast maths, so the readability of a brand colour is computed rather than
 * eyeballed. A subsidiary can store any colour it likes; the interface still has
 * to reach 4.5:1 on text, and only a calculation can promise that.
 *
 * Supports the two notations the company records use: hexadecimal and oklch.
 */

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const OKLCH = /^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)\s*\)$/i;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function parseHex(value: string): Rgb | null {
  const match = HEX.exec(value.trim());
  if (!match) {
    return null;
  }
  const digits = match[1] ?? '';
  const full = digits.length === 3 ? [...digits].map((d) => d + d).join('') : digits;
  return {
    r: Number.parseInt(full.slice(0, 2), 16) / 255,
    g: Number.parseInt(full.slice(2, 4), 16) / 255,
    b: Number.parseInt(full.slice(4, 6), 16) / 255,
  };
}

function gammaEncode(channel: number): number {
  return channel <= 0.0031308
    ? 12.92 * channel
    : 1.055 * Math.pow(channel, 1 / 2.4) - 0.055;
}

/** Oklab to linear sRGB, then gamma encoding (Björn Ottosson's matrices). */
function oklchToRgb(lightness: number, chroma: number, hueDegrees: number): Rgb {
  const hue = (hueDegrees * Math.PI) / 180;
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);

  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return {
    r: clamp01(gammaEncode(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
    g: clamp01(gammaEncode(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
    b: clamp01(gammaEncode(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)),
  };
}

function parseOklch(value: string): Rgb | null {
  const match = OKLCH.exec(value.trim());
  if (!match) {
    return null;
  }
  const [, rawLightness, rawChroma, rawHue] = match;
  const lightness = rawLightness?.endsWith('%')
    ? Number.parseFloat(rawLightness) / 100
    : Number.parseFloat(rawLightness ?? '0');
  return oklchToRgb(lightness, Number.parseFloat(rawChroma ?? '0'), Number.parseFloat(rawHue ?? '0'));
}

export function parseColor(value: string): Rgb | null {
  return parseHex(value) ?? parseOklch(value);
}

function linearise(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(color: Rgb): number {
  return (
    0.2126 * linearise(color.r) + 0.7152 * linearise(color.g) + 0.0722 * linearise(color.b)
  );
}

/** WCAG contrast ratio, from 1:1 to 21:1. */
export function contrastRatio(foreground: string, background: string): number {
  const fg = parseColor(foreground);
  const bg = parseColor(background);
  if (!fg || !bg) {
    throw new RangeError(`Unsupported colour notation: "${foreground}" or "${background}".`);
  }
  const lighter = Math.max(relativeLuminance(fg), relativeLuminance(bg));
  const darker = Math.min(relativeLuminance(fg), relativeLuminance(bg));
  return (lighter + 0.05) / (darker + 0.05);
}

export type TextSize = 'normal' | 'large';

export function meetsAA(ratio: number, size: TextSize = 'normal'): boolean {
  return ratio >= (size === 'large' ? 3 : 4.5);
}

export const INK = '#111827';
export const PAPER = '#ffffff';

/**
 * Picks the readable text colour to lay over a brand colour. A pale brand gets
 * dark text instead of the white the brand book assumes, because an unreadable
 * button is worse than an off-brand one.
 */
export function readableTextOn(background: string, candidates: readonly string[] = [PAPER, INK]): string {
  let best = candidates[0] ?? INK;
  let bestRatio = 0;
  for (const candidate of candidates) {
    const ratio = contrastRatio(candidate, background);
    if (ratio > bestRatio) {
      best = candidate;
      bestRatio = ratio;
    }
  }
  return best;
}

export interface Oklch {
  readonly l: number;
  readonly c: number;
  readonly h: number;
}

function gammaDecode(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

export function rgbToOklch({ r, g, b }: Rgb): Oklch {
  const lr = gammaDecode(r);
  const lg = gammaDecode(g);
  const lb = gammaDecode(b);

  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  const hue = (Math.atan2(bb, a) * 180) / Math.PI;
  return { l: lightness, c: Math.hypot(a, bb), h: hue < 0 ? hue + 360 : hue };
}

export function formatOklch({ l, c, h }: Oklch): string {
  return `oklch(${l.toFixed(4)} ${c.toFixed(4)} ${h.toFixed(2)})`;
}

/**
 * Some mid-tone brand colours reach 4.5:1 against neither white nor black — a
 * mid red tops out around 4.3. Picking a text colour cannot fix that, so the
 * brand colour itself is darkened or lightened along its own hue until the
 * text becomes readable. Still the brand, just usable.
 */
export function accessibleSurface(
  brand: string,
  text: string,
  minimumRatio = 4.5,
): string {
  const parsed = parseColor(brand);
  if (!parsed) {
    throw new RangeError(`Unsupported colour notation: "${brand}".`);
  }
  if (contrastRatio(text, brand) >= minimumRatio) {
    return brand;
  }

  const base = rgbToOklch(parsed);
  const textLuminance = relativeLuminance(parseColor(text) ?? { r: 0, g: 0, b: 0 });
  // Move away from the text: dark text pushes the surface lighter, and vice versa.
  const direction = textLuminance > 0.5 ? -1 : 1;

  for (let step = 1; step <= 100; step += 1) {
    const candidate = formatOklch({ ...base, l: clamp01(base.l + direction * step * 0.01) });
    if (contrastRatio(text, candidate) >= minimumRatio) {
      return candidate;
    }
  }
  // Unreachable in practice: pure black or white always satisfies the ratio.
  return direction === 1 ? PAPER : INK;
}

/** The pair a brand colour must be used as, once readability is accounted for. */
export interface BrandSurface {
  readonly background: string;
  readonly text: string;
  readonly ratio: number;
}

export function brandSurface(brand: string, minimumRatio = 4.5): BrandSurface {
  const text = readableTextOn(brand);
  const background = accessibleSurface(brand, text, minimumRatio);
  return { background, text, ratio: contrastRatio(text, background) };
}

/**
 * A quiet tint of the brand: same hue, chroma held back, lightness imposed.
 * Computed rather than mixed in CSS, so the contrast of what sits on it can be
 * checked in a test instead of being hoped for.
 */
export function brandTint(brand: string, lightness: number, maximumChroma: number): string {
  const parsed = parseColor(brand);
  if (!parsed) {
    throw new RangeError(`Unsupported colour notation: "${brand}".`);
  }
  const { c, h } = rgbToOklch(parsed);
  return formatOklch({ l: clamp01(lightness), c: Math.min(c, maximumChroma), h });
}
