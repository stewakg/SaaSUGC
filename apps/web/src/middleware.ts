/**
 * Next.js middleware — refreshes the Supabase auth session on every request and
 * protects authenticated routes. Public routes (landing, auth pages) are allowed
 * through; everything else under /app redirects to /login when there's no session.
 *
 * NOTE: middleware runs in the edge runtime, so it only uses the public anon key
 * (never the service-role key).
 *
 * On top of the session logic it attaches a security header set to EVERY response
 * it returns — redirects included: a per-request nonce Content-Security-Policy
 * plus the three headers Caddy owns once it runs (nosniff, frame denial, referrer
 * policy). Caddy sits behind the `tls` compose profile and does not run yet (no
 * domain), so today this middleware is the only component that can send them —
 * and a nonce has to be minted per request anyway, which a static Caddyfile
 * cannot do.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

type CookieEntry = { name: string; value: string; options?: CookieOptions };

/**
 * Stamp the security headers on whatever response the middleware is about to
 * return. Every return path goes through here — the two redirects included —
 * so a redirect is never the one uncovered path.
 *
 * Deliberately NO Strict-Transport-Security: the site is served over plain HTTP
 * today (no domain yet, so the `tls` compose profile with Caddy does not run),
 * and browsers ignore HSTS on an http origin anyway. Once a domain and TLS
 * exist, that max-age commitment belongs on the proxy that terminates TLS, not
 * hardcoded in an app that cannot know when that switch happens.
 */
function withSecurityHeaders(response: NextResponse, csp: string) {
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return response;
}

/*
 * The policy below is `default-src 'self'` plus a few deliberate loosenings.
 * Every directive looser than 'self', and why:
 *
 * - `https:` on img-src / media-src — R2 assets reach the browser as a redirect
 *   from /api/storage to a signed URL on the bucket host, so images and media
 *   must allow https origins, not just 'self'.
 * - `https:` on connect-src — Supabase (auth + DB) is a different origin the
 *   browser talks to directly, and the presigned PUT goes straight from the
 *   browser to the bucket host.
 * - `'unsafe-inline'` on style-src — Next injects the critical CSS as an inline
 *   <style> and there is no nonce hook for it. Inline styles are NOT the same
 *   risk as inline scripts: they cannot execute logic on their own.
 * - `'unsafe-inline'` in script-src exists ONLY as the fallback for old
 *   browsers with no nonce support. Modern browsers IGNORE it whenever a nonce
 *   is present, so keeping it does not make scripts unrestricted for anyone
 *   current. Do not "clean it up" — removing it breaks old clients, while
 *   keeping it costs nothing where the nonce is honoured.
 */
/**
 * Builds the policy. Exported and parameterised on `dev` so BOTH policies are
 * testable — the production one is the one that matters, and the development one
 * is the one that was silently broken (see `DEV_ONLY` below).
 */
export function buildCsp(nonce: string, { dev }: { dev: boolean }): string {
  return [
    `default-src 'self'`,
    // `strict-dynamic` lets a nonced script load the chunks it needs, which is
    // how Next's own bootstrap works; without it every lazy chunk is blocked.
    //
    // ⚠️ DEV_ONLY: `'unsafe-eval'`. `next dev` ships its client bundle through
    // webpack's eval-based evaluator plus React Refresh, so a policy without it
    // throws `EvalError` inside main-app.js and the client bootstrap DIES:
    // `window.next` never appears and nothing hydrates. Measured in a real
    // browser 2026-08-17 — the markup was perfect, every script had the right
    // nonce, and clicking a theme switch changed no attribute and set no
    // cookie, because no React handler was ever attached. It had been that way
    // since the nonce CSP landed (be22b61), and it made local browser
    // verification lie: a dead page looks exactly like a broken component.
    //
    // The PRODUCTION bundle contains no eval, so this must never reach the
    // production policy — `'unsafe-eval'` there is what turns an injected
    // string into running code.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https: 'unsafe-inline'${
      dev ? ` 'unsafe-eval'` : ''
    }`,
    // 'unsafe-inline' for styles is deliberate and NOT the same risk as it is
    // for scripts: Next injects inline <style> for the critical CSS, and there
    // is no nonce hook for it.
    `style-src 'self' 'unsafe-inline'`,
    // R2 assets arrive as a redirect from /api/storage to a signed url on the
    // bucket host, so media and images must allow https, not just 'self'.
    `img-src 'self' blob: data: https:`,
    `media-src 'self' blob: https:`,
    `font-src 'self' data:`,
    // Supabase (auth + DB) is a different origin, and the browser talks to it
    // directly; the presigned PUT goes straight to the bucket host.
    //
    // DEV_ONLY `ws:` — HMR is a websocket to the dev server. 'self' is
    // specified to cover it, but browsers have disagreed about that for years
    // and a blocked HMR socket costs a reload per edit, so it is stated.
    `connect-src 'self' https:${dev ? ' ws:' : ''}`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`,
  ].join('; ');
}

export async function middleware(request: NextRequest) {
  // A fresh nonce per request. `crypto` is the Web Crypto global, available in
  // the middleware runtime — do not import node:crypto here.
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');

  // `!== 'production'` rather than `=== 'development'`: a test run sets
  // NODE_ENV=test, and the policy a test exercises should be the one the
  // developer's browser gets, not a third variant nothing ever serves.
  const csp = buildCsp(nonce, { dev: process.env.NODE_ENV !== 'production' });

  // The nonce rides on the forwarded request too: Next reads it from the
  // request header and puts it on its own injected scripts, so the app's
  // request must carry the same x-nonce the policy was built with.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieEntry[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Refresh the session (expires refresh token if needed). MUST be awaited.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Redirect authenticated users away from auth pages.
  if (user && (pathname === '/login' || pathname === '/signup')) {
    return withSecurityHeaders(NextResponse.redirect(new URL('/app', request.url)), csp);
  }

  // Protect /app/* — require a session.
  if (!user && pathname.startsWith('/app')) {
    const redirect = new URL('/login', request.url);
    redirect.searchParams.set('next', pathname);
    return withSecurityHeaders(NextResponse.redirect(redirect), csp);
  }

  return withSecurityHeaders(response, csp);
}

export const config = {
  matcher: [
    /*
     * Match all paths except static assets and Next internals.
     *
     * This used to claim it also excluded "api webhooks". It never did — there
     * is no `/api` term in the pattern below, so every API route runs through
     * this middleware. Harmless, because the middleware only redirects on
     * `/login`, `/signup` and `/app/*` and touches nothing else, and every API
     * route authenticates itself with its own `getUser()` call. Corrected
     * rather than "fixed": adding the exclusion now would change what runs on
     * paths nobody has tested that way.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js|map)$).*)',
  ],
};
