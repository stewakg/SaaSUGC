/**
 * Unit tests for OpenRouterScriptProvider.describeImage — the vision call that
 * turns a product image into a short stock-footage search query.
 *
 * Why this file exists: the script model (gemini-3.1-flash-lite by default) is
 * vision-capable and the wizard already collects product images, but until this
 * method landed the provider only ever sent TEXT — the AI never once looked at
 * the product. The single most important assertion here (case 1) proves the
 * model is actually shown the image by checking the user message's content is a
 * multimodal ARRAY containing an image_url entry.
 *
 * Mirrors ai.kiefal.test.ts for isolation: globalThis.fetch is faked in
 * beforeEach and restored in afterEach. No real network call is ever made.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OpenRouterScriptProvider } from './script.openrouter.ts';
import { MockScriptProvider } from './mocks.ts';

/** Minimal fake fetch Response — the provider only reads ok/status/json/text. */
function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

// One persistent fetch mock; reset + given a per-call sequence in beforeEach.
// Assigned onto globalThis.fetch so the provider (which calls the bare global
// `fetch`) hits the mock.
const fetchMock = vi.fn();
let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  fetchMock.mockReset();
  originalFetch = globalThis.fetch;
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// --- accessor over the recorded fetch call's parsed request body ---
function callBody<T = Record<string, unknown>>(i: number): T {
  const init = fetchMock.mock.calls[i][1] as { body?: string };
  return (init.body ? JSON.parse(init.body) : {}) as T;
}

/** Queue a single normal OpenRouter completion carrying `content`. */
function queueContent(content: string): void {
  fetchMock.mockResolvedValueOnce(
    jsonResponse({ choices: [{ message: { content }, finish_reason: 'stop' }] }),
  );
}

const provider = () => new OpenRouterScriptProvider({ apiKey: 'TEST_KEY' });
const IMG = 'https://img.example/p.png';

// ===========================================================================
// describeImage
// ===========================================================================
describe('OpenRouterScriptProvider.describeImage', () => {
  it('1. sends a multimodal request — user content is an array with an image_url entry', async () => {
    queueContent('masazer za vrat');
    await provider().describeImage(IMG, 'sr');

    const body = callBody<{ messages: { role: string; content: unknown }[] }>(0);
    const userMessage = body.messages.find((m) => m.role === 'user');
    expect(Array.isArray(userMessage?.content)).toBe(true);

    const contentArr = userMessage!.content as {
      type: string;
      image_url?: { url: string };
      text?: string;
    }[];
    expect(contentArr).toContainEqual({ type: 'image_url', image_url: { url: IMG } });
    expect(contentArr.some((e) => e.type === 'text')).toBe(true);
  });

  it('2. the language argument reaches the prompt', async () => {
    queueContent('masazer za vrat');
    await provider().describeImage(IMG, 'sr');

    const serialised = JSON.stringify(fetchMock.mock.calls[0][1]);
    expect(serialised).toContain('sr');
  });

  it('3. a normal answer is returned trimmed', async () => {
    queueContent('  masazer za vrat \n');
    const result = await provider().describeImage(IMG, 'sr');
    expect(result).toBe('masazer za vrat');
  });

  it('4. surrounding quotes are stripped', async () => {
    queueContent('"masazer za vrat"');
    const result = await provider().describeImage(IMG, 'sr');
    expect(result).toBe('masazer za vrat');
  });

  it('5. an over-long answer is clamped to 120 characters', async () => {
    queueContent('a'.repeat(500));
    const result = await provider().describeImage(IMG, 'sr');
    expect(result.length).toBe(120);
  });

  it('6. a non-ok response throws with the status in the message', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false, 429));
    await expect(provider().describeImage(IMG, 'sr')).rejects.toThrow(/429/);
  });

  it('7. a response with no content throws', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: '' } }] }));
    await expect(provider().describeImage(IMG, 'sr')).rejects.toThrow();
  });

  it('8. requests no JSON schema — response_format is absent from the body', async () => {
    queueContent('masazer za vrat');
    await provider().describeImage(IMG, 'sr');
    const body = callBody<Record<string, unknown>>(0);
    expect(body).not.toHaveProperty('response_format');
  });
});

// ===========================================================================
// MockScriptProvider.describeImage
// ===========================================================================
describe('MockScriptProvider.describeImage', () => {
  it('9. resolves without any fetch call', async () => {
    const mock = new MockScriptProvider();
    const result = await mock.describeImage?.(IMG, 'sr');
    expect(result).toBe('mock proizvod za pretragu');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
