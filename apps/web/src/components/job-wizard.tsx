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
}) {
  const step = steps[activeIndex];
  const isLast = activeIndex === steps.length - 1;

  return (
    <div className="mx-auto max-w-lg">
      {/*
        The rail was a row of <div>s. It has an active state, a done state and
        chip styling — it LOOKS like navigation, so people click it, and nothing
        happened. Now every step already reached is a real button that jumps
        there; steps ahead stay disabled, because skipping forward would walk
        past the validation in `canNext`.
      */}
      <nav className="step-rail mb-4" aria-label="Koraci">
        {steps.map((s, i) => {
          const reached = i <= activeIndex;
          return (
            <button
              key={s.id}
              type="button"
              disabled={!reached || !onStepSelect}
              aria-current={i === activeIndex ? 'step' : undefined}
              onClick={() => onStepSelect?.(i)}
              className={cn(
                'focus-ring step-chip',
                i < activeIndex && 'step-chip--done',
                i === activeIndex && 'step-chip--active',
                reached && onStepSelect && i !== activeIndex && 'hover:bg-panel-2',
                !reached && 'cursor-default',
              )}
            >
              <span className="truncate">{s.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="panel overflow-hidden">
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
