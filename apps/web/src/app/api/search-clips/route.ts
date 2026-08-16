/**
 * POST /api/search-clips — suggests source clips for the Matrix montage.
 *
 * v1 is YouTube only, and that is a capability limit rather than a preference:
 * yt-dlp ships a search extractor for YouTube (`ytsearchN:`) but none for
 * TikTok or Instagram, which it can only resolve from a URL. Those two need a
 * third-party search API and are a separate decision (INFRASTRUCTURE.md F5).
 *
 * Metadata only — `flatPlaylist` + `dumpJson` returns title/duration/thumbnail
 * without downloading a single frame, which is what makes previewing a dozen
 * candidates cheap. The user picks one and /api/import-clip does the actual
 * download, through the path that already exists.
 *
 * We only SUGGEST. The user watches a candidate before choosing it, so nothing
 * here puts a clip into a job on its own.
 *
 * Parsing lives in @/lib/clip-search so it can be verified against real yt-dlp
 * output without Next in the way.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { runYtDlp } from '@/lib/yt-dlp';
import { createServerClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/rate-limit';
import {
  MAX_CACHE_ENTRIES,
  parseSearchOutput,
  usableAsMontageMaterial,
  type ClipSuggestion,
} from '@/lib/clip-search';

/** Upper bound on results; the UI shows a grid, not a feed. */
const MAX_RESULTS = 12;
const DEFAULT_RESULTS = 8;
const QUERY_MAX_CHARS = 120;

type CacheEntry = { at: number; results: ClipSuggestion[] };
/**
 * Process-local and best-effort, deliberately not Redis: a slightly stale
 * suggestion list is harmless, and this only needs to blunt repeated identical
 * searches within one worker. Two sellers pushing the same dropshipping
 * product would otherwise issue the same search all day, and repeated yt-dlp
 * searches from one VPS IP are exactly what gets an IP throttled by YouTube.
 */
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000;

export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  // Tighter than import's 15/60: import is one heavy download the user
  // explicitly asked for, search is cheap enough to hammer.
  const rl = await rateLimit(`search:${user.id}`, 8, 60);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'rate_limited', retryAfterSeconds: rl.resetSeconds }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as { query?: unknown; limit?: unknown };
  const query = typeof body.query === 'string' ? body.query.trim() : '';
  if (!query || query.length > QUERY_MAX_CHARS) {
    return NextResponse.json({ error: 'invalid_query' }, { status: 400 });
  }
  const limit = clampLimit(body.limit);

  const cacheKey = `${limit}:${query.toLowerCase()}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return NextResponse.json({ results: hit.results, cached: true });
  }

  try {
    // `ytsearchN:` is a yt-dlp search *prefix*, not a URL — it goes in the
    // positional argument. Over-fetch, because the duration filter drops some
    // of what comes back.
    const raw = await runYtDlp(`ytsearch${Math.min(limit * 2, MAX_RESULTS * 2)}:${query}`, [
      '--flat-playlist',
      '--dump-json',
      '--no-warnings',
      '--retries',
      '1',
    ]);

    const results = parseSearchOutput(raw).filter(usableAsMontageMaterial).slice(0, limit);

    cache.set(cacheKey, { at: Date.now(), results });
    // Evict oldest-first once over the cap. `set` on an EXISTING key keeps its
    // original position and does not grow `size`, so re-searching the same term
    // never evicts anything.
    while (cache.size > MAX_CACHE_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
    return NextResponse.json({ results, cached: false });
  } catch (err) {
    console.error('[search-clips] search failed:', err);
    return NextResponse.json({ error: 'search_failed' }, { status: 502 });
  }
}

function clampLimit(raw: unknown): number {
  const n = typeof raw === 'number' ? Math.floor(raw) : DEFAULT_RESULTS;
  if (!Number.isFinite(n) || n < 1) return DEFAULT_RESULTS;
  return Math.min(n, MAX_RESULTS);
}
