import Link from 'next/link';

/**
 * Shared shell for the legal pages.
 *
 * ⚠️ These documents are DRAFTS written from what the codebase actually does —
 * which data is collected, which processor touches it, where it is stored. That
 * part is accurate and is the part an outside lawyer cannot write for you.
 * What they are NOT is legal advice or a reviewed text, and they carry
 * `[[POPUNITI: …]]` markers wherever a real-world fact is required that must
 * not be invented (company name, address, tax id). Impressum data in
 * particular is a statutory declaration — a fabricated one is worse than none.
 *
 * The banner below is deliberately loud and deliberately in the page, not just
 * in a comment: it must be impossible to publish these by accident and believe
 * the site is covered.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <nav className="mb-8 flex flex-wrap items-center gap-4 text-sm">
        <Link href="/" className="text-brand-200 hover:underline">
          ← Početna
        </Link>
        <Link href="/uslovi" className="text-zinc-400 hover:text-zinc-200">
          Uslovi korišćenja
        </Link>
        <Link href="/privatnost" className="text-zinc-400 hover:text-zinc-200">
          Privatnost
        </Link>
        <Link href="/impressum" className="text-zinc-400 hover:text-zinc-200">
          Impressum
        </Link>
      </nav>

      <div className="mb-8 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
        <p className="font-semibold">Nacrt — nije pravno pregledan.</p>
        <p className="mt-1 text-amber-100/80">
          Ovaj tekst opisuje šta aplikacija stvarno radi sa podacima, ali ga nije pregledao advokat niti poreski
          savetnik. Sva mesta označena sa <code className="rounded bg-black/30 px-1">[[POPUNITI: …]]</code> moraju se
          popuniti stvarnim podacima pre nego što sajt primi ijednog pravog korisnika.
        </p>
      </div>

      <article className="prose-legal space-y-6 text-sm leading-relaxed text-zinc-300">{children}</article>
    </div>
  );
}
