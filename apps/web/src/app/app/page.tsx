import { JOB_DESCRIPTORS, CREDIT_PACKS } from '@adgen/core';
import { creditsWord } from '@adgen/core/pricing';
import type { JobType } from '@adgen/db';
import { AddCreditsButton } from '@/components/add-credits-button';
import { MainToolCard, UtilityToolCard } from '@/components/tool-cards';
import { createServerClient } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/admin';

/**
 * Job types that WORK END TO END — a wizard AND a pipeline that produces a real
 * asset. Anything absent here renders with an "USKORO" badge and no link.
 *
 * Trimmed 2026-08-14 after the functional audit. `quick_test`, `edit`, `mix`
 * and `translate` all have a wizard and a card, and none of them has a
 * pipeline: `runPipeline` refuses them with `tool_not_implemented`, which is
 * the correct behaviour (nothing is charged) but a terrible way for a customer
 * to find out. They clicked a card that looked live, filled in three steps, hit
 * Pokreni and got an error. Listing them here was the app promising work it
 * cannot do; the badge tells the truth up front.
 *
 * Put a tool back the moment its pipeline lands — that is the same list the
 * worker's RENDERABLE_COMPOSITIONS guards from the other side.
 */
const LIVE_TOOL_LINKS: Partial<Record<JobType, string>> = {
  image_ads: '/app/ai-slike',
  // Same wizard as matrix: the montage switch in step 3 sends the `revoice` job
  // type instead. Until 2026-08-14 this pipeline had a price, a descriptor and
  // full test coverage, and nothing in the app could reach it.
  revoice: '/app/matrix',
  matrix: '/app/matrix',
  enhance: '/app/enhance',
  remove_text: '/app/remove-text',
};

/**
 * Dashboard / Početna. EcomAlati-style two-tier layout: `main` tools get a
 * big neutral card with benefit bullets, `utility` tools get a compact row
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

  // The instant-credit button mints credits out of nothing. Outside production
  // anyone signed in may use it (that is what makes local testing painless);
  // in production it is admins only. This only decides whether to RENDER it —
  // the route enforces the same rule for itself, because a hidden button is
  // not a protected one.
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const canGrantCredits = process.env.NODE_ENV !== 'production' || isAdminEmail(user?.email);

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
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-txt-low">Dodatni alati</p>
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

      {/* Pricing placeholder + dev add-credits (mock billing) */}
      {credited && (
        <p className="rounded-lg border border-ok/30 bg-ok/10 px-3 py-2 text-sm text-ok-text">Krediti dodati!</p>
      )}
      <section className="border-t border-line pt-8">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="font-display text-xl font-bold sm:text-2xl">Krediti</h2>
            <p className="mt-1 text-sm text-txt-mid">Dopuni kad ti zatreba. Dev mode = besplatno.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CREDIT_PACKS.map((p) => (
            <div key={p.id} className="card">
              {p.popular && <span className="badge mb-2">Popularno</span>}
              <p className="font-mono tabular text-2xl font-bold text-txt-hi">
                {p.credits}
                {p.bonus ? <span className="text-sm font-normal text-accent-text"> +{p.bonus}</span> : null}
              </p>
              <p className="text-xs text-txt-mid">{creditsWord(p.credits)}</p>
              <p className="mt-2 text-sm font-mono tabular text-txt-mid">{p.priceEUR} €</p>
              {canGrantCredits && <AddCreditsButton packId={p.id} className="mt-4 w-full" />}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
