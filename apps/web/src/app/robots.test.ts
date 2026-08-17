/**
 * Tests for `/robots.txt`.
 *
 * Two things are worth pinning and they pull in opposite directions, which is
 * why the branch is a parameter rather than a module constant read at import
 * time: TODAY the site must tell every crawler to stay out, and AT LAUNCH the
 * other branch must be correct on its first and only run. A test that asserted
 * only today's output would have to be deleted on launch day — exactly when the
 * launch branch stops being covered.
 */
import { describe, expect, it } from 'vitest';
import robots, { PRIVATE_PATHS, robotsRules } from './robots';

describe('robots.txt', () => {
  it('tells every crawler to stay out while the site is pre-launch', () => {
    // The shipped default export, not the helper — this is what Next renders.
    const rules = robots().rules;
    expect(rules).toEqual({ userAgent: '*', disallow: '/' });
    // A stray `allow` alongside `disallow: '/'` is the classic way a
    // disallow-all quietly stops applying, since crawlers resolve conflicts by
    // the most specific match.
    expect(rules).not.toHaveProperty('allow');
  });

  it('opens the marketing pages but never the app or the API once indexing is allowed', () => {
    const rules = robotsRules(true);
    expect(rules).toEqual({ userAgent: '*', allow: '/', disallow: PRIVATE_PATHS });
  });

  it('keeps the signed-in app, the API and the auth callbacks out of the index', () => {
    // Named paths rather than a length check: dropping one of these is a real
    // regression and a count assertion would be satisfied by a replacement.
    expect(PRIVATE_PATHS).toContain('/app');
    expect(PRIVATE_PATHS).toContain('/api/');
    expect(PRIVATE_PATHS).toContain('/auth/');
  });
});
