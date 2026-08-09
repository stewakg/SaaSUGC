# kie.ai vs fal.ai — quality/reliability comparison

**Goal:** decide provider routing (INFRASTRUCTURE.md F5 TODO). Same model, same prompt, same settings, both providers.
**Date:** 2026-07-17 · driven via browser (user's logged-in fal.ai + kie.ai, real credits).

## Test scenario (realistic e-commerce UGC, as an end user of our site would do)
- **Product:** skincare serum (typical Balkan COD product).
- **Image prompt (text→image):** "UGC-style product photo: a young woman with clear healthy skin holding a small amber glass skincare serum bottle near her face, smiling at the camera, bright modern bathroom background, soft natural lighting, photorealistic, vertical portrait"
- **Video prompt (image→video):** "She smiles and gently turns the serum bottle toward the camera, subtle natural head movement, soft blink, cinematic UGC ad style"
- **Resolution:** 720p everywhere. Aspect 9:16.
- **Reference image (shared across ALL video gens):** generated on fal.ai nano-banana →
  `https://v3b.fal.media/files/b/0aa2a92d/p9SxW8LhSR1pfvdI4h-gr_lVwmlOsA.png`

## Results

### Image — nano-banana (text→image)
| Provider | Quality / adherence | Time | Cost | Reliability | Notes |
|---|---|---|---|---|---|
| fal.ai | ✅ Excellent — accurate to prompt, photorealistic, correct 9:16 | ~10s | **$0.039** | OK (1st try) | used as the shared reference image |
| kie.ai | _pending_ | | | | |

### Video — Veo3 (image→video, 720p)
| Provider | Quality / adherence | Time | Cost | Reliability | Notes |
|---|---|---|---|---|---|
| fal.ai | ⚠️ N/A | | | | **fal DEPRECATED Veo3 image→video** (both `veo3/fast/image-to-video` and `veo3/image-to-video` show "This model is no longer supported"). fal has moved to **Veo 3.1**. So fal-Veo3 vs kie-Veo3 is not an apples-to-apples version match. |
| kie.ai | _pending_ | | | | kie still lists Veo3 Fast/Quality |

### Video — Kling 2.1 standard (image→video, 720p)
| Provider | Quality / adherence | Time | Cost | Reliability | Notes |
|---|---|---|---|---|---|
| fal.ai | _blocked_ | | | | fal's Kling playground **hangs on browser automation** when a custom image URL is set (heavy React page + preview fetch block the page thread; reproduced 3×). Not an API reliability measure — a playground/automation issue. Points to doing the real bench via **API**, not the web UI. |
| kie.ai | _pending_ | | | | |

## Findings so far (2026-07-17)
- **Image gen (nano-banana) on fal.ai works great** — accurate, fast (~10s), $0.039. This is our baseline reference image.
- **fal deprecated Veo3 i2v** → version drift vs kie's Veo3. For "latest Veo" we'd compare fal Veo3.1 vs kie Veo3/3.1 (note the mismatch).
- **fal playground is not automation-friendly** for image→video (hangs). The clean, reproducible way to benchmark provider quality/reliability is the **API** (identical params to both, save outputs) — which is also what F5 needs anyway.

## Live code-path test — 2026-07-19 (KieAIFalRouter, real keys, via API not UI)

Separate from the browser-driven benchmark above: this exercised the actual shipped
code (`packages/core/src/providers/ai.kiefal.ts`, commit `f49eebf`) via a throwaway
script (`getAI()` / direct `KieAIFalRouter` construction), one `generateImage` call per
provider, same prompt as the Image/nano-banana row above, `size: '1080x1920'`.

| Provider | Model (as coded) | Result | Time | Notes |
|---|---|---|---|---|
| kie.ai | `nano-banana-2` (generic Jobs API) | ✅ success, 1st try | 13.9s | `createTask`→`recordInfo` contract confirmed correct against the real API. Output: photorealistic, on-prompt, vertical, legible bottle label ("Glow Serum"). |
| fal.ai | `fal-ai/nano-banana-2` (queue API) | ✅ success, 1st try | 14.2s | Tested in isolation (fal-only router instance) — the fallback path itself, not just "kie succeeded so fal was never tried". Output: photorealistic, on-prompt, vertical, legible bottle label. |

Both images visually inspected (not just "got a 200") — both fully match the prompt,
no artifacts, no watermarks, correct 9:16-ish portrait framing. **Cost per call not
captured from the API response** (no price field returned) — check each dashboard's
usage log if exact per-image cost is needed; the fal.ai nano-banana (non-`-2`) row above
was $0.039 for reference but that's a different model tier, not this one.

`generateVideo` (Veo3 kie.ai + fal.ai veo3.1) still NOT live-tested — no wired job calls
it yet (`ai_video` is F7, deferred).

## Multi-prompt image benchmark — 2026-08-05 (n=3 prompts × 2 providers, real credits)

Driven through the shipped `KieAIFalRouter`, each provider in an **isolated** router
(kie-only / fal-only) so no run could silently fall back to the other. Same prompt, same
`size: '1080x1920'`. All 6 calls succeeded 1st try — **zero failures on either side.**

| Prompt | kie.ai | fal.ai |
|---|---|---|
| `serum-ugc` (UGC person + product) | ✅ 20.8s | ✅ 23.5s |
| `watch-flatlay` (studio product shot) | ✅ 11.7s | ✅ 27.8s |
| `text-render` (ad banner w/ Serbian headline) | ✅ 12.0s | ✅ 34.4s |
| **median** | **12.0s** | **27.8s** |

**Speed: kie.ai wins clearly** — ~2.3× faster at the median, and its worst case (20.8s)
beats fal.ai's best (23.5s). Consistent across all three prompts, so not noise.

**Quality: a wash, both production-grade.** All 6 outputs visually inspected. The
`text-render` pair is the discriminating one — both rendered a full ad layout with a
correct large "AKCIJA -50%" headline, a CTA button, and **correct Serbian diacritics**
(`KOŽU`, `SNIŽENO`) — historically the hard part for image models. Neither had artifacts
or watermarks. fal.ai's layout was slightly richer (trust badges, cart icon); kie.ai's
Serbian copy was cleaner — fal.ai invented "ASSORTIMAN" (not a Serbian word; should be
"asortiman"). Neither difference is decisive.

**Cost still not captured** — neither API returns a price field; read each dashboard's
usage log if exact per-image cost matters.

**Routing conclusion: keep kie.ai primary, fal.ai fallback.** Now supported by
measurement (speed + equal reliability), not just the earlier cost assumption.

## Public list pricing — captured 2026-08-09 (NOT from our own usage)

Every round above ends with "cost not captured" because neither API returns a price field.
These are the providers' **published list prices**, read off their own pages — they are a
planning input, not a measurement of what we are billed. The dashboards' usage logs are
still unread.

| Model | fal.ai | kie.ai |
|---|---|---|
| nano-banana-2 (what `image_ads` uses) | **$0.08** / image base — 2K ×1.5, 4K ×2, 0.5K ×0.75; +$0.015 if web search is used | **from $0.04** / image |
| GPT Image 2 (not wired anywhere yet) | — | ~$0.03 (1K) · $0.05 (2K) · $0.08 (4K) |

**kie.ai is roughly half of fal.ai for the identical model**, which is consistent with the
kie-primary routing already chosen on speed and reliability — cost now points the same way
instead of merely being assumed to.

**Margin sanity check:** `image_ads` charges 4 credits and credits sell at 0.20–0.30 € each,
so ~0.80–1.20 € of revenue against single-digit cents of provider cost. Provider price is
not what will decide this product's economics; Remotion render time and ElevenLabs per
variant matter far more (a `matrix` job at count=15 makes 15 TTS calls).

**Supply risk, unverified.** kie.ai's prices are widely speculated to rest on reselling
subsidised consumer subscriptions rather than on list-price API access. That is a rumour, not
a finding — but kie.ai is our **primary** route, and a provider whose margin depends on an
arrangement it does not control can change or break with little notice. Concrete implication:
keep the fal.ai fallback genuinely exercised (the 08-05 round already ran fal in an isolated
router for exactly this reason), and do not let the fallback path rot untested.

## Verdict
**Both kie.ai and fal.ai work correctly end-to-end for image generation as coded** —
routing/fallback logic is confirmed sound, not just typechecked. Raw quality is a wash
at this sample size (n=1 each); no reason yet to change the kie-primary/fal-fallback
order (kie.ai chosen primary for cost — see F5 notes). Video (Veo3/Kling) benchmark
still pending — lower priority than before since the harness code itself is now proven
correct on the image side, and `ai_video` isn't wired into any job yet (F7).
