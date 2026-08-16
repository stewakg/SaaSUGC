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
        Uslugu pruža [[POPUNITI: pun pravni naziv firme]], društvo sa ograničenom odgovornošću (LLC) osnovano u
        državi Vajoming, SAD, sa sedištem na adresi [[POPUNITI: adresa]] (u daljem tekstu „mi”). Puni podaci o
        firmi i kontakt nalaze se na stranici{' '}
        <a href="/impressum" className="focus-ring rounded text-accent-text hover:underline">
          Podaci o pružaocu usluge
        </a>
        . Korišćenjem sajta prihvataš ove uslove. Ako se sa njima ne slažeš, nemoj koristiti uslugu.
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
      <p>
        <strong className="text-txt-hi">Uzrast.</strong> Nalog može otvoriti samo lice sa navršenih 18 godina, ili
        lice koje ugovor zaključuje u ime firme. Usluga se plaća i proizvodi sadržaj namenjen oglašavanju, pa nije
        namenjena maloletnicima. Ako saznamo da nalog koristi maloletno lice, nalog ćemo ugasiti.
      </p>
      <p>
        <strong className="text-txt-hi">Zatvaranje naloga.</strong> Nalog možete zatvoriti u svakom trenutku, porukom
        na kontakt email. Zatvaranjem naloga brišu se i preostali neiskorišćeni krediti — oni se ne isplaćuju u
        novcu. Preuzmi sve što ti treba pre zahteva za zatvaranje.
      </p>

      <h2 className="text-lg font-semibold text-txt-hi">4. Krediti i plaćanje</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Usluga se plaća unapred, u kreditima. Cena svakog alata je prikazana pre pokretanja posla.</li>
        <li>
          <strong className="text-txt-hi">Naplaćuje se samo uspešan posao.</strong> Ako posao ne uspe, krediti se ne
          skidaju. Ako se skinu greškom, vraćaju se.
        </li>
        <li>Neiskorišćeni krediti se prenose u naredni period i ne ističu dok nalog postoji.</li>
        <li>Krediti nisu novac, ne mogu se preneti drugom nalogu niti zameniti za gotovinu.</li>
        <li>
          <strong className="text-txt-hi">Kupovina kredita je konačna.</strong> Kupljeni krediti se ne vraćaju i ne
          zamenjuju za novac. To se ne odnosi na tačku iznad: posao koji ne uspe se ne naplaćuje, a krediti skinuti
          greškom se vraćaju — to nije povraćaj novca nego ispravka pogrešnog zaduženja.
        </li>
        <li>
          <strong className="text-txt-hi">Pravo na odustanak i zašto ga gubiš.</strong> Krediti su digitalni sadržaj
          koji se isporučuje odmah. Pri kupovini izričito tražiš da isporuka počne pre isteka zakonskog roka za
          odustanak od 14 dana i potvrđuješ da time gubiš pravo na odustanak. Ako ta potvrda nije data pri kupovini,
          zakonski rok od 14 dana važi i pored prethodne rečenice.
        </li>
      </ul>
      <p className="text-txt-mid">
        Poslednja stavka nije formalnost: bez izričite potvrde na koraku plaćanja, pravilo „kupovina je konačna” ne
        proizvodi dejstvo prema potrošaču u EU.
      </p>
      <p>
        <strong className="text-txt-hi">Kada se posao smatra uspešno isporučenim.</strong> Posao je isporučen kada
        sistem napravi rezultat i učini ga dostupnim za preuzimanje na tvom nalogu. Krediti se naplaćuju za tu
        isporuku, a ne za tvoje zadovoljstvo rezultatom — veštačka inteligencija svaki put daje drugačiji rezultat i
        procena da li je „dobar” je subjektivna. Ako rezultat ne odgovara, lek je ponovno pokretanje sa izmenjenim
        podacima, ne povraćaj kredita. Tehnički neuspeh je nešto drugo i pokriven je pravilom iznad: ako posao ne
        uspe, ne naplaćuje se.
      </p>
      <p>
        <strong className="text-txt-hi">Izmena cena.</strong> Cene alata možemo menjati. O izmeni obaveštavamo
        emailom najmanje 14 dana unapred, a nova cena važi tek za poslove pokrenute posle tog roka. Krediti koje si
        već kupio zadržavaju vrednost — izmena cene menja koliko kredita jedan alat troši ubuduće, a ne oduzima ti
        ništa što je već na nalogu.
      </p>

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
        Prava na gotovu reklamu pripadaju tebi i možeš je koristiti komercijalno, u granicama tačke 5 i 6. U meri u
        kojoj bi nama pripadalo bilo kakvo pravo na rezultatu, to pravo prenosimo na tebe, bez naknade i bez
        vremenskog ograničenja. Rezultat pravi veštačka inteligencija, pa može sadržati greške u tekstu, izgovoru ili
        prikazu proizvoda. Ne garantujemo da će reklama biti tačna, prikladna ni uspešna.
      </p>
      <p>
        <strong className="text-txt-hi">Pregled pre objave je tvoja obaveza</strong> — i to ne samo zbog grešaka.
        Reklama koju objaviš mora da poštuje pravila platforme na kojoj se objavljuje (TikTok, Meta, YouTube i
        slično) i propise o oglašavanju u zemlji u kojoj se prikazuje. Ta pravila ne poznajemo umesto tebe i ne
        proveravamo ih.
      </p>

      <h2 className="text-lg font-semibold text-txt-hi">8. Koliko dugo čuvamo rezultat</h2>
      <p className="rounded-lg border border-warn/40 bg-warn/10 p-3 text-warn-text">
        <strong className="text-txt-hi">Sve što napraviš na platformi dostupno je za preuzimanje 30 dana.</strong> Posle
        toga se fajlovi brišu automatski — i gotove reklame i materijal koji si otpremio. Zapis o poslu ostaje u
        istoriji, ali fajl više ne postoji i ne može se povratiti.
      </p>
      <p>
        Preuzmi reklamu čim je gotova. Čuvanje rezultata nije usluga arhiviranja i ne zamenjuje tvoju sopstvenu kopiju.
      </p>

      <h2 className="text-lg font-semibold text-txt-hi">9. Šta nije dozvoljeno</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Sadržaj koji je protivzakonit, obmanjujući ili predstavlja lažnu reklamu.</li>
        <li>Lik ili glas stvarne osobe bez njenog pristanka.</li>
        <li>Tuđi žig ili brend na način koji navodi na zabludu o poreklu proizvoda.</li>
        <li>Automatizovano preopterećenje servisa ili zaobilaženje ograničenja broja zahteva.</li>
        <li>Preprodaja pristupa nalogu, iznajmljivanje naloga ili deljenje pristupa bez naše pisane saglasnosti.</li>
        <li>
          Automatizovano preuzimanje sadržaja sa sajta (scraping), pokušaj rekonstrukcije koda ili modela iza usluge,
          i zaobilaženje naplate ili ograničenja kredita na bilo koji način.
        </li>
      </ul>
      <p>
        Posledice idu redom: prvo upozorenje, pa privremeno ograničenje naloga, pa ukidanje. Kod ozbiljnog kršenja —
        naročito zaobilaženja naplate, preprodaje pristupa i protivzakonitog sadržaja — nalog ukidamo odmah, a
        preostali krediti se gube i ne isplaćuju.
      </p>

      <h2 className="text-lg font-semibold text-txt-hi">10. Dostupnost</h2>
      <p>
        Usluga zavisi od spoljnih servisa i može biti privremeno nedostupna. Ne garantujemo neprekidan rad. Ako posao
        ne može da se izvrši, krediti se ne troše.
      </p>

      <h2 className="text-lg font-semibold text-txt-hi">11. Odgovornost</h2>
      <p>Odgovaramo bez ograničenja:</p>
      <ul className="list-disc space-y-1 pl-5">
        <li>za štetu prouzrokovanu namerno ili grubom nepažnjom;</li>
        <li>za povredu života, tela ili zdravlja;</li>
        <li>u meri u kojoj odgovornost propisuju prinudni propisi o odgovornosti za proizvod.</li>
      </ul>
      <p>
        Za običnu nepažnju odgovaramo samo ako je povređena obaveza čije ispunjenje uopšte omogućava izvršenje ugovora
        i u čije se ispunjenje korisnik opravdano pouzda. U tom slučaju odgovornost je ograničena na štetu koja je za
        ovakav ugovor tipična i predvidiva. Svaka dalja odgovornost je isključena.
      </p>
      <p>
        Posebno ne odgovaramo za sadržaj reklame koju objaviš ni za posledice njenog objavljivanja, za prava na
        materijalu koji si otpremio ili uvezao (tačke 5 i 6), niti za gubitak fajlova posle isteka roka iz tačke 8.
      </p>

      <h2 className="text-lg font-semibold text-txt-hi">12. Izmene uslova</h2>
      <p>
        Uslove možemo menjati. O bitnim izmenama obaveštavamo emailom najmanje 15 dana unapred. Ako se sa izmenom ne
        slažeš, možeš prestati da koristiš uslugu pre nego što stupi na snagu; nastavak korišćenja posle tog roka znači
        prihvatanje.
      </p>

      <h2 className="text-lg font-semibold text-txt-hi">13. Merodavno pravo i nadležnost</h2>
      <p>
        Na ovaj ugovor primenjuje se pravo države Vajoming, SAD, uz isključenje kolizionih normi i Bečke konvencije o
        ugovorima o međunarodnoj prodaji robe.
      </p>
      <p>
        <strong className="text-txt-hi">Ako si potrošač</strong>, ovo te ne lišava zaštite koju ti daju prinudni propisi
        države tvog uobičajenog boravišta, i možeš tužiti i biti tužen pred sudom te države. To važi bez obzira na
        prethodni stav — prodajemo potrošačima u Srbiji i Evropskoj uniji, a ta zaštita se ugovorom ne može isključiti.
        Ako ugovor zaključuješ kao privredni subjekt, isključivo je nadležan sud u državi Vajoming, SAD.
      </p>

      <h2 className="text-lg font-semibold text-txt-hi">14. Kontakt</h2>
      <p>
        [[POPUNITI: pun pravni naziv firme]]
        <br />
        [[POPUNITI: adresa]], Vajoming, SAD
        <br />
        Email: [[POPUNITI: kontakt email adresa]]
      </p>
    </>
  );
}
