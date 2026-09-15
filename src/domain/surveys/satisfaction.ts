import type { SurveyMilestone } from './survey-schedule';

/**
 * Score de satisfaction et detection de signal faible. Un signal faible n'est
 * pas une mauvaise note isolee seulement : c'est aussi une note correcte qui
 * s'effondre entre J+7 et J+30, ou un meme sujet qui revient chez plusieurs
 * arrivants — ce qu'aucune reponse, lue seule, ne montre.
 */

export const MIN_RATING = 1;
export const MAX_RATING = 5;

export interface SurveyResponse {
  readonly milestone: SurveyMilestone;
  readonly rating: number;
  readonly comment: string | null;
  /** Themes tagues sur la reponse : « materiel », « accueil », « acces »... */
  readonly themes: readonly string[];
}

/** Les seuils sont une donnee de la societe, jamais une constante du module. */
export interface WeakSignalPolicy {
  readonly lowRatingAtOrBelow: number;
  readonly dropAtLeast: number;
  readonly recurringThemeAtLeast: number;
}

export type WeakSignal =
  | { readonly code: 'low_rating'; readonly milestone: SurveyMilestone; readonly rating: number }
  | { readonly code: 'rating_drop'; readonly from: number; readonly to: number; readonly delta: number }
  | { readonly code: 'recurring_theme'; readonly theme: string; readonly occurrences: number };

export function isValidRating(rating: number): boolean {
  return Number.isInteger(rating) && rating >= MIN_RATING && rating <= MAX_RATING;
}

/** Signaux lisibles sur le parcours d'une seule personne. */
export function detectJourneySignals(
  responses: readonly SurveyResponse[],
  policy: WeakSignalPolicy,
): readonly WeakSignal[] {
  const valid = responses.filter((response) => isValidRating(response.rating));
  const signals: WeakSignal[] = [];

  for (const response of valid) {
    if (response.rating <= policy.lowRatingAtOrBelow) {
      signals.push({ code: 'low_rating', milestone: response.milestone, rating: response.rating });
    }
  }

  const first = valid.find((response) => response.milestone === 'day_7');
  const second = valid.find((response) => response.milestone === 'day_30');
  if (first && second) {
    const delta = first.rating - second.rating;
    if (delta >= policy.dropAtLeast) {
      signals.push({ code: 'rating_drop', from: first.rating, to: second.rating, delta });
    }
  }

  return signals;
}

/**
 * Themes qui reviennent sur plusieurs reponses. Un theme ne compte qu'une fois
 * par reponse, sinon une seule personne insistante ferait passer son sujet
 * pour un probleme collectif.
 */
export function detectRecurringThemes(
  responses: readonly SurveyResponse[],
  policy: WeakSignalPolicy,
): readonly WeakSignal[] {
  const counts = new Map<string, number>();
  for (const response of responses) {
    for (const theme of new Set(response.themes.map((t) => t.trim().toLowerCase()).filter(Boolean))) {
      counts.set(theme, (counts.get(theme) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .filter(([, occurrences]) => occurrences >= policy.recurringThemeAtLeast)
    .sort(([a, na], [b, nb]) => nb - na || a.localeCompare(b))
    .map(([theme, occurrences]) => ({ code: 'recurring_theme' as const, theme, occurrences }));
}
