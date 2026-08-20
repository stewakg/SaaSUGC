# MARGINS.md — šta nas svaki alat stvarno košta i kolika je marža

**Napisano 2026-08-19. Prihodna strana prepravljena 2026-08-20** — cene paketa su
spuštene da budu 25% ispod konkurentskih (§1a); sve marže niže na stranici su
preračunate na taj novi, niži prihod. Krediti su i dalje preuzeti od konkurencije
(BUSINESS.md), a troškovna strana je i dalje računica iz 2026-08-19. Svaki broj dole nosi oznaku
odakle je:

- **[IZMERENO]** — naš stvarni run (SESSION_LOG 2026-08-14: ceo lanac uživo).
- **[UHVAĆENO]** — cena očitana sa provajderove mašinski čitljive stranice
  (`research/kie-ai-catalogue.md` — kie-ov pricing API, 408 redova, 2026-08-10;
  fal-ovi `llms.txt` — u komentaru `media-edit.fal.ts`).
- **[JAVNO]** — javni cenovnik, iz sećanja/dokumentacije, NIJE potvrđen na fakturi.
- **[PRETPOSTAVKA]** — naznačeno šta i zašto.

⚠️ **Ništa od ovoga još nije sravnjeno sa pravom fakturom** — to je i dalje otvoren
red u TODO §9 („Per-job cost vs. real invoices"). Ovo je računica, ne knjigovodstvo.

---

## 1. Koliko vredi kredit (prihodna strana) — NOVE CENE od 2026-08-20

| Paket | Krediti | Cena | €/kredit | Bilo |
|---|---|---|---|---|
| Starter | 60 | **€9.00** | **€0.150** | 30 kr · €4.50 |
| Creator | 100+10 | **€13.50** | **€0.123** | €25 · €0.227 |
| Pro | 250+40 | **€34.50** | **€0.119** | €55 · €0.190 |
| Agency | 600+120 | **€72** | **€0.100** | €120 · €0.167 |

**Najgori slučaj za nas je sada €0.100/kredit** (Agency), a ne €0.167 — i svaka
marža u §3 je preračunata na taj broj, jer marža koja preživi najjeftiniji kredit
preživi sve ostale. **Signup bonus je 2026-08-20 podignut sa 3 na 45 kredita** — tri „Nova reklama"
videa (3 × 15) — jer je sajt obećavao „3 besplatna videa" a 3 kredita ne kupuju
nijedan. Retail vrednost poklona je €4.50 po nalogu; STVARNI trošak je COGS, a on
je ~€0.12 za tri 15s videa. Najskuplji način da neko potroši poklon je enhance
(5 × 9 kr, do ~€2.75 fal vremena po nalogu) — ako lažni nalozi ikad postanu
obrazac, odgovor je verifikacija mejla pre dodele, ne manji poklon.

⚠️ Zato je i Starter paket podignut sa 30 na 60 kredita: najmanje što PRODAJEMO ne
sme biti manje od onoga što POKLANJAMO.

### 1a. Zašto baš ove cene — poređenje sa konkurencijom [IZMERENO 2026-08-20]

Konkurent (ecomalati.com) ne prodaje pakete nego **mesečnu pretplatu**, i njegove
cene po ALATU su identične našima (matrix 15, edit 18, AI slika 4). Dakle jedina
poluga kojom se razlikujemo je koliko košta kredit:

| Njihov plan | Cena | Krediti/mes | €/kredit | Naš uporedni paket | Naš €/kredit | Razlika |
|---|---|---|---|---|---|---|
| Starter | €50/mes | 250 | €0.200 | Starter (30) | €0.150 | **−25%** |
| Pro | €100/mes | 600 | €0.167 | Creator (110) | €0.123 | **−26%** |
| Pro | €100/mes | 600 | €0.167 | Pro (290) | €0.119 | **−29%** |
| Max | €200/mes | 1500 | €0.133 | Agency (720) | €0.100 | **−25%** |

Dve strukturne razlike koje se ne vide u tabeli, a prodaju umesto nas: kod njih se
**ulazi sa €50 mesečno i obavezuje se na mesec**, kod nas se kupuje paket od €4.50
bez pretplate. Njihov trial je ugašen 18.08.2026 (piše u komentaru njihovog
sopstvenog HTML-a), a stranica sa cenama još obećava 50 gratis kredita.

## 2. Jedinični troškovi (troškovna strana)

| Šta | Cena | Izvor |
|---|---|---|
| ElevenLabs TTS (`eleven_multilingual_v2`) | 1 ElevenLabs-kredit po karakteru; **~$0.20/1000 karaktera** na Creator planu ($22/100k) | [JAVNO] — **koji plan imamo nije zabeleženo**; Starter je $0.167/1k, Pro $0.198/1k |
| Skripte (OpenRouter `gemini-3.1-flash-lite`) | ~$0.10/M ulaz + $0.40/M izlaz → **~$0.0005 po pozivu** | [JAVNO] |
| Lambda render | 17.2s reklame = 91.3 lambda-sekundi [IZMERENO] × 2 GB [PRETPOSTAVKA: Remotion default memorija] × $0.0000167/GB-s → **~$0.003 po videu**; skalira ~$0.00018 po sekundi reklame | [IZMERENO]+[JAVNO] |
| kie.ai slika (`nano-banana-2`, 1K) | **$0.04 po slici** ($0.06 za 2K, $0.09 za 4K) | [UHVAĆENO] |
| kie.ai video (`veo3_fast`) | **$0.30 (720p) / $0.325 (1080p) po videu** (Veo 3.1 Fast; Quality je $1.25+) | [UHVAĆENO] |
| fal.ai fallback video (`veo3.1 i2v`) | red veličine **$2–3+ po videu** | [JAVNO] — proveriti pre nego što fallback postane bitan |
| fal.ai Topaz upscale VIDEO | **$0.01/s ≤720p · $0.02/s 1080p · $0.08/s iznad · ×2 na 60fps** | [UHVAĆENO] |
| fal.ai Topaz upscale SLIKA | **$0.08** (do 24MP) | [UHVAĆENO] |
| fal.ai uklanjanje teksta | **$0.04 po slici** | [UHVAĆENO] |
| R2 skladište | $0.015/GB-mesečno; 17 MB video = **$0.00026/mes** | [JAVNO] — zanemarljivo |
| Scene-detect, titlovi, montaža | ffmpeg na našem boxu — **€0 marginalno** | — |

Govorni tempo [IZMERENO]: 164 karaktera ≈ 17.2s → **~9.5 kar/s**. Plafoni u kodu:
reklama ≤60s, skripta <900 karaktera, ≤15 varijanti po poslu.

## 3. Marža po alatu — na NAJJEFTINIJEM kreditu (€0.100/kr, Agency)

Prihod je namerno računat po najgoroj tarifi za nas. Kupac na Starteru plaća 50%
više po kreditu, pa je svaka marža dole **donja granica, ne prosek**.

| Alat | Cena | Prihod (€0.100/kr) | COGS tipično | COGS najgori | Marža tip. | Marža najgora |
|---|---|---|---|---|---|---|
| **Nova reklama** (matrix) | 15 kr | €1.50 | ~€0.04 (15s: TTS $0.035 + Lambda $0.003) | ~€0.18 (60s) | **~97%** | ~88% |
| **Reklama sa novim zvukom** (revoice) | 8 kr | €0.80 | ~€0.04 | ~€0.18 (60s) | **~95%** | ~78% |
| **AI slike** (image_ads) | 4 kr | €0.40 | ~€0.04 ($0.04 nano-banana-2 1K) | €0.06 (2K) | **~90%** | ~85% |
| **Ukloni tekst** (remove_text) | 6 kr | €0.60 | ~€0.04 | isto | **~93%** | — |
| **Poboljšaj kvalitet** (enhance) — SLIKA | 9 kr | €0.90 | ~€0.07 ($0.08) | isto | **~92%** | — |
| **Poboljšaj kvalitet** (enhance) — VIDEO | 9 kr **po 30s** | €0.90 po tieru | ~€0.28 (15s 1080p) | €0.55 (30s 1080p) | **~69%** | **~39%** |
| **AI influencer** (ai_video, uskoro) | 25 kr | €2.50 | ~€0.28 (veo3_fast 720p) | ~€2.8 (fal fallback) | **~89%** | ❌ **GUBITAK** |

Za USKORO alate bez pipeline-a (edit 18 kr, mix 12, translate 15, quick_test 2) marža
ne postoji dok se ne odluči ČIME se prave — ako edit ide na Veo-klasu, $0.30–1.30 po
videu znači 28–83% na 18 kr (€1.80 na najjeftinijem kreditu), što je bitno tanje nego
na starim cenama i mora se izračunati pre nego što se taj pipeline uključi.

### ⚠️ Nalaz #0 (NOVO 2026-08-20) — ai_video na fal fallback-u je sada GUBITAK

Ovo je nastalo spuštanjem cena, nije postojalo juče. `ai_video` nosi 25 kr = **€2.50**
na najjeftinijem paketu, a fal fallback košta **€2.8** — dakle svaki put kad kie.ai
padne i router pređe na fal, taj posao nas košta više nego što donosi. Na srednjoj
tarifi (Creator, €0.123/kr) prihod je €3.07 naspram €2.8, tj. 9% — jedva pozitivno.

**Zatvoreno istog dana u kodu:** `KieAIFalRouter` više ne pada automatski na fal za
VIDEO. Fallback je sada opt-in (`allowVideoFallback`, podrazumevano isključen), i kad
kie padne posao padne sa jasnom porukom da nije naplaćen. Slike zadržavaju automatski
fallback — tamo obe kuće naplaćuju $0.04, pa argument o gubitku ne važi.

Ostaje CENOVNA odluka za kasnije: ako se ikad poželi dostupnost po svaku cenu, ai_video
mora da poskupi ili fallback dobija sopstveni plafon. Dok je alat USKORO, isključen
fallback je ispravan podrazumevani izbor.

### ✅ Nalaz #1 — enhance VIDEO je ZATVOREN plafonom (bio je jedini put u gubitak)

**Rešeno 2026-08-20, u tri koraka istog dana.** Prvo je postavljen plafon (`09fb33b`),
pa spušten sa 60s na 30s kad su cene pale — a onda je shvaćeno da plafon štiti maržu
tako što alat čini beskorisnim za normalnu reklamu od 45 sekundi. Konačno rešenje je
ono koje je i sam modul od početka nazivao ispravnim: **naplata po dužini.**

`packages/core/src/enhance-limits.ts` sada deli klip na **tiere od 30 sekundi**:
9 kredita nosi 30s, duži klip košta srazmerno više, plafon je **4 tiera = 120s**.
Marža time prestaje da zavisi od dužine — 39% u najgorem slučaju i na 30s i na 120s,
umesto da propada sa svakom sekundom. Ostale odbrane su ostale: izvor iznad 1080p se
odbija, upscale faktor se kleše da IZLAZ ostane u 1080p pojasu, sve preko 30fps se
pinuje na 30, a fajl koji se ne može izmeriti se odbija (fail-closed).

Gde se to proverava — na tri mesta, namerno:
1. **wizard** meri fajl u browseru pre otpremanja i pokazuje cenu („Klip traje 45s —
   naplaćuje se kao 2 × 30s"), pa niko ne šalje 200 MB da bi saznao cenu;
2. **`/api/jobs`** računa cenu iz te dužine i upisuje `params.enhanceTiers` kao RAČUN
   na job red;
3. **worker** meri stvarni fajl ffprobe-om i odbija posao ako traži više tiera nego
   što je plaćeno (`underpaid_duration`) — pre nego što je išta naplaćeno. Laganje
   naniže donosi odbijanje, ne popust. Kraći klip od plaćenog prolazi.

Naplata prati račun: `job-state.ts` za enhance naplaćuje `JOB_COST.enhance × tiers`, a
ne `× broj izlaza` — inače bi klip od dva minuta bio naplaćen kao trideset sekundi.

Originalni nalaz, radi istorije — ovako je izgledalo pre plafona:

| Klip | fal trošak | Naš prihod (9 kr, stare cene) | Ishod |
|---|---|---|---|
| 15s / 1080p | $0.30 (€0.28) | €1.50–2.70 | ✅ ~84% |
| 60s / 1080p | $1.20 (€1.11) | €1.50–2.70 | ⚠️ 26–59% |
| 60s / iznad 1080p | $4.80 (€4.44) | €1.50–2.70 | ❌ **gubitak €1.7–2.9** |
| 60s / iznad 1080p / 60fps | $9.60 (€8.89) | €1.50–2.70 | ❌ **gubitak €6.2–7.4** |

Upload je ograničen na 200 MB **po veličini fajla, ne po trajanju ni rezoluciji** — a
200 MB komprimovanog 1080p je i po nekoliko minuta. To je i bila rupa; sada se meri
trajanje i rezolucija, a ne bajtovi.

### Nalaz #2 — fal fallback za ai_video jede 50 poena marže

kie $0.30 → fal $2–3+ za isti posao. Na starim cenama je fal-run spuštao maržu sa
~94% na ~44% — neprijatno, ali pozitivno. **Na novim cenama isti fal-run je gubitak**
(Nalaz #0 gore). Merenje koliko ČESTO okida i dalje treba, ali odluka više ne može da
čeka mesečni izveštaj: mora da se donese pre nego što ai_video ode uživo.

### Nalaz #3 — generate-scripts je besplatan za korisnika, a nas košta

`/api/generate-scripts` ne skida kredite (evidentirano u TODO §1b kao odluka o ceni
koja čeka). Po pozivu ~$0.0005 — zanemarljivo dok je rate limit živ (Redis pao ⇒
fail-open, poznat rizik). Sa 1000 zloupotrebljenih poziva dnevno: ~$0.50/dan. Nisko,
ali jedina ničim naplaćena potrošnja u aplikaciji.

## 4. Fiksni troškovi i naplata

| Stavka | Mesečno | Napomena |
|---|---|---|
| Hetzner VPS (2 vCPU/4 GB) | ~€4–8 | [JAVNO] |
| ElevenLabs plan | $5–22 | plan nepoznat; Creator $22 uključuje 100k karaktera ≈ ~660 tipičnih 15s varijanti |
| Supabase | €0 | free tier |
| AWS / R2 | ~€0 fiksno | čist pay-per-use |
| Domen | ~€1 | još ne postoji |
| **Stripe** (kad LLC legne) | **~1.5% + €0.25 EEA kartice** [JAVNO] | na Creator paketu od €13.50 ≈ €0.45 ≈ **3.4%** prihoda |

**Break-even: ~€30/mes fiksno ≈ 2.2 Creator paketa mesečno** (bilo 1.2 na starim
cenama). Sve preko toga je ~90%+ bruto marže. ⚠️ Fiksna Stripe naknada od €0.25 boli
srazmerno više što je paket manji: na Starteru od €4.50 ona je **7.1%** prihoda
(€0.32 od €4.50), pa je taj paket akvizicioni alat, a ne izvor marže.

## 5. Kontrolni račun — ceo Creator paket potrošen na najskuplji regularan način

110 kredita = 7 poslova „Nova reklama" sa po ~1 varijantom 60s (105 kr) + 1 slika:
COGS ≈ 7×€0.18 + €0.04 ≈ **€1.30** na **€13.50** prihoda → **90.4%** pre Stripe-a,
**~87%** posle. Tipična potrošnja (15s varijante): COGS ≈ €0.30 → **~94%** posle svega.
Na starim cenama isti račun je davao 94.8% / ~92% — spuštanje cena je pojelo oko
5 poena bruto marže, i to je cena ulaska ispod konkurencije.

## 6. Šta ovo NE pokriva (i gde može da slaže)

1. **Nijedna faktura nije pročitana** — kie/fal/ElevenLabs/AWS dashboardi su konačni
   sudija (TODO §9). Posebno: ElevenLabs PLAN (menja TTS cenu ±30%), i da li kie
   stvarno naplaćuje listu iz svog pricing API-ja.
2. Lambda memorija je pretpostavljena (2048 MB) — proveriti u AWS konzoli; 4096 MB
   bi dupliralo render trošak (i dalje zanemarljiv).
3. Stripe brojke su pretpostavka dok naloga nema; ne uključuju Stripe Tax.
4. Refundacije/chargeback (L3.6) i prenos neiskorišćenih kredita (BUSINESS.md
   liability #2) nisu u marži — to su odluke, ne troškovi po jedinici.

## 7. Zaključak jednom rečenicom

**Sa cenama 25% ispod konkurencije i dalje smo u DOBITI na svemu što je danas uživo —
88–97% po poslu čak i na najjeftinijem kreditu** (bilo 95–99% na starim cenama; razlika
je cena ulaska ispod konkurenta). Jedini put u gubitak, enhance nad dugim videom, je
ZATVOREN plafonom u kodu (Nalaz #1). Ostaje jedan otvoren: **ai_video preko fal
fallback-a sada gubi novac** (Nalaz #0) i mora se rešiti pre nego što taj alat ode
uživo — dotle ne curi ništa jer pipeline ne postoji.
