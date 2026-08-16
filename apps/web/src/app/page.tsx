import Link from 'next/link';
import { JOB_DESCRIPTORS, SIGNUP_BONUS_CREDITS } from '@adgen/core';
import { freeVideosLabel } from '@adgen/core/pricing';
import { MainToolCard, UtilityToolCard } from '@/components/tool-cards';
import { ThemeSwitcher } from '@/components/theme-switcher';
import { isToolSoon } from '@/lib/live-tools';

/**
 * Public landing page — EcomAlati-style hero + tool cards.
 * Reads job descriptors + pricing from @adgen/core (single source of truth).
 * Tool cards reuse MainToolCard/UtilityToolCard from the dashboard so the two
 * screens cannot drift.
 *
 * The USKORO badge comes from `isToolSoon`, the same list the dashboard uses.
 * It used to be hard-coded here as `t.type === 'ai_video'`, which meant this
 * page — the first thing a stranger sees — advertised `quick_test`, `edit`,
 * `mix` and `translate` with prices while the dashboard already knew none of
 * them had a pipeline.
 */
export default function LandingPage() {
  /**
   * ONLY the tools that work. Owner's call 2026-08-16, and it is the second
   * half of a fix started on 2026-08-14: the badge stopped lying then, but the
   * page still opened with ten cards of which five said USKORO, so a stranger's
   * first impression was a half-built catalogue — with the five that DO work
   * buried among them. The dashboard still shows everything, badge and all;
   * that is where a signed-in user should see what is coming.
   */
  const liveTools = JOB_DESCRIPTORS.filter((t) => !isToolSoon(t.type));
  const mainTools = liveTools.filter((t) => t.tier === 'main');
  const utilityTools = liveTools.filter((t) => t.tier !== 'main');

  return (
    <main className="relative min-h-screen">
      <div className="ambient ambient--a" aria-hidden="true" />
      <div className="ambient ambient--b" aria-hidden="true" />

      {/* Hero */}
      <section className="container-app relative pt-20 pb-16 sm:pt-28">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="animate-fade-in text-center lg:text-left">
            <span className="badge mb-5">COD e-commerce · Balkan</span>
            <h1 className="font-display text-[clamp(44px,8vw,88px)] font-extrabold leading-[0.95] tracking-head-tight">
              AI reklame koje{' '}
              <span className="bg-text-grad bg-clip-text text-transparent">
                prodaju
              </span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-balance text-base text-txt-mid sm:text-lg lg:mx-0">
              Zalepi link proizvoda, mi generišemo skriptu, glas, titl i CTA.
              Vertikalni video spreman za TikTok, Reels i Shorts — za minute.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
              <Link href="/signup" className="btn-primary w-full sm:w-auto">
                Probaj besplatno
              </Link>
              <Link href="/login" className="btn-ghost w-full sm:w-auto">
                Uloguj se
              </Link>
            </div>
            <p className="mt-4 text-sm text-txt-mid">
              {freeVideosLabel(SIGNUP_BONUS_CREDITS)} na registraciji · Bez kartice
            </p>
          </div>

          <div className="animate-fade-in flex justify-center">
            <div className="phone-frame">
              {/* txt-mid, not txt-low: the frame is filled with --panel-2, which is
                  lighter than the ground, so the quietest text token measured
                  4.32:1 in obsidian against it — under the bar for 12px text. */}
              <span className="font-mono tabular text-xs text-txt-mid">1080×1920</span>
            </div>
          </div>
        </div>
      </section>

      {/* Tool cards */}
      <section className="container-app pb-24">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold sm:text-3xl">Alati</h2>
            <p className="mt-1 text-sm text-txt-mid">
              Svaki alat radi zasebno ili u kombinaciji.
            </p>
          </div>
        </div>

        {/*
          Same grid shape as the dashboard (two wide cards per row), and the
          same props — `theme` for the colour wash and `benefits` for the
          check-marked lines. Both already exist on every descriptor; the
          landing simply never passed them, which is why the two screens looked
          like different products while sharing one component.

          `showCost` is off on purpose: see the prop's comment in tool-cards.
        */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {mainTools.map((t) => (
            // Every card — main and utility alike — points at /signup: a
            // signed-out visitor cannot open a wizard, so the card is an
            // advert for the tool rather than a way into it.
            <MainToolCard
              key={t.type}
              icon={t.icon}
              label={t.label}
              description={t.description}
              cost={t.cost}
              benefits={t.benefits}
              theme={t.theme}
              showCost={false}
              href="/signup"
              className="xl:col-span-2"
            />
          ))}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {utilityTools.map((t) => (
            <UtilityToolCard
              key={t.type}
              icon={t.icon}
              label={t.label}
              description={t.description}
              cost={t.cost}
              showCost={false}
              href="/signup"
            />
          ))}
        </div>
      </section>

      {/* Footer-ish note */}
      <section className="container-app pb-16 text-center text-xs text-txt-low">
        <p>
          Za prodaju pouzećem · Srpski, Bosanski, Hrvatski, Rumunski, Engleski ·
          Tvoj račun, tvoji podaci
        </p>
        {/*
          Legal links belong on every page a visitor can reach. The two-clicks
          rule they were placed for was Germany's Impressum duty, which no
          longer applies — the operator is a Wyoming LLC since 2026-08-16 — but
          the placement stays: a customer in Serbia or the EU still has to be
          able to find who is selling to them without hunting. This is the landing page only — the app shell still needs
          the same links before launch.
        */}
        <p className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <Link href="/uslovi" className="focus-ring rounded hover:text-txt-mid">
            Uslovi korišćenja
          </Link>
          <span aria-hidden>·</span>
          <Link href="/privatnost" className="focus-ring rounded hover:text-txt-mid">
            Privatnost
          </Link>
          <span aria-hidden>·</span>
          <Link href="/impressum" className="focus-ring rounded hover:text-txt-mid">
            Podaci o firmi
          </Link>
        </p>
        {/* Logged-out visitors get the same theme control as signed-in ones. */}
        <div className="mt-5 flex justify-center">
          <ThemeSwitcher />
        </div>
      </section>
    </main>
  );
}
