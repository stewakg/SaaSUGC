// @vitest-environment jsdom
/**
 * Tests for the AI slike wizard PAGE (F3) — /app/ai-slike.
 *
 * Harness copied from enhance/page.test.tsx (same JobWizard shape):
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
 * - '@/lib/poll-job': pollJob would poll /api/jobs/:id. Mocked so nothing
 *   here can open a socket; the happy-path test resolves it directly.
 * - '@/lib/utils': factory-mocked with a faithful `cn` (JobWizard styles).
 * - global.fetch: this page is the only wizard that STARTS from a URL, so it
 *   makes two kinds of fetch — POST /api/scrape (free, fills step 1) and
 *   POST /api/jobs (spends credits). The mock dispatches on the URL and
 *   every call is inspected, so the two never blur together.
 *
 * '@adgen/core/pricing' is NOT mocked: the cost label is computed by the same
 * pure functions the page uses, so the visible price is asserted for real —
 * including how it tracks the chosen image COUNT, the number the customer
 * is charged per image.
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

import AiSlikePage from './page';
import * as React from 'react';
import { computeJobCost, creditsLabel } from '@adgen/core/pricing';

// React 19's act() refuses to run unless this flag is set.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as { React?: typeof React }).React = React;

// Per-image unit price and the default label — computed by the same pure
// calls the page uses (the page's own "× 4" must equal this or the label
// lies about either the unit or the total).
const UNIT = computeJobCost('image_ads', 1);
const DEFAULT_COUNT = 2;
const DEFAULT_COST_LABEL = creditsLabel(computeJobCost('image_ads', DEFAULT_COUNT));

const SCRAPE_URL = 'https://prodavnica.rs/proizvod/zimska-jakna';
const SCRAPE_BODY = {
  title: 'Zimska jakna',
  price: '2.990 RSD',
  images: ['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.jpg'],
};

const fetchMock = vi.fn();

describe('AiSlikePage', () => {
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
      root.render(<AiSlikePage />);
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
   * Types into a controlled React input: the native value setter must be
   * used, or React swallows the change as "unchanged DOM state".
   */
  function setUrlValue(container: HTMLElement, value: string): void {
    const input = container.querySelector('input[type="url"]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('page did not render the URL input');
    }
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    React.act(() => {
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
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

  /** All fetch calls this test made to a given endpoint (URL is arg 0). */
  function callsTo(url: string): Array<[string, RequestInit | undefined]> {
    return fetchMock.mock.calls.filter(([u]) => u === url) as Array<
      [string, RequestInit | undefined]
    >;
  }

  /** Dispatches global.fetch per URL; an unexpected URL throws loudly. */
  function stubFetch(
    handlers: Record<string, () => { ok: boolean; status: number; json: () => Promise<unknown> }>,
  ): void {
    fetchMock.mockImplementation(((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      const handler = handlers[url];
      if (!handler) throw new Error(`unexpected fetch: ${url}`);
      return handler();
    }) as unknown as typeof fetch);
  }

  /** The usual happy scrape: /api/scrape answers with a real product. */
  function stubHappyScrape(): void {
    stubFetch({
      '/api/scrape': () => ({ ok: true, status: 200, json: async () => SCRAPE_BODY }),
    });
  }

  /** Drives the wizard to step 2 (Generiši) with a scraped product. */
  async function reachGenerateStep(container: HTMLElement): Promise<void> {
    setUrlValue(container, SCRAPE_URL);
    await clickAsync(findButton(container, 'Uvezi'));
    click(findButton(container, 'Dalje')); // → Podešavanja
    click(findButton(container, 'Dalje')); // → Generiši
  }

  it('renders the first step with the URL field and no price shouting at the customer', () => {
    const container = mountPage();
    const heading = container.querySelector('h1');
    expect(heading?.textContent).toBe('AI slike'); // h1 = tool since 2026-08-18
    expect(container.textContent).toContain('Uvezi proizvod');
    expect(container.textContent).toContain('Korak 1/3');
    expect(container.querySelector('input[type="url"]')).toBeInstanceOf(HTMLInputElement);
    // The price is NOT on the first step any more (2026-08-20): it is a quiet
    // line on the LAST step, right above the button that spends. Asserted as an
    // absence so that putting it back is a failing test, not a silent revert.
    expect(container.textContent).not.toContain('Cena:');
    expect(container.textContent).not.toContain(DEFAULT_COST_LABEL);
    expect(container.textContent).not.toContain(`(${DEFAULT_COUNT} × ${UNIT})`);
  });

  it('the primary action is unavailable with no product imported and starts nothing', () => {
    const container = mountPage();
    // No URL yet: even the (free) scrape is disabled...
    expect(findButton(container, 'Uvezi').disabled).toBe(true);
    // ...and Dalje — the only road to the credit-spending Pokreni — is gated
    // on a scraped title that does not exist yet.
    expect(findButton(container, 'Dalje').disabled).toBe(true);
    // The control that spends credits does not even exist at this step.
    expect(findButtonOpt(container, 'Pokreni')).toBeUndefined();
    click(findButton(container, 'Uvezi'));
    click(findButton(container, 'Dalje'));
    // No scrape, no /api/jobs POST — nothing can be charged.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(callsTo('/api/jobs')).toHaveLength(0);

    // A typed URL alone is not the required input: without a successful
    // scrape there is still no title, so the wizard must stay gated.
    setUrlValue(container, SCRAPE_URL);
    expect(findButton(container, 'Uvezi').disabled).toBe(false);
    expect(findButton(container, 'Dalje').disabled).toBe(true);
    click(findButton(container, 'Dalje'));
    expect(callsTo('/api/jobs')).toHaveLength(0);
  });

  it('a failed scrape shows its message in a role=alert and starts no job', async () => {
    const container = mountPage();
    stubFetch({
      '/api/scrape': () => ({
        ok: false,
        status: 422,
        json: async () => ({ error: 'Stranica nije dostupna.' }),
      }),
    });
    setUrlValue(container, SCRAPE_URL);
    await clickAsync(findButton(container, 'Uvezi'));

    const alert = container.querySelector('[role="alert"]');
    expect(alert).toBeInstanceOf(HTMLElement);
    expect(alert!.textContent).toBe('Stranica nije dostupna.');
    // One scrape attempt, and nothing else — no job was ever started.
    expect(callsTo('/api/scrape')).toHaveLength(1);
    expect(callsTo('/api/jobs')).toHaveLength(0);
    expect(mocks.pollJob).not.toHaveBeenCalled();
    // Still gated: the failure must not unlock the road to Pokreni.
    expect(findButton(container, 'Dalje').disabled).toBe(true);
  });

  it('a successful scrape fills step 1 and makes the wizard advanceable', async () => {
    const container = mountPage();
    stubHappyScrape();
    setUrlValue(container, SCRAPE_URL);
    await clickAsync(findButton(container, 'Uvezi'));

    expect(callsTo('/api/scrape')).toHaveLength(1);
    // What the page actually gates on: a non-empty product title, which the
    // scrape must deliver into the editable field.
    const titleInput = [...container.querySelectorAll('input')].find(
      (i) => i.value === SCRAPE_BODY.title,
    );
    expect(titleInput).toBeInstanceOf(HTMLInputElement);
    expect(findButton(container, 'Dalje').disabled).toBe(false);
  });

  it('a 402 from /api/jobs surfaces as an alert instead of the wizard hanging', async () => {
    const container = mountPage();
    stubFetch({
      '/api/scrape': () => ({ ok: true, status: 200, json: async () => SCRAPE_BODY }),
      // The real route answers exactly this body when the balance is short.
      '/api/jobs': () => ({
        ok: false,
        status: 402,
        json: async () => ({ error: 'insufficient_balance', cost: 8, balance: 2 }),
      }),
    });
    await reachGenerateStep(container);

    const start = findButton(container, 'Pokreni');
    expect(start.disabled).toBe(false);
    await clickAsync(start);

    // The wizard must not look like it is working...
    expect(container.textContent).not.toContain('Radi…');
    expect(container.textContent).not.toContain('Generišem AI slike');
    // ...the rejection is announced to the user. NOTE: what the page actually
    // renders here is the RAW machine code from the API body — the Serbian
    // message a human should see never reaches this page. Pinned as-rendered
    // (same finding as enhance/page.test.tsx) so that wiring it up later
    // changes this test loudly.
    const alert = container.querySelector('[role="alert"]');
    expect(alert).toBeInstanceOf(HTMLElement);
    expect(alert!.textContent).toBe('insufficient_balance');
    // No job id came back, so nothing was ever polled.
    expect(mocks.pollJob).not.toHaveBeenCalled();
    // Retry stays possible: the action is back to Pokreni and usable.
    const retry = findButton(container, 'Pokreni');
    expect(retry.disabled).toBe(false);
    expect(findButtonOpt(container, 'Radi…')).toBeUndefined();
  });

  it('the quoted cost tracks the chosen image count, and the job is charged for it', async () => {
    const container = mountPage();
    const chosen = 3;
    stubFetch({
      '/api/scrape': () => ({ ok: true, status: 200, json: async () => SCRAPE_BODY }),
      '/api/jobs': () => ({
        ok: true,
        status: 200,
        json: async () => ({ id: 'job_ai1' }),
      }),
    });
    mocks.pollJob.mockResolvedValue({
      status: 'done',
      result: { assets: [{ url: 'https://files.example.com/ai1.png' }] },
    });
    setUrlValue(container, SCRAPE_URL);
    await clickAsync(findButton(container, 'Uvezi'));
    click(findButton(container, 'Dalje')); // → Podešavanja

    // The count is picked here, but the quote is read on the LAST step
    // (2026-08-20) — so the picker is exercised here and the arithmetic is
    // checked one step later, which is also the order a customer sees it in.
    const pick = findButton(container, `${chosen}`);
    click(pick);
    expect(pick.getAttribute('aria-pressed')).toBe('true');

    click(findButton(container, 'Dalje')); // → Generiši, where the price shows

    expect(container.textContent).toContain(`(${chosen} × ${UNIT})`);
    expect(container.textContent).toContain(creditsLabel(computeJobCost('image_ads', chosen)));
    // The default quote must be gone — the number followed the picker.
    expect(container.textContent).not.toContain(`(${DEFAULT_COUNT} × ${UNIT})`);

    // Generate: the credit-spending POST must carry the SAME count the
    // label quoted — a stale label or a stale payload would charge the
    // customer something other than what they were promised. (Already on the
    // last step: the quote above was read there.)
    await clickAsync(findButton(container, 'Pokreni'));

    const jobCalls = callsTo('/api/jobs');
    expect(jobCalls).toHaveLength(1);
    const body = JSON.parse(jobCalls[0][1]!.body as string) as {
      type: string;
      count: number;
    };
    expect(body.type).toBe('image_ads');
    expect(body.count).toBe(chosen);

    // The job finished: pollJob resolved and the label says it was charged.
    expect(mocks.pollJob).toHaveBeenCalledWith('job_ai1', expect.anything());
    expect(container.textContent).toContain('naplaćeno');
    expect(findButton(container, 'Vidi u Moje reklame')).toBeInstanceOf(HTMLButtonElement);
  });

});
