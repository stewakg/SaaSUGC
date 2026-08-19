'use client';

import { type ReactNode } from 'react';
// Subpath import, not the '@adgen/core' root: this is a client component, and
// the root re-exports the queue module whose BullMQ/ioredis chain drags
// node:crypto & co. into the browser bundle — the build fails on the scheme.
// `JobType` is type-only, so it is erased at compile time and safe from root.
import { JOB_DESCRIPTORS } from '@adgen/core/pricing';
import type { JobType } from '@adgen/core';
import { cn } from '@/lib/utils';
import { ToolIcon } from '@/components/tool-icon';

export interface WizardStep {
  id: string;
  label: string;
  content: ReactNode;
}

/**
 * Same hue-variable classes the tool cards use (`.card-tool--<hue>` only sets
 * custom properties), composed here with `.panel-tone` so the wizard panel
 * bleeds the tool's colour from its top edge — the Premijera organic-wash
 * language, never a boxed band.
 */
const TOOL_TONE: Record<string, string> = {
  orange: 'card-tool--orange',
  blue: 'card-tool--blue',
  purple: 'card-tool--purple',
  teal: 'card-tool--teal',
  pink: 'card-tool--pink',
  red: 'card-tool--red',
};

/**
 * Reusable wizard shell (steps, progress bar, Nazad/Dalje) — the step-driven
 * tool flow. Per-tool wizards (F3+) supply the steps and drive
 * `activeIndex`/`onNext`/`onBack` themselves; this component only renders the
 * chrome.
 *
 * 2026-08-18 (Premijera pass, after comparing against the competitor's
 * wizard): the panel now opens with the TOOL's identity — icon, name, hue
 * wash — instead of an anonymous step title floating in dark space, the rail
 * gets a "Koraci" kicker plus a live progress bar, and the whole layout
 * breathes wider. `toolType` is the only new prop: label, hue and icon are
 * resolved from JOB_DESCRIPTORS so the wizard cannot drift from the cards.
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
  toolType,
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
  /** Which tool this wizard belongs to — brings its name, icon and hue. */
  toolType?: JobType;
}) {
  const step = steps[activeIndex];
  const isLast = activeIndex === steps.length - 1;
  const tool = toolType ? JOB_DESCRIPTORS.find((t) => t.type === toolType) : undefined;
  const tone = (tool?.theme && TOOL_TONE[tool.theme]) || '';

  return (
    /*
      Layout changed 2026-08-13: the rail used to be a horizontal strip above a
      max-w-lg column, which put the steps in the reading path and left the
      settings squeezed into a narrow centre. It is now a VERTICAL rail beside a
      wide panel — the shape a multi-step tool wants.

      It stays a single column below `lg`: a vertical rail on a phone would eat
      the screen before the content starts.
    */
    /*
      2026-08-19, owner's call: the wizard fills the content area edge to edge —
      the old `mx-auto max-w-6xl` centred it and left a dead gutter between the
      sidebar and the step rail, which also refused to follow the sidebar
      collapse. Full width means the rail hugs the left edge and the panel
      absorbs whatever the collapse frees up.
    */
    <div className="w-full lg:flex lg:items-start lg:gap-8">
      <div className="mb-4 lg:mb-0 lg:sticky lg:top-6 lg:w-56 lg:shrink-0">
        <p className="mb-2 hidden px-1 text-[11px] font-semibold uppercase tracking-wide text-txt-low lg:block">
          Koraci
        </p>
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
          className="step-rail lg:flex-col lg:items-stretch lg:gap-1"
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
                aria-label={i < activeIndex ? `${s.label} (završeno)` : undefined}
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
        {/* Live progress under the rail — the competitor's "Korak 1 od 3"
            pattern, driven by the same .progress primitive the renders use. */}
        <div className="mt-4 hidden px-1 lg:block">
          <p className="mb-1.5 text-xs font-medium text-txt-mid">
            Korak {activeIndex + 1} od {steps.length}
          </p>
          <span className="progress">
            <i style={{ width: `${((activeIndex + 1) / steps.length) * 100}%` }} />
          </span>
        </div>
      </div>

      <div className={cn('panel panel-tone overflow-hidden lg:min-w-0 lg:flex-1', tone)}>
        <div className="p-6 sm:p-8">
          {tool ? (
            <div className="flex items-center gap-3.5">
              <ToolIcon icon={tool.icon} />
              <div className="min-w-0">
                <h1 className="font-display truncate text-xl font-bold text-txt-hi sm:text-2xl">
                  {tool.label}
                </h1>
                <p className="truncate text-sm text-txt-mid">
                  {step.label} · Korak {activeIndex + 1}/{steps.length}
                </p>
              </div>
            </div>
          ) : (
            <>
              <p className="mb-1 text-xs uppercase tracking-wide text-txt-low">
                Korak {activeIndex + 1}/{steps.length}
              </p>
              <h1 className="font-display text-xl font-bold text-txt-hi">{step.label}</h1>
            </>
          )}

          <div className="mt-6">{step.content}</div>
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
              className="btn-primary px-6 disabled:opacity-50"
            >
              {nextLabel ?? (isLast ? 'Pokreni' : 'Dalje')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
