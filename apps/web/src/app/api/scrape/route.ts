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

const PRIVATE_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '169.254.169.254']);
const PRIVATE_IP_PATTERN = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.)/;

function isSafeTargetUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  // IPv6 hostnames come back bracketed (e.g. "[::1]") — strip that before
  // matching, or the loopback/private checks below never fire.
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (PRIVATE_HOSTS.has(host)) return false;
  if (PRIVATE_IP_PATTERN.test(host)) return false;
  return true;
}

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
