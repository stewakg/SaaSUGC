import { JOB_DESCRIPTORS } from '@adgen/core';
import { MainToolCard, UtilityToolCard } from '@/components/tool-cards';
import { LIVE_TOOL_LINKS } from '@/lib/live-tools';

/**
 * Dashboard / Početna — Premijera layout (2026-08-18).
 *
 * Since 2026-08-19 this page shows ONLY tools that work (owner's call): the
 * unreleased ones moved to their own sidebar page, /app/uskoro — the recessed
 * `.soon-well` lives there now. Utilities render with the same strip-card
 * system as the main tier, their own hues.
 */
export default function DashboardPage() {
  const liveMain = JOB_DESCRIPTORS.filter((t) => t.tier === 'main' && LIVE_TOOL_LINKS[t.type]);
  const liveUtility = JOB_DESCRIPTORS.filter((t) => t.tier !== 'main' && LIVE_TOOL_LINKS[t.type]);

  return (
    <div className="space-y-10">
      <h1 className="sr-only">Početna</h1>

      <section>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {liveMain.map((t) => (
            <MainToolCard
              key={t.type}
              icon={t.icon}
              label={t.label}
              description={t.description}
              cost={t.cost}
              benefits={t.benefits}
              theme={t.theme}
              href={LIVE_TOOL_LINKS[t.type]}
            />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-txt-low">Dodatni alati</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {liveUtility.map((t) => (
            <UtilityToolCard
              key={t.type}
              icon={t.icon}
              label={t.label}
              description={t.description}
              cost={t.cost}
              theme={t.theme}
              href={LIVE_TOOL_LINKS[t.type]}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
