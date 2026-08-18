import { JOB_DESCRIPTORS } from '@adgen/core';
import { creditsLabel } from '@adgen/core/pricing';
import { MainToolCard, UtilityToolCard } from '@/components/tool-cards';
import { ToolIcon } from '@/components/tool-icon';
import { LIVE_TOOL_LINKS } from '@/lib/live-tools';

/**
 * Dashboard / Početna — Premijera layout (2026-08-18).
 *
 * The old grid gave all seven `main` tools an equal card and dimmed the four
 * unreleased ones, which read as a half-built product. Now elevation carries
 * availability: tools that WORK get the full strip-header card, tools that
 * are coming sit in a recessed `.soon-well` as compact rows — prices kept,
 * because the roadmap is honest, just demoted. (F0 note: `ai_video` is the
 * influencer feature, deferred to F7 — still a utility row marked "Uskoro".)
 */
export default function DashboardPage() {
  const mainTools = JOB_DESCRIPTORS.filter((t) => t.tier === 'main');
  const liveMain = mainTools.filter((t) => LIVE_TOOL_LINKS[t.type]);
  const soonMain = mainTools.filter((t) => !LIVE_TOOL_LINKS[t.type]);
  const utilityTools = JOB_DESCRIPTORS.filter((t) => t.tier !== 'main');

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

      {soonMain.length > 0 && (
        <section className="soon-well" aria-label="Alati u pripremi">
          <div className="mb-1 flex items-center gap-2.5">
            <h2 className="text-sm font-semibold text-txt-mid">Uskoro</h2>
            <span className="badge badge--muted">{soonMain.length}</span>
          </div>
          {soonMain.map((t) => (
            <div key={t.type} className="soon-row">
              <ToolIcon icon={t.icon} />
              <h3 className="min-w-0 flex-1 truncate text-sm font-medium text-txt-mid">
                {t.label}
              </h3>
              <span className="text-sm tabular-nums text-txt-low">{creditsLabel(t.cost)}</span>
              <span className="badge badge--muted shrink-0">USKORO</span>
            </div>
          ))}
        </section>
      )}

      <section>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-txt-low">Dodatni alati</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {utilityTools.map((t) => (
            <UtilityToolCard
              key={t.type}
              icon={t.icon}
              label={t.label}
              description={t.description}
              cost={t.cost}
              href={LIVE_TOOL_LINKS[t.type]}
              soon={!LIVE_TOOL_LINKS[t.type]}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
