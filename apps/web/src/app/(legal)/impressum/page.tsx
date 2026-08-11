export const metadata = { title: 'Impressum — AdGen' };

/**
 * ⚠️ Every value on this page is a STATUTORY DECLARATION, not marketing copy.
 * In Germany an Impressum is required by §5 DDG and a wrong or missing one is
 * an actionable offence (Abmahnung). Nothing here may be guessed: the legal
 * name, address, register entry and VAT id must come from the owner's actual
 * Gewerbe/registration documents.
 *
 * That is why this file ships as a skeleton of labelled blanks rather than
 * plausible-looking sample data. A realistic-but-invented Impressum is worse
 * than an obviously incomplete one, because it looks finished and nobody goes
 * back to fix it.
 */
export default function ImpressumPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold text-txt-hi">Impressum</h1>
      <p className="text-txt-mid">Podaci u skladu sa § 5 DDG.</p>

      <div className="rounded-xl border border-err/40 bg-err/10 p-4 text-sm text-err-text">
        <p className="font-semibold">Ništa na ovoj stranici nije popunjeno izmišljenim podacima — namerno.</p>
        <p className="mt-1 text-err-text opacity-80">
          Impressum je zvanična izjava, ne marketinški tekst. Pogrešan ili izmišljen podatak je prekršaj i osnov za
          opomenu (Abmahnung). Svaka vrednost mora doći iz stvarnih dokumenata o registraciji delatnosti.
        </p>
      </div>

      <h2 className="text-lg font-semibold text-txt-hi">Nosilac delatnosti</h2>
      <p>
        [[POPUNITI: ime i prezime nosioca Gewerbe-a ili pun naziv firme]]
        <br />
        [[POPUNITI: ulica i broj]]
        <br />
        [[POPUNITI: poštanski broj i grad]]
        <br />
        [[POPUNITI: država]]
      </p>

      <h2 className="text-lg font-semibold text-txt-hi">Kontakt</h2>
      <p>
        Email: [[POPUNITI: email adresa]]
        <br />
        Telefon: [[POPUNITI: broj telefona — obavezan podatak]]
      </p>

      <h2 className="text-lg font-semibold text-txt-hi">Poreski podaci</h2>
      <p>
        Poreski identifikacioni broj (USt-IdNr) po § 27a UStG: [[POPUNITI: USt-IdNr ili napomena da mali preduzetnik
        po § 19 UStG ne iskazuje PDV]]
      </p>

      <h2 className="text-lg font-semibold text-txt-hi">Registracija</h2>
      <p>
        [[POPUNITI: registar i broj upisa, ako postoji. Za Gewerbe bez upisa u registar — izostaviti ovaj odeljak, ne
        izmišljati broj.]]
      </p>

      <h2 className="text-lg font-semibold text-txt-hi">Odgovoran za sadržaj</h2>
      <p>[[POPUNITI: ime i adresa odgovornog lica — po pravilu isto lice kao nosilac delatnosti]]</p>

      <h2 className="text-lg font-semibold text-txt-hi">Rešavanje sporova</h2>
      <p>
        Evropska komisija vodi platformu za onlajn rešavanje sporova:{' '}
        <a
          href="https://ec.europa.eu/consumers/odr/"
          className="text-accent-text hover:underline"
          rel="noreferrer noopener"
          target="_blank"
        >
          ec.europa.eu/consumers/odr
        </a>
        .
      </p>
      <p>
        [[POPUNITI: izjava o spremnosti ili nespremnosti za učešće u postupku pred telom za mirno rešavanje
        potrošačkih sporova — obavezna izjava, obe varijante su dozvoljene ali jedna mora stajati.]]
      </p>
    </>
  );
}
