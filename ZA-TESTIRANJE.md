# ZA-TESTIRANJE.md — status (ažurirano 2026-08-05)

> Prethodna verzija ovog fajla (2026-07-20) bila je checklist za tebe: skini yt-dlp,
> digni stack, istestiraj montažu. **To je sada odrađeno** — u sesiji 2026-08-05, sa
> tvojim odobrenjem da se troše krediti. Ostalo je malo, i dole je tačno šta.

---

## 1. Šta je URAĐENO i stvarno provereno (ne samo otipkano)

**yt-dlp binary — skinut.** Blokada od dve nedelje. Nije trebao `pnpm approve-builds`
ni TTY; postinstall skripta je pokrenuta direktno (`yt-dlp.exe 2026.07.04`).

**Link import — radi.** Pravi YouTube link → validan h264+aac mp4 → storage.

**Matrix montaža — RENDERUJE.** Prvi put otkad je M2c napisan. Dve varijante,
1080×1920, 18.05s i 23.06s, ~20 MB. Filmstripovi pregledani kadar po kadar:
seče između različitih izvornih klipova, srpski titlovi sa highlight-om reči,
intro tranzicija, outro CTA kartica, i **dve varijante su stvarno različite** —
i po tekstu i po izboru kadrova.

**F5 benchmark kie.ai vs fal.ai — odrađen.** 3 prompta × 2 providera, 6/6 uspelo iz
prve. kie.ai medijana 12.0s vs fal.ai 27.8s (~2.3× brži, dosledno). Kvalitet
izjednačen, oba produkcijska, oba tačno renderuju srpske dijakritike u tekstu reklame.
Zaključak: ostaje kie primary / fal fallback — sad na osnovu merenja. Detalji:
`tests/kie-vs-fal.md`.

---

## 2. Tri buga koja su nađena tek pokretanjem

Sva tri su prošla statički review. Nijedan se nije mogao videti čitanjem koda.

1. **`/api/storage` je tražio Supabase kolačić, a worker i Remotion ga nemaju.**
   Svaki Matrix posao sa uploadovanim klipovima je **padao** — ne degradirao na jedan
   klip kao što je stara verzija ovog fajla predviđala, nego bacao izuzetak na 401.
   Znači glavni feature proizvoda nikad nije radio lokalno. Popravljeno: bypass van
   produkcije (path-traversal guard i dalje radi prvi).

2. **`.gitignore` je progutao izvorni fajl.** Obrazac `storage/` bez kose crte na
   početku hvata folder `storage` na **bilo kojoj dubini** → cela
   `apps/web/src/app/api/storage/` ruta **nikad nije bila komitovana**. Postojala je
   samo na ovoj mašini; svež `git clone` je nema. Popravljeno: `/storage/`.

3. **`maxFilesize: '200M'` je radio suprotno od namere.** Baš prosleđivanje
   `--max-filesize` tera yt-dlp sa malog progresivnog formata na 1080p60 HLS →
   skinuto **269 MB** umesto 27 MB, tj. limit je probijen zbog samog limita.
   Popravljeno: `[protocol=https]` + `stat()` provera. Izmereno: 269.28 MB / 56.2s
   → **27.20 MB / 15.6s**.

---

## 3. Šta OSTAJE tebi

### (a) Redis — **nije hitno, i nije blokada za produkciju**
Produkcijski Redis **već radi na tvom Hetzner VPS-u**
(`infra/docker-compose.prod.yml`, LIVE-VERIFIED 2026-07-18). Tu nemaš šta da radiš.

Lokalni Redis bi služio samo da se provoza put `/api/jobs → red → worker` kroz UI.
Sam pipeline je verifikovan i bez njega. Ako hoćeš i taj deo: instaliraj Memurai
(Redis za Windows) ili daj cloud `REDIS_URL`.

> ⚠️ **Nemoj SSH tunel do VPS Redisa** za ovo — prod worker sluša isti red
> `adgen-jobs` i pokupio bi tvoje test poslove.

### (b) Klikni kroz UI (opciono, prijatno)
`pnpm dev` → http://localhost:3000 → uloguj se → `/app/matrix`. Sad bi trebalo da
prođe ceo wizard. Bez lokalnog Redisa posao neće biti pokupljen iz reda — videćeš ga
kako čeka.

### (c) Odluka pre F6 launch-a: **javni R2 bucket vs presigned URL-ovi**
`S3CompatibleStorage.getUrl` vraća običan javan URL. Ključevi su pogodivi
(`uploads/<uid>/imported-<timestamp>.mp4`), pa javni bucket vraća **tačno onu rupu**
zbog koje je auth na `/api/storage` i napisan. Presigned kratkotrajni linkovi su pravo
rešenje. Nije hitno dok R2 nije uključen, ali je launch blocker. Zapisano u
`INFRASTRUCTURE.md` F5.

---

## 4. I dalje neurađeno (nepromenjeno)
Audio muxing (voiceover se generiše ali se ne ubacuje u video) · sound/music panel
(blokiran na izvoru muzike) · F6 billing live + Vercel deploy · legal stranice
(pravnik) · brand naming (`matrix` je ime konkurenta) · `generateVideo` live-test (F7).

Puna lista: `INFRASTRUCTURE.md` (F5–F7) + `SESSION_LOG.md` (vrh).
