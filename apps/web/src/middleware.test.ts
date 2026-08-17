/**
 * Unit tests for the middleware's security headers — the per-request nonce
 * Content-Security-Policy plus the three headers Caddy is not sending yet (it
 * sits behind the `tls` compose profile, which does not run without a domain).
 *
 * The point of a NONCE CSP is that every request gets a fresh nonce, so a
 * script tag lifted from one response's HTML is invalid on the next request.
 * If the nonce ever becomes constant — hoisted out of the middleware, memoised,
 * cached — test 2 fails, and that is the whole policy defeated in one line.
 *
 * Mocks follow the house discipline (vi.hoisted + vi.mock, same as
 * app/api/jobs/route.test.ts): `@supabase/ssr`'s createServerClient is replaced
 * with a stub whose auth.getUser is a vi.fn, so there is no Supabase and no
 * network. `next/server` is used for REAL, like in the route tests —
 * NextResponse.next()/redirect() are plain Response constructors. How the
 * forwarded request headers are observable in a unit test: NextResponse.next
 * stamps each forwarded header onto the response as `x-middleware-request-<name>`
 * and lists the names in `x-middleware-override-headers` — that mechanism is
 * exactly what carries x-nonce to the app.
 *
 * The session redirects (tests 7–8) are asserted too: the header work must not
 * disturb a single existing redirect.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));

// Only the auth surface the middleware touches is stubbed. The cookies config
// is accepted and ignored: with getUser mocked, the client never reads or
// writes a cookie, so no request cookies are needed for any test below.
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser } }),
}));

import { buildCsp, middleware } from './middleware.ts';

/** Build a request for a path, as the type the middleware declares. */
function req(path: string) {
  return new NextRequest(new URL(`https://app.example${path}`));
}

/** Extract the 'nonce-…' value from a response's script-src. */
function nonceOf(res: Response): string {
  const csp = res.headers.get('content-security-policy') ?? '';
  const match = csp.match(/'nonce-([^']+)'/);
  if (!match) throw new Error(`no nonce found in CSP: ${csp}`);
  return match[1];
}

beforeEach(() => {
  // Reset every mock's call log and implementation, then reinstall the default:
  // a signed-out visitor on a public page. Tests 7–8 override this.
  vi.resetAllMocks();
  getUser.mockResolvedValue({ data: { user: null } });
});

describe('middleware — the nonce Content-Security-Policy', () => {
  it('1. a normal page request gets a Content-Security-Policy header', async () => {
    const res = await middleware(req('/'));

    expect(res.headers.has('content-security-policy')).toBe(true);
    expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
  });

  it('2. script-src is nonced and two requests get DIFFERENT nonces', async () => {
    const first = await middleware(req('/'));
    const second = await middleware(req('/'));

    const csp = first.headers.get('content-security-policy') ?? '';
    expect(csp).toMatch(/script-src [^;]*'nonce-[^']+'/);
    // A constant nonce is a broken nonce: markup copied from one response (or
    // a script tag an attacker lifted from it) would be replayable forever.
    expect(nonceOf(first)).not.toBe(nonceOf(second));
  });

  it('3. the forwarded request carries the SAME nonce in x-nonce as the policy', async () => {
    const res = await middleware(req('/'));

    // x-middleware-request-x-nonce is how NextResponse.next({ request:
    // { headers } }) surfaces a forwarded header; without x-nonce in the
    // override list the app's request would never see it, and Next could not
    // stamp its own injected scripts with the nonce.
    const overrideList = (res.headers.get('x-middleware-override-headers') ?? '').split(',');
    expect(overrideList).toContain('x-nonce');
    expect(res.headers.get('x-middleware-request-x-nonce')).toBe(nonceOf(res));
  });

  it('4. the lockdown directives are present: frame-ancestors, object-src, base-uri', async () => {
    const csp = (await middleware(req('/'))).headers.get('content-security-policy') ?? '';

    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
  });
});

/*
 * Both branches of the policy, tested through `buildCsp` rather than through
 * NODE_ENV, because the two failures are opposite and each one is invisible in
 * the other environment:
 *
 * - PRODUCTION with 'unsafe-eval' is a security regression that would never show
 *   up in a browser, because nothing breaks.
 * - DEVELOPMENT without it is what shipped from be22b61 until 2026-08-17: the
 *   dev client bundle runs through eval, the EvalError kills the bootstrap, and
 *   every page renders correctly while NOTHING hydrates. That cost nothing in
 *   production and made every dev-mode browser check untrustworthy.
 */
describe('CSP — the development loosenings, and that they stay out of production', () => {
  it("9. production script-src has NO 'unsafe-eval' — an injected string must not become code", () => {
    const csp = buildCsp('n0nce', { dev: false });

    expect(csp).not.toContain('unsafe-eval');
    // Not a blanket "no ws:" check: `connect-src 'self' https:` is what
    // production must say, and asserting the whole directive catches a stray
    // scheme anywhere in it.
    expect(csp).toContain(`connect-src 'self' https:;`);
  });

  it("10. development script-src DOES carry 'unsafe-eval', or nothing on any page hydrates", () => {
    const csp = buildCsp('n0nce', { dev: true });
    const scriptSrc = csp.split('; ').find((d) => d.startsWith('script-src ')) ?? '';

    // On script-src specifically — a match anywhere in the policy would also be
    // satisfied by it landing on the wrong directive.
    expect(scriptSrc).toContain(`'unsafe-eval'`);
    expect(csp).toContain(`connect-src 'self' https: ws:`);
  });

  it('11. the two policies are otherwise identical — dev must not drift into a different app', () => {
    const strip = (csp: string) => csp.replace(` 'unsafe-eval'`, '').replace(' ws:', '');

    expect(strip(buildCsp('n0nce', { dev: true }))).toBe(buildCsp('n0nce', { dev: false }));
  });

  it('12. the nonce reaches script-src in both modes', () => {
    for (const dev of [true, false]) {
      expect(buildCsp('n0nce', { dev })).toContain(`script-src 'self' 'nonce-n0nce'`);
    }
  });
});

describe('middleware — the headers Caddy is not sending yet', () => {
  it('5. nosniff, frame denial and referrer policy are set on a normal response', async () => {
    const res = await middleware(req('/'));

    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
  });

  it('6. NO Strict-Transport-Security — the site is plain HTTP today', async () => {
    const res = await middleware(req('/'));

    // HSTS on an http origin is ignored at best; once a domain and TLS exist
    // the commitment belongs on the proxy, not baked in here.
    expect(res.headers.has('strict-transport-security')).toBe(false);
  });
});

describe('middleware — the session redirects still work and stay covered', () => {
  it('7. signed-out /app still redirects to /login?next=/app AND carries the policy', async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const res = await middleware(req('/app'));

    // NextResponse.redirect's status varies (307/308 across Next versions);
    // the Location header is what matters.
    expect([307, 308]).toContain(res.status);
    const location = res.headers.get('location');
    expect(location).toBeTruthy();
    const target = new URL(location!);
    expect(target.pathname).toBe('/login');
    expect(target.searchParams.get('next')).toBe('/app');
    // A redirect is a response too — it must not be the one uncovered path.
    expect(res.headers.has('content-security-policy')).toBe(true);
    expect(res.headers.get('x-frame-options')).toBe('DENY');
  });

  it('8. signed-in /login still redirects to /app (with the policy)', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });

    const res = await middleware(req('/login'));

    expect([307, 308]).toContain(res.status);
    const location = res.headers.get('location');
    expect(location).toBeTruthy();
    expect(new URL(location!).pathname).toBe('/app');
    expect(res.headers.has('content-security-policy')).toBe(true);
  });
});
