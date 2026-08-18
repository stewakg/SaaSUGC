// @vitest-environment jsdom
/**
 * Tests for the Video reklame (matrix) wizard PAGE — /app/matrix.
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
 * - '@/lib/upload-file': uploadFile would POST /api/upload.
 * - '@/lib/poll-job': pollJob would poll /api/jobs/:id — mocked so nothing
 *   here can open a socket.
 * - '@/lib/utils': factory-mocked with a faithful `cn` (same as the other
 *   component suites) so no styling dependencies load.
 * - global.fetch: ROUTE TABLE below. Unlike enhance, this page fetches on
 *   mount (GET /api/voices for the voice catalogue), so "did the page spend
 *   money" is asserted on POST /api/jobs calls specifically (jobsPosted),
 *   never on raw fetchMock totals.
 *
 * '@adgen/core/pricing' is NOT mocked: the cost label is computed by the same
 * pure functions the page uses, so the visible price is asserted for real.
 *
 * The page's own generate gate is `clipsRequired = process.env.NODE_ENV ===
 * 'production'` — vitest runs with NODE_ENV=test, where the requirement is
 * deliberately lifted. The production rule is exercised by stubbing NODE_ENV
 * to 'production' for those tests (vi.stubEnv, undone in afterEach).
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

import MatrixPage from './page';
import * as React from 'react';
import { computeJobCost, creditsLabel } from '@adgen/core/pricing';

// React 19's act() refuses to run unless this flag is set.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as { React?: typeof React }).React = React;

// The two prices the wizard must quote — computed by the same pure calls the
// page uses (montage on = matrix at 15/video, off = revoice at 8/video, the
// wizard's default variant count is 5).
const MATRIX_LABEL = creditsLabel(computeJobCost('matrix', 5));
const REVOICE_LABEL = creditsLabel(computeJobCost('revoice', 5));

const fetchMock = vi.fn();

/**
 * What global.fetch answers, per URL. Only the endpoints the page itself
 * calls are registered (voices on mount; /api/jobs, /api/scrape etc. per
 * test). An unexpected URL throws, so any new network reach in this page
 * fails loudly here instead of silently opening a socket.
 */
type RouteHandler = () => { status: number; body: unknown };
const routes = new Map<string, RouteHandler>();

/** The POST /api/jobs bodies the page has sent — the credit-spending calls. */
interface PostedJob {
  type: string;
  count: number;
  params: { sourceVideoUrls?: string[]; scripts?: unknown } & Record<string, unknown>;
}

function jobsPosted(): PostedJob[] {
  return fetchMock.mock.calls
    .filter((call) => String(call[0]) === '/api/jobs')
    .map((call) => JSON.parse(String((call[1] as RequestInit | undefined)?.body)) as PostedJob);
}

describe('MatrixPage', () => {
  const cleanups: Array<() => void> = [];

  beforeEach(() => {
    routes.clear();
    routes.set('/api/voices', () => ({
      status: 200,
      body: { voices: [{ id: 'voice-ana', name: 'Ana' }] },
    }));
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input);
      const handler = routes.get(url);
      if (!handler) throw new Error(`unexpected fetch in test: ${url}`);
      const { status, body } = handler();
      return { ok: status >= 200 && status < 300, status, json: async () => body };
    });
    vi.stubGlobal('fetch', fetchMock);
    mocks.push.mockReset();
    mocks.refresh.mockReset();
    mocks.replace.mockReset();
    mocks.uploadFile.mockReset();
    mocks.pollJob.mockReset();
    mocks.pollJob.mockResolvedValue({ status: 'done', result: { assets: [] } });
  });

  afterEach(() => {
    while (cleanups.length) cleanups.pop()!();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  /** Mounts the page on a container attached to document.body. */
  function mountPage(): HTMLDivElement {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    React.act(() => {
      root.render(<MatrixPage />);
    });
    cleanups.push(() => {
      React.act(() => {
        root.unmount();
      });
      container.remove();
    });
    return container;
  }

  /** Lets the mount-time /api/voices effect settle inside act. */
  async function flush(): Promise<void> {
    await React.act(async () => {});
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

  /**
   * Jumps to a step via the wizard's own rail. Matrix opts into
   * allowJumpAhead (its only real requirement is checked on the Generate
   * action), so every rail chip is a live button. The chips also carry a
   * number badge span, so they are matched on their label inside the
   * "Koraci" nav rather than by exact textContent.
   */
  function railTo(container: HTMLElement, label: string): void {
    const chip = [...container.querySelectorAll('nav[aria-label="Koraci"] button')].find(
      (b): b is HTMLButtonElement =>
        b instanceof HTMLButtonElement && (b.textContent ?? '').includes(label),
    );
    if (!chip) throw new Error(`rail chip "${label}" not found`);
    click(chip);
  }

  /** The montage/revoice switch on the "Glas, titlovi i varijante" step. */
  function findSwitch(container: HTMLElement): HTMLButtonElement {
    const sw = container.querySelector('button[role="switch"]');
    if (!(sw instanceof HTMLButtonElement)) throw new Error('montage switch not found');
    return sw;
  }

  /** Types into a controlled input the way the browser would deliver it. */
  function setInputValue(input: HTMLInputElement, value: string): void {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (!setter) throw new Error('no native input value setter');
    React.act(() => {
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  it('renders the first step with the dropzone and the montage price visible', async () => {
    const container = mountPage();
    await flush(); // the mount-time /api/voices fetch settles inside act
    expect(container.querySelector('h1')?.textContent).toBe('Video reklame'); // h1 = tool since 2026-08-18
    expect(container.textContent).toContain('Upload klipova');
    // Simple mode: clips, import, style, generate — the two tuning steps are hidden.
    expect(container.textContent).toContain('Korak 1/4');
    const zone = container.querySelector('button[data-dropzone]');
    expect(zone).toBeInstanceOf(HTMLButtonElement);
    expect(zone!.textContent).toContain('Klikni ili prevuci video ovde');
    // The default quote: montage on = the matrix price for 5 videos.
    expect(container.textContent).toContain('Cena:');
    expect(container.textContent).toContain(MATRIX_LABEL);
  });

  it('Generate is gated in production until the wizard\'s own requirements are met', async () => {
    // The page's real rule: `clipsRequired = process.env.NODE_ENV === 'production'`.
    // Under vitest's NODE_ENV=test the gate is deliberately lifted, so it is
    // switched on here to exercise the production requirement.
    vi.stubEnv('NODE_ENV', 'production');
    const container = mountPage();
    await flush();
    railTo(container, 'Generiši');
    // The notice names both missing pieces (verbatim copy from the page).
    expect(container.textContent).toContain('Pre pokretanja fali još:');
    expect(container.textContent).toContain('bar jedan video klip');
    expect(container.textContent).toContain('naziv proizvoda');
    const start = findButton(container, 'Pokreni');
    expect(start.disabled).toBe(true);
    // A forced activation attempt must not spend anything.
    await clickAsync(start);
    expect(jobsPosted()).toHaveLength(0);
  });

  it('in production, meeting the requirements unlocks Pokreni and POSTs a matrix job', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const container = mountPage();
    await flush();

    // Requirement 1: an uploaded clip.
    mocks.uploadFile.mockResolvedValue({
      url: 'https://files.example.com/klip.mp4',
      name: 'klip.mp4',
    });
    await dropFile(container, 'klip.mp4', 'video/mp4');
    expect(mocks.uploadFile).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('1. klip.mp4');

    // Requirement 2: a product name, typed into the import step's own field.
    railTo(container, 'Uvezi proizvod');
    const title = container.querySelector('input[placeholder="npr. Bežične slušalice Pro"]');
    if (!(title instanceof HTMLInputElement)) throw new Error('product title input not found');
    setInputValue(title, 'Masažer za vrat');

    railTo(container, 'Generiši');
    expect(container.textContent).not.toContain('Pre pokretanja fali još:');
    const start = findButton(container, 'Pokreni');
    expect(start.disabled).toBe(false);

    routes.set('/api/jobs', () => ({ status: 200, body: { id: 'job_matrix_1' } }));
    await clickAsync(start);

    // Montage ON (the default) must buy the matrix job type, with the clip on board.
    const posts = jobsPosted();
    expect(posts).toHaveLength(1);
    expect(posts[0].type).toBe('matrix');
    expect(posts[0].count).toBe(5);
    expect(posts[0].params.sourceVideoUrls).toEqual(['https://files.example.com/klip.mp4']);
    expect(mocks.pollJob).toHaveBeenCalledWith('job_matrix_1', expect.anything());
    // Done: the footer marks the charge and the exit affordance appears.
    expect(container.textContent).toContain('naplaćeno');
    expect(findButton(container, 'Vidi u Moje reklame').disabled).toBe(false);
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it('the montage switch changes the job type sent to /api/jobs', async () => {
    const container = mountPage();
    await flush();
    railTo(container, 'Glas, titlovi i varijante');

    const sw = findSwitch(container);
    expect(sw.getAttribute('aria-label')).toBe('Iseci klipove u montažu');
    expect(sw.getAttribute('aria-checked')).toBe('true'); // montage is the default
    click(sw);
    expect(sw.getAttribute('aria-checked')).toBe('false');

    railTo(container, 'Generiši');
    routes.set('/api/jobs', () => ({ status: 200, body: { id: 'job_revoice_1' } }));
    await clickAsync(findButton(container, 'Pokreni'));

    // Money: the same wizard must now buy the cheaper revoice job type.
    const posts = jobsPosted();
    expect(posts).toHaveLength(1);
    expect(posts[0].type).toBe('revoice');
    expect(posts[0].count).toBe(5);
    expect(posts[0].params.sourceVideoUrls).toEqual([]);
  });

  it('the quoted price follows the montage switch', async () => {
    const container = mountPage();
    await flush();
    railTo(container, 'Glas, titlovi i varijante');

    // Montage on: the matrix price.
    expect(container.textContent).toContain('Cena:');
    expect(container.textContent).toContain(MATRIX_LABEL);

    click(findSwitch(container));

    // Montage off: the total must move to the revoice price…
    expect(container.textContent).toContain(REVOICE_LABEL);
    expect(container.textContent).not.toContain(MATRIX_LABEL);
    // …and the unit hint must follow: the per-video figure for the CURRENT
    // job type, derived from @adgen/core/pricing — a literal 15 here would
    // reproduce the bug this suite was written to prevent.
    expect(container.textContent).toContain(`(5 × ${computeJobCost('revoice')})`);
  });

  it('with the montage switch OFF, the breakdown quotes the revoice unit and a total that matches it', async () => {
    const container = mountPage();
    await flush();
    railTo(container, 'Glas, titlovi i varijante');

    click(findSwitch(container)); // montage off → the job type is revoice

    // The exact combination that used to be wrong: the total said 40 while
    // the breakdown said (5 × 15). Both figures now come from the same
    // source the page reads.
    const unit = computeJobCost('revoice');
    expect(container.textContent).toContain(`(5 × ${unit})`);
    expect(container.textContent).toContain(creditsLabel(unit * 5));
    // The wrong pair (matrix total against the revoice count) must be gone.
    expect(container.textContent).not.toContain(MATRIX_LABEL);
  });

  it('a failed upload shows its message in a role=alert and starts no job', async () => {
    const container = mountPage();
    await flush();
    mocks.uploadFile.mockRejectedValue(new Error('Otpremanje fajla nije uspelo.'));
    await dropFile(container, 'klip.mp4', 'video/mp4');
    const alert = container.querySelector('[role="alert"]');
    expect(alert).toBeInstanceOf(HTMLElement);
    expect(alert!.textContent).toBe('Otpremanje fajla nije uspelo.');
    expect(jobsPosted()).toHaveLength(0);
    // No clip made it in, so the append control is not offered either.
    expect(findButtonOpt(container, '+ Dodaj još jedan klip')).toBeUndefined();
  });

  it('a 402 from /api/jobs surfaces instead of leaving the wizard looking busy', async () => {
    const container = mountPage();
    await flush();
    railTo(container, 'Generiši');
    routes.set('/api/jobs', () => ({
      status: 402,
      body: { error: 'insufficient_balance', cost: 40, balance: 0 },
    }));
    const start = findButton(container, 'Pokreni');
    expect(start.disabled).toBe(false);
    await clickAsync(start);

    // Not stuck in the running state…
    expect(container.textContent).not.toContain('Renderujem…');
    expect(findButtonOpt(container, 'Pokreni')).toBeInstanceOf(HTMLButtonElement);
    // …the rejection is announced. NOTE (same as enhance): what reaches the
    // user is the RAW machine code from the API body — pinned as-rendered so
    // that wiring up a Serbian message later changes this test loudly.
    const alert = container.querySelector('[role="alert"]');
    expect(alert).toBeInstanceOf(HTMLElement);
    expect(alert!.textContent).toBe('insufficient_balance');
    // Retry stays possible: the action is back to Pokreni and usable.
    expect(findButton(container, 'Pokreni').disabled).toBe(false);
  });

  it('"+ Dodaj još jedan klip" appends to the existing clips', async () => {
    const container = mountPage();
    await flush();
    mocks.uploadFile.mockImplementation(async () => ({
      url: 'https://files.example.com/prvi.mp4',
      name: 'prvi.mp4',
    }));
    await dropFile(container, 'prvi.mp4', 'video/mp4');
    expect(container.textContent).toContain('1. prvi.mp4');

    const add = findButton(container, '+ Dodaj još jedan klip');
    expect(add.disabled).toBe(false);

    // The control drives its own hidden file input (the picker cannot open in
    // jsdom), so the second pick is delivered the way the browser would
    // deliver the picker's result: a change carrying files on that input.
    const hidden = container.querySelector('input[type="file"][aria-hidden="true"]');
    if (!(hidden instanceof HTMLInputElement)) {
      throw new Error('hidden clip input not found');
    }
    mocks.uploadFile.mockImplementation(async () => ({
      url: 'https://files.example.com/drugi.mp4',
      name: 'drugi.mp4',
    }));
    Object.defineProperty(hidden, 'files', {
      value: [new File(['y'], 'drugi.mp4', { type: 'video/mp4' })],
      configurable: true,
    });
    await React.act(async () => {
      hidden.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(mocks.uploadFile).toHaveBeenCalledTimes(2);
    // BOTH clips are on screen — the control appended, not replaced.
    expect(container.textContent).toContain('1. prvi.mp4');
    expect(container.textContent).toContain('2. drugi.mp4');
  });
});

