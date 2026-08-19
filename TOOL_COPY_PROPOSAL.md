# Predlog: imena i copy za dva video alata (TODO §3a)

**Status: REŠENO 2026-08-19 — vlasnik izabrao iste noći.** `matrix` = **„Nova
reklama"**, `revoice` = **„Reklama sa novim zvukom"**; copy (honest varijanta za
matrix, undersell + cross-link za revoice) je u kodu od `9663d60`. Živi izvor
istine je `JOB_DESCRIPTORS` u pricing.ts — ovaj fajl ostaje kao zapis rezona.

Originalni predlog ispod, netaknut:

---

Ništa od ovoga nije u kodu. Kad izabereš,
menja se SAMO `label`/`description`/`benefits` u `JOB_DESCRIPTORS`
(`packages/core/src/pricing.ts`) — job type stringovi `'matrix'` i `'revoice'` su
nosivi identifikatori (DB, queue, cene) i NE diraju se, ruta `/app/matrix` isto ostaje.

## Zašto se menja (podsetnik iz TODO §3a)

Kod konkurencije "matrix video" znači SUPROTNO od našeg: njihov "matrix" je naš
`revoice` (jedan klip, novi glas preko), njihov "edit" je naš `matrix` (spaja
klipove). Kupac koji dođe od njih klikne na pogrešan alat. Ime mora da kaže šta
alat RADI, ne kako se tehnologija zove.

## `matrix` — predlozi imena (tvoja radna verzija: „Nova reklama")

| # | Ime | Za | Protiv |
|---|---|---|---|
| 1 | **Nova reklama** (tvoje) | najšire, jasno "od materijala praviš novu" | ne kaže da MEŠA više klipova |
| 2 | **Video reklame** (trenutno) | već poznato korisnicima | generično, ne kaže mehanizam |
| 3 | **Montaža reklama** | kaže tačno mehanizam (seče i sklapa scene) | "montaža" zvuči kao ručni rad |
| 4 | **Reklama iz klipova** | kaže ulaz (više klipova → jedna reklama) | duže |

**Kartica — "šta dobijaš" (ne sme da preklama, vidi upozorenje u §3a):**

> **Ubaci 2–3 klipa — dobiješ više različitih reklama.**
> Ne lepimo klip na klip: svaki klip iseckamo na scene, pa svaku varijantu
> sklopimo od NAJBOLJIH kadrova iz svih klipova. Uz to: skripta, glas, titlovi.
> Svaka varijanta = drugačiji rez.

⚠️ Rečenica „ne lepimo klip na klip" je tačna po kodu (`detectShots` +
`buildMontage`), ali je NIKO nije potvrdio okom na istim klipovima (§9 red
"Scenes mixed, proven by eye"). Dok se to ne uradi, blaža verzija bez poređenja:
„Svaku varijantu sklapamo od kadrova iz svih tvojih klipova."

## `revoice` — predlozi imena (tvoja radna verzija: „Voiceover reklama")

| # | Ime | Za | Protiv |
|---|---|---|---|
| 1 | **Voiceover reklama** (tvoje) | pojam koji TikTok/IG svet zna | anglicizam |
| 2 | **Novi glas** | najkraće, kaže tačno šta se menja | možda previše ogoljeno |
| 3 | **Presnimavanje** | domaća reč, jasna | asocira na kasete :) |
| 4 | **Glas preko klipa** | potpuno doslovno | rogobatno |

**Kartica — mora da PODCENI, ne precenjuje (§3a eksplicitno):**

> **Tvoj klip, novi glas.**
> Video ostaje POTPUNO isti — mi ugasimo originalni zvuk i preko stavimo novu
> skriptu, AI glas, muziku i titlove. Ako hoćeš novi video od svojih klipova,
> to je [ime matrix alata].

Ta poslednja rečenica (cross-link) je važna: ona hvata kupca koji je došao od
konkurencije i krenuo u pogrešan alat.

## Šta odlučuješ

1. Ime za `matrix` (1–4 ili svoje)
2. Ime za `revoice` (1–4 ili svoje)
3. Jača ili blaža verzija montaža-rečenice (dok oko ne potvrdi)

Kad kažeš, implementacija je jedan prolaz: `pricing.ts` labels + kartice +
naslovi wizarda se povlače iz `JOB_DESCRIPTORS` automatski, testovi koji pinuju
stare stringove se re-pinuju.
