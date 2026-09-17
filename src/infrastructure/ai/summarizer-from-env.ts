import type { SatisfactionSummarizer } from '@/application/ports/satisfaction-summarizer';
import { createAnthropicSummarizer, createAnthropicSummarizerFromEnv } from '@/infrastructure/anthropic/satisfaction-summarizer';
import { createOllamaSummarizer } from '@/infrastructure/ollama/satisfaction-summarizer';

type Env = Readonly<Record<string, string | undefined>>;

const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434';

function unavailable(detail: string): SatisfactionSummarizer {
  return {
    async summarize() {
      return { kind: 'unavailable', reason: 'provider_error', detail };
    },
  };
}

/**
 * `AI_SUMMARY_PROVIDER` choisit explicitement le fournisseur (`ollama` ou
 * `anthropic`). Sans lui : Anthropic si une clé est présente, sinon Ollama si
 * `OLLAMA_BASE_URL` est défini, sinon un résumeur qui échoue proprement.
 */
export function createSummarizerFromEnv(env: Env = process.env): SatisfactionSummarizer {
  const provider = env['AI_SUMMARY_PROVIDER']?.trim().toLowerCase() || null;
  const ollama = () =>
    createOllamaSummarizer({
      baseUrl: env['OLLAMA_BASE_URL'] || DEFAULT_OLLAMA_URL,
      ...(env['OLLAMA_MODEL'] ? { model: env['OLLAMA_MODEL'] } : {}),
    });
  const anthropic = () => {
    const apiKey = env['ANTHROPIC_API_KEY'];
    return apiKey ? createAnthropicSummarizer({ apiKey }) : createAnthropicSummarizerFromEnv();
  };

  switch (provider) {
    case 'ollama':
      return ollama();
    case 'anthropic':
      return anthropic();
    case null:
      if (env['ANTHROPIC_API_KEY']) return anthropic();
      if (env['OLLAMA_BASE_URL']) return ollama();
      return unavailable('Synthese IA non configuree : definir AI_SUMMARY_PROVIDER (ollama ou anthropic).');
    default:
      return unavailable(`AI_SUMMARY_PROVIDER inconnu : ${provider} (valeurs possibles : ollama, anthropic).`);
  }
}
