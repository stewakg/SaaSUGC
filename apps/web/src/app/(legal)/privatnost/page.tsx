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
      <p className="text-txt-mid">Poslednja izmena: 18. 8. 2026.</p>

      <h2 className="text-lg font-semibold text-txt-hi">1. Ko obrađuje tvoje podatke</h2>
      <p>
        Rukovalac podacima je [[POPUNITI: pun pravni naziv firme]], društvo osnovano u državi Vajoming, SAD,
        [[POPUNITI: adresa]]. Kontakt za sva pitanja o podacima: [[POPUNITI: email adresa]].
      </p>
      <p className="rounded-lg border border-line bg-panel-2 p-3">
        <strong className="text-txt-hi">Rukovalac je izvan Evropske unije.</strong> Firma je registrovana u SAD, a
        usluga se nudi korisnicima u Srbiji i Evropskoj uniji. Zato se na obradu tvojih podataka primenjuju i Opšta
        uredba o zaštiti podataka (GDPR), jer nudimo uslugu licima u EU, i srpski Zakon o zaštiti podataka o
        ličnosti za korisnike iz Srbije. Sedište firme ne menja tvoja prava iz odeljka 5.
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
          <tr className="border-b border-line">
            <td className="py-2 pr-4">Gotove reklame i međukorišćeni fajlovi</td>
            <td className="py-2 pr-4">Da ih možeš preuzeti iz „Moje reklame”</td>
            <td className="py-2">Izvršenje ugovora</td>
          </tr>
          <tr>
            <td className="py-2 pr-4">Tehnički zapisi servera — IP adresa, vreme zahteva, greške</td>
            <td className="py-2 pr-4">Bezbednost, otkrivanje zloupotrebe i ispravljanje kvarova</td>
            <td className="py-2">Legitiman interes (siguran rad usluge)</td>
          </tr>
        </tbody>
      </table>
      <p>
        Ne prodajemo podatke, ne koristimo ih za profilisanje i ne prikazujemo reklame trećih lica.
      </p>
      <p>
        <strong className="text-txt-hi">Plaćanje još nije uključeno.</strong> Dok se ne uključi, na sajtu se ništa ne
        naplaćuje i podaci o kartici se nigde ne prikupljaju. Kada naplata proradi, obrađivaće je spoljni procesor
        plaćanja i broj kartice nikada neće doći do nas — a ova stranica će pre toga biti dopunjena njegovim imenom,
        po pravilu iz odeljka 9.
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
            <td className="py-2">Evropska unija (EU jurisdikcija kante)</td>
          </tr>
          <tr>
            <td className="py-2 pr-4">YouTube</td>
            <td className="py-2 pr-4">Upit koji ukucaš u pretragu snimaka</td>
            <td className="py-2">SAD</td>
          </tr>
        </tbody>
      </table>
      <p className="rounded-lg border border-line bg-panel-2 p-3">
        <strong className="text-txt-hi">Prenos van EU.</strong> Više servisa sa spiska je izvan Evropske unije, a od
        2026. i sam rukovalac je firma u SAD — što znači da podaci korisnika iz EU i Srbije napuštaju te teritorije
        već time što ih mi obrađujemo. Za prenos se oslanjamo na standardne ugovorne klauzule koje ovi pružaoci nude
        u svojim uslovima obrade podataka. Ako ti je za tvoju upotrebu potrebno da podaci ostanu u EU, ova usluga ti
        u ovom obliku ne odgovara — recimo to otvoreno umesto da se krije u fusnoti.
      </p>

      <h2 className="text-lg font-semibold text-txt-hi">4. Koliko dugo čuvamo</h2>
      <p>
        <strong className="text-txt-hi">Fajlove čuvamo 30 dana.</strong> To važi i za materijal koji otpremiš i za
        gotove reklame — posle 30 dana brišu se automatski i ne mogu se povratiti. Zvučni zapisi koji nastanu usput
        (izgovorena skripta pre nego što se ugradi u video) brišu se ranije, jer posle ugradnje nemaju svrhu.
      </p>
      <p>
        Nalog i evidenciju kredita čuvamo dok postoji nalog. Posle zatvaranja naloga zadržavamo samo ono što je
        potrebno za poslovne knjige — datum, iznos i broj računa za svaku kupovinu — i to najviše 7 godina, koliko
        traje obaveza čuvanja poslovne dokumentacije za firmu u SAD. Sadržaj koji si napravio ili otpremio ne spada u
        to: kad se nalog obriše, brišu se i svi vezani fajlovi, bez čekanja na rok od 30 dana.
      </p>
      <p>
        Tehničke zapise servera iz odeljka 2 (IP adresa, vreme zahteva, greške) čuvamo najviše 30 dana, posle čega se
        brišu.
      </p>

      <h2 className="text-lg font-semibold text-txt-hi">5. Tvoja prava</h2>
      <p>
        Imaš pravo da tražiš uvid u svoje podatke, ispravku, brisanje, ograničenje obrade, prenosivost i prigovor na
        obradu. Zahtev šalješ na [[POPUNITI: email adresa]]. Odgovaramo najkasnije u roku od 30 dana. Ako smatraš da
        obrađujemo podatke protivno propisima, možeš se obratiti nadzornom organu. Pošto je rukovalac u SAD, to je
        organ u tvojoj zemlji: u Srbiji <strong className="text-txt-hi">Poverenik za informacije od javnog značaja i
        zaštitu podataka o ličnosti</strong>, a u Evropskoj uniji nadzorni organ države u kojoj imaš boravište.
      </p>
      <p>
        Umesto brisanja možeš tražiti i <strong className="text-txt-hi">anonimizaciju</strong>: nalog i sadržaj se
        brišu, a u poslovnim knjigama ostaje samo zapis o uplati, bez podataka koji te identifikuju.
      </p>

      <h2 className="text-lg font-semibold text-txt-hi">6. Kolačići</h2>
      <p>
        Postoje tačno tri, svi su naši (nema kolačića trećih strana) i nijedan ne prati tvoje ponašanje:
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
            <tr className="border-t border-line">
              <td className="py-2 pr-4 font-mono text-xs">adgen_tz</td>
              <td className="py-2 pr-4">
                Pamti vremensku zonu u kojoj želiš da vidiš datume. Postavlja se tek kad je izabereš u profilu — ako
                je ne diraš, ne postoji.
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

      <h2 className="text-lg font-semibold text-txt-hi">7. Bezbednost</h2>
      <p>
        Saobraćaj između tvog pregledača i naših servera ide preko šifrovane veze, lozinke se čuvaju isključivo kao
        kriptografski otisak (nikada u čitljivom obliku), a pristup produkcionim podacima ima samo lice koje održava
        sistem. Fajlovi koje otpremiš i gotove reklame ne stoje na javno dostupnoj adresi — server ih izdaje tek
        pošto proveri da je nalog koji ih traži njihov vlasnik, i to preko linka koji ističe.
      </p>
      <p className="text-txt-mid">
        Nijedan sistem nije potpuno siguran i ne tvrdimo suprotno. Ako dođe do povrede podataka koja može da ti
        naškodi, obaveštavamo te emailom i prijavljujemo je nadzornom organu u rokovima koje propis nalaže.
      </p>

      <h2 className="text-lg font-semibold text-txt-hi">8. Deca</h2>
      <p>
        Usluga nije namenjena licima mlađoj od 18 godina i svesno ne prikupljamo njihove podatke. Ako saznamo da je
        nalog otvorilo maloletno lice, nalog i podatke brišemo. Ako si roditelj ili staratelj i misliš da se to
        dogodilo, javi nam se na kontakt email.
      </p>

      <h2 className="text-lg font-semibold text-txt-hi">9. Izmene ove politike</h2>
      <p>
        Politiku možemo menjati kada se promeni ono što radimo sa podacima — na primer kada dodamo novi spoljni
        servis. O bitnim izmenama obaveštavamo emailom ili porukom u aplikaciji najmanje 15 dana unapred. Datum
        poslednje izmene uvek stoji na vrhu ove stranice.
      </p>

      <h2 className="text-lg font-semibold text-txt-hi">10. Sadržaj koji generiše veštačka inteligencija</h2>
      <p>
        Skripte, glas i slike pravi veštačka inteligencija na osnovu onoga što uneseš. Rezultat može biti netačan ili
        neprikladan i <strong className="text-txt-hi">ti si odgovoran da ga pregledaš pre objave</strong>. Posebno:
        ako uvezeš tuđi snimak, u kadru može ostati vodeni žig ili korisničko ime druge osobe — proveri svaki snimak
        pre nego što ga upotrebiš u reklami.
      </p>
    </>
  );
}
