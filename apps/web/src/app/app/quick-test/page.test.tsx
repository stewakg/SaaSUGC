// @vitest-environment jsdom
/**
 * Tests for the Brzi test wizard PAGE — /app/quick-test.
 *
 * Harness copied from enhance/page.test.tsx:
 * - jsdom opt-in via the docblock above (suite default is node).
 * - No @testing-library/react: the page is mounted with react-dom/client's
 *   createRoot and driven with plain dispatchEvent wrapped in React.act
 *   (React 19 RC exports act from 'react'; it also needs
 *   globalThis.IS_REACT_ACT_ENVIRONMENT, set below).
 * - vitest transforms .tsx with the CLASSIC JSX runtime here, so a global
 *   `React` binding is provided — exactly what that transform expects.
 *
 * MOCKS, all at the module boundary:
 * - 'next/navigation': useRouter throws outside the App Router; the fakes
 *   exist before the module graph evaluates (vi.hoisted).
 * - '@/lib/poll-job': pollJob would poll /api/jobs/:id — never reached in
 *   these tests, but mocked so nothing here can open a socket.
 * - '@/lib/utils': factory-mocked with a faithful `cn` (same as the other
 *   component suites) so no styling dependencies load.
 * - global.fetch: with pollJob faked, the ONLY fetch the page can make is
 *   its own POST /api/jobs — the credit-spending call. Any fetch recorded
 *   by these tests IS that call.
 *
 * NOTE: this page does NOT import '@/lib/upload-file' — it has no import
 * step at all — so that module is not mocked here.
 *
 * '@adgen/core/pricing' is NOT mocked: the cost label, the step heading and
 * the overview copy are computed by the same pure functions the page uses,
 * so they are asserted for real.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';

vi.mock('@/lib/utils', () => ({
  cn: (...parts: Array<string | false | null | undefined>) =>
    parts.filter(Boolean).join(' '),
}));

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
  pollJob: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mocks.push,
    refresh: mocks.refresh,
    replace: mocks.replace,
  }),
}));

vi.mock('@/lib/poll-job', () => ({ pollJob: mocks.pollJob }));

import QuickTestPage from './page';
import * as React from 'react';
import { creditsLabel, getJobDescriptor } from '@adgen/core/pricing';

// React 19's act() refuses to run unless this flag is set.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as { React?: typeof React }).React = React;

// The price the page must show — computed by the same pure call it uses.
const DESCRIPTOR = getJobDescriptor('quick_test');
const COST_LABEL = creditsLabel(DESCRIPTOR.cost);

const fetchMock = vi.fn();

describe('QuickTestPage', () => {
  const cleanups: Array<() => void> = [];

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    mocks.push.mockReset();
    mocks.refresh.mockReset();
    mocks.replace.mockReset();
    mocks.pollJob.mockReset();
  });

  afterEach(() => {
    while (cleanups.length) cleanups.pop()!();
    vi.unstubAllGlobals();
  });

  /** Mounts the page on a container attached to document.body. */
  function mountPage(): HTMLDivElement {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    React.act(() => {
      root.render(<QuickTestPage />);
    });
    cleanups.push(() => {
      React.act(() => {
        root.unmount();
      });
      container.remove();
    });
    return container;
  }

  /** Clicks a control the way a user would, through React's synthetic events. */
  function click(node: Element): void {
    React.act(() => {
      node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
  }

  /** Clicks and lets the async handler settle before returning. */
  async function clickAsync(node: Element): Promise<void> {
    await React.act(async () => {
      node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
  }

  /**
   * The wizard rail renders every step LABEL as a button, and this wizard's
   * second step is literally labeled "Pokreni". The action buttons (Nazad /
   * Dalje / Pokreni) must therefore be looked up OUTSIDE the `nav`, or the
   * rail chip shadows the credit-spending control.
   */
  function findActionButtonOpt(container: HTMLElement, text: string): HTMLButtonElement | undefined {
    return [...container.querySelectorAll('button')]
      .filter((b) => !b.closest('nav[aria-label="Koraci"]'))
      .find((b): b is HTMLButtonElement => b instanceof HTMLButtonElement && b.textContent === text);
  }

  function findActionButton(container: HTMLElement, text: string): HTMLButtonElement {
    const button = findActionButtonOpt(container, text);
    if (!button) throw new Error(`action button "${text}" not found`);
    return button;
  }

  /** A step chip in the wizard rail (the `nav`), by its visible label. */
  function findRailChip(container: HTMLElement, text: string): HTMLButtonElement {
    const chip = [...container.querySelectorAll('nav[aria-label="Koraci"] button')].find(
      (b) => (b.textContent ?? '').includes(text),
    );
    if (!(chip instanceof HTMLButtonElement)) {
      throw new Error(`rail chip "${text}" not found`);
    }
    return chip;
  }

  it('renders the overview step with the tool description, price held back', () => {
    const container = mountPage();
    const heading = container.querySelector('h1');
    expect(heading?.textContent).toBe(DESCRIPTOR.label);
    expect(container.textContent).toContain('Korak 1/2');
    expect(container.textContent).toContain(DESCRIPTOR.description);
    // The price is NOT on the first step any more (2026-08-20): it is a quiet
    // line on the LAST step, right above the button that spends. Asserted as an
    // absence so that putting it back is a failing test, not a silent revert.
    expect(container.textContent).not.toContain('Cena:');
    expect(container.textContent).not.toContain(COST_LABEL);
  });

  it('the job-starting action does not exist on step 1 and nothing can reach /api/jobs yet', () => {
    const container = mountPage();
    // This page takes no input by design (a quick_test job has no params),
    // so there is no "requirement not met" state to pin. What still matters
    // is that NOTHING on this step can spend credits:
    // - the action bar offers only Dalje, not Pokreni;
    expect(findActionButtonOpt(container, 'Pokreni')).toBeUndefined();
    // - the rail chip labeled "Pokreni" (step 2, not yet reached) is disabled,
    //   and clicking it neither jumps ahead nor starts anything.
    const chip = findRailChip(container, 'Pokreni');
    expect(chip.disabled).toBe(true);
    click(chip);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Korak 1/2');
    // - advancing the only real way stays free of side effects.
    click(findActionButton(container, 'Dalje'));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Korak 2/2');
    expect(container.textContent).toContain('da generišeš probni video');
  });

  it('a 402 from /api/jobs surfaces as an alert instead of the wizard hanging', async () => {
    const container = mountPage();
    click(findActionButton(container, 'Dalje')); // → Pokreni step
    // The real route answers exactly this body when the balance is short.
    fetchMock.mockResolvedValue({
      ok: false,
      status: 402,
      json: async () => ({ error: 'insufficient_balance', cost: 5, balance: 0 }),
    });
    const start = findActionButton(container, 'Pokreni');
    expect(start.disabled).toBe(false);
    await clickAsync(start);

    // The wizard must not look like it is working...
    expect(container.textContent).not.toContain('Radi…');
    expect(container.textContent).not.toContain('Generišem probni video');
    // ...the rejection is announced to the user. NOTE: what the page actually
    // renders here is the RAW machine code from the API body — the Serbian
    // message built by insufficientBalanceMessage() never reaches this page.
    // Pinned as-rendered (same finding as enhance and translate) so that
    // wiring it up later changes this test loudly.
    const alert = container.querySelector('[role="alert"]');
    expect(alert).toBeInstanceOf(HTMLElement);
    expect(alert!.textContent).toBe('insufficient_balance');
    // Retry stays possible: the action is back to Pokreni and usable.
    expect(findActionButton(container, 'Pokreni').disabled).toBe(false);
  });

});
