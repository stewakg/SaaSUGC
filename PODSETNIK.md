# PODSETNIK.md — pročitaj ovo sa drugog kompa i sve ti se vrati

**Pisano:** 2026-08-08 · **Mašina:** `CYBORG` · **Pokriva:** WebSaas *i* aikutak

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

Zatim `pnpm install` (WebSaas) odnosno `npm install` (aikutak), pa **ručno napravi `.env`** —
on ne putuje kroz git. Šablon: `.env.example`.

**Oba repoa su na dan 2026-08-08 potpuno gurnuta.** WebSaas `main` i aikutak `master`
su 0/0 sa GitHub-om.

---

## 2. Gde stoje oba projekta

| | WebSaas (AdGen) | aikutak |
|---|---|---|
| Repo | `github.com/stewakg/SaaSUGC` · `main` | `github.com/stewakg/aikutak` · `master` |
| Stanje | Matrix radi ceo lanac | sajt živ i zdrav u produkciji |
| Blokada | 🔴 **Supabase nedostupan** | nema |
| Hitno | — | ⏰ **4a — presuda o `auto_safe`** |

---

## 3. 🔴 WebSaas — jedina prava blokada

`gczikdrskcpqqlyzvnby.supabase.co` **se ne razrešava** (NXDOMAIN sa Google, Cloudflare i
Quad9). Bez toga **nema prijave ni reda poslova** — aplikacija se ne može otvoriti.

**NIJE nužno obrisan.** Drugi tvoj projekat (`zrkexuskrfaewtaafhff`) stoji u dashboard-u a
takođe daje NXDOMAIN → **pauziran projekat gubi DNS**. Uz to imaš projekte u **više
organizacija** (Market-reseller `hadnlscsbymuzrwwbgob` je živ a nije bio u listi od tri).

**Uradi ovo, tim redom:**
1. U Supabase dashboard-u **prebaci organizaciju gore levo** i traži pauziran AdGen/WebSaas projekat.
2. Ako ga nađeš → **„Restore"**. Vraćaju se tabele, podaci **i isti ključevi**. `.env` se ne dira. Gotovo.
3. Ako ga nema ni u jednoj organizaciji → obrisan je. Onda: nov projekat → u **SQL Editor**
   pusti `supabase/migrations/0001` → `0002` → `0003` → `0004` (tim redom) → pošalji mi
   Project URL + anon key + service_role key.

> SQL migracije ne pokreće AI — pravilo repoa. Nad pravom bazom nema „undo".

**Ostali ključevi su netaknuti** — `KIE_API_KEY`, `FAL_API_KEY`, `ELEVENLABS_API_KEY` rade
i korišćeni su uživo. Menjaju se samo tri `SUPABASE_*` vrednosti, i to samo u slučaju 3.

---

## 4. Šta je WebSaas dobio 2026-08-05 (17 commita)

Matrix je od „napisano" postao **stvarno radi**:

- **Montaža renderuje** — više klipova → scene-detect → različita montaža po varijanti.
- **Glas je u videu** (ElevenLabs), a **titlovi prate stvarni govor** — ne procenu.
- **Titlovi pomerljivi** — pozicija gore/dole i levo/desno, veličina, tri preseta.
- **Muzika i CTA efekat** — korisnik uploaduje svoju numeru.
- **Link import radi** — TikTok/YouTube/Instagram link → klip u montaži.
- **kie.ai vs fal.ai benchmark** — 6/6 uspelo, kie ~2.3× brži, kvalitet izjednačen →
  ostaje kie primary. Detalji: `tests/kie-vs-fal.md`.

**Sedam bugova nađenih tek pokretanjem** — nijedan se nije video u kodu. Tri su bila „tihi
audio" (Remotion odbaci zvuk bez ijedne greške), dva relativan storage URL, jedan fajl koji
nikad nije ušao u git, jedan yt-dlp koji je skidao 269 MB umesto 27 MB.

> **Pouka koja je upisana u `CLAUDE.md`:** audio se ne proverava time što „postoji stream",
> nego merenjem — `ffmpeg -sseof -2 -i <mp4> -af volumedetect -vn -f null NUL`.
> `-91 dB` = digitalna tišina.

⚠️ **Troškovna promena:** Matrix sada troši **prave ElevenLabs kredite po varijanti**.
`count=15` = 15 TTS poziva.

---

## 5. Šta te čeka

### WebSaas
| # | Šta | Ko |
|---|---|---|
| 1 | **Vratiti Supabase** (§3 gore) | **ti** |
| 2 | **Klik-test wizarda** — nove kontrole za titl i zvuk **nikad nisu kliknute** u browseru | ti (iza prijave) |
| 3 | R2: javni bucket vs presigned URL-ovi — **launch blocker** | odluka |
| 4 | Brand naming (`matrix` je ime konkurenta), legal stranice | odluka |
| 5 | Vizuelni polish wizarda, copy pass, F7 `ai_video` skelet | Claude sam |

### aikutak
| # | Šta | Ko |
|---|---|---|
| 1 | ⏰ **4a — presuda o `auto_safe`** (rok ~09.08) | odluka |
| 2 | Distribucija: Discord/LinkedIn/FB **je commitovana ali neaktivna** — treba env ključevi + test objava po kanalu | ti |
| 3 | 5b — datum u URL-u članka | odluka |
| 4 | middleware→proxy, `/admin/prijave`, light/dark toggle | Claude sam |

> **4a nosi pravnu posledicu:** kad se upali automatska objava, **mora** se promeniti tekst
> u `AiDisclosure.tsx` — „kontrolisano od strane uredništva" prestaje da važi (EU AI Act).

---

## 6. Pravilo za dva kompa (naučeno na svojoj koži)

Distribucija u aikutak-u stajala je **nekomitovana na jednom disku tri nedelje**, a WebSaas
nije bio gurnut **18 dana** — i ruta `/api/storage` nikad nije ni ušla u git jer ju je
`.gitignore` gutao.

1. **Sesija počinje sa `git fetch`.**
2. **Sesija se ne završava sa nekomitovanim radom.** Nedovršeno se svejedno commituje —
   `wip:` prefiks ili `wip/<tema>` grana. Commit nije izjava da je gotovo; on je jedino što
   prenosi rad na drugu mašinu.
3. **Push nije opcion.**
4. Popuni sinhronizacioni blok na vrhu `STANJE.md` (aikutak) — mašina, commit, i pošteno
   „ostavljeno nekomitovano".

**Dve zamke:** untracked fajlovi **blokiraju ceo `pull`** (ne rešavaj sa `-f` — uporedi
sadržaj, jedan od njih je danas bio lokalno noviji); i CRLF pravi **lažne razlike** (razlika
u bajtovima ≈ broj linija → to je prelom reda, ne izmena).

---

## 7. Gde dalje kopati

- **WebSaas:** `SESSION_LOG.md` → sekcija **„▶ PICK UP HERE TOMORROW"** ima i recepte za
  okruženje (kako pokrenuti render bez Redisa, putanje do ffmpeg/yt-dlp, Git Bash zamka).
- **aikutak:** `STANJE.md` → §1 šta čeka tebe, §2 otvoreno, §3 čeka odluku, §6 konvencije.
- Cene i marže: `BUSINESS.md` (WebSaas).
