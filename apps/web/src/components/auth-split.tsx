import Link from 'next/link';
import { SIGNUP_BONUS_CREDITS, creditsLabel } from '@adgen/core/pricing';
import { cn } from '@/lib/utils';

/**
 * The shell both auth pages sit in: a brand half and a form half.
 *
 * Owner, 2026-08-20, pointing at the competitor's login: he wants it "light and
 * simple — just written out like that". Their shape is a two-up split, the left
 * side selling in three lines and two chips, the right side nothing but the
 * form. This is that shape in OUR identity — violet, one organic hue bleed, no
 * bordered boxes — not a copy of their page: their headline and their offer copy
 * stay theirs.
 *
 * ONE CLAIM WE DO NOT MAKE: their chip promises "3 besplatna videa". Our signup
 * bonus is 3 CREDITS, and the cheapest video tool costs 8, so that sentence
 * would be false here — `freeVideosLabel` exists and would happily print it.
 * The chip below says credits, which is what the account actually receives.
 *
 * Below `lg` the brand half collapses to a single line above the form: on a
 * phone the form is the whole job, and a full-height marketing panel would push
 * it under the fold.
 */
export function AuthSplit({
  active,
  title,
  subtitle,
  children,
}: {
  /** Which tab is lit — also which page this is. */
  active: 'login' | 'signup';
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <main className="relative min-h-screen lg:flex lg:items-stretch">
      <BrandHalf />

      <div className="relative flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
        <div className="spotlight" aria-hidden="true" />
        <div className="w-full max-w-sm animate-fade-in">
          <h1 className="font-display text-3xl font-bold text-txt-hi sm:text-4xl">{title}</h1>
          <p className="mt-2 text-sm text-txt-mid">{subtitle}</p>

          <AuthTabs active={active} />

          {children}

          <p className="mt-8 text-center text-xs text-txt-low">
            <Link
              href="/"
              className="focus-ring rounded underline-offset-4 hover:text-txt-mid hover:underline"
            >
              ← Nazad na početnu
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

/**
 * Prijava / Registracija as one capsule with two halves — the same segmented
 * shape the step rail uses, so the app has one idea of what "pick one of these"
 * looks like. They are LINKS, not tabs: login and signup are separate routes
 * with separate forms, and making them look like tabs while being navigation is
 * only a lie if the destination surprises you — it does not.
 */
function AuthTabs({ active }: { active: 'login' | 'signup' }) {
  const base =
    'focus-ring flex-1 rounded-full px-4 py-2 text-center text-sm font-semibold transition';
  return (
    <nav aria-label="Prijava ili registracija" className="mt-6 flex gap-1 rounded-full bg-panel-2 p-1">
      <Link
        href="/login"
        aria-current={active === 'login' ? 'page' : undefined}
        className={cn(base, active === 'login' ? 'bg-panel text-txt-hi shadow-card' : 'text-txt-mid hover:text-txt-hi')}
      >
        Prijava
      </Link>
      <Link
        href="/signup"
        aria-current={active === 'signup' ? 'page' : undefined}
        className={cn(base, active === 'signup' ? 'bg-panel text-txt-hi shadow-card' : 'text-txt-mid hover:text-txt-hi')}
      >
        Registracija
      </Link>
    </nav>
  );
}

/** The selling half. Full height beside the form on lg, one quiet line below it. */
function BrandHalf() {
  return (
    <aside className="auth-brand lg:w-[46%] lg:shrink-0">
      <div className="flex h-full flex-col justify-between gap-10 px-6 py-8 sm:px-10 lg:px-14 lg:py-14">
        <p className="font-display text-lg font-bold text-txt-hi">AdGen</p>

        <div className="hidden lg:block">
          <h2 className="font-display text-4xl font-bold leading-[1.05] text-txt-hi xl:text-5xl">
            Od linka
            <br />
            do reklame.
          </h2>
          <p className="mt-5 max-w-sm text-base text-txt-mid">
            Nalepi link proizvoda i dobij gotov video za TikTok, Reels i Shorts — glas,
            titlovi i montaža idu automatski.
          </p>
        </div>

        <div className="hidden gap-3 sm:grid sm:grid-cols-2 lg:grid">
          <Chip strong={`${creditsLabel(SIGNUP_BONUS_CREDITS)} na poklon`} rest="čim napraviš nalog, bez kartice." />
          <Chip strong="Jedan novčanik" rest="isti krediti važe u svim alatima." />
        </div>
      </div>
    </aside>
  );
}

function Chip({ strong, rest }: { strong: string; rest: string }) {
  return (
    <p className="auth-chip">
      <span className="font-semibold text-txt-hi">{strong}</span> {rest}
    </p>
  );
}
