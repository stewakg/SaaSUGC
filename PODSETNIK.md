# PODSETNIK.md — pročitaj ovo sa drugog kompa i sve ti se vrati

**Ažurirano:** 2026-08-18 · **Mašina:** druga (drugi fizički komp) · **Pokriva:** WebSaas *i* aikutak

> ⚠️ **Šta je od 2026-08-09 do 2026-08-18 postalo netačno u ovom fajlu** — čitaj ovo pre svega
> ostalog, jer je razlika od 241 commita:
>
> - **§3 je pisao „migracije 0001–0006". Sada su primenjene 0001–0011**, poslednja 2026-08-18.
>   Ne veruj ni ovoj rečenici — u §3 stoji upit kojim se pita sama baza.
> - **`.env` traži sedam ključeva više** nego što §3 nabraja. Spisak je u §3a.
> - **Cline se drugačije poziva na ovoj mašini** nego što `CLAUDE.md` opisuje — §3b.
> - VPS više **nije** `/opt/adgen-saas` nego `/srv/adgen`, i svaka `docker compose` komanda
>   sada zahteva učitan `.env` (§3c). Rečenica u §3 „VPS je već ažuriran" odnosi se na staru
>   putanju i zastarela je.

> Jedan fajl, namerno kratak. Detalji žive u `SESSION_LOG.md` (ovde) i `STANJE.md`
> (aikutak) — ovde je samo ono što ti treba da se ponovo uhvatiš u koštac.

---

## 1. Prvih pet minuta

```bash
git fetch && git status -sb     # u OBA repoa
```

- `behind N` → `git pull`
- `ahead N` → tu stoji rad koji nikad nije gurnut, **prvo to gurni**
- foldera nema → `git clone https://github.com/stewakg/SaaSUGC.git`

Zatim zavisnosti, pa **ručno napravi `.env`** (§3) — on ne putuje kroz git. Šablon: `.env.example`.

**⚠️ `pnpm` možda nije na PATH-u, a `corepack enable` pada sa EPERM** (piše u `C:\Program Files\nodejs`).
Rešenje bez ikakve instalacije i bez admin prava:

```bash
corepack pnpm install
corepack pnpm -r typecheck
```

**Sve je gurnuto na dan 2026-08-18.** WebSaas `main` je 0/0 sa GitHub-om.

⏱️ **Računaj na ~9 minuta za `corepack pnpm install`** ako je razlika velika (241 commit je toliko
trajalo 2026-08-18). Nije zaglavljeno — skida stotine paketa.

⚠️ **Prvo `pnpm install`, tek onda bilo kakvi testovi.** Očigledno, ali greška se ne vidi kao
„nedostaju zavisnosti" nego kao gomila nejasnih grešaka u tipovima.

---

## 2. Gde stoje oba projekta

| | WebSaas (AdGen) | aikutak |
|---|---|---|
| Repo | `github.com/stewakg/SaaSUGC` · `main` | `github.com/stewakg/aikutak` · `master` |
| Stanje | u produkciji na Hetzneru, 5 alata radi kroz ceo lanac, baza na 0011 | sajt živ i zdrav u produkciji |
| Blokada | ⛔ **domen + HTTPS** · 🟡 **nijedan wizard nije kliknut do kraja** | nema |
| Hitno | — | ⏰ **4a — presuda o `auto_safe`** |

**Odluke vlasnika od 2026-08-18:** domen i HTTPS idu **kasnije**, naplata ide na **Stripe** (Lemon
Squeezy spava iza fabrike provajdera, nije obrisan — jednom je već bio obrisan pa vraćen uz puno
prežičavanje).

---

## 3. 🟢 Supabase blokada je REŠENA — ali `.env` moraš ponovo

Stari projekat `gczikdrskcpqqlyzvnby` **nije bio obrisan nego pauziran, pod DRUGIM Supabase nalogom**
(org „stewankg ORG"). Zato ga pretraga po organizacijama nije našla. Napušten je.

**Novi projekat: `iqfzhnndhhrprkrkfygd`** — migracije **0001–0011** puštene, poslednja 2026-08-18.

Nemoj verovati ni ovoj rečenici ni bilo kom dokumentu — 2026-08-09 je ovde pisalo „0001–0006" i to je
osam dana bilo netačno. Pitaj bazu, u SQL editoru:

```sql
select
  to_regclass('public.credits_holds') is not null as holds_0010,
  to_regclass('public.credits_ledger_one_job_spend_per_job') is not null as index_0011;
```

Oba `true` = baza je na 0011.

> **0011 (2026-08-18)** je jedan uslovni jedinstveni indeks koji garantuje **najviše jednu naplatu po
> poslu**. Nije stvar stila: dva pokušaja mogu da se preklope u istoj milisekundi, pa nikakva provera
> u kodu to ne može presuditi — samo baza. Pre primene je pušten kontrolni upit i vratio je **nula
> redova**, dakle nijedan kupac nikad nije naplaćen dvaput. Dokazano je i da stvarno **odbija** drugu
> naplatu, ne samo da postoji: transakcija koja je pokušala duplikat stvarnog reda odbijena je sa
> `23505`.

**Novi sistem ključeva.** Legacy `anon`/`service_role` su isključeni i JWT secret je opozvan; koriste se
`sb_publishable_…` i `sb_secret_…`. **Imena promenljivih su ostala ista** (`SUPABASE_ANON_KEY` sada drži
publishable ključ) — preimenovanje bi diralo web, worker, VPS i dokumentaciju.

Napravi `.env` u korenu iz `.env.example` i popuni:

```
SUPABASE_URL=https://iqfzhnndhhrprkrkfygd.supabase.co
NEXT_PUBLIC_SUPABASE_URL=https://iqfzhnndhhrprkrkfygd.supabase.co
SUPABASE_ANON_KEY=sb_publishable_…          # Settings → API Keys
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_…
SUPABASE_SERVICE_ROLE_KEY=sb_secret_…
OPENROUTER_API_KEY=sk-or-v1-…               # skripte; bez njega sve pada na mock
OPENROUTER_SCRIPT_MODEL=                    # prazno = podrazumevani model
KIE_API_KEY=…   FAL_API_KEY=…   ELEVENLABS_API_KEY=…
```

Pa `corepack pnpm env:sync` (kopira root `.env` u `apps/web` i `apps/worker`).

> **`ANTHROPIC_API_KEY` više ne postoji.** Nikad nije ni bio popunjen — vidi §4.

---

## 3a. ⚠️ Spisak iznad je NEPOTPUN — sedam ključeva više

Provereno 2026-08-18 poređenjem `.env.example` sa lokalnim `.env`. Ovih sedam postoje u šablonu a
nema ih u spisku gore, i **ne putuju kroz git**:

```
REDIS_PASSWORD                # bez njega deploy PADA namerno (vidi 3c)
R2_ENDPOINT                   # EU bucket ima svoj endpoint; izvedeni oblik javlja "bucket not found"
BILLING_PROVIDER              # bez njega naplata pada na mock, a produkcija mock odbija
ADMIN_EMAILS                  # ko sme da doda kredite u produkciji
WORKER_CONCURRENCY            # koliko teških poslova odjednom
REMOTION_LAMBDA_CONCURRENCY   # AWS kvota je podignuta 10 → 1000, broj još nije podešen
ALERT_WEBHOOK_URL             # neispunjen = nijedan neuspeo posao se ne prijavljuje nigde
```

Prenesi ih rukom sa druge mašine. **Nikad ih ne lepi u chat.**

---

## 3b. Cline na ovoj mašini — `CLAUDE.md` je opisivao pogrešnu komandu

Postavljeno 2026-08-18. CLI se instalira sa `npm i -g cline` (verzija 3.0.55, traži Node 22+; ovde
je 22.19.0). Ključ se unosi kroz **interaktivni** `cline auth`, nikad kroz `-k` u komandnoj liniji —
PowerShell trajno upisuje svaku komandu u `ConsoleHost_history.txt` kao čist tekst.

**Poziv na ovoj mašini:**

```bash
cline --json -P zai-coding-plan -c "<repo>" "jednolinijski prompt"
```

`-P openai-compatible` iz `CLAUDE.md` **ovde ne postoji** i komanda bi pukla — ova verzija CLI-ja ima
ugrađen `zai-coding-plan` provajder. Zamka sa dva novčanika i dalje važi, samo drugačije: u
`providers.json` postoje i `zai` i `zai-coding-plan` sa **istim ključem** (isti nalog, drugi endpoint
— coding plan je pretplata, obični `zai` troši prazan balans), a `globalState.json` još pokazuje na
`zai`. **Zato uvek eksplicitno `-P`,** nikad golo `cline "zadatak"`.

Provereno pokretanjem, ne pretpostavkom: odgovor prijavljuje `model.id: glm-5.3`, kontekst 1.000.000,
trošak 0.

---

## 3c. VPS — putanja i komande su se promenile

**Više nije `/opt/adgen-saas` nego `/srv/adgen`**, i to je zaseban `.env` koji ne dolazi iz gita.

```bash
ssh root@5.75.154.153 'cd /srv/adgen && git pull'
ssh root@5.75.154.153 'cd /srv/adgen && set -a && . ./.env && set +a && docker compose -f infra/docker-compose.prod.yml -p adgen up -d --build'
```

⚠️ **`set -a && . ./.env && set +a` nije opciono, i treba ga čak i `ps` i `logs`.** `REDIS_PASSWORD`
se čita kao `${VAR:?}`, pa compose odbija da uopšte pročita fajl bez njega. To je namerna zaštita —
alternativa je tiho pokretanje reda bez lozinke — ali znači da gola `docker compose ps` sada puca.

⚠️ Posle više build-ova: `docker builder prune -f && df -h /`. Osam build-ova u jednom danu ostavilo
je 19,82 GB keša na disku od 38 GB. **Ne** koristi `docker system prune -a` — obrisao bi i slike iz
kojih rade kontejneri.

---

## 4. Šta je WebSaas dobio 2026-08-09 (17 commita)

**Najveći nalaz: skripte nikad nisu radile.** `ScriptProvider` je bio zaključan na `ANTHROPIC_API_KEY`,
a Anthropic nalog nikad nije ni postojao — svaki Matrix posao do sada koristio je **konzervirani mock
tekst**. ElevenLabs ga jeste stvarno čitao naglas, ali je čitao unapred napisane rečenice.

- **OpenRouter provajder** zamenio je mrtvu Claude granu. Gejt je sad `OPENROUTER_API_KEY`.
- **Rod glasa u skripti.** Sve skripte su izlazile u ženskom rodu („našla sam", „sigurna"), pa je muški
  glas čitao ženski tekst — u srpskom pokvarena reklama, u engleskom nevidljiv problem. Izmereno:
  muški → 0 ženskih oblika.
- **Korak za pregled skripti** u wizardu: praviš jednu po jednu, starije se skupljaju ali ostaju
  dostupne, 5 besplatno / 10 maksimum. Odobrene idu u `params.scripts`, worker ih koristi umesto da
  generiše.
- **Slepi test srpskog** (`scripts/eval-serbian-scripts.mts`) — pušten, 30 varijanti čeka ocenu (§5).
- **Predlozi klipova**: `POST /api/search-clips`, YouTube preko yt-dlp. Radi **bez ijednog ključa**.
- **Deveti alat „Preozvuči"** (`revoice`): jedan klip, N kopija sa novim glasom i titlom. To je ono
  što konkurent stvarno radi — raniji zapis u `INFRASTRUCTURE.md` da on pravi montažu **bio je
  pogrešan i ispravljen je**. Naša montaža nije sustizanje, nego nešto što on nema.
- **Migracije 0005 i 0006** puštene i potvrđene protiv žive baze.
- **Lozinke**: 8 znakova, malo + veliko slovo, cifra, simbol — prepisano doslovno iz GoTrue skupova.
  Kvačice (`č`, `Č`) se **ne broje**, jer ih Supabase ne broji.

⚠️ **Troškovna napomena i dalje važi:** Matrix troši prave ElevenLabs kredite po varijanti.

---

## 5. Šta te čeka

### WebSaas — sve staje na jedno: **ništa od 09.08. nije kliknuto**

Sve je prošlo typecheck, testove i build, ali nijedan ekran nije dodirnut. `CLAUDE.md` upozorava zašto
to nije isto što i gotovo (M2c je prošao review i dve nedelje nije napravio nijedan frejm).

| # | Šta kliknuti | Gde |
|---|---|---|
| 1 | **Predlozi klipova** — pretraga, sličice, „Uzmi" | `/app/matrix`, 1. korak |
| 2 | **Korak sa skriptama** — skupljanje/širenje, „Ukloni" na otvorenoj, granica 5 i 10 | `/app/matrix`, 4. korak |
| 3 | **Reset lozinke** — ceo tok mejlom | `/login` → „Zaboravio si lozinku?" |
| 4 | Kontrole za titl i zvuk (visi od 05.08.) | `/app/matrix`, korak stila |

**Počni od 1** — jedina stvar koja radi bez ijednog ključa, pa najbrže pokaže da li je lanac čitav.

### WebSaas — odluke koje čekaju tebe

| # | Šta | Zašto stoji |
|---|---|---|
| 1 | **Oceni 30 varijanti** u `tests/serbian-script-eval/…-blind.md`, pa otvori `…-key.json` | ti si izvorni govornik |
| 2 | ~~Wizard za „Preozvuči"~~ | **urađeno** — alat radi kroz ceo lanac (90,7 s, 9,6 MB mp4) |
| 3 | Google Cloud Vision vs Google Lens scraper za pretragu po slici | test na 5 proizvoda pa odluka |
| 4 | ~~R2: javni bucket vs presigned URL-ovi~~ | **rešeno 2026-08-16** — bucket je privatan, linkovi se potpisuju |
| 5 | ~~Brend naming „Matrix"~~ | **rešeno** — alat se zove „Video reklame" |
| 6 | TikTok/Instagram pretraga (yt-dlp ume samo YouTube) | traži plaćeni servis |
| 7 | **Izbor dizajna** — 4 pravca čekaju u `design-proposals/` (otvori HTML u browseru) | preporuka prethodne sesije: „Papir" (2) sa „Kiosk" (3) redovima na dashboardu |
| 8 | **Šest podataka o firmi** za pravne stranice — ime, adresa, Wyoming filing id, registrovani agent, odgovorno lice, kontakt mejl | svaki `[[POPUNITI]]` je jedan od njih; ne mogu se izmisliti |
| 9 | **Povraćaj novca / chargeback** — šta kad stigne posle potrošenih kredita | negativan saldo, nula, ili zamrznut nalog |
| 10 | **Brisanje naloga** — koji redovi i fajlovi odlaze | `Storage.delete` postoji od 2026-08-17, ali ga niko ne poziva dok se ovo ne odluči |

### aikutak
| # | Šta | Ko |
|---|---|---|
| 1 | ⏰ **4a — presuda o `auto_safe`** | odluka |
| 2 | Distribucija: Discord/LinkedIn/FB commitovana ali neaktivna — treba env ključevi + test objava | ti |
| 3 | 5b — datum u URL-u članka | odluka |
| 4 | middleware→proxy, `/admin/prijave`, light/dark toggle | Claude sam |

> **4a nosi pravnu posledicu:** kad se upali automatska objava, **mora** se promeniti tekst u
> `AiDisclosure.tsx` — „kontrolisano od strane uredništva" prestaje da važi (EU AI Act).

---

## 6. Pravilo za dva kompa (naučeno na svojoj koži)

1. **Sesija počinje sa `git fetch`.**
2. **Sesija se ne završava sa nekomitovanim radom.** Nedovršeno se svejedno commituje — `wip:` prefiks
   ili `wip/<tema>` grana. Commit nije izjava da je gotovo; on je jedino što prenosi rad.
3. **Push nije opcion.**
4. Popuni sinhronizacioni blok na vrhu `STANJE.md` (aikutak).

**Tri zamke:** untracked fajlovi **blokiraju ceo `pull`**; CRLF pravi **lažne razlike** (razlika u
bajtovima ≈ broj linija → to je prelom reda); i **nikad ne prepisuj izvorni fajl kroz PowerShell**
(`Get-Content`/`Set-Content`) — PowerShell 5.1 čita UTF-8 bez BOM-a kao ANSI i dvostruko ga kodira.
Jedan dodat `import` je tako postao 432 izmenjene linije. Uhvaćeno sa `git diff --numstat`.

> 🔁 **Treća zamka je ponovo naplaćena 2026-08-18**, i to Claude-u koji je ovaj fajl imao pred sobom.
> `Set-Content -Encoding utf8` u PS 5.1 upisuje **BOM**; `package.json` je postao neispravan
> (`corepack` javio „Invalid package.json"), a ćirilični i UTF-8 znakovi u komentarima su se
> izobličili. Vraćeno sa `git checkout -- <fajlovi>` i ponovo urađeno alatima za pisanje fajlova.
> **Pouka je konkretnija nego što je bila zapisana:** problem nije samo čitanje — i **pisanje** kroz
> `Set-Content` je zabranjeno, jer dodaje BOM koji parseri JSON-a odbijaju.

---

## 7. Gde dalje kopati

- **WebSaas:** `SESSION_LOG.md` → najnoviji blok gore. Sadrži i recepte za okruženje (kako pokrenuti
  render bez Redisa, putanje do ffmpeg/yt-dlp, Git Bash zamka).
- **aikutak:** `STANJE.md` → §1 šta čeka tebe, §2 otvoreno, §3 čeka odluku, §6 konvencije.
- Cene i marže: `BUSINESS.md` (WebSaas). **Svi krediti su privremeni brojevi** — cene se određuju
  posle izgradnje, ne pre.
