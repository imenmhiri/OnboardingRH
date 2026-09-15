import { isValidRating } from './satisfaction';

/**
 * Agregation de satisfaction par societe ou par site, sans jamais permettre
 * de re-identifier un repondant.
 *
 * Le risque n'est pas theorique : un site qui accueille deux personnes ce mois
 * affiche une moyenne de 3 ; l'une a dit a son manager qu'elle etait ravie, le
 * manager en deduit la note de l'autre. En dessous du seuil, on ne publie donc
 * ni la moyenne, ni rien qui permette de la retrouver.
 */

export type RatingAggregate =
  /** Aucune reponse : ce n'est pas une satisfaction nulle, c'est une absence. */
  | { readonly kind: 'no_data' }
  /** Trop peu de reponses : ni moyenne, ni distribution, seulement le fait. */
  | { readonly kind: 'too_few'; readonly minimum: number }
  | {
      readonly kind: 'available';
      readonly respondents: number;
      readonly average: number;
    };

export function aggregateRatings(
  ratings: readonly number[],
  minimumRespondents: number,
): RatingAggregate {
  const valid = ratings.filter(isValidRating);

  if (valid.length === 0) {
    return { kind: 'no_data' };
  }
  // Meme le nombre exact de repondants est retenu sous le seuil : « 1 reponse
  // sur ce site » suffit a savoir de qui il s'agit.
  if (valid.length < minimumRespondents) {
    return { kind: 'too_few', minimum: minimumRespondents };
  }

  const average = valid.reduce((sum, rating) => sum + rating, 0) / valid.length;
  return { kind: 'available', respondents: valid.length, average: Math.round(average * 10) / 10 };
}

export interface GroupedRating {
  readonly groupKey: string;
  readonly rating: number;
}

/** Une agregation par groupe (site, societe), chacun soumis au meme seuil. */
export function aggregateByGroup(
  entries: readonly GroupedRating[],
  groupKeys: readonly string[],
  minimumRespondents: number,
): ReadonlyMap<string, RatingAggregate> {
  const byGroup = new Map<string, number[]>();
  for (const entry of entries) {
    byGroup.set(entry.groupKey, [...(byGroup.get(entry.groupKey) ?? []), entry.rating]);
  }
  // Un groupe connu sans aucune reponse apparait quand meme, en « no_data » :
  // un site absent du tableau laisserait croire qu'il n'existe pas.
  return new Map(
    groupKeys.map((key) => [key, aggregateRatings(byGroup.get(key) ?? [], minimumRespondents)]),
  );
}
