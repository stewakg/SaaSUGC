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
    <div className="card-gradient mx-auto max-w-lg p-6 sm:p-8">
      <div className="mb-6 flex items-center gap-2">
        {steps.map((s) => (
          <div
            key={s.id}
            className={cn(
              'h-1.5 flex-1 rounded-full transition',
              steps.indexOf(s) <= activeIndex ? 'bg-brand-400' : 'bg-white/10',
            )}
          />
        ))}
      </div>

      <p className="mb-1 text-xs uppercase tracking-wide text-zinc-500">
        Korak {activeIndex + 1}/{steps.length}
      </p>
      <h2 className="font-display text-xl font-bold">{step.label}</h2>

      <div className="mt-5">{step.content}</div>

      {costLabel ? <div className="mt-6">{costLabel}</div> : null}

      <div className="mt-8 flex items-center justify-between gap-3">
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
  );
}
