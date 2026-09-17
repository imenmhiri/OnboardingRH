import { describe, expect, it, vi } from 'vitest';
import { createOllamaSummarizer, DEFAULT_OLLAMA_MODEL, type FetchLike } from './satisfaction-summarizer';
import type { SatisfactionSummaryRequest } from '@/application/ports/satisfaction-summarizer';

const REQUEST: SatisfactionSummaryRequest = {
  groupLabel: 'Site de Lille',
  anonymizedComments: [
    "[personne] a trouve l'accueil chaleureux mais le materiel en retard.",
    "L'acces au badge a pris plus de temps que prevu.",
  ],
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('createOllamaSummarizer', () => {
  it('sends the anonymized comments and the shared system prompt to the local chat endpoint', async () => {
    const fetchImpl: FetchLike = vi.fn(async () =>
      jsonResponse(200, { message: { role: 'assistant', content: '  Materiel et badge en retard pour plusieurs arrivants.  ' } }),
    );
    const summarizer = createOllamaSummarizer({ baseUrl: 'http://127.0.0.1:11434/', fetchImpl });

    const result = await summarizer.summarize(REQUEST);

    expect(result).toEqual({ kind: 'generated', narrative: 'Materiel et badge en retard pour plusieurs arrivants.' });
    const [url, init] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:11434/api/chat');
    const body = JSON.parse(init.body as string) as {
      model: string;
      stream: boolean;
      messages: { role: string; content: string }[];
    };
    expect(body.model).toBe(DEFAULT_OLLAMA_MODEL);
    expect(body.stream).toBe(false);
    expect(body.messages[0]?.role).toBe('system');
    expect(body.messages[0]?.content).toContain('anonymis');
    expect(body.messages[1]?.content).toContain('[personne]');
  });

  it('reports a missing model as a typed provider_error', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => jsonResponse(404, { error: "model 'qwen2.5:3b' not found" }));
    const summarizer = createOllamaSummarizer({ baseUrl: 'http://127.0.0.1:11434', fetchImpl });

    expect(await summarizer.summarize(REQUEST)).toEqual({
      kind: 'unavailable',
      reason: 'provider_error',
      detail: "model 'qwen2.5:3b' not found",
    });
  });

  it('reports an unreachable server as a typed provider_error, never throws', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => {
      throw new Error('fetch failed');
    });
    const summarizer = createOllamaSummarizer({ baseUrl: 'http://127.0.0.1:11434', fetchImpl });

    expect(await summarizer.summarize(REQUEST)).toEqual({
      kind: 'unavailable',
      reason: 'provider_error',
      detail: 'fetch failed',
    });
  });

  it('treats an empty answer as unusable', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => jsonResponse(200, { message: { content: '   ' } }));
    const summarizer = createOllamaSummarizer({ baseUrl: 'http://127.0.0.1:11434', fetchImpl });

    const result = await summarizer.summarize(REQUEST);
    expect(result.kind).toBe('unavailable');
  });

  it('does not call the model when there is nothing to summarize', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => jsonResponse(200, {}));
    const summarizer = createOllamaSummarizer({ baseUrl: 'http://127.0.0.1:11434', fetchImpl });

    const result = await summarizer.summarize({ groupLabel: 'Vide', anonymizedComments: [] });
    expect(result).toEqual({ kind: 'unavailable', reason: 'empty_input', detail: 'Aucun commentaire a resumer.' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
