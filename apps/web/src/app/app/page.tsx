import { JOB_DESCRIPTORS } from '@adgen/core';
import { MainToolCard, UtilityToolCard } from '@/components/tool-cards';
import { LIVE_TOOL_LINKS } from '@/lib/live-tools';

/**
 * Dashboard / Početna. EcomAlati-style two-tier layout: `main` tools get a
 * big neutral card with benefit bullets, `utility` tools get a compact row
 * under "Dodatni alati". (F0 note: `ai_video` is the influencer feature,
 * deferred to F7 — shown as a utility row marked "Uskoro".)
 */
export default function DashboardPage() {
  const mainTools = JOB_DESCRIPTORS.filter((t) => t.tier === 'main');
  const utilityTools = JOB_DESCRIPTORS.filter((t) => t.tier !== 'main');

  return (
    <div className="space-y-10">
      <section>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Šta praviš danas?</h1>
        <p className="mt-1 text-sm text-txt-mid">Izaberi šta praviš, sve ostalo se otvara posle izbora.</p>
      </section>

      <section>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {mainTools.map((t) => (
            <MainToolCard
              key={t.type}
              icon={t.icon}
              label={t.label}
              description={t.description}
              cost={t.cost}
              benefits={t.benefits}
              theme={t.theme}
              href={LIVE_TOOL_LINKS[t.type]}
              soon={!LIVE_TOOL_LINKS[t.type]}
              className="xl:col-span-2"
            />
          ))}
        </div>
      </section>

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
