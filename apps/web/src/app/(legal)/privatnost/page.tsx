export const metadata = { title: 'Politika privatnosti — AdGen' };

/**
 * The processor list here is not boilerplate — it was assembled from the
 * providers the code actually calls (`packages/core/src/providers/`) and the
 * infrastructure it actually runs on. Keep it in step with `factory.ts`: adding
 * a provider adds a recipient of user data, and this page is where that has to
 * be declared.
 */
export default function PrivatnostPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold text-txt-hi">Politika privatnosti</h1>
      <p className="text-txt-mid">Poslednja izmena: 10. 8. 2026.</p>

      <h2 className="text-lg font-semibold text-txt-hi">1. Ko obrađuje tvoje podatke</h2>
      <p>
        Rukovalac podacima je [[POPUNITI: pun pravni naziv nosioca delatnosti]], [[POPUNITI: adresa]]. Kontakt za sva
        pitanja o podacima: [[POPUNITI: email adresa za zaštitu podataka]].
      </p>

      <h2 className="text-lg font-semibold text-txt-hi">2. Koje podatke prikupljamo i zašto</h2>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-line text-txt-mid">
            <th className="py-2 pr-4 font-medium">Podatak</th>
            <th className="py-2 pr-4 font-medium">Zašto</th>
            <th className="py-2 font-medium">Pravni osnov</th>
          </tr>
        </thead>
        <tbody className="align-top">
          <tr className="border-b border-line">
            <td className="py-2 pr-4">Email adresa i lozinka (u obliku heša)</td>
            <td className="py-2 pr-4">Nalog i prijava</td>
            <td className="py-2">Izvršenje ugovora</td>
          </tr>
          <tr className="border-b border-line">
            <td className="py-2 pr-4">Stanje kredita i istorija zaduženja</td>
            <td className="py-2 pr-4">Naplata i evidencija šta je plaćeno</td>
            <td className="py-2">Izvršenje ugovora; zakonska obaveza čuvanja</td>
          </tr>
          <tr className="border-b border-line">
            <td className="py-2 pr-4">Fajlovi koje otpremiš — snimci, slike, zvuk</td>
            <td className="py-2 pr-4">Izrada reklame koju si naručio</td>
            <td className="py-2">Izvršenje ugovora</td>
          </tr>
          <tr className="border-b border-line">
            <td className="py-2 pr-4">Tekst koji unosiš — naziv proizvoda, cena, prednosti</td>
            <td className="py-2 pr-4">Pisanje skripte za reklamu</td>
            <td className="py-2">Izvršenje ugovora</td>
          </tr>
          <tr className="border-b border-line">
            <td className="py-2 pr-4">Linkovi koje zalepiš i rezultati pretrage snimaka</td>
            <td className="py-2 pr-4">Uvoz izvornog materijala</td>
            <td className="py-2">Izvršenje ugovora</td>
          </tr>
          <tr>
            <td className="py-2 pr-4">Gotove reklame i međukorišćeni fajlovi</td>
            <td className="py-2 pr-4">Da ih možeš preuzeti iz „Moje reklame”</td>
            <td className="py-2">Izvršenje ugovora</td>
          </tr>
        </tbody>
      </table>
      <p>
        Ne prodajemo podatke, ne koristimo ih za profilisanje i ne prikazujemo reklame trećih lica. Ne tražimo podatke
        o kartici — [[POPUNITI: naziv budućeg procesora plaćanja]] obrađuje plaćanje i mi nikada ne vidimo broj
        kartice.
      </p>

      <h2 className="text-lg font-semibold text-txt-hi">3. Kome se podaci prosleđuju</h2>
      <p>
        Da bi se reklama napravila, delovi tvog sadržaja se šalju spoljnim servisima. Ovo je potpun spisak onoga što
        aplikacija stvarno poziva:
      </p>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-line text-txt-mid">
            <th className="py-2 pr-4 font-medium">Servis</th>
            <th className="py-2 pr-4 font-medium">Šta dobija</th>
            <th className="py-2 font-medium">Gde</th>
          </tr>
        </thead>
        <tbody className="align-top">
          <tr className="border-b border-line">
            <td className="py-2 pr-4">Supabase</td>
            <td className="py-2 pr-4">Nalog, email, stanje kredita, evidencija poslova</td>
            <td className="py-2">[[POPUNITI: region Supabase projekta]]</td>
          </tr>
          <tr className="border-b border-line">
            <td className="py-2 pr-4">Hetzner</td>
            <td className="py-2 pr-4">Server na kom se poslovi obrađuju</td>
            <td className="py-2">Nemačka (EU)</td>
          </tr>
          <tr className="border-b border-line">
            <td className="py-2 pr-4">OpenRouter</td>
            <td className="py-2 pr-4">Naziv proizvoda, cena i prednosti — radi pisanja skripte. Prosleđuje ih modelu koji izvršava zahtev.</td>
            <td className="py-2">SAD i dalje, zavisno od modela</td>
          </tr>
          <tr className="border-b border-line">
            <td className="py-2 pr-4">ElevenLabs</td>
            <td className="py-2 pr-4">Tekst skripte — radi izgovora</td>
            <td className="py-2">SAD</td>
          </tr>
          <tr className="border-b border-line">
            <td className="py-2 pr-4">kie.ai i fal.ai</td>
            <td className="py-2 pr-4">Opis proizvoda i fajlovi koje obrađuju (slike, snimci)</td>
            <td className="py-2">[[POPUNITI: proveriti jurisdikciju oba — bitno za prenos van EU]]</td>
          </tr>
          <tr className="border-b border-line">
            <td className="py-2 pr-4">Cloudflare R2</td>
            <td className="py-2 pr-4">Čuvanje gotovih reklama i otpremljenih fajlova</td>
            <td className="py-2">[[POPUNITI: izabrani region kante]]</td>
          </tr>
          <tr>
            <td className="py-2 pr-4">YouTube</td>
            <td className="py-2 pr-4">Upit koji ukucaš u pretragu snimaka</td>
            <td className="py-2">SAD</td>
          </tr>
        </tbody>
      </table>
      <p className="rounded-lg border border-line bg-panel-2 p-3">
        <strong className="text-txt-hi">Prenos van EU.</strong> Više servisa sa spiska je izvan Evropske unije. Za
        svaki od njih potrebno je proveriti osnov za prenos — standardne ugovorne klauzule ili odluka o adekvatnosti —
        i to je jedna od stavki koju [[POPUNITI: advokat / poreski savetnik]] mora da potvrdi pre lansiranja.
      </p>

      <h2 className="text-lg font-semibold text-txt-hi">4. Koliko dugo čuvamo</h2>
      <p>
        <strong className="text-txt-hi">Fajlove čuvamo 30 dana.</strong> To važi i za materijal koji otpremiš i za
        gotove reklame — posle 30 dana brišu se automatski i ne mogu se povratiti. Zvučni zapisi koji nastanu usput
        (izgovorena skripta pre nego što se ugradi u video) brišu se ranije, jer posle ugradnje nemaju svrhu.
      </p>
      <p>
        Nalog i evidenciju kredita čuvamo dok postoji nalog, a zatim onoliko koliko nalažu propisi o čuvanju poslovne
        dokumentacije ([[POPUNITI: rok po važećem propisu — u Nemačkoj po pravilu 6 ili 10 godina za knjigovodstvene
        isprave; potvrditi sa poreskim savetnikom]]). Kad se nalog obriše, brišu se i svi vezani fajlovi, bez čekanja
        na rok od 30 dana.
      </p>

      <h2 className="text-lg font-semibold text-txt-hi">5. Tvoja prava</h2>
      <p>
        Imaš pravo da tražiš uvid u svoje podatke, ispravku, brisanje, ograničenje obrade, prenosivost i prigovor na
        obradu. Zahtev šalješ na [[POPUNITI: email adresa]]. Odgovaramo najkasnije u roku od 30 dana. Ako smatraš da
        obrađujemo podatke protivno propisima, možeš se obratiti nadzornom organu — [[POPUNITI: nadležni organ prema
        sedištu]].
      </p>

      <h2 className="text-lg font-semibold text-txt-hi">6. Kolačići</h2>
      <p>
        Postoje tačno dva, oba su naša (nema kolačića trećih strana) i nijedan ne prati tvoje ponašanje:
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-txt-low">
            <tr>
              <th className="py-2 pr-4 font-medium">Kolačić</th>
              <th className="py-2 pr-4 font-medium">Čemu služi</th>
              <th className="py-2 font-medium">Koliko traje</th>
            </tr>
          </thead>
          <tbody className="align-top">
            <tr className="border-t border-line">
              <td className="py-2 pr-4 font-mono text-xs">sb-…-auth-token</td>
              <td className="py-2 pr-4">
                Drži te prijavljenim. Bez njega bi te svaka stranica ponovo tražila da se uloguješ.
              </td>
              <td className="py-2">do odjave</td>
            </tr>
            <tr className="border-t border-line">
              <td className="py-2 pr-4 font-mono text-xs">adgen-theme</td>
              <td className="py-2 pr-4">
                Pamti temu koju si izabrao. Postavlja se tek kad je sam izabereš — ako je ne diraš, ne postoji.
              </td>
              <td className="py-2">godinu dana</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Oba su neophodna za funkciju koju si sam zatražio, pa za njih po propisu nije potreban pristanak i
        <strong className="text-txt-hi"> nema banera za kolačiće</strong>. Nema analitike, nema piksela za reklame, nema
        praćenja između sajtova.
      </p>
      <p className="text-txt-mid">
        Ako se analitika ikada uvede, ovaj odeljak i pristanak moraju se urediti <em>pre</em> nego što se uvede, ne
        posle.
      </p>

      <h2 className="text-lg font-semibold text-txt-hi">7. Sadržaj koji generiše veštačka inteligencija</h2>
      <p>
        Skripte, glas i slike pravi veštačka inteligencija na osnovu onoga što uneseš. Rezultat može biti netačan ili
        neprikladan i <strong className="text-txt-hi">ti si odgovoran da ga pregledaš pre objave</strong>. Posebno:
        ako uvezeš tuđi snimak, u kadru može ostati vodeni žig ili korisničko ime druge osobe — proveri svaki snimak
        pre nego što ga upotrebiš u reklami.
      </p>
    </>
  );
}
