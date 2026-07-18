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

## Verdict
_pending — fill after all runs_
