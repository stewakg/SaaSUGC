/**
 * POST /api/scrape — runs the (real, F3) Scraper server-side for the AI slike
 * wizard's step 1 "import product URL". Server-only: the scraper does a raw
 * `fetch` of an arbitrary user-supplied URL, so this must never run client-side
 * and the URL is validated before dispatch to block obvious SSRF targets
 * (localhost / private ranges / the cloud metadata address).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createProviders } from '@adgen/core';
import { createServerClient } from '@/lib/supabase/server';
import { assertPublicHost } from '@/lib/safe-url';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  // This route makes the SERVER fetch a URL the caller chose. Unlimited, that
  // turns a signed-in account into a scanning proxy: the SSRF guard decides
  // WHERE it may go, and only a rate limit decides how often. Matched to
  // search's 8/60 — scraping one product page is the same weight.
  const rl = await rateLimit(`scrape:${user.id}`, 8, 60);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'rate_limited', retryAfterSeconds: rl.resetSeconds }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as { url?: unknown };
  // assertPublicHost, not the string check alone: a perfectly public-looking
  // hostname can have a DNS record pointing at 127.0.0.1 or the cloud metadata
  // address, and this server is about to fetch whatever it is given.
  if (typeof body.url !== 'string' || !(await assertPublicHost(body.url))) {
    return NextResponse.json({ error: 'invalid_url' }, { status: 400 });
  }

  const { scraper } = createProviders();
  const result = await scraper.scrape(body.url);

  return NextResponse.json(result);
}
