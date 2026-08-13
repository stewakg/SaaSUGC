'use client';

import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface WizardStep {
  id: string;
  label: string;
  content: ReactNode;
}

/**
 * Reusable wizard shell (steps, progress bar, Nazad/Dalje) — matches
 * EcomAlati's step-driven tool flow. Per-tool wizards (F3+) supply the steps
 * and drive `activeIndex`/`onNext`/`onBack` themselves; this component only
 * renders the chrome.
 */
export function JobWizard({
  steps,
  activeIndex,
  onBack,
  onNext,
  canNext = true,
  nextLabel,
  costLabel,
  onStepSelect,
  allowJumpAhead = false,
}: {
  steps: WizardStep[];
  activeIndex: number;
  onBack: () => void;
  onNext: () => void;
  canNext?: boolean;
  nextLabel?: string;
  costLabel?: ReactNode;
  /**
   * Jump straight to an already-reached step. Optional: without it the rail
   * stays read-only, which is what every wizard except matrix wants.
   */
  onStepSelect?: (index: number) => void;
  /**
   * Let the rail jump FORWARD to a step not yet reached. Off by default: most
   * wizards validate step by step through `canNext`, and skipping ahead would
   * walk past that. Matrix opts in because its only real requirement is checked
   * on the Generate action itself, not on each step.
   */
  allowJumpAhead?: boolean;
}) {
  const step = steps[activeIndex];
  const isLast = activeIndex === steps.length - 1;

  return (
    /*
      Layout changed 2026-08-13: the rail used to be a horizontal strip above a
      max-w-lg column, which put the steps in the reading path and left the
      settings squeezed into a narrow centre. It is now a VERTICAL rail beside a
      wide panel — the shape a multi-step tool wants, and the shape the owner
      asked for after comparing against EcomAlati.

      It stays a single column below `lg`: a vertical rail on a phone would eat
      the screen before the content starts.
    */
    <div className="mx-auto max-w-5xl lg:flex lg:items-start lg:gap-6">
      {/*
        The rail was a row of <div>s. It has an active state, a done state and
        chip styling — it LOOKS like navigation, so people click it, and nothing
        happened. Now every step already reached is a real button that jumps
        there. Steps ahead stay disabled by default, because skipping forward
        would walk past the validation in `canNext`; `allowJumpAhead` opts in to
        a free rail for wizards whose only real requirement is checked on the
        final action, not on each step.
      */}
      <nav
        className="step-rail mb-4 lg:mb-0 lg:w-56 lg:shrink-0 lg:flex-col lg:items-stretch lg:gap-1 lg:sticky lg:top-6"
        aria-label="Koraci"
      >
        {steps.map((s, i) => {
          const reached = allowJumpAhead || i <= activeIndex;
          return (
            <button
              key={s.id}
              type="button"
              disabled={!reached || !onStepSelect}
              aria-current={i === activeIndex ? 'step' : undefined}
              onClick={() => onStepSelect?.(i)}
              className={cn(
                'focus-ring step-chip lg:w-full lg:justify-start lg:gap-3 lg:px-3 lg:py-2.5 lg:text-left',
                i < activeIndex && 'step-chip--done',
                i === activeIndex && 'step-chip--active',
                reached && onStepSelect && i !== activeIndex && 'hover:bg-panel-2',
                !reached && 'cursor-default',
              )}
            >
              {/* Number badge, visible only in the vertical layout — it is what
                  makes a stacked rail readable as an ordered list rather than a
                  pile of chips. */}
              <span
                aria-hidden
                className={cn(
                  'hidden h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold lg:inline-flex',
                  i === activeIndex ? 'bg-accent text-accent-contrast' : 'bg-panel-2 text-txt-mid',
                )}
              >
                {i + 1}
              </span>
              <span className="truncate">{s.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="panel overflow-hidden lg:min-w-0 lg:flex-1">
        <div className="p-6 sm:p-8">
          <p className="mb-1 text-xs uppercase tracking-wide text-txt-low">
            Korak {activeIndex + 1}/{steps.length}
          </p>
          <h2 className="font-display text-xl font-bold text-txt-hi">{step.label}</h2>

          <div className="mt-5">{step.content}</div>
        </div>

        <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-line bg-panel px-6 py-4 sm:px-8">
          {costLabel ? <div className="min-w-0">{costLabel}</div> : <div />}
          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              disabled={activeIndex === 0}
              className="btn-ghost disabled:opacity-40"
            >
              Nazad
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={!canNext}
              className="btn-primary disabled:opacity-50"
            >
              {nextLabel ?? (isLast ? 'Pokreni' : 'Dalje')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
