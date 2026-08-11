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
        <p className="mt-1 text-err-text">
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
        Nismo obavezni niti spremni da učestvujemo u postupku za mirno rešavanje sporova pred telom za rešavanje
        potrošačkih sporova.
      </p>
      <p className="text-txt-mid">
        [[PROVERITI: ovo je uobičajena izjava za malog preduzetnika i obe varijante su dozvoljene — ali izjava mora
        odgovarati stvarnoj nameri. Ako se opredeliš za učešće, mora se navesti i konkretno nadležno telo.]]
      </p>
      <p className="text-txt-mid">
        [[PROVERITI: raniji tekst je upućivao na ODR platformu Evropske komisije. Ta platforma je ugašena tokom 2025.
        godine, pa je upućivanje uklonjeno — potvrditi pre objave da obaveza upućivanja više ne postoji.]]
      </p>
    </>
  );
}
