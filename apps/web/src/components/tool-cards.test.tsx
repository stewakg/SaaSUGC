// @vitest-environment jsdom
/**
 * Tests for MainToolCard / UtilityToolCard — the LINK-or-USKORO decision.
 *
 * ENVIRONMENT (copied from file-dropzone.test.tsx — read that first):
 * - jsdom opt-in via the docblock above; the suite default is node.
 * - Both cards are render-only (no local state, no effects), so they are
 *   asserted through renderToStaticMarkup exactly like the dropzone's
 *   server-render describe — no createRoot needed here.
 *
 * next/link is factory-mocked as a plain <a href="…">: the real Link needs
 * the app-router context and cannot render outside Next, and the ONLY thing
 * these tests care about is whether the card is wrapped in a link to the
 * given href or not. '@/lib/utils' is mocked with a faithful `cn` like in
 * the dropzone harness. lucide-react and @adgen/core/pricing load for real
 * (pricing is already imported by job-display.test.ts).
 *
 * What is guarded here:
 * - A tool WITH an href renders a link to that href.
 * - A tool marked `soon` renders NO link and shows the USKORO badge
 *   instead of the credit cost — both halves, because a clickable card
 *   with no pipeline behind it is precisely the failure that costs money.
 * - Cost (via creditsLabel — singular/plural), label, description and
 *   benefits render as given.
 * - The tone fallback: unknown `theme` values degrade to the neutral
 *   card, so a new tool without a matching class still renders.
 * - The two combinations nobody intends: `soon` WITH an href, and neither
 *   prop — asserted as the code actually behaves and reported, because a
 *   descriptor carrying either renders a card a customer cannot use.
 */
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/link', async () => {
  const { createElement } = await import('react');
  type MockLinkProps = { href: string; children?: React.ReactNode } & Record<string, unknown>;
  return {
    // Faithful for these tests: the real Link renders an <a href="…">.
    default: ({ href, children, ...rest }: MockLinkProps) =>
      createElement('a', { href, ...rest }, children),
  };
});

vi.mock('@/lib/utils', () => ({
  cn: (...parts: Array<string | false | null | undefined>) =>
    parts.filter(Boolean).join(' '),
}));

import { MainToolCard, UtilityToolCard } from './tool-cards';
import * as React from 'react';

// vitest transforms .tsx with the CLASSIC JSX runtime here (tsconfig says
// jsx: "preserve", which Next/SWC handles but vite's esbuild does not), so
// executing JSX needs a `React` binding in scope. Providing it globally is
// exactly what the classic transform expects.
// `as unknown as` is load-bearing, not noise: the direct cast is only legal when
// the resolved React types happen to overlap with globalThis, and CI resolves
// `types-react@19.0.0-rc.1` where they do not (TS2352). Found 2026-08-20 when a
// docs-only commit failed CI while the code commit before it passed — the
// difference was a warm dependency cache, not the code.
(globalThis as unknown as { React?: typeof React }).React = React;

/** Server-renders a card element; cast for the react-dom @18/19 types mismatch. */
function renderCard(element: React.ReactElement): string {
  type StaticMarkupInput = Parameters<typeof renderToStaticMarkup>[0];
  return renderToStaticMarkup(element as unknown as StaticMarkupInput);
}

const BASE = {
  icon: 'video',
  label: 'Video rez',
  description: 'Skrati i sredi duge snimke.',
  cost: 15,
};

describe('MainToolCard', () => {
  it('a tool with an href renders a link to that href', () => {
    const html = renderCard(<MainToolCard {...BASE} href="/alati/video-rez" />);
    expect(html).toContain('<a href="/alati/video-rez"');
    // The anchor wraps the whole card, it is not decoration beside it.
    expect(html.trimStart().startsWith('<a ')).toBe(true);
    expect(html).toContain('Video rez');
    expect(html).toContain('Skrati i sredi duge snimke.');
    expect(html).not.toContain('USKORO');
  });

  it('the cost renders through creditsLabel, singular and plural', () => {
    expect(renderCard(<MainToolCard {...BASE} cost={15} href="/alati/x" />)).toContain(
      '15 kredita',
    );
    expect(renderCard(<MainToolCard {...BASE} cost={1} href="/alati/x" />)).toContain(
      '1 kredit',
    );
  });

  it('benefits render one list item each', () => {
    const html = renderCard(
      <MainToolCard {...BASE} href="/alati/x" benefits={['Rez po tajm kodu', 'Izvoz u MP4']} />,
    );
    expect(html).toContain('<li');
    expect(html).toContain('Rez po tajm kodu');
    expect(html).toContain('Izvoz u MP4');
  });

  it('a known tone class is applied and an unknown theme falls back to the neutral strip card', () => {
    const toned = renderCard(<MainToolCard {...BASE} href="/alati/x" theme="orange" />);
    expect(toned).toContain('card-tool--orange');
    const unknown = renderCard(<MainToolCard {...BASE} href="/alati/x" theme="chartreuse" />);
    expect(unknown).not.toContain('card-tool--');
    // Since 2026-08-18 the card is the Premijera strip-header card; with no
    // hue class the header band falls back to a neutral --panel-2 gradient.
    // 2026-08-19: equal-height pass added flex/min-h chrome — the assertion
    // cares that NO card-tool-- hue class sneaks in, not the exact class list.
    expect(unknown).toContain('card-strip flex h-full flex-col sm:min-h-[17rem] card--lift');
  });

  it('a tool marked soon renders NO link and shows the USKORO badge instead of the cost', () => {
    const html = renderCard(<MainToolCard {...BASE} soon />);
    // Both halves: the badge is there…
    expect(html).toContain('USKORO');
    // …and there is no anchor anywhere — the card is not clickable.
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('<a>');
    // The credit cost is replaced by the badge, not shown beside it.
    expect(html).not.toContain('15 kredita');
    expect(html).toContain('Video rez');
  });

  it('FINDING: soon with an href STILL renders a link — the badge does not disarm the card', () => {
    // This asserts what the code does today (see the report): `if (href)`
    // wins over `soon`, so a descriptor carrying both puts the customer
    // one click into a wizard whose pipeline does not exist.
    const html = renderCard(<MainToolCard {...BASE} soon href="/alati/nepostoji" />);
    expect(html).toContain('<a href="/alati/nepostoji"');
    expect(html).toContain('USKORO');
  });

  it('FINDING: no href and not soon renders a dead card — no link, no badge, cost still shown', () => {
    // Asserts what the code does today: the card looks like a normal
    // priced tool (cost badge included) but nothing about it is clickable
    // and nothing marks it as unavailable.
    const html = renderCard(<MainToolCard {...BASE} />);
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('USKORO');
    expect(html).toContain('15 kredita');
  });
});

describe('UtilityToolCard', () => {
  it('a tool with an href renders a link to that href', () => {
    const html = renderCard(
      <UtilityToolCard {...BASE} label="Prevod titla" href="/alati/prevod" />,
    );
    expect(html).toContain('<a href="/alati/prevod"');
    expect(html).toContain('Prevod titla');
    expect(html).toContain('15 kredita');
    expect(html).not.toContain('USKORO');
  });

  it('a tool marked soon renders NO link and shows the USKORO badge instead of the cost', () => {
    const html = renderCard(<UtilityToolCard {...BASE} soon />);
    expect(html).toContain('USKORO');
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('15 kredita');
  });

  it('FINDING: no href and not soon renders a dead card with a cost but no link and no badge', () => {
    const html = renderCard(<UtilityToolCard {...BASE} />);
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('USKORO');
    expect(html).toContain('15 kredita');
  });

  /**
   * `showCost={false}` is what the LANDING page passes: a stranger who has
   * never seen a price list reads "15 kredita" as a number with no unit.
   * The dashboard keeps the price, because there the reader has a balance.
   */
  it('showCost=false hides the credit badge on the utility card', () => {
    const html = renderCard(<UtilityToolCard {...BASE} href="/app/x" showCost={false} />);
    expect(html).not.toContain('15 kredita');
    expect(html).not.toContain('kredit');
    expect(html).toContain('<a ');
  });

  it('showCost=false hides the credit badge on the main card too, and keeps the benefits', () => {
    const html = renderCard(
      <MainToolCard {...BASE} href="/app/x" showCost={false} benefits={['Prva korist']} />,
    );
    expect(html).not.toContain('kredit');
    expect(html).toContain('Prva korist');
  });

  it('showCost=false does NOT suppress USKORO — an unbuilt tool still says so', () => {
    // The two flags answer different questions: "is this ready" must survive
    // "are we quoting a price here". A silent card for a tool with no pipeline
    // is the failure that sent customers through three wizard steps to an error.
    const html = renderCard(<MainToolCard {...BASE} soon showCost={false} />);
    expect(html).toContain('USKORO');
    expect(html).not.toContain('kredit');
  });

  it('the default is unchanged: no showCost prop still shows the price', () => {
    const html = renderCard(<MainToolCard {...BASE} href="/app/x" />);
    expect(html).toContain('15 kredita');
  });
});

