import { JOB_DESCRIPTORS } from '@adgen/core';
import { creditsLabel } from '@adgen/core/pricing';
import { ToolIcon } from '@/components/tool-icon';
import { LIVE_TOOL_LINKS } from '@/lib/live-tools';

/**
 * /app/uskoro — the roadmap page (owner's call, 2026-08-19): everything not
 * yet released, MAIN and UTILITY tier alike, moved here off the dashboard so
 * Početna shows only tools that work. Same recessed `.soon-well` rows the
 * dashboard used — prices kept, because the roadmap is honest.
 *
 * The list derives from LIVE_TOOL_LINKS, the single source of truth for what
 * is live — a tool disappears from this page the moment its pipeline lands.
 */
export default function UskoroPage() {
  const soonTools = JOB_DESCRIPTORS.filter((t) => !LIVE_TOOL_LINKS[t.type]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Uskoro</h1>
        <p className="mt-1 text-sm text-txt-mid">Alati koji stižu — sa cenama, da znaš šta te čeka.</p>
      </div>

      <section className="soon-well" aria-label="Alati u pripremi">
        {soonTools.map((t) => (
          <div key={t.type} className="soon-row">
            <ToolIcon icon={t.icon} />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-medium text-txt-mid">{t.label}</h2>
              <p className="mt-0.5 truncate text-xs text-txt-low">{t.description}</p>
            </div>
            <span className="text-sm tabular-nums text-txt-low">{creditsLabel(t.cost)}</span>
            <span className="badge badge--muted shrink-0">USKORO</span>
          </div>
        ))}
      </section>
    </div>
  );
}
