/**
 * Anonymisation deterministe d'un verbatim, avant tout appel a un modele
 * d'IA (T-26). Fonction pure : aucune I/O, l'appelant (application) fournit
 * le "roster" des identifiants connus — noms reels, emails, libelles
 * d'equipe/site/societe — recuperes en base par la couche application. Le
 * domaine ne sait pas d'ou vient ce roster et ne le devine jamais.
 *
 * Ce que cette fonction attrape :
 * - toute occurrence d'un nom connu (nom complet ou un de ses composants,
 *   insensible a la casse, aux frontieres de mot Unicode) ;
 * - toute chaine qui ressemble a une adresse email, connue ou non (defense
 *   en profondeur : un email non liste dans le roster est quand meme
 *   redige) ;
 * - toute mention d'un site ou du nom de la societe (le regroupement est
 *   deja la granularite de la synthese, le texte n'a pas besoin de le
 *   repeter — et sa presence est justement ce qui pourrait aider a
 *   re-identifier) ;
 * - a titre de garde-fou supplementaire, toute sequence d'au moins deux mots
 *   consecutifs a majuscule initiale (heuristique "Prenom Nom"), qu'ils
 *   soient sur le roster ou non — c'est ce qui protege un nom propre absent
 *   du roster (voir le cas limite du ticket : "un verbatim contenant un nom
 *   propre : il ne sort pas du systeme").
 *
 * Ce que cette fonction NE peut PAS raisonnablement attraper (limite
 * honnete, a documenter partout ou cette fonction est utilisee) :
 * - un surnom, un diminutif ou une orthographe qui ne figure pas dans le
 *   roster et ne correspond pas au motif "Majuscule + minuscules" (ex. un
 *   nom tout en minuscules glisse dans le texte, ou un nom d'une seule
 *   lettre) ;
 * - un identifiant exprime autrement qu'un nom ou un email (un numero de
 *   badge, un surnom d'equipe informel non enregistre comme site) ;
 * - une re-identification par recoupement d'informations contextuelles non
 *   textuelles (ex. "la seule personne arrivee ce mois-ci a ce poste") — la
 *   protection contre ce risque-la est le seuil minimal de repondants
 *   applique en amont par le cas d'usage, pas cette fonction.
 *
 * L'heuristique "deux mots majuscule-minuscule consecutifs" a un cout connu
 * de faux positifs (une expression comme "Bonne Ambiance" serait redigee
 * alors que ce n'est pas un nom) et de faux negatifs (un nom isole d'un seul
 * mot, hors roster, n'est pas attrape par elle). C'est un compromis
 * deliberement du cote de la surprotection : un faux positif degrade une
 * synthese, un faux negatif expose une personne.
 */

export interface KnownIdentifiers {
  /** Noms complets connus pour la societe (employes, managers, RH, IT...). */
  readonly names: readonly string[];
  /** Adresses email connues (redondant avec le motif generique, mais explicite). */
  readonly emails: readonly string[];
  /** Noms de site et nom de la societe. */
  readonly teamLabels: readonly string[];
}

const NAME_PLACEHOLDER = '[personne]';
const EMAIL_PLACEHOLDER = '[email]';
const TEAM_PLACEHOLDER = '[site]';

const MIN_TOKEN_LENGTH = 2;

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/** Au moins deux mots consecutifs a majuscule initiale : heuristique "Prenom Nom". */
const CAPITALIZED_SEQUENCE_PATTERN =
  /\p{Lu}\p{Ll}+(?:-\p{Lu}\p{Ll}+)?(?:[ \t]+\p{Lu}\p{Ll}+(?:-\p{Lu}\p{Ll}+)?)+/gu;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Remplace `phrase` (mot entier, aux frontieres Unicode) partout dans `text`. */
function redactPhrase(text: string, phrase: string, placeholder: string): string {
  const trimmed = phrase.trim();
  if (trimmed.length < MIN_TOKEN_LENGTH) return text;
  const escaped = escapeRegExp(trimmed);
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'giu');
  return text.replace(pattern, placeholder);
}

function redactPhrases(text: string, phrases: readonly string[], placeholder: string): string {
  // Les phrases les plus longues d'abord : "Alice Arrivante" avant "Alice",
  // pour ne jamais laisser deux placeholders cote a cote pour une seule
  // personne.
  const ordered = [...new Set(phrases.map((phrase) => phrase.trim()).filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  );
  let result = text;
  for (const phrase of ordered) {
    result = redactPhrase(result, phrase, placeholder);
  }
  return result;
}

function nameTokens(names: readonly string[]): readonly string[] {
  const tokens = new Set<string>();
  for (const name of names) {
    for (const part of name.split(/\s+/)) {
      const cleaned = part.replace(/[,;:.!?]/g, '').trim();
      if (cleaned.length >= MIN_TOKEN_LENGTH) {
        tokens.add(cleaned);
      }
    }
  }
  return [...tokens];
}

const CAPITALIZED_WORD = /^\p{Lu}\p{Ll}+$/u;
const MIN_TEAM_TOKEN_LENGTH = 3;

/**
 * "Siege de Lille" doit aussi rediger "Lille" tout seul, mais decouper
 * n'importe quel libelle mot par mot redigerait aussi "de" partout dans le
 * texte — un mot beaucoup trop courant et generique. On ne retient donc que
 * les composants a majuscule initiale (motif proche noms propres), ce qui
 * couvre les noms de site/societe sans toucher aux mots de liaison.
 */
function teamLabelTokens(labels: readonly string[]): readonly string[] {
  const tokens = new Set<string>();
  for (const label of labels) {
    for (const part of label.split(/\s+/)) {
      const cleaned = part.replace(/[,;:.!?]/g, '').trim();
      if (cleaned.length >= MIN_TEAM_TOKEN_LENGTH && CAPITALIZED_WORD.test(cleaned)) {
        tokens.add(cleaned);
      }
    }
  }
  return [...tokens];
}

export function anonymizeComment(comment: string, knownIdentifiers: KnownIdentifiers): string {
  let text = comment;

  // 1. Emails : motif generique d'abord, connu ou non sur le roster.
  text = text.replace(EMAIL_PATTERN, EMAIL_PLACEHOLDER);

  // 2. Noms connus : phrase complete, puis composants individuels restants.
  text = redactPhrases(text, knownIdentifiers.names, NAME_PLACEHOLDER);
  text = redactPhrases(text, nameTokens(knownIdentifiers.names), NAME_PLACEHOLDER);

  // 3. Emails connus explicitement (couvre une forme deja normalisee differemment du motif generique).
  text = redactPhrases(text, knownIdentifiers.emails, EMAIL_PLACEHOLDER);

  // 4. Site(s) et societe : le regroupement est deja le niveau de la synthese.
  text = redactPhrases(text, knownIdentifiers.teamLabels, TEAM_PLACEHOLDER);
  text = redactPhrases(text, teamLabelTokens(knownIdentifiers.teamLabels), TEAM_PLACEHOLDER);

  // 5. Garde-fou : nom propre plausible absent du roster.
  text = text.replace(CAPITALIZED_SEQUENCE_PATTERN, NAME_PLACEHOLDER);

  return text;
}
