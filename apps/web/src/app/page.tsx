import Link from 'next/link';
import { JOB_DESCRIPTORS, SIGNUP_BONUS_CREDITS } from '@adgen/core';
import { MainToolCard, UtilityToolCard } from '@/components/tool-cards';
import { ThemeSwitcher } from '@/components/theme-switcher';

/**
 * Public landing page — EcomAlati-style hero + tool cards.
 * Reads job descriptors + pricing from @adgen/core (single source of truth).
 * Tool cards reuse MainToolCard/UtilityToolCard from the dashboard so the two
 * screens cannot drift.
 */
export default function LandingPage() {
  const mainTools = JOB_DESCRIPTORS.filter((t) => t.tier === 'main');
  const utilityTools = JOB_DESCRIPTORS.filter((t) => t.tier !== 'main');

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
              Zalepi link proizvoda, mi generišemo skriptu, glas, titl, muziku i
              CTA. Vertikalni video spreman za TikTok, Reels i Shorts — za minute.
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
              {SIGNUP_BONUS_CREDITS} besplatna videa na registraciji · Bez kartice
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {mainTools.map((t) => (
            <MainToolCard
              key={t.type}
              icon={t.icon}
              label={t.label}
              description={t.description}
              cost={t.cost}
              soon={t.type === 'ai_video'}
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
              soon={t.type === 'ai_video'}
            />
          ))}
        </div>
      </section>

      {/* Footer-ish note */}
      <section className="container-app pb-16 text-center text-xs text-txt-low">
        <p>
          Plaćaš pouzećem · Srpski, Bosanski, Hrvatski, Rumunski, Engleski ·
          Tvoj račun, tvoji podaci
        </p>
        {/*
          Legal links belong on every page a visitor can reach, and in Germany
          the Impressum specifically must be reachable in two clicks from
          anywhere. This is the landing page only — the app shell still needs
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
            Impressum
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
