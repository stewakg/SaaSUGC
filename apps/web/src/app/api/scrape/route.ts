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
import { isSafeTargetUrl } from '@/lib/safe-url';

export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { url?: unknown };
  if (typeof body.url !== 'string' || !isSafeTargetUrl(body.url)) {
    return NextResponse.json({ error: 'invalid_url' }, { status: 400 });
  }

  const { scraper } = createProviders();
  const result = await scraper.scrape(body.url);

  return NextResponse.json(result);
}
