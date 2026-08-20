// @vitest-environment jsdom
/**
 * Tests for the Prevod wizard PAGE — /app/translate.
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
 * - '@/lib/upload-file': uploadFile would POST /api/upload.
 * - '@/lib/poll-job': pollJob would poll /api/jobs/:id — never reached in
 *   these tests, but mocked so nothing here can open a socket.
 * - '@/lib/utils': factory-mocked with a faithful `cn` (same as the other
 *   component suites) so no styling dependencies load.
 * - global.fetch: with the two libs above faked, the ONLY fetch the page can
 *   make is its own POST /api/jobs — the credit-spending call. Any fetch
 *   recorded by these tests IS that call.
 *
 * '@adgen/core/pricing' is NOT mocked: the cost label is computed by the same
 * pure functions the page uses, so the visible price is asserted for real.
 *
 * Files are delivered through the real FileDropzone (a `drop` event with a
 * File on the dropzone button, the technique of file-dropzone.test.tsx), not
 * by poking page internals.
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
  uploadFile: vi.fn(),
  pollJob: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mocks.push,
    refresh: mocks.refresh,
    replace: mocks.replace,
  }),
}));

vi.mock('@/lib/upload-file', () => ({ uploadFile: mocks.uploadFile }));
vi.mock('@/lib/poll-job', () => ({ pollJob: mocks.pollJob }));

import TranslatePage from './page';
import * as React from 'react';
import { creditsLabel, getJobDescriptor } from '@adgen/core/pricing';

// React 19's act() refuses to run unless this flag is set.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// `as unknown as` is load-bearing, not noise: the direct cast is only legal when
// the resolved React types happen to overlap with globalThis, and CI resolves
// `types-react@19.0.0-rc.1` where they do not (TS2352). Found 2026-08-20 when a
// docs-only commit failed CI while the code commit before it passed — the
// difference was a warm dependency cache, not the code.
(globalThis as unknown as { React?: typeof React }).React = React;

// The price the page must show — computed by the same pure call it uses.
const COST_LABEL = creditsLabel(getJobDescriptor('translate').cost);

const fetchMock = vi.fn();

describe('TranslatePage', () => {
  const cleanups: Array<() => void> = [];

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    mocks.push.mockReset();
    mocks.refresh.mockReset();
    mocks.replace.mockReset();
    mocks.uploadFile.mockReset();
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
      root.render(<TranslatePage />);
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

  /** Drops one File on the page's real dropzone (see file-dropzone.test.tsx). */
  async function dropFile(container: HTMLElement, name: string, type: string): Promise<void> {
    const zone = container.querySelector('button[data-dropzone]');
    if (!(zone instanceof HTMLButtonElement)) {
      throw new Error('page did not render a dropzone button');
    }
    const event = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', {
      value: { files: [new File(['x'], name, { type })] },
    });
    await React.act(async () => {
      zone.dispatchEvent(event);
    });
  }

  /**
   * The wizard rail renders every step LABEL as a button too, so the
   * action buttons (Nazad / Dalje / Pokreni) must be looked up outside
   * the `nav` — otherwise a step label can shadow the real action.
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

  it('renders the first step with the dropzone and no price shouting at the customer', () => {
    const container = mountPage();
    const heading = container.querySelector('h1');
    expect(heading?.textContent).toBe('Prevod'); // h1 = tool since 2026-08-18
    expect(container.textContent).toContain('Uvezi video');
    expect(container.textContent).toContain('Korak 1/3');
    const zone = container.querySelector('button[data-dropzone]');
    expect(zone).toBeInstanceOf(HTMLButtonElement);
    expect(zone!.textContent).toContain('Klikni ili prevuci video ovde');
    // The price is NOT on the first step any more (2026-08-20): it is a quiet
    // line on the LAST step, right above the button that spends. Asserted as an
    // absence so that putting it back is a failing test, not a silent revert.
    expect(container.textContent).not.toContain('Cena:');
    expect(container.textContent).not.toContain(COST_LABEL);
  });

  it('the primary action is unavailable with no file chosen and starts nothing', () => {
    const container = mountPage();
    const next = findActionButton(container, 'Dalje');
    expect(next.disabled).toBe(true);
    // The control that spends credits does not even exist at this step.
    expect(findActionButtonOpt(container, 'Pokreni')).toBeUndefined();
    click(next);
    // No upload, no /api/jobs POST — nothing can be charged.
    expect(mocks.uploadFile).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a successful upload makes the wizard advanceable', async () => {
    const container = mountPage();
    mocks.uploadFile.mockResolvedValue({
      url: 'https://files.example.com/reklama.mp4',
      name: 'reklama.mp4',
    });
    await dropFile(container, 'reklama.mp4', 'video/mp4');
    expect(mocks.uploadFile).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('Otpremljeno: reklama.mp4');
    expect(findActionButton(container, 'Dalje').disabled).toBe(false);
  });

  it('a failed upload shows the error in a role=alert and starts no job', async () => {
    const container = mountPage();
    mocks.uploadFile.mockRejectedValue(new Error('Otpremanje fajla nije uspelo.'));
    await dropFile(container, 'reklama.mp4', 'video/mp4');
    const alert = container.querySelector('[role="alert"]');
    expect(alert).toBeInstanceOf(HTMLElement);
    expect(alert!.textContent).toBe('Otpremanje fajla nije uspelo.');
    expect(fetchMock).not.toHaveBeenCalled();
    // Still gated: the failure must not unlock the path to Pokreni.
    expect(findActionButton(container, 'Dalje').disabled).toBe(true);
  });

  it('a 402 from /api/jobs surfaces as an alert instead of the wizard hanging', async () => {
    const container = mountPage();
    mocks.uploadFile.mockResolvedValue({
      url: 'https://files.example.com/reklama.mp4',
      name: 'reklama.mp4',
    });
    await dropFile(container, 'reklama.mp4', 'video/mp4');
    click(findActionButton(container, 'Dalje')); // → Podešavanja
    click(findActionButton(container, 'Dalje')); // → Generiši
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
    expect(container.textContent).not.toContain('Prevodim oglas');
    // ...the rejection is announced to the user. NOTE: what the page actually
    // renders here is the RAW machine code from the API body — the Serbian
    // message built by insufficientBalanceMessage() never reaches this page.
    // Pinned as-rendered (same finding as enhance) so that wiring it up later
    // changes this test loudly.
    const alert = container.querySelector('[role="alert"]');
    expect(alert).toBeInstanceOf(HTMLElement);
    expect(alert!.textContent).toBe('insufficient_balance');
    // Retry stays possible: the action is back to Pokreni and usable.
    expect(findActionButton(container, 'Pokreni').disabled).toBe(false);
  });

});
