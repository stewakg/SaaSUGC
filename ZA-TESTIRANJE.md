# ZA-TESTIRANJE.md — šta da uradiš i istestiraš (sesija 2026-07-20)

> Checklist za vlasnika posle autonomne sesije. Sve dole je **CODE-COMPLETE i gejtovano**
> (typecheck + testovi + web build zeleni u trenutku commita), ali **NIJE runtime-provereno** —
> to je ono što ti treba da odradiš ovde. Detaljan trag je u `SESSION_LOG.md` (vrh).

---

## 1. Šta je urađeno ove sesije (10+ komita)

**Matrix montaža (M2c) — ceo lanac povezan:**
- Worker sad radi pravu montažu: `download klipova → scene-detect → shot pool → buildMontage po varijanti → <Series> render` (commiti `0cd72ad`, `cb646fc`).
- Storage URL-ovi apsolutizovani da worker/renderer mogu da ih fetch-uju.

**Link import (TikTok / YouTube / Instagram):**
- Nova ruta `POST /api/import-clip` (yt-dlp → storage) — commit `c3f3468`.
- Wizard Step 0 dobio „…ili nalepi link" input — commit `36ec956`.

**Ostalo:**
- **Count 5/10/15** (parity sa konkurentom) — `30fe4ef`.
- Refactor: SSRF guard u shared `@/lib/safe-url` — `766a671`.
- **Prvi testovi u repo-u**: vitest + 25 testova (montaža, scene-detect, captions, cena) — `e0dea18`, `f0cc99a`, `d061fd3`.

---

## 2. KORAK 0 — jednokratno: povuci yt-dlp binary ⚠️ (BEZ OVOGA link import ne radi)

pnpm 10 preskače postinstall, pa yt-dlp binary nije skinut. U **pravom terminalu** (treba TTY):

```bash
pnpm approve-builds
```
→ u listi izaberi **`youtube-dl-exec`** (i `ffmpeg-static` ako se ponudi) → to pokrene postinstall i skine binary.

**Ako `approve-builds` ne uradi ništa**, fallback (skini ručno):
```bash
cd node_modules/.pnpm/youtube-dl-exec@3.1.9_debug@4.4.3/node_modules/youtube-dl-exec
node scripts/preinstall.mjs && node scripts/postinstall.js
```
Provera da je uspelo: treba da postoji `.../youtube-dl-exec/bin/` sa yt-dlp binarijem.

> Napomena: `ffmpeg-static` binary (za scene-detect) je već prisutan — montaža ne zavisi od ovog koraka, samo link import.

---

## 3. KORAK 1 — pokreni lokalni stack

```bash
pnpm services:up      # Redis (BullMQ red) na :6379
pnpm supabase start   # Supabase (Postgres/Auth/Storage/Studio)
pnpm dev              # web (:3000) + worker paralelno
```
(prvi `pnpm dev` pokrene i `env:sync`). Otvori http://localhost:3000, registruj/uloguj se (auth je obavezan za wizard).

---

## 4. KORAK 2 — brzi gejtovi (bez kredita, čist kod-nivo)

```bash
pnpm -r typecheck     # svih 5 projekata
pnpm -r test          # 25 testova (11 core + 14 worker)
pnpm --filter @adgen/web build
```
Sva tri treba da su zelena. (Ovo je sad i zvanični baseline gate — vidi `CLAUDE.md`.)

---

## 5. KORAK 3 — funkcionalno testiranje kroz UI (ovo je pravi cilj)

Idi na **Matrix** wizard (`/app/matrix`).

### (a) Link import — Step 0 „Upload klipova"
- [ ] Nalepi pravi **TikTok** link → „Uvezi" → klip se pojavi u listi (ime = hostname).
- [ ] Isto probaj **YouTube** i **Instagram** link.
- [ ] Ako pukne: pogledaj worker/web log. `502 import_failed` = yt-dlp nije uspeo (proveri KORAK 0). `invalid_url` = URL nije http(s).

### (b) Cela montaža — end-to-end
- [ ] Dodaj **2-3 klipa** (upload i/ili link) — svaki neka je kompilacija više kadrova.
- [ ] Prođi Step 1 (scrape proizvoda), Step 2 (glas/titlovi/**count 5/10/15**), Step 3 (tranzicija/CTA).
- [ ] Klikni Generate. **Sačekaj** (5-15 rendera ide sekvencijalno; timeout je skaliran po count-u).
- [ ] **ODGLEDAJ bar 2 izlazna MP4-a** i proveri:
  - [ ] Video **seče između različitih shotova** iz tvojih klipova (nije jedan klip full-length, nije default „mov_bbb").
  - [ ] Svaka varijanta je **drugačija montaža** (drugačiji redosled/izbor shotova).
  - [ ] Titlovi + intro tranzicija + outro CTA kartica su tu.
  - [ ] Broj izlaza = odabrani count (5/10/15).
  - [ ] Cena naplaćena = `count × 15` kredita.

### (c) Ako montaža padne na jedan klip
Ako vidiš jedan klip full-length umesto montaže → pogledaj worker log za `[matrix] scene-detect skipped for <url>`. To znači da download ili scene-detect nije uspeo (npr. storage URL nije fetch-abilan) → javi mi taj log.

---

## 6. Poznata ograničenja / na šta paziti
- **YouTube kvalitet:** link import skida najbolji *progresivni* mp4 (~720p, bez ffmpeg merge-a u webu). Za B-roll je OK; TikTok/IG su ionako single-file.
- **Voiceover se NE muksuje** još — glas se generiše ali se ne ubacuje u video; titlovi idu na mock tajminge. (Audio muxing je zaseban, budući, troši ElevenLabs kredite.)
- **Nema sound/music panela** još (blokiran na izvoru muzike/SFX).
- Vercel deploy: pravi video upload bi 413-ovao na Vercelu (platform limit) — radi na self-hosted Node; pravo rešenje je presigned upload (kasnije).

---

## 7. Kad sve gore prođe → push (backup)
```bash
git push origin main
```
(Ništa nije push-ovano ove sesije — po two-account modelu nije nužno, samo backup.)

---

## 8. Šta ostaje za sledeće sesije (sve traži tebe / kredite / odluku)
Sound/music panel · real audio muxing · F5 kie.ai↔fal.ai benchmark + live-testovi providera · F6 billing live + Vercel deploy · legal stranice (pravnik) · brand naming (Matrix je ime konkurenta) · vizuelni/copy polish. Puna lista: `INFRASTRUCTURE.md` (F5–F7) + `SESSION_LOG.md`.
