import { JOB_DESCRIPTORS, CREDIT_PACKS } from '@adgen/core';
import type { JobType } from '@adgen/db';
import { AddCreditsButton } from '@/components/add-credits-button';
import { MainToolCard, UtilityToolCard } from '@/components/tool-cards';

/** Job types with a working wizard so far. */
const LIVE_TOOL_LINKS: Partial<Record<JobType, string>> = {
  quick_test: '/app/quick-test',
  image_ads: '/app/ai-slike',
  matrix: '/app/matrix',
  edit: '/app/edit',
  mix: '/app/mix',
  translate: '/app/translate',
  enhance: '/app/enhance',
  remove_text: '/app/remove-text',
};

/**
 * Dashboard / Početna. EcomAlati-style two-tier layout: `main` tools get a
 * big colored card with benefit bullets, `utility` tools get a compact row
 * under "Dodatni alati". (F0 note: `ai_video` is the influencer feature,
 * deferred to F7 — shown as a utility row marked "Uskoro".)
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ credited?: string }>;
}) {
  const { credited } = await searchParams;
  const mainTools = JOB_DESCRIPTORS.filter((t) => t.tier === 'main');
  const utilityTools = JOB_DESCRIPTORS.filter((t) => t.tier !== 'main');

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <section>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Šta praviš danas?</h1>
        <p className="mt-1 text-sm text-zinc-400">Izaberi šta praviš, sve ostalo se otvara posle izbora.</p>
      </section>

      <section>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {mainTools.map((t) => (
            <MainToolCard
              key={t.type}
              icon={t.icon}
              theme={t.theme}
              label={t.label}
              description={t.description}
              cost={t.cost}
              benefits={t.benefits}
              href={LIVE_TOOL_LINKS[t.type]}
              soon={!LIVE_TOOL_LINKS[t.type]}
            />
          ))}
        </div>
      </section>

      <section>
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500">Dodatni alati</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

      {/* Pricing placeholder + dev add-credits (mock billing) */}
      {credited && (
        <p className="rounded-lg bg-brand-400/10 px-3 py-2 text-sm text-brand-200">Krediti dodati!</p>
      )}
      <section>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="font-display text-xl font-bold sm:text-2xl">Krediti</h2>
            <p className="mt-1 text-sm text-zinc-400">Dopuni kad ti zatreba. Dev mode = besplatno.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CREDIT_PACKS.map((p) => (
            <div key={p.id} className="card">
              {p.popular && <span className="badge mb-2">Popularno</span>}
              <p className="font-display text-2xl font-bold">
                {p.credits}
                {p.bonus ? <span className="text-sm font-normal text-brand-300"> +{p.bonus}</span> : null}
              </p>
              <p className="text-xs text-zinc-400">kredita</p>
              <p className="mt-2 text-sm text-zinc-300">{p.priceEUR} €</p>
              <AddCreditsButton packId={p.id} className="btn-ghost mt-4 w-full" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}