import { describe, expect, it, vi } from 'vitest';
import { createAnthropicSummarizer, createAnthropicSummarizerFromEnv, type FetchLike } from './satisfaction-summarizer';
import type { SatisfactionSummaryRequest } from '@/application/ports/satisfaction-summarizer';

const REQUEST: SatisfactionSummaryRequest = {
  groupLabel: 'Site de Lille',
  anonymizedComments: [
    "[personne] a trouve l'accueil chaleureux mais le materiel en retard.",
    'Le poste de travail est arrive avec un jour de retard pour [personne].',
    "L'acces au badge a pris plus de temps que prevu.",
  ],
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('createAnthropicSummarizer', () => {
  it('sends the anonymized comments and system prompt, never raw PII, to the Messages API', async () => {
    const fetchImpl: FetchLike = vi.fn(async () =>
      jsonResponse(200, { content: [{ type: 'text', text: 'Synthese : materiel et badge en retard pour plusieurs arrivants.' }] }),
    );
    const summarizer = createAnthropicSummarizer({ apiKey: 'fake-key', fetchImpl });

    const result = await summarizer.summarize(REQUEST);

    expect(result).toEqual({ kind: 'generated', narrative: 'Synthese : materiel et badge en retard pour plusieurs arrivants.' });

    const calls = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0]?.[0]).toBe('https://api.anthropic.com/v1/messages');
    const init = calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('fake-key');
    const body = JSON.parse(init.body as string) as { messages: { content: string }[]; system: string };
    const sentText = body.messages[0]?.content ?? '';
    expect(sentText).toContain('[personne]');
    expect(sentText).not.toMatch(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    expect(body.system).toContain('anonymis');
  });

  it('returns a typed rate_limited failure on HTTP 429, never throws', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => jsonResponse(429, { error: { message: 'Too many requests' } }));
    const summarizer = createAnthropicSummarizer({ apiKey: 'fake-key', fetchImpl });

    const result = await summarizer.summarize(REQUEST);

    expect(result).toEqual({ kind: 'unavailable', reason: 'rate_limited', detail: 'Too many requests' });
  });

  it('returns a typed provider_error on other HTTP failures', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => jsonResponse(401, { error: { message: 'invalid x-api-key' } }));
    const summarizer = createAnthropicSummarizer({ apiKey: 'bad-key', fetchImpl });

    const result = await summarizer.summarize(REQUEST);

    expect(result).toEqual({ kind: 'unavailable', reason: 'provider_error', detail: 'invalid x-api-key' });
  });

  it('returns a typed provider_error when the network call itself throws', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => {
      throw new Error('network down');
    });
    const summarizer = createAnthropicSummarizer({ apiKey: 'fake-key', fetchImpl });

    const result = await summarizer.summarize(REQUEST);

    expect(result).toEqual({ kind: 'unavailable', reason: 'provider_error', detail: 'network down' });
  });

  it('refuses to call the API at all when there is nothing to summarize', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => jsonResponse(200, {}));
    const summarizer = createAnthropicSummarizer({ apiKey: 'fake-key', fetchImpl });

    const result = await summarizer.summarize({ groupLabel: 'Site vide', anonymizedComments: [] });

    expect(result).toEqual({ kind: 'unavailable', reason: 'empty_input', detail: 'Aucun commentaire a resumer.' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('createAnthropicSummarizerFromEnv', () => {
  it('degrades cleanly (never throws) when ANTHROPIC_API_KEY is missing', async () => {
    const previous = process.env['ANTHROPIC_API_KEY'];
    delete process.env['ANTHROPIC_API_KEY'];
    try {
      const summarizer = createAnthropicSummarizerFromEnv();
      const result = await summarizer.summarize(REQUEST);
      expect(result.kind).toBe('unavailable');
      if (result.kind === 'unavailable') {
        expect(result.detail).toContain('ANTHROPIC_API_KEY');
      }
    } finally {
      if (previous !== undefined) process.env['ANTHROPIC_API_KEY'] = previous;
    }
  });
});
