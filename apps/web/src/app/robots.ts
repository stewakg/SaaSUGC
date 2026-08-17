import type { MetadataRoute } from 'next';

/**
 * `/robots.txt`. Until 2026-08-17 the path 404'd, which is not the same as
 * "crawl freely" — it just means no crawler was ever told anything.
 *
 * ⚠️ **Right now this site says: do not index anything.** That is deliberate and
 * it is the one line here that has to change at launch. The site has no domain,
 * the Impressum is still labelled blanks, and nobody has clicked a wizard end to
 * end — a search result pointing at that state is worse than no search result,
 * and a page indexed early keeps showing up long after it is fixed.
 *
 * **To open the site to search engines at launch:** set `ALLOW_INDEXING = true`.
 * Nothing else changes — the private half stays disallowed either way.
 */
const ALLOW_INDEXING = false;

/**
 * Never crawlable, in either mode: the signed-in app and the API surface.
 * `/auth/` is here too — it carries one-time callback links, and a crawler
 * following one burns the token before the customer's browser gets to it.
 * (These need auth anyway, so a crawler would only ever collect a redirect to
 * the login page — noise in the index, no content.)
 */
export const PRIVATE_PATHS = ['/app', '/api/', '/auth/'];

/**
 * Split out from the default export and exported so BOTH states can be tested.
 * Keeping the launch branch under test is the point: it is code that will run
 * exactly once, on the day nobody wants to discover a typo in it.
 */
export function robotsRules(allowIndexing: boolean): MetadataRoute.Robots['rules'] {
  return allowIndexing
    ? { userAgent: '*', allow: '/', disallow: PRIVATE_PATHS }
    : // One rule, no `allow`: a bare `disallow: '/'` is the unambiguous form
      // every crawler agrees on. Listing the private paths as well would be
      // noise — they are already covered by the root.
      { userAgent: '*', disallow: '/' };
}

export default function robots(): MetadataRoute.Robots {
  return { rules: robotsRules(ALLOW_INDEXING) };
}
