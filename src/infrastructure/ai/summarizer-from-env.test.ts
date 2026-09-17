import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSummarizerFromEnv } from './summarizer-from-env';

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

const REQUEST = { groupLabel: 'Site de Lille', anonymizedComments: ['Accueil chaleureux.'] };

function stubFetch() {
  const fetchMock = vi.fn<FetchFn>(async () =>
    new Response(JSON.stringify({ message: { content: 'Synthese.' } }), { status: 200 }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createSummarizerFromEnv', () => {
  it('uses the local Ollama server when the provider is ollama', async () => {
    const fetchMock = stubFetch();
    const summarizer = createSummarizerFromEnv({ AI_SUMMARY_PROVIDER: 'ollama', OLLAMA_MODEL: 'llama3.2:3b' });

    expect(await summarizer.summarize(REQUEST)).toEqual({ kind: 'generated', narrative: 'Synthese.' });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('http://127.0.0.1:11434/api/chat');
    expect(JSON.parse(String(init?.body)).model).toBe('llama3.2:3b');
  });

  it('falls back to Ollama when only OLLAMA_BASE_URL is set', async () => {
    const fetchMock = stubFetch();
    const summarizer = createSummarizerFromEnv({ OLLAMA_BASE_URL: 'http://ollama:11434' });

    await summarizer.summarize(REQUEST);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://ollama:11434/api/chat');
  });

  it('prefers Anthropic when an API key is present and no provider is named', async () => {
    const fetchMock = vi.fn<FetchFn>(async () =>
      new Response(JSON.stringify({ content: [{ type: 'text', text: 'Synthese.' }] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const summarizer = createSummarizerFromEnv({ ANTHROPIC_API_KEY: 'k', OLLAMA_BASE_URL: 'http://ollama:11434' });

    await summarizer.summarize(REQUEST);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.anthropic.com/v1/messages');
  });

  it('fails cleanly when nothing is configured', async () => {
    const result = await createSummarizerFromEnv({}).summarize(REQUEST);
    expect(result.kind).toBe('unavailable');
  });

  it('fails cleanly on an unknown provider name', async () => {
    const result = await createSummarizerFromEnv({ AI_SUMMARY_PROVIDER: 'gpt' }).summarize(REQUEST);
    expect(result).toMatchObject({ kind: 'unavailable', reason: 'provider_error' });
    if (result.kind === 'unavailable') expect(result.detail).toContain('gpt');
  });
});
