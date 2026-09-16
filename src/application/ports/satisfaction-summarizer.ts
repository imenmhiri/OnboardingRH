/**
 * Port de synthese IA (T-26). Meme discipline que `Mailer` (T-24) et
 * `Calendar` (T-25) : le domaine et les cas d'usage ne connaissent que cette
 * interface, jamais Anthropic directement. L'appelant garantit deja que
 * `anonymizedComments` a ete produit par `domain/privacy/anonymize-comment`
 * — ce port ne fait aucune anonymisation lui-meme, il ne fait que demander
 * une synthese sur un texte deja nettoye.
 *
 * Le resultat distingue explicitement succes et echec : jamais d'exception
 * a attraper au hasard cote appelant. Le succes porte lui-meme la marque
 * "genere" (`kind: 'generated'`) — ce n'est pas laisse a la charge de
 * l'ecran de se souvenir de l'ajouter.
 */

export interface SatisfactionSummaryRequest {
  /** Libelle humain du groupe resume (ex. "Site de Lille", "Atelier Nord — toutes societes"). */
  readonly groupLabel: string;
  /** Deja anonymises par l'appelant — ce port ne relit jamais de PII. */
  readonly anonymizedComments: readonly string[];
}

export type SatisfactionSummaryFailureReason = 'provider_error' | 'rate_limited' | 'empty_input';

export type SatisfactionSummaryResult =
  | { readonly kind: 'generated'; readonly narrative: string }
  | { readonly kind: 'unavailable'; readonly reason: SatisfactionSummaryFailureReason; readonly detail: string };

export interface SatisfactionSummarizer {
  summarize(request: SatisfactionSummaryRequest): Promise<SatisfactionSummaryResult>;
}
