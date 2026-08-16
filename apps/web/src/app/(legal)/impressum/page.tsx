export const metadata = { title: 'Podaci o pružaocu usluge — AdGen' };

/**
 * Provider-identification page.
 *
 * ⚠️ RE-FOUNDED 2026-08-16. This page used to be a GERMAN Impressum: it cited
 * § 5 DDG, USt-IdNr under § 27a UStG and the § 19 UStG small-business rule,
 * because the plan at the time was an EU/German operation. That plan is gone —
 * the operator is a **Wyoming LLC** — so every German statute reference has
 * been removed rather than translated. Citing a statute that does not apply to
 * you is worse than citing none.
 *
 * Why the page still exists at all, and still lives at /impressum: a US company
 * has no Impressum duty, but a trader selling to consumers in Serbia and the EU
 * still has to say plainly WHO is selling and how to reach them — and the path
 * is linked from the landing footer and the app shell, so it stays put.
 *
 * The values below are STATEMENTS OF FACT about a real company. They are left
 * as labelled blanks on purpose: an invented address on a page like this is
 * worse than an obviously unfinished one, because it looks finished and nobody
 * comes back to fix it. Fill them from the LLC's formation documents.
 */
export default function ImpressumPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold text-txt-hi">Podaci o pružaocu usluge</h1>
      <p className="text-txt-mid">Ko stoji iza sajta i kako da nas kontaktiraš. Poslednja izmena: 16. 8. 2026.</p>

      <div className="rounded-xl border border-err/40 bg-err/10 p-4 text-sm text-err-text">
        <p className="font-semibold">Podaci ispod još nisu popunjeni.</p>
        <p className="mt-1 text-err-text">
          Ova stranica je zvanična izjava o tome ko pruža uslugu, a ne marketinški tekst. Ništa ovde nije popunjeno
          izmišljenim podacima — vrednosti moraju doći iz osnivačkih dokumenata firme.
        </p>
      </div>

      <h2 className="text-lg font-semibold text-txt-hi">Pružalac usluge</h2>
      <p>
        [[POPUNITI: pun pravni naziv firme, npr. „Primer LLC”]]
        <br />
        [[POPUNITI: ulica i broj sedišta / registrovanog agenta]]
        <br />
        [[POPUNITI: grad, država (Wyoming), poštanski broj]]
        <br />
        Sjedinjene Američke Države
      </p>

      <h2 className="text-lg font-semibold text-txt-hi">Pravni oblik i registracija</h2>
      <p>
        Društvo sa ograničenom odgovornošću (Limited Liability Company) osnovano u državi Vajoming, SAD.
        <br />
        Registarski broj: [[POPUNITI: Filing ID iz Wyoming Secretary of State]]
        <br />
        Registrovani agent: [[POPUNITI: naziv i adresa registrovanog agenta]]
      </p>

      <h2 className="text-lg font-semibold text-txt-hi">Kontakt</h2>
      <p>
        Email: [[POPUNITI: kontakt email adresa]]
        <br />
        Na poruke odgovaramo u roku od 5 radnih dana.
      </p>
      <p className="text-txt-mid">
        Email je jedini zvanični kanal za reklamacije, zahteve u vezi sa podacima i raskid naloga. Poruke poslate
        društvenim mrežama ne smatraju se primljenim.
      </p>

      <h2 className="text-lg font-semibold text-txt-hi">Odgovoran za sadržaj</h2>
      <p>[[POPUNITI: ime i prezime odgovornog lica]], na adresi navedenoj iznad.</p>

      <h2 className="text-lg font-semibold text-txt-hi">Rešavanje sporova</h2>
      <p>
        Reklamaciju prvo pošalji na email iznad — najveći deo nesporazuma rešava se tako, bez ikakvog postupka.
      </p>
      <p>
        Nismo obavezni niti spremni da učestvujemo u postupku pred telom za vansudsko rešavanje potrošačkih sporova.
        Ako si potrošač, to te ne lišava prava koja ti daju prinudni propisi države u kojoj imaš uobičajeno boravište
        — vidi tačku 13.{' '}
        <a href="/uslovi" className="focus-ring rounded text-accent-text hover:underline">
          Uslova korišćenja
        </a>
        .
      </p>
    </>
  );
}
