/**
 * Pure parsing/filtering for /api/search-clips. Kept out of the route file so
 * it imports nothing from Next and can be exercised directly against real
 * yt-dlp output — same reason safe-url.ts lives here rather than inline.
 *
 * apps/web has no vitest setup (only @adgen/core and @adgen/worker do), so
 * verification is a standalone tsx run against live search output rather than
 * a fixture suite. That is the stronger check for this particular code: the
 * thing most likely to break is yt-dlp changing its output shape, and a
 * hand-written fixture would keep passing when it does.
 */

/** Clips shorter than this have too few shots to be useful montage material. */
export const MIN_DURATION_SEC = 5;
/** Feature-length uploads are almost never product footage; they also cost the most to import. */
export const MAX_DURATION_SEC = 900;

export interface ClipSuggestion {
  id: string;
  url: string;
  title: string;
  durationSec: number | null;
  channel: string | null;
  thumbnail: string | null;
  viewCount: number | null;
}

/** One entry of yt-dlp's `--flat-playlist --dump-json` output. */
interface FlatEntry {
  id?: unknown;
  url?: unknown;
  webpage_url?: unknown;
  title?: unknown;
  duration?: unknown;
  channel?: unknown;
  uploader?: unknown;
  view_count?: unknown;
  thumbnails?: unknown;
}

/**
 * `--dump-json` emits one JSON object per line, so the payload as a whole is
 * NOT valid JSON. youtube-dl-exec returns it already-parsed when there is a
 * single object and as a raw string otherwise — handle both, and skip
 * unparseable lines rather than failing the whole search over one bad entry.
 */
export function parseSearchOutput(raw: unknown): ClipSuggestion[] {
  const entries: FlatEntry[] = [];
  if (typeof raw === 'string') {
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('{')) continue;
      try {
        entries.push(JSON.parse(trimmed) as FlatEntry);
      } catch {
        // One bad line shouldn't cost the user the whole result set.
      }
    }
  } else if (Array.isArray(raw)) {
    entries.push(...(raw as FlatEntry[]));
  } else if (raw && typeof raw === 'object') {
    entries.push(raw as FlatEntry);
  }

  return entries.map(toSuggestion).filter((s): s is ClipSuggestion => s !== null);
}

function toSuggestion(e: FlatEntry): ClipSuggestion | null {
  const id = typeof e.id === 'string' ? e.id : null;
  const title = typeof e.title === 'string' ? e.title : null;
  if (!id || !title) return null;

  // `webpage_url` is the canonical watch URL; `url` is the flat-entry
  // shorthand. Construct one only if neither is present.
  const url =
    typeof e.webpage_url === 'string'
      ? e.webpage_url
      : typeof e.url === 'string'
        ? e.url
        : `https://www.youtube.com/watch?v=${id}`;

  return {
    id,
    url,
    title,
    durationSec: typeof e.duration === 'number' && e.duration > 0 ? Math.round(e.duration) : null,
    channel: typeof e.channel === 'string' ? e.channel : typeof e.uploader === 'string' ? e.uploader : null,
    thumbnail: pickThumbnail(e.thumbnails),
    viewCount: typeof e.view_count === 'number' ? e.view_count : null,
  };
}

/** Last entry is the highest resolution in yt-dlp's ordering; fall back to whatever has a url. */
function pickThumbnail(thumbnails: unknown): string | null {
  if (!Array.isArray(thumbnails)) return null;
  for (let i = thumbnails.length - 1; i >= 0; i--) {
    const t = thumbnails[i];
    if (t && typeof t === 'object' && typeof (t as { url?: unknown }).url === 'string') {
      return (t as { url: string }).url;
    }
  }
  return null;
}

/**
 * Unknown duration is kept rather than dropped — flat entries occasionally omit
 * it, and discarding a possibly-good clip is worse than showing one the user
 * can reject by looking at it.
 */
export function usableAsMontageMaterial(s: ClipSuggestion): boolean {
  if (s.durationSec === null) return true;
  return s.durationSec >= MIN_DURATION_SEC && s.durationSec <= MAX_DURATION_SEC;
}
