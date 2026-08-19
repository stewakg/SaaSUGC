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

(globalThis as { React?: typeof React }).React = React;

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

  it('keeps the honest roadmap: every row carries a price and an USKORO badge', () => {
    expect(html.match(/USKORO/g)).toHaveLength(5);
    expect(html.match(/kredita?/g)?.length).toBeGreaterThanOrEqual(5);
  });
});
