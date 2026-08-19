# MARGINS.md — šta nas svaki alat stvarno košta i kolika je marža

**Napisano 2026-08-19.** Krediti su preuzeti od konkurencije (BUSINESS.md), a ovo je
prvi put da je TROŠKOVNA strana izračunata broj po broj. Svaki broj dole nosi oznaku
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

## 1. Koliko vredi kredit (prihodna strana)

| Paket | Krediti | Cena | €/kredit |
|---|---|---|---|
| Starter | 30 | €9 | **€0.300** |
| Creator | 100+10 | €25 | **€0.227** |
| Pro | 250+40 | €55 | **€0.190** |
| Agency | 600+120 | €120 | **€0.167** |

Računamo sa **€0.20/kreditu** kao srednjom vrednošću; najgori slučaj za nas je
Agency (€0.167). Signup bonus: 3 kredita poklonjeno po nalogu (≈€0.60 COGS rizika
maksimalno — zanemarljivo, pokriva jedan quick_test + sliku).

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

## 3. Marža po alatu (po jednom izlazu, prihod po €0.20/kr)

| Alat | Cena | Prihod | COGS tipično | COGS najgori | Marža tip. | Marža najgora |
|---|---|---|---|---|---|---|
| **Nova reklama** (matrix) | 15 kr | €3.00 | ~€0.04 (15s: TTS $0.035 + Lambda $0.003) | ~€0.18 (60s) | **~98.7%** | ~94% |
| **Reklama sa novim zvukom** (revoice) | 8 kr | €1.60 | ~€0.04 | ~€0.18 (60s) | **~97.5%** | ~89% |
| **AI slike** (image_ads) | 4 kr | €0.80 | ~€0.04 ($0.04 nano-banana-2 1K) | €0.06 (2K) | **~95%** | ~92% |
| **Ukloni tekst** (remove_text) | 6 kr | €1.20 | ~€0.04 | isto | **~97%** | — |
| **Poboljšaj kvalitet** (enhance) — SLIKA | 9 kr | €1.80 | ~€0.07 ($0.08) | isto | **~96%** | — |
| **Poboljšaj kvalitet** (enhance) — VIDEO | 9 kr | €1.80 | ~€0.28 (15s 1080p = $0.30) | **vidi ⚠️ dole** | **~84%** | **GUBITAK** |
| **AI influencer** (ai_video, uskoro) | 25 kr | €5.00 | ~€0.28 (veo3_fast 720p) | ~€2.8 (fal fallback) | **~94%** | ~44% |

Za USKORO alate bez pipeline-a (edit 18 kr, mix 12, translate 15, quick_test 2) marža
ne postoji dok se ne odluči ČIME se prave — ako edit ide na Veo-klasu, $0.30–1.30 po
videu znači 85–96% na 18 kr, sasvim zdravo.

### ⚠️ Nalaz #1 — enhance VIDEO može da bude GUBITAK, i ničim nije ograničen

Naplaćujemo **pausalno 9 kr**, a fal Topaz naplaćuje **po sekundi i po rezoluciji**:

| Klip | fal trošak | Naš prihod (9 kr) | Ishod |
|---|---|---|---|
| 15s / 1080p | $0.30 (€0.28) | €1.50–2.70 | ✅ ~84% |
| 60s / 1080p | $1.20 (€1.11) | €1.50–2.70 | ⚠️ 26–59% |
| 60s / iznad 1080p | $4.80 (€4.44) | €1.50–2.70 | ❌ **gubitak €1.7–2.9** |
| 60s / iznad 1080p / 60fps | $9.60 (€8.89) | €1.50–2.70 | ❌ **gubitak €6.2–7.4** |

Upload je ograničen na 200 MB **po veličini fajla, ne po trajanju ni rezoluciji** — a
200 MB komprimovanog 1080p je i po nekoliko minuta. **Pre prvog pravog kupca: ili
ograničiti enhance ulaz (npr. ≤60s, izlaz ≤1080p/30fps), ili naplaćivati po sekundi.**
(Kod danas cilja 1080p — „HD do 1080p" na kartici — pa je $0.08/s zona verovatno
nedostižna dok neko ne promeni parametre; ograničenje treba da to i GARANTUJE.)

### Nalaz #2 — fal fallback za ai_video jede 50 poena marže

kie $0.30 → fal $2–3+ za isti posao. Fallback je ispravan za dostupnost, ali kad
ai_video krene uživo, vredi meriti koliko ČESTO okida — na 25 kr svaki fal-run
spušta maržu sa ~94% na ~44%.

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
| **Stripe** (kad LLC legne) | **~1.5% + €0.25 EEA kartice** [JAVNO] | na Creator paketu od €25 ≈ €0.63 ≈ **2.5%** prihoda |

**Break-even: ~€30/mes fiksno ≈ jedan i po Creator paket mesečno.** Sve preko toga je
~90%+ bruto marže dok god enhance-video ne pukne (Nalaz #1).

## 5. Kontrolni račun — ceo Creator paket potrošen na najskuplji regularan način

110 kredita = 7 poslova „Nova reklama" sa po ~1 varijantom 60s (105 kr) + 1 slika:
COGS ≈ 7×€0.18 + €0.04 ≈ **€1.30** na €25 prihoda → **94.8%** pre Stripe-a,
**~92%** posle. Tipična potrošnja (15s varijante): COGS ≈ €0.30 → **~96%** posle svega.

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

**Sa cenama preuzetim od konkurencije mi smo u KOMFORNOJ DOBITI na svemu što je danas
uživo (~95–99% marže po poslu)** — jedini stvarni rizik gubitka je enhance nad dugim/
visokorezolucijskim videom (Nalaz #1, treba plafon), a jedina velika nepoznanica za
budućnost je cena Veo-klase generacije za edit/ai_video, koja je sada [UHVAĆENA]
($0.30 fast) ali fal fallback i Quality varijante koštaju višestruko.
