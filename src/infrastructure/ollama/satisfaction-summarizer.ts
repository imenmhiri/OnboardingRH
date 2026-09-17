import type {
  SatisfactionSummarizer,
  SatisfactionSummaryRequest,
  SatisfactionSummaryResult,
} from '@/application/ports/satisfaction-summarizer';
import { buildSummaryUserContent, SUMMARY_SYSTEM_PROMPT } from '@/infrastructure/ai/summary-prompt';

/**
 * Synthèse par un modèle ouvert servi par Ollama, sur la machine ou le réseau
 * de l'entreprise : gratuit, sans compte, et les commentaires (déjà
 * anonymisés) ne quittent jamais l'infrastructure.
 */

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export const DEFAULT_OLLAMA_MODEL = 'qwen2.5:3b';
// Un petit modèle sur CPU peut mettre une minute par groupe.
const DEFAULT_TIMEOUT_MS = 180_000;

interface OllamaOptions {
  readonly baseUrl: string;
  readonly model?: string;
  readonly timeoutMs?: number;
  readonly fetchImpl?: FetchLike;
}

interface OllamaChatResponse {
  readonly message?: { readonly content?: string };
  readonly error?: string;
}

export function createOllamaSummarizer(options: OllamaOptions): SatisfactionSummarizer {
  const fetchImpl = options.fetchImpl ?? fetch;
  const model = options.model ?? DEFAULT_OLLAMA_MODEL;
  const endpoint = `${options.baseUrl.replace(/\/+$/, '')}/api/chat`;

  return {
    async summarize(request: SatisfactionSummaryRequest): Promise<SatisfactionSummaryResult> {
      if (request.anonymizedComments.length === 0) {
        return { kind: 'unavailable', reason: 'empty_input', detail: 'Aucun commentaire a resumer.' };
      }

      try {
        const response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
          body: JSON.stringify({
            model,
            stream: false,
            options: { temperature: 0.2 },
            messages: [
              { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
              { role: 'user', content: buildSummaryUserContent(request) },
            ],
          }),
        });

        const body = (await response.json().catch(() => ({}))) as OllamaChatResponse;

        if (!response.ok) {
          return {
            kind: 'unavailable',
            reason: response.status === 429 ? 'rate_limited' : 'provider_error',
            detail: body.error ?? `HTTP ${response.status}`,
          };
        }

        const narrative = body.message?.content?.trim();
        if (!narrative) {
          return { kind: 'unavailable', reason: 'provider_error', detail: 'Reponse Ollama sans texte exploitable.' };
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
