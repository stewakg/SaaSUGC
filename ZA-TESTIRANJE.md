# ZA-TESTIRANJE.md — šta te čeka (ažurirano 2026-08-05, kraj dana)

> Kratko: **Matrix sada radi cео lanac** — montaža, glas, titlovi na pravom govoru,
> pomerljivi titlovi, muzika i zvučni efekat. Sve izmereno, ne pretpostavljeno.
> Ostalo ti je jedno testiranje i tri odluke.

---

## 1. ⬛ JEDINA STVAR KOJA STVARNO ČEKA TEBE: klik-test wizarda

Danas je dodato dosta **kontrola u wizardu** koje **nisu prošle kroz browser** — `/app/matrix`
je iza login-a, a ja ne unosim lozinke. Render koji te kontrole pokreću **jeste** proveren;
same kontrole nisu.

```bash
pnpm dev
```
→ http://localhost:3000 → uloguj se → **Matrix** wizard.

Proveri u koraku „Stil i glas":
- [ ] **Padajući spisak glasova se popuni pravim glasovima** (ne „Učitavanje glasova…"). To
      povlači `GET /api/voices` sa tvog ElevenLabs naloga — trebalo bi da ih bude ~58.
- [ ] **Pozicija titla** — tri preseta (Gornja trećina / Iznad sredine / Centar) i dva
      slajdera (gore-dole, levo-desno). Spusti slajder ispod 72% → mora iskočiti žuto
      upozorenje o TikTok interfejsu.
- [ ] **Veličina titla** — slajder 60–150%.
- [ ] **Zvuk** — otpremi neku svoju numeru kao muziku; pojavi se slajder jačine. Preko 45%
      mora iskočiti upozorenje da muzika guši glas. Otpremi i kratak zvuk kao CTA efekat.

Ako sve to izgleda kako treba → generiši jedan oglas i odgledaj ga.

> ⚠️ **Bez lokalnog Redisa posao neće biti pokupljen iz reda** — videćeš ga kako čeka. To je
> očekivano; ceo pipeline je verifikovan mimo reda. Vidi tačku 3.

---

## 2. Šta je danas urađeno (15 commita)

**Montaža radi.** Prvi put otkad je M2c napisan — pravi višekadarski render, varijante se
stvarno razlikuju.

**Glas je u videu**, i **titlovi prate stvarni govor** (ElevenLabs vraća poravnanje po
karakterima, presavijeno u reči — pauze su prave, dijakritika radi).

**Titlovi pomerljivi** — pozicija i veličina, sa safe-zone presetima. Default je podignut sa
~88% (u TikTok traci) na ~46%.

**Muzika i CTA efekat** — uploaduješ svoju numeru, nije potrebna licencirana biblioteka.

**Link import radi** — pravi YouTube/TikTok link → mp4 u storage.

**Benchmark kie.ai vs fal.ai** — 6/6 uspelo, kie ~2.3× brži, kvalitet izjednačen. Ostaje
kie primary / fal fallback. Detalji: `tests/kie-vs-fal.md`.

**Dokumentacija sređena** — `handover.md` obrisan (jedini jedinstven deo spasen u
`BUSINESS.md`), session log prepolovljen + arhiviran.

### Sedam bugova nađenih pokretanjem — nijedan se nije video u kodu
1. `/api/storage` je tražio kolačić → **svaki Matrix posao je padao** na 401.
2. `.gitignore` je progutao celu `/api/storage` rutu — **nikad nije bila u gitu**.
3. `maxFilesize: '200M'` je terao yt-dlp na 1080p HLS → skinuto **269 MB umesto 27 MB**.
4. Titlovi zalepljeni za dno kadra, u zoni TikTok interfejsa.
5. Relativan URL glasa → render **nem**, bez ijedne greške.
6. Wizard je slao **mock id glasa** pravom ElevenLabs-u → `404 voice_not_found`.
7. **CTA zvučni efekat nikad nije radio** — od F4, jer `<Audio>` nije bio u `<Sequence>`.

---

## 3. Tri odluke koje traže tebe

### (a) Redis — **nije hitno**
Produkcijski Redis **već radi na tvom VPS-u** (LIVE-VERIFIED 18.07). Lokalni bi služio samo
da se provoza put `/api/jobs → red → worker` kroz UI. Ako hoćeš: instaliraj Memurai ili daj
cloud `REDIS_URL`.

> ⚠️ **Nemoj SSH tunel do VPS Redisa** — prod worker sluša isti red `adgen-jobs` i pokupio bi
> tvoje test poslove.

### (b) 🔴 Pre F6 launch-a: javni R2 bucket vs presigned URL-ovi
`S3CompatibleStorage.getUrl` vraća običan javan URL, a ključevi su pogodivi
(`uploads/<uid>/imported-<timestamp>.mp4`). To vraća **tačno onu rupu** zbog koje je auth na
`/api/storage` i napisan. Presigned kratkotrajni linkovi su pravo rešenje. **Launch blocker.**

### (c) Cena po pozivu kod kie.ai i fal.ai
Nijedan API ne vraća cenu. Treba pogledati usage log na oba dashboarda. Bez toga se ne zna
da li je `edit` (18 kredita) profitabilan — vidi `BUSINESS.md`.

---

## 4. ⚠️ Troškovna promena — bitno da znaš
Matrix posao sada troši **prave ElevenLabs kredite po varijanti**. `count=15` znači
**15 TTS poziva**. Bez `ELEVENLABS_API_KEY` sve i dalje radi, samo nemo.

---

## 5. I dalje neurađeno
Ugrađena biblioteka muzike (za sada korisnik nosi svoju) · F6 billing live + Vercel deploy ·
legal stranice (pravnik) · brand naming (`matrix` je ime konkurenta) · vizuelni polish
wizarda · F7 `ai_video`.

Puna lista: `INFRASTRUCTURE.md` (F5–F7). Detaljan trag: `SESSION_LOG.md`, sekcija
**„▶ PICK UP HERE TOMORROW"** na vrhu.
