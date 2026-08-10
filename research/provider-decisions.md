# Provider decisions — kie.ai vs fal.ai

**Written 2026-08-10.** Inputs: `research/fal-ai-catalogue.md` and `research/kie-ai-catalogue.md`,
researched independently on the same day. This file is a **decision doc, not a third catalogue** —
it only covers capabilities AdGen actually needs, and every section ends with a call.

**Price provenance rule:** every number below traces to one of the two catalogues. Where neither
captured a price it says **not captured** — nothing here is estimated or filled in from memory.
Credit costs come from `packages/core/src/pricing.ts`; the €/credit rate (0.20–0.30) from
`BUSINESS.md` and `tests/kie-vs-fal.md`. Provider prices are USD list, revenue is EUR, and **no FX
conversion is applied** — at rough parity the comparison is indicative, not accounting.

**Do the two catalogues contradict each other?** On shared facts, no. Not one price appears in both
files with two different values. The friction is entirely **asymmetric coverage** — fal publishes
price only inside each endpoint's own `llms.txt`, so the fal side has many "not captured" cells,
while kie's whole 408-row price table comes back from a single unauthenticated API call. Every
disagreement flagged below is a gap or an inference, and is labelled as such.

---

## 1. `enhance` — video upscale → **fal.ai**

Same underlying Topaz engine on both sides, so quality is not the variable. Price and terms are.

| | fal `fal-ai/topaz/upscale/video` | kie `topaz/video-upscale` |
|---|---|---|
| Billing axis | by **output resolution** | by **upscale factor** |
| Rate | $0.01/s ≤720p · **$0.02/s 720p–1080p** · $0.08/s >1080p | **$0.04/s at 1x–2x** · $0.07/s at 4x |
| **15 s clip to 1080p** | **$0.30** | **$0.60** |
| 60 fps output | doubles → $0.60 | not captured |
| Input cap | not captured | **50 MB**, mp4/mov/mkv |
| Controls | factor 1–4, frame interpolation `target_fps` 16–60, noise/halo/grain/detail, H264 or H265 | factor 1/2/4 only |
| Failed jobs | not charged (fal does not bill server errors or queue wait) | not charged |

**fal is exactly half price for the case that matters.** `enhance` charges 9 credits ≈ €1.80–2.70,
so provider cost is **11–17% of revenue on fal against 22–33% on kie** — the difference between a
comfortable margin and a tool that eats a third of its own price.

fal also wins on everything that is not price: no stated input-size cap (kie's 50 MB ceiling is a
real product constraint — a user's phone clip clears it easily, so the kie path needs a
transcode/downscale step before the call, which is code AdGen would have to write and maintain),
plus frame interpolation and codec control that kie does not expose at all.

**One inference worth recording** (mine, from combining the two tables — neither catalogue states
it): because the two price on *different axes*, the winner flips above 1080p. A 15 s clip rendered
above 1080p is $1.20 on fal ($0.08/s) but $1.05 on kie ($0.07/s at 4x). Irrelevant today —
`enhance` promises sharp HD **up to 1080p** — but it means "fal is half the price" is a claim about
the 1080p band specifically, not about Topaz generally. Don't let it get repeated as a general law.

Rejected: fal's `fal-ai/seedvr/upscale/video` works out to ≈$0.93 for the same 15 s clip by its
megapixel formula — three times Topaz for no gain at this resolution. Both catalogues' "creative"
upscalers are wrong by construction: they invent detail, which on a product shot is a lie about the
goods.

> **Decision: `fal-ai/topaz/upscale/video`, $0.02/s, $0.30 per 15 s 1080p clip.**

---

## 2. `enhance` — image upscale → **kie.ai**, on evidence rather than preference

The head-to-head cannot be run on price: **fal's `fal-ai/topaz/upscale/image` price was not
captured** — the fal catalogue's image table has no price column at all. Same for
`fal-ai/recraft/upscale/crisp`. So this is a decision made against one known column.

| Endpoint | Provider | Price | Notes |
|---|---|---|---|
| `topaz/image-upscale` | kie | **$0.05** to 2K · $0.10 to 4K · $0.20 to 8K | ≤10 MB, jpeg/png/webp, factor 1/2/4 |
| `recraft/crisp-upscale` | kie | **$0.0025** | takes `image` only — no factor, no controls; a sharpener, not a restorer |
| `fal-ai/topaz/upscale/image` | fal | not captured | same Topaz family as the video endpoint |
| `fal-ai/recraft/upscale/crisp` | fal | not captured | fal's equivalent of the cheap path |

At 9 credits ≈ €1.80–2.70, **$0.05 is under 3% of revenue — price is not what decides this one.**
What decides it is that kie's Jobs API client already exists and is proven live
(`packages/core/src/providers/ai.kiefal.ts`: `createTask` → `recordInfo`, with the
`resultJson`-is-a-JSON-string quirk already handled), so the image path is a `model` string away.

**The trap, from the kie research:** `grok-imagine/upscale` and the Veo `get-1080p-video` /
`get-4k-video` endpoints look like cheap upscalers ($0.05–$0.10, $0.025 for Veo 1080p) and are
**useless here** — they accept only a kie.ai `task_id` from media kie.ai itself generated, never a
user's uploaded file. The docs are explicit: only Kie AI-generated task IDs are supported. Anyone
skimming the price column will pick one of these; they cannot work for a user-upload tool.

`recraft/crisp-upscale` at **$0.0025** is 20× cheaper than Topaz and is the right free-tier path
(`SIGNUP_BONUS_CREDITS = 3` — this makes the bonus survivable), but it is a sharpener, so it must
not be sold as the same thing.

> **Decision: kie `topaz/image-upscale` ($0.05) as the paid path, `recraft/crisp-upscale` ($0.0025)
> for free tier.** This deliberately splits `enhance` across providers — fal for video, kie for
> image. **Named condition to revisit:** fetch `https://fal.ai/models/fal-ai/topaz/upscale/image/llms.txt`
> and close the not-captured gap. If fal's image Topaz is at or under $0.05, consolidate both media
> types onto fal and delete a provider from this tool.

---

## 3. `remove_text` — image → **fal.ai**, and price is not why

| | fal `fal-ai/image-editing/text-removal` | kie `google/nano-banana-edit` |
|---|---|---|
| Price | **$0.04** /image | **$0.02** /image |
| Input | `image_url` **only — no prompt** | `prompt` + `image_urls[]` + aspect/size/format |
| Kind | purpose-built: removes all text and writing, preserves background | general prompt-driven image editor |

The brief framed the prompt-free endpoint as removing a translation layer for Serbian users. **That
argument does not survive contact with how the tool actually works, and the decision is right
anyway** — so here is the corrected reasoning.

`remove_text` is a single-purpose job. The user clicks one button; they never type anything. The
prompt sent to `google/nano-banana-edit` would be a **hardcoded English constant** written by us
("remove all text, subtitles, watermarks and logos, reconstruct the background naturally"), not
user input. There is no translation layer to remove, because there is no user text in the first
place. The prompt-driven-vs-not distinction only earns its keep on a *general* edit tool where the
user describes what they want — that is the `edit` job, not this one.

**The real argument for fal is failure modes.** An endpoint whose entire input is `image_url`
cannot misread an instruction. A general image editor handed "remove all text" can comply
partially, regenerate the whole frame, drift the product's colour, or invent a label — and
`remove_text` charges 6 credits on a promise of no blur or smearing. A purpose-built endpoint is
the safer product even at 2× the unit price, because the expensive failure here is a bad output the
user sees, not two cents.

And two cents is the whole delta. 6 credits ≈ €1.20–1.80 of revenue; **$0.02 is roughly 1% of it.**
Price is genuinely not decisive, so it should not be allowed to decide.

Note this **inverts the house routing** — it is the one capability where fal goes primary. kie's
`google/nano-banana-edit` at $0.02 makes a good fallback precisely because the client code and
credentials already exist, and the same family already powers `image_ads`. kie's `ideogram/v3-edit`
($0.0175 TURBO / $0.035 BALANCED / $0.05 QUALITY) is the only true masked inpainting on either
platform and would give the best quality — but `mask_url` is **required** and neither platform has
a text-detection endpoint, so shipping it means building OCR/box-detection first. Not worth it for
a 6-credit tool.

> **Decision: `fal-ai/image-editing/text-removal` ($0.04) primary, `google/nano-banana-edit` ($0.02)
> fallback.** Both are cents — run one A/B on real dirty frames before locking the order.

---

## 4. `remove_text` — video → **confirmed category gap. Do not ship.**

Two researchers, two platforms, same day, no contact between them, same conclusion. That
convergence is the strongest evidence in either file, and it should be treated as settled rather
than re-researched next session.

| Side | What exists | Why it fails |
|---|---|---|
| **fal** | `fal-ai/bria/video/erase/mask` — **$0.14/s**, temporally consistent | Requires a **mask video you must generate yourself**. AdGen has no text-detection or mask-tracking pipeline; that is the actual blocker, before price |
| **fal** | `fal-ai/bria/video/erase/keypoints` — **$0.14/s** | **Input must be under 5 seconds** (`auto_trim` cuts to 5 s). Unusable for a 15 s ad by construction |
| **kie** | **Nothing.** No text-, watermark- or object-removal video model anywhere — all 253 doc pages grepped for `inpaint`, `watermark removal`, `object removal`, `erase` | The category does not exist on the platform |
| **kie** | Closest: Runway **Aleph**, `POST /api/v1/aleph/generate` — **$0.55 flat per video**, no stated duration limit | **Re-renders frames from a prompt** instead of erasing a region. The "no blur or smearing" promise cannot be kept by a re-render |

**The economics are not marginal, they are inverted.** 15 s × $0.14/s = **$2.10** of provider cost
against `remove_text` at 6 credits ≈ **€1.20–1.80** of revenue. Every job loses money before a
single Remotion frame is rendered.

> **Correction to the fal catalogue's own framing:** it compares $2.10 against "€3.00–4.50 of
> revenue for the whole video," which is a 15-credit job. `remove_text` is **6 credits**
> (`pricing.ts`). The real gap is worse than that file states — not thin margin, negative margin.

Aleph's flat **$0.55** is the only option inside the revenue envelope, and it buys a re-render, not
an erase. If the video path is ever shipped it is Aleph behind an explicit "experimental — output
is a re-render" warning, on its own dedicated poll path (`/api/v1/aleph/record-info`, not the Jobs
API). Default: don't.

**What this means for the burned-in-UI problem:** buying our way out of another platform's
watermark is not purchasable at any price either provider offers. **Excluding dirty shots is the
only path** — detect them at scene level and never pick them. That is already the owner's decision
(`TODO.md` §4); both catalogues independently confirm there was never an alternative to reject.

> **Decision: no video `remove_text`. Do not advertise it. Revisit only if a purpose-built video
> eraser appears — not on a price drop, since price was never the primary blocker.**

---

## 5. Existing wiring — keep the routing, change the router's shape

### Image generation: kie-primary / fal-fallback stands

The catalogues change nothing here, and three independent lines of evidence now point the same way:

- **Speed** — `tests/kie-vs-fal.md` (2026-08-05, n=3 prompts × 2 providers, real credits): kie
  median **12.0 s** vs fal **27.8 s**, ~2.3× faster; kie's worst case (20.8 s) beats fal's best
  (23.5 s). Consistent across all three prompts.
- **Reliability** — all 6 calls succeeded first try on both sides. A wash.
- **Price** — kie catalogue puts `nano-banana-2` at **$0.04 (1K)**. The fal catalogue does not
  price it (**not captured**); `tests/kie-vs-fal.md` separately recorded fal at $0.08 base, which
  is consistent with kie being roughly half.

> **Decision: no change. kie.ai primary, fal.ai fallback for `generateImage`.**

### But the router's shape must change

`KieAIFalRouter` today encodes **one fixed model per method, kie tried first**
(`nano-banana-2` for image, `veo3_fast` for video). The decisions above do not fit that shape:
`enhance`/video → fal, `enhance`/image → kie, `remove_text`/image → fal-primary. **The winner is
not the same provider for every capability**, so the router needs a `capability → (provider, model)`
table rather than a global preference order. That is the one real architectural consequence of this
research, and it should be done when `enhance` is wired, not retrofitted after.

Two operational notes that fall out of it:

- **File hosting.** Every model on both platforms takes a **URL, never raw bytes**, and both
  `enhance` and `remove_text` are upload-driven. kie's upload host is a *different base*
  (`https://kieai.redpandaai.co` — stream / base64 / url-fetch, free, max 100 MB, auto-deleted
  after 24 h). AdGen already has R2 and an `/api/storage` route: **serve R2 public URLs to both
  providers and skip kie's upload host entirely.** One code path, no 24-hour clock, no second host.
- **Retention.** kie keeps generated media **14 days**. If AdGen ever links to a provider URL
  instead of copying the bytes into R2, that link dies in two weeks. Copy on completion.
- **Rate limit.** kie rejects (does not queue) above 20 new tasks / 10 s per account — a `matrix`
  job at count=15 is already close to that ceiling.

### ElevenLabs: keep calling it directly

It is available through both — fal `fal-ai/elevenlabs/tts/turbo-v2.5` (**price not captured**) and
kie `elevenlabs/text-to-speech-turbo-2-5` at **$0.03 / 1000 chars**,
`elevenlabs/text-to-speech-multilingual-v2` at **$0.06 / 1000 chars** (multilingual v2 covers
Serbian), `elevenlabs/text-to-dialogue-v3` at $0.07 / 1000 chars.

**ElevenLabs' own direct price is in neither catalogue — not captured — so it is not possible to
say from this research whether reselling is cheaper or more expensive than direct.** That single
missing number is what the decision would turn on, so the honest answer is to keep the status quo
until it exists.

Independent of price, three reasons to stay direct: a resold TTS endpoint generally does not expose
the **voice library or voice cloning**, which F7's AI-influencer work will need; TTS is the
highest-call-count dependency in the product (BUSINESS.md: a `matrix` job at count=15 makes **15
TTS calls**), so adding a hop multiplies latency and adds a failure point 15 times per job; and
consolidation buys billing convenience, not capability. Convenience does not outrank a hot path.

> **Decision: keep ElevenLabs direct. Revisit only if consolidating billing becomes a real
> requirement — and capture ElevenLabs' direct per-1000-char price first, or the comparison is
> guesswork.**

---

## 6. New capabilities worth building

Selective on purpose. Both platforms sell hundreds of models; four of them have a business case for
a Serbian cash-on-delivery ad tool specifically. The rest are listed at the bottom as explicit
rejects so the selectivity is auditable.

### a. Background removal — kie `recraft/remove-background`, **$0.005/image**

Half a cent. Every COD seller needs white-background cutouts for marketplace listings (Kupindo,
Limundo, Instagram Shop), and it is the single most-requested utility in this category. At $0.005
it is cheap enough to **give away as an acquisition hook** rather than price as a revenue line —
which is what makes it interesting: `SIGNUP_BONUS_CREDITS` is 3, and a free utility that costs
half a cent per use is a signup driver that cannot lose money. fal's equivalents
(`fal-ai/birefnet/v2`, `fal-ai/bria/background/remove`) are **not captured** on price, so kie wins
by default here too.

### b. Music bed — kie Suno, `POST /api/v1/generate`, **$0.06 per track**

This one closes a promise the UI **already makes**. The `matrix` descriptor in
`packages/core/src/pricing.ts` reads "skripta, glas, titl, **muzika**, CTA." If that music is
currently a fixed library track, then every ad AdGen ships carries a copyright-claim risk on TikTok
and Reels — a real liability for a tool whose entire output is social video. $0.06 for an original,
licence-clean bed per campaign against a 15-credit job (€3.00–4.50) is **under 2% of revenue to
remove a platform-takedown risk.** Related and cheaper: `POST /api/v1/generate/sounds` at $0.0125
for effects, `POST /api/v1/lyrics` at $0.002. Also on the dedicated path, not the Jobs API.

### c. Lip-sync dubbing — upgrade the existing `translate` job

`translate` already exists at 15 credits (€3.00–4.50) and presumably swaps voice and captions
without touching the mouth. Making the mouth match is the difference between a dubbed ad and a
believable one, and the prices make it easy:

| Endpoint | Provider | Price | 15 s clip |
|---|---|---|---|
| `volcengine/video-to-video-lip-sync` | kie | **$0.04/s** | $0.60 |
| `kling/ai-avatar-standard` | kie | $0.04/s, ≤15 s, 720p | $0.60 |
| `infinitalk/from-audio` | kie | **$0.015/s** 480p · $0.06/s 720p | $0.225 / $0.90 |
| `fal-ai/heygen/v3/lipsync/{precision,speed}` | fal | not captured | — |

$0.60 against €3.00–4.50 is **13–20% COGS**. This is the best business case of the four because it
raises the quality of a tool that already exists and already has a price — no new job type, no new
UI, no new credit-cost argument. `volcengine/video-to-video-lip-sync` is the pick: it takes an
existing video rather than generating an avatar, which is exactly the `translate` shape.

### d. Product photography — a new sellable job

`fal-ai/image-apps-v2/product-photography` (professional product shots, realistic lighting and
backgrounds) is **not captured** on price, so it cannot be committed to today. But the need is the
most concrete in the whole catalogue: COD sellers shoot products on a kitchen table with a phone,
and a tool that turns that into a studio shot is worth paying for on its own, independent of video.

**It is shippable now regardless**, because kie prices the prompt-driven equivalents:
`google/nano-banana-edit` at **$0.02**, `seedream/5-pro-image-to-image` at **$0.035 (1K)**,
`flux-2/pro-image-to-image` at **$0.025 (1K)**. At $0.02–0.035 this could be priced near
`image_ads` (4 credits ≈ €0.80–1.20) with a very comfortable margin. Fetch fal's price before
choosing; ship on kie if it does not come back cheaper.

### Deliberately not recommended

- **Virtual try-on** (`fal-ai/fashn/tryon/v1.6`, `fal-ai/flux-pro/v1/vto` and four others) —
  **highest upside on this list and entirely unpriced.** Apparel is a huge Balkan COD category, but
  **all six fal endpoints are "not captured"** and kie's catalogue lists none. This is a pricing
  fetch away from being a real candidate; it is not a decision yet, and should not be planned
  around until it is.
- **3D** (`fal-ai/trellis`, Tripo3D) — no COD ad use case.
- **LLM arbitrage** — kie resells Claude at roughly 71% under Anthropic list. Real money, but AdGen
  already routes through Claude directly and OpenRouter. A price arbitrage, not a capability gap,
  and it adds a dependency on the supply risk flagged below.
- **`fal-ai/any-llm`** — same reasoning; we use OpenRouter.

### One UX pattern worth stealing (not a purchase)

FLUX.3 on fal ships a cheap `/draft` tier plus `/draft-enhance` to re-render the *approved* draft
at full quality. That maps almost exactly onto AdGen's script-review step: let the user approve a
cheap preview before paying for the expensive render. kie has the pieces to build the same shape at
its own prices — `grok-imagine/text-to-video` at **$0.008/s 480p / $0.015/s 720p** and
`bytedance/seedance-2-mini` at **$0.012–$0.041/s** make a genuinely cheap preview tier viable
against `quick_test` at 2 credits (€0.40–0.60). Worth noting for BUSINESS.md's open question about
whether `edit` (18 credits ≈ €3.60–5.40) is a loss leader: kie's Veo 3.1 **Quality 1080p is $1.275
per video** — 24–35% COGS, which is survivable — while **Lite 720p at $0.15** is what makes a
preview tier essentially free.

---

## How to research these platforms

Both turned out to have machine-readable surfaces. **Nobody should browse either gallery by hand
again** — the slow half of both catalogues was gathered that way, and it was wasted effort.

### fal.ai

| Surface | What it gives |
|---|---|
| `https://fal.ai/llms.txt` | Platform overview + representative endpoint ids per category |
| `https://fal.ai/models/<endpoint-id>/llms.txt` | **The important one.** Live input/output schema, types, defaults, constraints, **price**, and runnable snippets for one endpoint — generated from the same metadata the platform serves, so it cannot drift from the real endpoint |
| `https://fal.ai/docs/llms.txt` | Index of every doc page |
| `https://fal.ai/docs/llms-full.txt` | Entire documentation in one file (several MB) |
| any doc URL + `.md` | That page as markdown |
| `https://fal.ai/docs/documentation/setting-up/mcp` | **fal ships an MCP server** — an agent client can query the catalogue directly instead of scraping |

Endpoints are ids like `fal-ai/flux/dev`; over plain HTTP,
`POST https://queue.fal.run/<endpoint-id>` with `Authorization: Key $FAL_KEY`. Prepaid credits,
billed per output. **fal does not charge for server errors or queue wait.**

### kie.ai

| Surface | What it gives |
|---|---|
| `https://docs.kie.ai/llms.txt` | Index of every doc page (253 English pages). Any doc URL + `.md` returns the **full OpenAPI 3.0.1 spec**: model enum, every input field, types, defaults, size/duration limits. Authoritative for endpoint ids and parameters |
| `POST https://api.kie.ai/client/v1/model-pricing/page` body `{"pageNum":N,"pageSize":100}` | **The entire pricing table — 408 rows** with credit price, USD price, billing unit, provider, and an anchor URL usually containing the exact `?model=<id>`. **No auth.** `pageSize` capped at 100 |
| `POST https://api.kie.ai/api/v1/playground/pagePlaygroundGroup` body `{"pageNum":N,"pageSize":30}` | 94 model groups tagged by `taskType` (Text to Video, Image Editing, Lip Sync, Video Upscale, …) and provider |

Auth for the real API: `Authorization: Bearer <KIE_API_KEY>`, base `https://api.kie.ai`.
**Credits convert at 200 credits = $1.**

### Traps, both sides

- **`WebFetch` gets 403 on kie.ai.** Plain `curl` against `docs.kie.ai` and the two JSON APIs works
  fine. Use curl.
- **`kie.ai/market` and `kie.ai/pricing` render empty without login** — the console throws
  `No Login`. The HTML is a dead end; the JSON APIs above are the fast path and need no account.
- **Never scrape either gallery.** Everything worth having is in a `.txt`, a `.md`, or a JSON
  endpoint.
- **Re-fetch before writing code.** Both catalogues change often; treat every endpoint id in this
  repo as a starting point, not a contract.

### The asymmetry — this is the useful finding

**kie publishes a complete machine-readable price list; fal does not.** One unauthenticated call
(five pages at `pageSize: 100`) returns all 408 kie prices. fal's price lives *only* inside each
individual model's `llms.txt`, so pricing the fal catalogue means one fetch per endpoint you care
about — which is exactly why the fal side of this research has so many "not captured" cells and the
kie side has almost none.

**Practical recipe:** pull kie's entire price table in ~5 curl calls up front, then shortlist on
capability, then fetch `llms.txt` for *only* the specific fal endpoints in the shortlist. Doing it
the other way round — browsing fal first — is what made this research slow.

### Supply risk, carried forward

Recorded in `tests/kie-vs-fal.md` and still unverified: kie.ai's prices are widely speculated to
rest on reselling subsidised consumer subscriptions rather than list-price API access. **That is a
rumour, not a finding** — but kie.ai is primary for image generation and now for image `enhance`
too, and a provider whose margin depends on an arrangement it does not control can change or break
with little notice. Concrete implication for the decisions above: **the fal fallback must stay
genuinely exercised**, and the split recommended here (video `enhance` and image `remove_text` on
fal) has the side benefit of keeping the fal path warm rather than letting it rot untested.

---

## Summary

| # | Capability | Winner | Price that decides it |
|---|---|---|---|
| 1 | `enhance` — video | **fal** `fal-ai/topaz/upscale/video` | $0.02/s → **$0.30** per 15 s 1080p clip vs kie's $0.60 |
| 2 | `enhance` — image | **kie** `topaz/image-upscale` | $0.05 (fal's is *not captured*); `recraft/crisp-upscale` $0.0025 for free tier |
| 3 | `remove_text` — image | **fal** `fal-ai/image-editing/text-removal` | $0.04 vs $0.02 — pays 2× to avoid an instruction-following failure mode; the delta is ~1% of revenue |
| 4 | `remove_text` — video | **Neither — confirmed category gap** | fal $0.14/s (one capped at 5 s input) vs €1.20–1.80 revenue; kie has nothing |
| 5 | Existing wiring | **No change** to kie-primary/fal-fallback; ElevenLabs stays direct | kie `nano-banana-2` $0.04; ElevenLabs direct price *not captured* |
| 6 | New builds | Background removal, Suno music bed, lip-sync dubbing, product photography | $0.005 · $0.06 · $0.04/s · $0.02–0.035 |
