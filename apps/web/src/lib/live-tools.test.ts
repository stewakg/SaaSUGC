import { describe, it, expect } from 'vitest';
import { JOB_DESCRIPTORS } from '@adgen/core';
import type { JobType } from '@adgen/db';
import { LIVE_TOOL_LINKS, isToolSoon } from './live-tools';

/**
 * This list is the app's claim about which tools work. It is read by the
 * dashboard AND by the public landing page, and getting it wrong in either
 * direction costs money: too generous and a customer pays for a wizard that
 * ends in `tool_not_implemented`; too stingy and a working, paid-for pipeline
 * is unreachable — which is exactly what happened to `revoice` for months.
 */
describe('LIVE_TOOL_LINKS — the one list both screens read', () => {
  it('1. the five tools with a real pipeline are live', () => {
    const live: JobType[] = ['image_ads', 'revoice', 'matrix', 'enhance', 'remove_text'];
    for (const type of live) {
      expect(isToolSoon(type), `${type} must be reachable`).toBe(false);
      expect(LIVE_TOOL_LINKS[type]).toMatch(/^\/app\//);
    }
  });

  it('2. the four tools with no pipeline are USKORO, not linked', () => {
    const dead: JobType[] = ['quick_test', 'edit', 'mix', 'translate'];
    for (const type of dead) {
      expect(isToolSoon(type), `${type} has no pipeline and must not link`).toBe(true);
      expect(LIVE_TOOL_LINKS[type]).toBeUndefined();
    }
  });

  it('3. every descriptor the UI renders resolves to a decision', () => {
    // Neither screen filters JOB_DESCRIPTORS, so every one of them is rendered
    // by both. A new descriptor must default to USKORO rather than to a
    // dangling link.
    for (const d of JOB_DESCRIPTORS) {
      const href = LIVE_TOOL_LINKS[d.type];
      expect(href === undefined || href.startsWith('/app/')).toBe(true);
    }
  });

  it('4. ai_video stays USKORO — it was the landing page\'s only badge', () => {
    expect(isToolSoon('ai_video')).toBe(true);
  });
});
