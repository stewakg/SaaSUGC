// @vitest-environment jsdom
/**
 * Tests for JobWizard — the shell every paid tool is driven through.
 *
 * ENVIRONMENT (copied from file-dropzone.test.tsx — read that first):
 * - jsdom opt-in via the docblock above; the suite default is node.
 * - No @testing-library/react: the component is mounted with
 *   react-dom/client's createRoot and driven with plain dispatchEvent,
 *   wrapped in React.act (this React 19 RC exports act from 'react'; it
 *   also requires globalThis.IS_REACT_ACT_ENVIRONMENT, set below).
 * - The container is appended to document.body or React's synthetic
 *   events never fire.
 *
 * JobWizard is a CONTROLLED component: `activeIndex` is a prop and the
 * parent owns the state, so the harness below models a real parent —
 * onNext advances, onBack goes back, onStepSelect jumps. "The step
 * counter advanced" therefore means the whole loop really ran, not just
 * that a callback was invoked.
 *
 * What is guarded here, in order of how much money depends on it:
 * - `canNext`: a disabled Dalje must not advance the wizard.
 * - `allowJumpAhead`: a rail chip for an unreached step must not be an
 *   enabled control unless the tool explicitly opted in.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement as h } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('@/lib/utils', () => ({
  cn: (...parts: Array<string | false | null | undefined>) =>
    parts.filter(Boolean).join(' '),
}));

import { JobWizard, type WizardStep } from './job-wizard';
import * as React from 'react';

// React 19's act() refuses to run unless this flag is set.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// vitest transforms .tsx with the CLASSIC JSX runtime here (tsconfig says
// jsx: "preserve", which Next/SWC handles but vite's esbuild does not), so
// executing JSX needs a `React` binding in scope. Providing it globally is
// exactly what the classic transform expects.
(globalThis as { React?: typeof React }).React = React;

const STEPS: WizardStep[] = [
  { id: 'upload', label: 'Upload', content: h('p', null, 'SADRZAJ-UPLOAD') },
  { id: 'podesavanja', label: 'Podešavanja', content: h('p', null, 'SADRZAJ-PODESAVANJA') },
  { id: 'pregled', label: 'Pregled', content: h('p', null, 'SADRZAJ-PREGLED') },
];

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

interface MountedWizard {
  container: HTMLDivElement;
  onNext: ReturnType<typeof vi.fn<() => void>>;
  onBack: ReturnType<typeof vi.fn<() => void>>;
  onStepSelect: ReturnType<typeof vi.fn<(index: number) => void>>;
  /** Re-renders with a new activeIndex, the way a real parent would. */
  goTo: (index: number) => void;
  /** Clicks a button the way a user would, through React's synthetic events. */
  click: (button: HTMLButtonElement) => void;
}

type WizardProps = React.ComponentProps<typeof JobWizard>;


/** Mounts one wizard on a container attached to document.body. */
function mountWizard(
  overrides: Partial<Pick<WizardProps, 'canNext' | 'allowJumpAhead' | 'onStepSelect'>> & {
    /** Wire the parent to advance on onNext (default true, like a real wizard). */
    advanceOnNext?: boolean;
  } = {},
): MountedWizard {
  const { advanceOnNext = true, ...propOverrides } = overrides;

  const onNext = vi.fn<() => void>();
  const onBack = vi.fn<() => void>();
  const onStepSelect = vi.fn<(index: number) => void>();

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  let props: WizardProps = {
    steps: STEPS,
    activeIndex: 0,
    onBack,
    onNext,
    onStepSelect,
    ...propOverrides,
  };

  // The parent's own handlers: record the callback, then move the wizard.
  if (advanceOnNext) {
    onNext.mockImplementation(() => setIndex(props.activeIndex + 1));
  }
  onBack.mockImplementation(() => setIndex(props.activeIndex - 1));
  onStepSelect.mockImplementation((index: number) => setIndex(index));

  function setIndex(index: number): void {
    props = { ...props, activeIndex: index };
    render();
  }

  function render(): void {
    React.act(() => {
      root.render(<JobWizard {...props} />);
    });
  }

  render();
  cleanups.push(() => {
    React.act(() => {
      root.unmount();
    });
    container.remove();
  });

  return {
    container,
    onNext,
    onBack,
    onStepSelect,
    goTo: setIndex,
    click: (button) => {
      React.act(() => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      });
    },
  };
}

function buttonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll('button')).find(
    (button) => button.textContent?.trim() === text,
  );
  if (!(found instanceof HTMLButtonElement)) {
    throw new Error(`no <button> with text "${text}"`);
  }
  return found;
}

/** The rail chip for step `index` — a <button> inside the nav, not the footer. */
function railChip(wizard: MountedWizard, index: number): HTMLButtonElement {
  const nav = wizard.container.querySelector('nav');
  if (!nav) throw new Error('wizard did not render the rail <nav>');
  const chips = nav.querySelectorAll('button');
  const chip = chips[index];
  if (!(chip instanceof HTMLButtonElement)) {
    throw new Error(`rail has no chip #${index} (has ${chips.length})`);
  }
  return chip;
}

function stepCounter(wizard: MountedWizard): string {
  const text = wizard.container.textContent ?? '';
  const match = text.match(/Korak \d+\/\d+/);
  if (!match) throw new Error(`no "Korak n/N" counter rendered (got: ${text})`);
  return match[0];
}


describe('JobWizard', () => {
  it("renders only the active step's content", () => {
    const wizard = mountWizard();
    const text = wizard.container.textContent ?? '';
    expect(text).toContain('SADRZAJ-UPLOAD');
    expect(text).not.toContain('SADRZAJ-PODESAVANJA');
    expect(text).not.toContain('SADRZAJ-PREGLED');

    wizard.goTo(1);
    const after = wizard.container.textContent ?? '';
    expect(after).not.toContain('SADRZAJ-UPLOAD');
    expect(after).toContain('SADRZAJ-PODESAVANJA');
    expect(after).not.toContain('SADRZAJ-PREGLED');
  });

  it('shows "Korak 1/3" on mount and advances via the Dalje button', () => {
    const wizard = mountWizard();
    expect(stepCounter(wizard)).toBe('Korak 1/3');

    wizard.click(buttonByText(wizard.container, 'Dalje'));
    expect(stepCounter(wizard)).toBe('Korak 2/3');
    expect(wizard.onNext).toHaveBeenCalledTimes(1);

    wizard.click(buttonByText(wizard.container, 'Dalje'));
    expect(stepCounter(wizard)).toBe('Korak 3/3');
  });

  it('Dalje is disabled when canNext is false, and clicking it does not advance', () => {
    const wizard = mountWizard({ canNext: false });
    const dalje = buttonByText(wizard.container, 'Dalje');
    expect(dalje.disabled).toBe(true);

    // The parent is wired to advance on onNext, like every real wizard: if
    // the handler fired anyway, the counter would move. It must not.
    wizard.click(dalje);
    expect(wizard.onNext).not.toHaveBeenCalled();
    expect(stepCounter(wizard)).toBe('Korak 1/3');
    expect(dalje.disabled).toBe(true);
  });

  it('Nazad is unavailable on the first step and goes back from a later one', () => {
    const wizard = mountWizard();
    const nazad = buttonByText(wizard.container, 'Nazad');
    expect(nazad.disabled).toBe(true);

    wizard.click(nazad);
    expect(wizard.onBack).not.toHaveBeenCalled();
    expect(stepCounter(wizard)).toBe('Korak 1/3');

    wizard.goTo(2);
    const nazadLater = buttonByText(wizard.container, 'Nazad');
    expect(nazadLater.disabled).toBe(false);
    wizard.click(nazadLater);
    expect(wizard.onBack).toHaveBeenCalledTimes(1);
    expect(stepCounter(wizard)).toBe('Korak 2/3');
  });

  it("the last step offers no Dalje — the caller's Pokreni takes over", () => {
    const wizard = mountWizard({ advanceOnNext: false });
    wizard.goTo(2);

    const text = wizard.container.textContent ?? '';
    expect(text).not.toContain('Dalje');
    expect(text).toContain('Pokreni');
    // It is still the same onNext hand-over, just with the final label.
    wizard.click(buttonByText(wizard.container, 'Pokreni'));
    expect(wizard.onNext).toHaveBeenCalledTimes(1);
  });

  it('without allowJumpAhead a rail chip for an unreached step is not an enabled control', () => {
    const wizard = mountWizard(); // allowJumpAhead defaults to false
    const ahead = railChip(wizard, 2);
    expect(ahead.disabled).toBe(true);

    wizard.click(ahead);
    expect(wizard.onStepSelect).not.toHaveBeenCalled();
    expect(stepCounter(wizard)).toBe('Korak 1/3');
  });

  it('with allowJumpAhead the rail jumps forward to an unreached step', () => {
    const wizard = mountWizard({ allowJumpAhead: true });
    const ahead = railChip(wizard, 2);
    expect(ahead.disabled).toBe(false);

    wizard.click(ahead);
    expect(wizard.onStepSelect).toHaveBeenCalledWith(2);
    expect(stepCounter(wizard)).toBe('Korak 3/3');
  });

  it('rail chips for already-reached steps stay clickable without allowJumpAhead', () => {
    const wizard = mountWizard();
    wizard.goTo(1);
    const first = railChip(wizard, 0);
    expect(first.disabled).toBe(false);

    wizard.click(first);
    expect(wizard.onStepSelect).toHaveBeenCalledWith(0);
    expect(stepCounter(wizard)).toBe('Korak 1/3');
  });
});
