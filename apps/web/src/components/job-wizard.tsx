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
}: {
  steps: WizardStep[];
  activeIndex: number;
  onBack: () => void;
  onNext: () => void;
  canNext?: boolean;
  nextLabel?: string;
  costLabel?: ReactNode;
}) {
  const step = steps[activeIndex];
  const isLast = activeIndex === steps.length - 1;

  return (
    <div className="mx-auto max-w-lg">
      <div className="step-rail mb-4">
        {steps.map((s, i) => (
          <div
            key={s.id}
            className={cn(
              'step-chip',
              i < activeIndex && 'step-chip--done',
              i === activeIndex && 'step-chip--active',
            )}
          >
            <span className="truncate">{s.label}</span>
          </div>
        ))}
      </div>

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
