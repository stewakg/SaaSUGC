# PODSETNIK.md — pročitaj ovo sa drugog kompa i sve ti se vrati

**Ažurirano:** 2026-08-09 · **Mašina:** nova (drugi fizički komp) · **Pokriva:** WebSaas *i* aikutak

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

**Sve je gurnuto na dan 2026-08-09.** WebSaas `main` i aikutak `master` su 0/0 sa GitHub-om.

---

## 2. Gde stoje oba projekta

| | WebSaas (AdGen) | aikutak |
|---|---|---|
| Repo | `github.com/stewakg/SaaSUGC` · `main` | `github.com/stewakg/aikutak` · `master` |
| Stanje | Supabase vraćen, skripte prorađene, 9. alat dodat | sajt živ i zdrav u produkciji |
| Blokada | 🟡 **ništa nije kliknuto** (§5) | nema |
| Hitno | — | ⏰ **4a — presuda o `auto_safe`** |

---

## 3. 🟢 Supabase blokada je REŠENA — ali `.env` moraš ponovo

Stari projekat `gczikdrskcpqqlyzvnby` **nije bio obrisan nego pauziran, pod DRUGIM Supabase nalogom**
(org „stewankg ORG"). Zato ga pretraga po organizacijama nije našla. Napušten je.

**Novi projekat: `iqfzhnndhhrprkrkfygd`** — migracije 0001–0006 puštene i **provereno** da stoje.

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

**VPS je već ažuriran** (`/opt/adgen-saas/apps/worker/.env`, backup `.env.bak-20260809-101211`),
worker restartovan i radi bez grešaka. Tamo ne treba ništa.

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
| 2 | Wizard stranica za „Preozvuči" | kartica je „USKORO" dok je nema |
| 3 | Google Cloud Vision vs Google Lens scraper za pretragu po slici | test na 5 proizvoda pa odluka |
| 4 | R2: javni bucket vs presigned URL-ovi | **launch blocker** iz F5 |
| 5 | Brend naming — „Matrix" je konkurentovo ime **i netačno** za ono što gradimo | odluka |
| 6 | TikTok/Instagram pretraga (yt-dlp ume samo YouTube) | traži plaćeni servis |

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

---

## 7. Gde dalje kopati

- **WebSaas:** `SESSION_LOG.md` → najnoviji blok gore. Sadrži i recepte za okruženje (kako pokrenuti
  render bez Redisa, putanje do ffmpeg/yt-dlp, Git Bash zamka).
- **aikutak:** `STANJE.md` → §1 šta čeka tebe, §2 otvoreno, §3 čeka odluku, §6 konvencije.
- Cene i marže: `BUSINESS.md` (WebSaas). **Svi krediti su privremeni brojevi** — cene se određuju
  posle izgradnje, ne pre.
