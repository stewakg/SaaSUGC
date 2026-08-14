import type { JobType } from '@adgen/db';

/**
 * Job types that WORK END TO END — a wizard AND a pipeline that produces a real
 * asset. Anything absent here renders with an "USKORO" badge and no link.
 *
 * Trimmed 2026-08-14 after the functional audit. `quick_test`, `edit`, `mix`
 * and `translate` all have a wizard and a card, and none of them has a
 * pipeline: `runPipeline` refuses them with `tool_not_implemented`, which is
 * the correct behaviour (nothing is charged) but a terrible way for a customer
 * to find out. They clicked a card that looked live, filled in three steps, hit
 * Pokreni and got an error.
 *
 * WHY THIS LIVES IN ITS OWN MODULE: it started as a const inside the dashboard,
 * and the PUBLIC LANDING PAGE went on advertising all four dead tools with
 * their prices, because its own card grid hard-coded `soon={t.type ===
 * 'ai_video'}`. The dashboard told the truth to people who had already signed
 * up while the marketing page lied to everyone who had not — the exact reverse
 * of the order that matters. One list, imported by both, is the only shape
 * where that cannot happen again.
 *
 * Put a tool back the moment its pipeline lands — that is the same list the
 * worker's RENDERABLE_COMPOSITIONS guards from the other side.
 */
export const LIVE_TOOL_LINKS: Partial<Record<JobType, string>> = {
  image_ads: '/app/ai-slike',
  // Same wizard as matrix: the montage switch in step 3 sends the `revoice` job
  // type instead. Until 2026-08-14 this pipeline had a price, a descriptor and
  // full test coverage, and nothing in the app could reach it.
  revoice: '/app/matrix',
  matrix: '/app/matrix',
  enhance: '/app/enhance',
  remove_text: '/app/remove-text',
};

/** True when a tool has no pipeline yet and must render as USKORO. */
export function isToolSoon(type: JobType): boolean {
  return !LIVE_TOOL_LINKS[type];
}
