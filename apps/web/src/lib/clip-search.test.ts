/**
 * Tests for parsing yt-dlp's search output.
 *
 * This function stands between a binary's stdout and the user's screen, and its
 * inputs are the messiest in the app: `--dump-json` emits one JSON object per
 * line, so the payload as a whole is NOT valid JSON, and `youtube-dl-exec`
 * hands it back already-parsed for a single result and as a raw string
 * otherwise. Both shapes reach this function in production.
 *
 * The rule the tests defend is "one bad line must not cost the whole search" —
 * a search that returns nothing because of a single malformed entry looks to
 * the user exactly like a search with no results.
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_DURATION_SEC,
  MIN_DURATION_SEC,
  parseSearchOutput,
  usableAsMontageMaterial,
  type ClipSuggestion,
} from './clip-search.ts';

const entry = (over: Record<string, unknown> = {}) => ({
  id: 'abc123',
  title: 'Masažer za vrat',
  duration: 60,
  channel: 'Prodavnica',
  view_count: 1000,
  thumbnails: [{ url: 'https://i.ytimg.com/small.jpg' }, { url: 'https://i.ytimg.com/large.jpg' }],
  ...over,
});

describe('parseSearchOutput — the three shapes yt-dlp actually returns', () => {
  it('parses newline-delimited JSON, which is not valid JSON as a whole', () => {
    const raw = [JSON.stringify(entry()), JSON.stringify(entry({ id: 'def456' }))].join('\n');
    const out = parseSearchOutput(raw);
    expect(out.map((s) => s.id)).toEqual(['abc123', 'def456']);
  });

  it('parses an already-parsed single object', () => {
    expect(parseSearchOutput(entry())).toHaveLength(1);
  });

  it('parses an already-parsed array', () => {
    expect(parseSearchOutput([entry(), entry({ id: 'x' })])).toHaveLength(2);
  });

  it.each([null, undefined, '', 42, true])('returns nothing for %s rather than throwing', (raw) => {
    expect(parseSearchOutput(raw)).toEqual([]);
  });
});

describe('parseSearchOutput — one bad line must not cost the whole search', () => {
  it('keeps the good entries around a malformed one', () => {
    const raw = [
      JSON.stringify(entry({ id: 'good1' })),
      '{ this is not json',
      JSON.stringify(entry({ id: 'good2' })),
    ].join('\n');

    // The user's alternative reading of a total failure is "no results", which
    // is indistinguishable from a genuinely empty search.
    expect(parseSearchOutput(raw).map((s) => s.id)).toEqual(['good1', 'good2']);
  });

  it('ignores progress noise and blank lines interleaved with the JSON', () => {
    const raw = ['[youtube:search] Extracting URL', '', JSON.stringify(entry()), '   '].join('\n');
    expect(parseSearchOutput(raw)).toHaveLength(1);
  });

  it('drops entries with no id or no title, keeping the rest', () => {
    const raw = [
      JSON.stringify(entry({ id: 'keep' })),
      JSON.stringify(entry({ id: undefined })),
      JSON.stringify(entry({ title: undefined })),
    ].join('\n');
    expect(parseSearchOutput(raw).map((s) => s.id)).toEqual(['keep']);
  });
});

describe('parseSearchOutput — field mapping', () => {
  it('prefers webpage_url, then url, then builds a watch URL from the id', () => {
    expect(parseSearchOutput(entry({ webpage_url: 'https://w/1', url: 'https://u/1' }))[0].url).toBe(
      'https://w/1',
    );
    expect(parseSearchOutput(entry({ url: 'https://u/1' }))[0].url).toBe('https://u/1');
    expect(parseSearchOutput(entry())[0].url).toBe('https://www.youtube.com/watch?v=abc123');
  });

  it('takes the LAST thumbnail, which is yt-dlp’s highest resolution', () => {
    expect(parseSearchOutput(entry())[0].thumbnail).toBe('https://i.ytimg.com/large.jpg');
  });

  it('skips trailing thumbnail entries that carry no url', () => {
    const out = parseSearchOutput(
      entry({ thumbnails: [{ url: 'https://ok.jpg' }, { width: 100 }, null] }),
    );
    expect(out[0].thumbnail).toBe('https://ok.jpg');
  });

  it('falls back from channel to uploader', () => {
    expect(parseSearchOutput(entry({ channel: undefined, uploader: 'Neko' }))[0].channel).toBe('Neko');
  });

  it('reports an unknown duration as null rather than zero', () => {
    // Zero would read as "0 seconds long" in the UI and would also be filtered
    // out below; null means "not reported" and is kept.
    expect(parseSearchOutput(entry({ duration: undefined }))[0].durationSec).toBeNull();
    expect(parseSearchOutput(entry({ duration: 0 }))[0].durationSec).toBeNull();
  });

  it('rounds a fractional duration', () => {
    expect(parseSearchOutput(entry({ duration: 59.6 }))[0].durationSec).toBe(60);
  });
});

describe('usableAsMontageMaterial', () => {
  const clip = (durationSec: number | null): ClipSuggestion => ({
    id: 'x',
    url: 'https://x',
    title: 't',
    durationSec,
    channel: null,
    thumbnail: null,
    viewCount: null,
  });

  it('keeps a clip whose duration is unknown', () => {
    // Deliberate: flat entries sometimes omit duration, and discarding a
    // possibly-good clip is worse than showing one the user can reject by eye.
    expect(usableAsMontageMaterial(clip(null))).toBe(true);
  });

  it('accepts both ends of the allowed range', () => {
    expect(usableAsMontageMaterial(clip(MIN_DURATION_SEC))).toBe(true);
    expect(usableAsMontageMaterial(clip(MAX_DURATION_SEC))).toBe(true);
  });

  it('rejects just outside it', () => {
    expect(usableAsMontageMaterial(clip(MIN_DURATION_SEC - 1))).toBe(false);
    expect(usableAsMontageMaterial(clip(MAX_DURATION_SEC + 1))).toBe(false);
  });

  it('rejects a clip too short to cut anything out of', () => {
    expect(usableAsMontageMaterial(clip(1))).toBe(false);
  });
});
