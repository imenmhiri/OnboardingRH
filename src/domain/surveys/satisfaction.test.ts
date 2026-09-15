import { describe, expect, it } from 'vitest';
import {
  detectJourneySignals,
  detectRecurringThemes,
  isValidRating,
  type SurveyResponse,
  type WeakSignalPolicy,
} from './satisfaction';

const policy: WeakSignalPolicy = { lowRatingAtOrBelow: 2, dropAtLeast: 2, recurringThemeAtLeast: 3 };

function response(overrides: Partial<SurveyResponse> = {}): SurveyResponse {
  return { milestone: 'day_7', rating: 4, comment: null, themes: [], ...overrides };
}

describe('isValidRating', () => {
  it('n accepte que des entiers de 1 a 5', () => {
    expect(isValidRating(1)).toBe(true);
    expect(isValidRating(5)).toBe(true);
    expect(isValidRating(0)).toBe(false);
    expect(isValidRating(6)).toBe(false);
    expect(isValidRating(3.5)).toBe(false);
  });
});

describe('detectJourneySignals', () => {
  it('ne signale rien sur un parcours qui se passe bien', () => {
    const signals = detectJourneySignals(
      [response({ rating: 4 }), response({ milestone: 'day_30', rating: 5 })],
      policy,
    );
    expect(signals).toEqual([]);
  });

  it('signale une note basse', () => {
    const signals = detectJourneySignals([response({ rating: 2 })], policy);
    expect(signals).toEqual([{ code: 'low_rating', milestone: 'day_7', rating: 2 }]);
  });

  it('signale une chute entre J+7 et J+30, meme sans note basse', () => {
    // 5 puis 3 : aucune des deux notes n'alerte seule, la chute oui.
    const signals = detectJourneySignals(
      [response({ rating: 5 }), response({ milestone: 'day_30', rating: 3 })],
      policy,
    );
    expect(signals).toEqual([{ code: 'rating_drop', from: 5, to: 3, delta: 2 }]);
  });

  it('ne confond pas une amelioration avec une chute', () => {
    const signals = detectJourneySignals(
      [response({ rating: 3 }), response({ milestone: 'day_30', rating: 5 })],
      policy,
    );
    expect(signals).toEqual([]);
  });

  it('ignore une note invalide plutot que d en tirer un signal', () => {
    expect(detectJourneySignals([response({ rating: 0 })], policy)).toEqual([]);
  });
});

describe('detectRecurringThemes', () => {
  it('remonte un theme repete par plusieurs repondants', () => {
    const signals = detectRecurringThemes(
      [
        response({ themes: ['matériel'] }),
        response({ themes: ['Matériel', 'accueil'] }),
        response({ themes: ['matériel '] }),
      ],
      policy,
    );
    expect(signals).toEqual([{ code: 'recurring_theme', theme: 'matériel', occurrences: 3 }]);
  });

  it('ne compte un theme qu une fois par reponse', () => {
    // Une seule personne qui insiste n'est pas un probleme collectif.
    const signals = detectRecurringThemes(
      [response({ themes: ['accès', 'accès', 'accès'] })],
      policy,
    );
    expect(signals).toEqual([]);
  });

  it('reste silencieux sous le seuil', () => {
    const signals = detectRecurringThemes(
      [response({ themes: ['accueil'] }), response({ themes: ['accueil'] })],
      policy,
    );
    expect(signals).toEqual([]);
  });
});
