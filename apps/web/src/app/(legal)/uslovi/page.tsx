export const metadata = { title: 'Uslovi korišćenja — AdGen' };

/**
 * Terms drafted against what the product actually does today: credits are
 * charged on success, unused credits roll over (which `BUSINESS.md` flags as a
 * deferred liability), and several tools are not implemented. The clauses about
 * third-party footage exist because the pipeline genuinely cannot guarantee a
 * clean frame — see the burned-in-UI item in TODO.md §4.
 */
export default function UsloviPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold text-txt-hi">Uslovi korišćenja</h1>
      <p className="text-txt-mid">Poslednja izmena: 10. 8. 2026.</p>

      <h2 className="text-lg font-semibold text-txt-hi">1. Ko pruža uslugu</h2>
      <p>
        Uslugu pruža [[POPUNITI: pun pravni naziv]], [[POPUNITI: adresa]] (u daljem tekstu „mi”). Korišćenjem sajta
        prihvataš ove uslove. Ako se sa njima ne slažeš, nemoj koristiti uslugu.
      </p>

      <h2 className="text-lg font-semibold text-txt-hi">2. Šta usluga radi</h2>
      <p>
        AdGen pravi video i slikovne reklame pomoću veštačke inteligencije, na osnovu podataka o proizvodu i
        materijala koji ti otpremiš. Neki alati su još u izradi i to je na sajtu označeno; alat koji ne radi ne
        naplaćuje se.
      </p>

      <h2 className="text-lg font-semibold text-txt-hi">3. Nalog</h2>
      <p>
        Za korišćenje je potreban nalog. Odgovoran si za tačnost email adrese i za čuvanje lozinke. Jedan nalog
        koristi jedno lice ili jedna firma — deljenje pristupa sa trećim licima nije dozvoljeno.
      </p>

      <h2 className="text-lg font-semibold text-txt-hi">4. Krediti i plaćanje</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Usluga se plaća unapred, u kreditima. Cena svakog alata je prikazana pre pokretanja posla.</li>
        <li>
          <strong className="text-txt-hi">Naplaćuje se samo uspešan posao.</strong> Ako posao ne uspe, krediti se ne
          skidaju. Ako se skinu greškom, vraćaju se.
        </li>
        <li>Neiskorišćeni krediti se prenose i ne ističu [[POPUNITI: potvrditi da ovo ostaje pravilo]].</li>
        <li>Krediti nisu novac, ne mogu se preneti drugom nalogu niti zameniti za gotovinu.</li>
        <li>
          Pravo na odustanak: kupovinom kredita i njihovim trošenjem pre isteka zakonskog roka za odustanak,
          saglasan si da usluga počinje odmah. [[POPUNITI: tačna formulacija po propisu o zaštiti potrošača —
          obavezno pravno pregledati.]]
        </li>
      </ul>

      <h2 className="text-lg font-semibold text-txt-hi">5. Materijal koji otpremaš</h2>
      <p>
        Zadržavaš sva prava na materijal koji otpremiš. Daješ nam samo dozvolu da ga obradimo radi izrade reklame koju
        si naručio, uključujući prosleđivanje spoljnim servisima navedenim u{' '}
        <a href="/privatnost" className="focus-ring rounded text-accent-text hover:underline">
          Politici privatnosti
        </a>
        .
      </p>
      <p>
        <strong className="text-txt-hi">Jamčiš da imaš pravo na materijal koji otpremaš.</strong> Ne otpremaj tuđe
        snimke, muziku ni fotografije bez dozvole.
      </p>

      <h2 className="text-lg font-semibold text-txt-hi">6. Snimci uvezeni sa drugih platformi</h2>
      <p className="rounded-lg border border-line bg-panel-2 p-3">
        Alat za pretragu i uvoz snimaka nalazi javno dostupne snimke na drugim platformama.{' '}
        <strong className="text-txt-hi">
          Uvoz takvog snimka ne daje ti pravo da ga komercijalno koristiš
        </strong>{' '}
        — to pravo zavisi od autora snimka i pravila te platforme, i na tebi je da ga obezbediš. Osim toga, u kadru
        mogu ostati vodeni žig, korisničko ime ili komentari sa te platforme, jer su to pikseli u samom snimku.
        Sistem ne garantuje da će takav kadar prepoznati i izbaciti. Pregledaj svaku reklamu pre objave.
      </p>

      <h2 className="text-lg font-semibold text-txt-hi">7. Rezultat</h2>
      <p>
        Prava na gotovu reklamu pripadaju tebi i možeš je koristiti komercijalno, u granicama tačke 5 i 6. Rezultat
        pravi veštačka inteligencija, pa može sadržati greške u tekstu, izgovoru ili prikazu proizvoda. Ne garantujemo
        da će reklama biti tačna, prikladna ni uspešna. Pregled pre objave je tvoja obaveza.
      </p>

      <h2 className="text-lg font-semibold text-txt-hi">8. Šta nije dozvoljeno</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Sadržaj koji je protivzakonit, obmanjujući ili predstavlja lažnu reklamu.</li>
        <li>Lik ili glas stvarne osobe bez njenog pristanka.</li>
        <li>Tuđi žig ili brend na način koji navodi na zabludu o poreklu proizvoda.</li>
        <li>Automatizovano preopterećenje servisa ili zaobilaženje ograničenja broja zahteva.</li>
        <li>Preprodaja pristupa nalogu.</li>
      </ul>
      <p>Nalog koji krši ova pravila možemo ograničiti ili ukinuti.</p>

      <h2 className="text-lg font-semibold text-txt-hi">9. Dostupnost</h2>
      <p>
        Usluga zavisi od spoljnih servisa i može biti privremeno nedostupna. Ne garantujemo neprekidan rad. Ako posao
        ne može da se izvrši, krediti se ne troše.
      </p>

      <h2 className="text-lg font-semibold text-txt-hi">10. Odgovornost</h2>
      <p>
        [[POPUNITI: ograničenje odgovornosti — formulacija zavisi od propisa i mora je napisati advokat. Ne
        objavljivati sa izmišljenim tekstom.]]
      </p>

      <h2 className="text-lg font-semibold text-txt-hi">11. Izmene uslova</h2>
      <p>
        Uslove možemo menjati. O bitnim izmenama obaveštavamo emailom najmanje [[POPUNITI: rok]] dana unapred.
        Nastavak korišćenja posle izmene znači prihvatanje.
      </p>

      <h2 className="text-lg font-semibold text-txt-hi">12. Merodavno pravo</h2>
      <p>[[POPUNITI: merodavno pravo i nadležni sud — zavisi od sedišta i od toga da li je kupac potrošač.]]</p>
    </>
  );
}
