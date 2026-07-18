import Link from 'next/link';
import { JOB_DESCRIPTORS, SIGNUP_BONUS_CREDITS } from '@adgen/core';
import { cn } from '@/lib/utils';
import { ToolIcon } from '@/components/tool-icon';

/**
 * Public landing page — EcomAlati-style hero + tool cards.
 * Reads job descriptors + pricing from @adgen/core (single source of truth).
 */
export default function LandingPage() {
  const tools = JOB_DESCRIPTORS;

  return (
    <main className="glow relative min-h-screen overflow-hidden">
      {/* Hero */}
      <section className="container-app relative pt-20 pb-16 sm:pt-28">
        <div className="mx-auto max-w-3xl text-center animate-fade-in">
          <span className="badge mb-5">COD e-commerce · Balkan</span>
          <h1 className="font-display text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl">
            AI reklame koje{' '}
            <span className="bg-gradient-to-r from-brand-300 to-brand-500 bg-clip-text text-transparent">
              prodaju
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-balance text-base text-zinc-300 sm:text-lg">
            Zalepi link proizvoda, mi generišemo skriptu, glas, titl, muziku i
            CTA. Vertikalni video spreman za TikTok, Reels i Shorts — za minute.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/signup" className="btn-primary w-full sm:w-auto">
              Probaj besplatno
            </Link>
            <Link href="/login" className="btn-ghost w-full sm:w-auto">
              Uloguj se
            </Link>
          </div>
          <p className="mt-4 text-sm text-zinc-400">
            {SIGNUP_BONUS_CREDITS} besplatna videa na registraciji · Bez kartice
          </p>
        </div>
      </section>

      {/* Tool cards */}
      <section className="container-app pb-24">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold sm:text-3xl">Alati</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Svaki alat radi zasebno ili u kombinaciji.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((t) => (
            <ToolCard
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
      <section className="container-app pb-16 text-center text-xs text-zinc-500">
        <p>
          Plaćaš pouzećem · Srpski, Bosanski, Hrvatski, Rumunski, Engleski ·
          Tvoj račun, tvoji podaci
        </p>
      </section>
    </main>
  );
}

function ToolCard({
  icon,
  label,
  description,
  cost,
  soon,
}: {
  icon?: string;
  label: string;
  description: string;
  cost: number;
  soon?: boolean;
}) {
  return (
    <div className={cn('card-gradient group transition hover:shadow-glow')}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <ToolIcon icon={icon} />
          <h3 className="font-display text-lg font-semibold">{label}</h3>
        </div>
        {soon ? (
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">
            Uskoro
          </span>
        ) : (
          <span className="badge">{cost} kredit{cost === 1 ? '' : 'a'}</span>
        )}
      </div>
      <p className="mt-2 text-sm text-zinc-300">{description}</p>
      <div className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-300 opacity-0 transition group-hover:opacity-100">
        Otvori →
      </div>
    </div>
  );
}