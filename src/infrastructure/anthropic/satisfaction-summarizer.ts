import type {
  SatisfactionSummarizer,
  SatisfactionSummaryRequest,
  SatisfactionSummaryResult,
} from '@/application/ports/satisfaction-summarizer';

/**
 * Sous-ensemble de `fetch` injecte pour rester testable sans reseau ni cle
 * reelle — meme principe que `FetchLike` en T-25 (Google Calendar) et
 * `ResendLikeClient` en T-24.
 */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const MESSAGES_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-3-5-haiku-latest';
const MAX_TOKENS = 500;

/**
 * Instructions systeme : le modele ne voit jamais que des commentaires deja
 * anonymises (voir `domain/privacy/anonymize-comment`), mais le prompt
 * reste defensif — si un identifiant a malgre tout survecu a la
 * redaction deterministe, il ne doit jamais etre repete tel quel.
 */
const SYSTEM_PROMPT = `Tu resumes des commentaires de satisfaction anonymises, recueillis aupres d'un
groupe de plusieurs personnes dans le cadre d'une integration professionnelle.

Regles strictes :
- Les commentaires fournis sont deja anonymises (noms, emails, sites remplaces
  par des mentions entre crochets comme [personne] ou [email]). Ne tente
  jamais de deviner ou de reconstituer une identite a partir du contexte.
  Si un element du texte ressemble malgre tout a un nom propre, un email ou
  un identifiant precis, ne le reprends jamais dans ta reponse.
- Ne cite aucun commentaire mot pour mot ; degage seulement les themes
  recurrents et les points de friction communs a plusieurs personnes.
- Ne formule jamais une phrase qui pourrait passer pour un fait etabli sur
  un individu precis ; ta reponse decrit toujours une tendance de groupe.
- Reste factuel, concis (5 phrases maximum), et en francais.
- Termine implicitement ta reponse comme un resume agrege, jamais comme une
  citation individuelle.`;

interface AnthropicOptions {
  readonly apiKey: string;
  readonly model?: string;
  readonly fetchImpl?: FetchLike;
}

interface AnthropicMessageResponse {
  readonly content?: readonly { readonly type: string; readonly text?: string }[];
  readonly error?: { readonly type?: string; readonly message?: string };
}

function buildUserContent(request: SatisfactionSummaryRequest): string {
  const list = request.anonymizedComments.map((comment, index) => `${index + 1}. ${comment}`).join('\n');
  return `Groupe : ${request.groupLabel}\nCommentaires anonymises (${request.anonymizedComments.length}) :\n${list}`;
}

/**
 * Implementation reelle de l'API Messages d'Anthropic. Un client `fetch`
 * injectable permet de verifier la mise en forme de la requete et
 * l'interpretation de la reponse sans jamais appeler le reseau en test.
 */
export function createAnthropicSummarizer(options: AnthropicOptions): SatisfactionSummarizer {
  const fetchImpl = options.fetchImpl ?? fetch;
  const model = options.model ?? DEFAULT_MODEL;

  return {
    async summarize(request: SatisfactionSummaryRequest): Promise<SatisfactionSummaryResult> {
      if (request.anonymizedComments.length === 0) {
        return { kind: 'unavailable', reason: 'empty_input', detail: 'Aucun commentaire a resumer.' };
      }

      try {
        const response = await fetchImpl(MESSAGES_ENDPOINT, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': options.apiKey,
            'anthropic-version': ANTHROPIC_VERSION,
          },
          body: JSON.stringify({
            model,
            max_tokens: MAX_TOKENS,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: buildUserContent(request) }],
          }),
        });

        const body = (await response.json().catch(() => ({}))) as AnthropicMessageResponse;

        if (response.status === 429) {
          return {
            kind: 'unavailable',
            reason: 'rate_limited',
            detail: body.error?.message ?? `HTTP ${response.status}`,
          };
        }

        if (!response.ok) {
          return {
            kind: 'unavailable',
            reason: 'provider_error',
            detail: body.error?.message ?? `HTTP ${response.status}`,
          };
        }

        const narrative = body.content
          ?.filter((block) => block.type === 'text' && block.text)
          .map((block) => block.text)
          .join('\n')
          .trim();

        if (!narrative) {
          return { kind: 'unavailable', reason: 'provider_error', detail: 'Reponse Anthropic sans texte exploitable.' };
        }

        return { kind: 'generated', narrative };
      } catch (err) {
        return {
          kind: 'unavailable',
          reason: 'provider_error',
          detail: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}

/**
 * Resumeur de repli quand `ANTHROPIC_API_KEY` manque : echoue proprement a
 * chaque appel plutot que de lever une exception, exactement comme
 * `createUnconfiguredCalendar` en T-25. Aucune synthese ne doit jamais faire
 * echouer autre chose (le scan T-23, la route dediee) faute de cle
 * configuree.
 */
function createUnconfiguredSummarizer(): SatisfactionSummarizer {
  return {
    async summarize(): Promise<SatisfactionSummaryResult> {
      return {
        kind: 'unavailable',
        reason: 'provider_error',
        detail: 'ANTHROPIC_API_KEY manquante — synthese IA non configuree.',
      };
    },
  };
}

export function createAnthropicSummarizerFromEnv(): SatisfactionSummarizer {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) {
    return createUnconfiguredSummarizer();
  }
  return createAnthropicSummarizer({ apiKey });
}
