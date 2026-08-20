// @vitest-environment jsdom
/**
 * /app/uskoro — the roadmap page. The assertion with teeth: the list derives
 * from LIVE_TOOL_LINKS, so a LIVE tool must never appear here and a tool with
 * no pipeline must never be missing — this page and the dashboard are the two
 * halves of one promise ("Početna shows only what works").
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import * as React from 'react';

// `as unknown as` is load-bearing, not noise: the direct cast is only legal when
// the resolved React types happen to overlap with globalThis, and CI resolves
// `types-react@19.0.0-rc.1` where they do not (TS2352). Found 2026-08-20 when a
// docs-only commit failed CI while the code commit before it passed — the
// difference was a warm dependency cache, not the code.
(globalThis as unknown as { React?: typeof React }).React = React;

import UskoroPage from './page';

describe('UskoroPage', () => {
  const html = renderToStaticMarkup(<UskoroPage />);

  it('renders every tool that has NO pipeline, main and utility tier alike', () => {
    for (const label of ['Edit', 'Mix', 'Brzi test', 'Prevod', 'AI influencer']) {
      expect(html).toContain(label);
    }
  });

  it('renders NO live tool — those live on Početna', () => {
    for (const label of [
      'Nova reklama',
      'Reklama sa novim zvukom',
      'AI slike',
      'Poboljšaj kvalitet',
      'Ukloni tekst',
    ]) {
      expect(html).not.toContain(label);
    }
  });

  it('keeps the honest roadmap: an USKORO badge per row, and no invented price', () => {
    expect(html.match(/USKORO/g)).toHaveLength(5);
    // No prices here (2026-08-20). These tools have no pipeline, so nothing
    // has decided what they cost; the numbers in pricing.ts are copied from
    // the competitor. Printing one would be a promise we have not made.
    expect(html).not.toMatch(/kredita?/);
  });
});
