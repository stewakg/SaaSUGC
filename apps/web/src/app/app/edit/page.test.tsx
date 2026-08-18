// @vitest-environment jsdom
/**
 * Tests for the Edit wizard PAGE (F5) — /app/edit.
 *
 * Harness copied from enhance/page.test.tsx / file-dropzone.test.tsx:
 * - jsdom opt-in via the docblock above (suite default is node).
 * - No @testing-library/react: the page is mounted with react-dom/client's
 *   createRoot and driven with plain dispatchEvent wrapped in React.act
 *   (React 19 exports act from 'react'; it also needs
 *   globalThis.IS_REACT_ACT_ENVIRONMENT, set below).
 * - vitest transforms .tsx with the CLASSIC JSX runtime here, so a global
 *   `React` binding is provided — exactly what that transform expects.
 *
 * MOCKS, all at the module boundary:
 * - 'next/navigation': useRouter throws outside the App Router; the fakes
 *   exist before the module graph evaluates (vi.hoisted).
 * - '@/lib/upload-file': uploadFile would POST /api/upload. The page takes
 *   only the FIRST file of a pick (it edits one video).
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

import EditPage from './page';
import * as React from 'react';
import { creditsLabel, getJobDescriptor } from '@adgen/core/pricing';

// React 19's act() refuses to run unless this flag is set.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as { React?: typeof React }).React = React;

// The price the page must show — computed by the same pure call it uses.
const COST_LABEL = creditsLabel(getJobDescriptor('edit').cost);

const fetchMock = vi.fn();

describe('EditPage', () => {
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
      root.render(<EditPage />);
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

  function findButtonOpt(container: HTMLElement, text: string): HTMLButtonElement | undefined {
    return [...container.querySelectorAll('button')].find(
      (b): b is HTMLButtonElement => b instanceof HTMLButtonElement && b.textContent === text,
    );
  }

  function findButton(container: HTMLElement, text: string): HTMLButtonElement {
    const button = findButtonOpt(container, text);
    if (!button) throw new Error(`button "${text}" not found`);
    return button;
  }

  it('renders the first step with the dropzone and the tool cost visible', () => {
    const container = mountPage();
    const heading = container.querySelector('h1');
    expect(heading?.textContent).toBe('Edit'); // h1 = tool since 2026-08-18
    expect(container.textContent).toContain('Uvezi video');
    expect(container.textContent).toContain('Korak 1/4');
    const zone = container.querySelector('button[data-dropzone]');
    expect(zone).toBeInstanceOf(HTMLButtonElement);
    expect(zone!.textContent).toContain('Klikni ili prevuci video ovde');
    // The price a customer would pay for this tool must be on the screen.
    expect(container.textContent).toContain('Cena:');
    expect(container.textContent).toContain(COST_LABEL);
  });

  it('the primary action is unavailable with no video chosen and starts nothing', () => {
    const container = mountPage();
    const next = findButton(container, 'Dalje');
    expect(next.disabled).toBe(true);
    // The control that spends credits does not even exist at this step.
    expect(findButtonOpt(container, 'Pokreni')).toBeUndefined();
    click(next);
    // No upload, no /api/jobs POST — nothing can be charged.
    expect(mocks.uploadFile).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a successful upload makes the wizard advanceable', async () => {
    const container = mountPage();
    mocks.uploadFile.mockResolvedValue({
      url: 'https://files.example.com/video.mp4',
      name: 'video.mp4',
    });
    await dropFile(container, 'video.mp4', 'video/mp4');
    expect(mocks.uploadFile).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('Otpremljeno: video.mp4');
    expect(findButton(container, 'Dalje').disabled).toBe(false);
  });

  it('a failed upload shows the error in a role=alert and starts no job', async () => {
    const container = mountPage();
    mocks.uploadFile.mockRejectedValue(new Error('Otpremanje fajla nije uspelo.'));
    await dropFile(container, 'video.mp4', 'video/mp4');
    const alert = container.querySelector('[role="alert"]');
    expect(alert).toBeInstanceOf(HTMLElement);
    expect(alert!.textContent).toBe('Otpremanje fajla nije uspelo.');
    expect(fetchMock).not.toHaveBeenCalled();
    // Still gated: the failure must not unlock the path to Pokreni.
    expect(findButton(container, 'Dalje').disabled).toBe(true);
  });

  it('a 402 from /api/jobs surfaces as an alert instead of the wizard hanging', async () => {
    const container = mountPage();
    mocks.uploadFile.mockResolvedValue({
      url: 'https://files.example.com/video.mp4',
      name: 'video.mp4',
    });
    await dropFile(container, 'video.mp4', 'video/mp4');
    click(findButton(container, 'Dalje')); // → Isecanje
    click(findButton(container, 'Dalje')); // → Titlovi i brend
    click(findButton(container, 'Dalje')); // → Generiši
    // The real route answers exactly this body when the balance is short.
    fetchMock.mockResolvedValue({
      ok: false,
      status: 402,
      json: async () => ({ error: 'insufficient_balance', cost: 5, balance: 0 }),
    });
    const start = findButton(container, 'Pokreni');
    expect(start.disabled).toBe(false);
    await clickAsync(start);

    // The wizard must not look like it is working...
    expect(container.textContent).not.toContain('Radi…');
    expect(container.textContent).not.toContain('Uređujem video');
    // ...the rejection is announced to the user. NOTE (same as enhance and
    // matrix): what the page actually renders here is the RAW machine code
    // from the API body — the Serbian message built by
    // insufficientBalanceMessage() never reaches this page. Pinned
    // as-rendered so that wiring it up later changes this test loudly.
    const alert = container.querySelector('[role="alert"]');
    expect(alert).toBeInstanceOf(HTMLElement);
    expect(alert!.textContent).toBe('insufficient_balance');
    // Retry stays possible: the action is back to Pokreni and usable.
    expect(findButton(container, 'Pokreni').disabled).toBe(false);
  });

});
