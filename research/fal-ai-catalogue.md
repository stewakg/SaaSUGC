# fal.ai — capability catalogue for AdGen

**Captured 2026-08-10** from fal.ai's own pages: `https://fal.ai/llms.txt`,
`https://fal.ai/explore/search?q=…`, and per-model `llms.txt` files. Prices below were read
from the model's own `llms.txt`, not from marketing pages or third parties.

## Read this before adding a model

fal.ai publishes machine-readable surfaces, so **nobody should ever browse the gallery by hand
again**:

| Surface | What it gives |
|---|---|
| `https://fal.ai/llms.txt` | Platform overview + representative endpoint ids per category |
| `https://fal.ai/models/<endpoint-id>/llms.txt` | **The important one.** Live input/output schema, types, defaults, constraints, price, and ready-to-run snippets for one endpoint, generated from the same metadata the platform serves — it cannot drift from the real endpoint |
| `https://fal.ai/docs/llms.txt` | Index of every doc page |
| `https://fal.ai/docs/llms-full.txt` | Entire documentation in one file (several MB) |
| any doc URL + `.md` | That page as markdown |
| `https://fal.ai/docs/documentation/setting-up/mcp` | **fal ships an MCP server** — an agent client can query the catalogue directly instead of scraping |

Every model is an endpoint id like `fal-ai/flux/dev`. Over plain HTTP:
`POST https://queue.fal.run/<endpoint-id>` with `Authorization: Key $FAL_KEY`. Billing is per
output from prepaid credits; **fal does not charge for server errors or queue wait**.

The catalogue changes often. Treat every id below as a starting point and re-fetch its
`llms.txt` before writing code against it.

---

## 1. Upscaling / restoration — candidates for AdGen's `enhance`

`enhance` accepts an image **or** a video, so both columns matter.

### Video

| Endpoint | Notes | Price |
|---|---|---|
| `fal-ai/topaz/upscale/video` | Professional grade. `upscale_factor` 1–4, optional frame interpolation `target_fps` 16–60, noise/halo/grain/detail controls, H264 or H265 out | **$0.01/s ≤720p, $0.02/s 720p–1080p, $0.08/s >1080p. Doubles for 60fps** |
| `fal-ai/seedvr/upscale/video` | SeedVR2, temporal consistency. `target_resolution` 720p/1080p/1440p/2160p | **$0.001 per megapixel** (w × h × frames). 1920×1080 × 121 frames ≈ $0.25 |
| `fal-ai/flashvsr/upscale/video` | Positioned as the fastest | not captured |
| `fal-ai/bytedance-upscaler/upscale/video` | ByteDance video upscaler | not captured |
| `fal-ai/bria/video/increase-resolution` | Up to 8K, strong temporal consistency, **licensed training data** | not captured |
| `fal-ai/clarityai/crystal-video-upscaler` | Claims to respect the original exactly | not captured |
| `fal-ai/video-upscaler` | RealESRGAN per frame — the naive approach | not captured |

### Image

| Endpoint | Notes |
|---|---|
| `fal-ai/topaz/upscale/image` | Same family as the video one |
| `fal-ai/seedvr/upscale/image`, `fal-ai/seedvr/upscale/image/seamless` | Seamless variant retains tiling |
| `fal-ai/bria/upscale/creative` | Doubles resolution up to 10MP, regenerates texture; licensed data |
| `fal-ai/recraft/upscale/creative`, `fal-ai/recraft/upscale/crisp` | Crisp variant focuses on small details and faces |
| `fal-ai/clarity-upscaler`, `fal-ai/clarityai/crystal-upscaler` | Crystal is portrait/face oriented |
| `fal-ai/aura-sr`, `fal-ai/esrgan`, `fal-ai/ccsr`, `fal-ai/drct-super-resolution` | Classic open-source upscalers, cheapest tier |
| `fal-ai/ideogram/upscale` | Up to 2×, optional prompt guidance |
| `fal-ai/phota/enhance` | Enhances while preserving identity |
| `fal-ai/image-apps-v2/portrait-enhance` | Portrait clarity |
| `fal-ai/flux-vision-upscaler`, `fal-ai/creative-upscaler` | Creative (hallucinating) upscalers — wrong choice for a product ad, they invent detail |

**Recommendation for `enhance`: `fal-ai/topaz/upscale/video` + `fal-ai/topaz/upscale/image`.**
At 1080p output the video price is $0.02/s, so a 15-second clip costs **$0.30** against
`enhance` = 9 credits ≈ €1.80–2.70 of revenue. SeedVR2 for the same clip works out around
$0.93 by its megapixel formula — three times more for no clear gain at this resolution. Avoid
the "creative" upscalers: they invent detail, which on a product shot is a lie about the goods.

---

## 2. Text / object removal — candidates for AdGen's `remove_text`

### Image — plenty, and cheap

| Endpoint | Notes | Price |
|---|---|---|
| `fal-ai/image-editing/text-removal` | **Exactly this tool**: removes all text and writing while preserving the background. Only needs `image_url` | **$0.04 per image** |
| `fal-ai/flux-pro/v1/erase` | Black Forest Labs eraser — objects *and* text | not captured |
| `fal-ai/bria/fibo-edit/erase_by_text` | Name the thing to erase in a prompt; licensed data | not captured |
| `fal-ai/object-removal`, `…/mask`, `…/bbox` | Natural language, mask, or bounding box | not captured |
| `fal-ai/finegrain-eraser`, `…/mask`, `…/bbox` | Also removes the object's **shadows, reflections and lighting artifacts** | not captured |
| `fal-ai/ideogram/object-removal` | Prompt-free, image + mask | not captured |
| `fal-ai/qwen-image-edit-2509-lora-gallery/remove-element` | Objects, people, text | not captured |
| `fal-ai/ideogram/v3/layerize-text` | Removes text and hands back editable text containers as HTML/JSON |  not captured |
| `fal-ai/bytedance/seedream/v5/pro/layerize` | Splits a flat image into 2–17 transparent PNG layers | not captured |

### Video — ⚠️ this is the problem

| Endpoint | Notes | Price |
|---|---|---|
| `fal-ai/bria/video/erase/mask` | Mask-based, temporally consistent. **Requires a mask *video* you must generate yourself** | **$0.14 per second** |
| `fal-ai/bria/video/erase/keypoints` | Keypoints `{x, y, type: positive/negative}` instead of a mask | **$0.14/s, and the input video must be under 5 seconds** (`auto_trim` cuts to 5s) |

**Recommendation for `remove_text`: ship the image path on `fal-ai/image-editing/text-removal`
($0.04) and do NOT promise the video path yet.** Both video erasers are unusable for a 15-second
ad: $0.14/s is $2.10 per clip, and the keypoints one caps the input at 5 seconds.
**Corrected 2026-08-10** — an earlier draft of this line weighed that $2.10 against €3.00–4.50,
which is a 15-credit Matrix job. `remove_text` is **6 credits ≈ €1.20–1.80** (`pricing.ts`), so
the margin is not thin, it is **negative before a single frame renders**. This also settles the burned-in-UI question in
`TODO.md` §4 — buying our way out of another platform's watermark is not affordable at these
prices, so the shot-level filter (detect dirty shots, never pick them) stays the right answer.

---

## 3. Everything else worth knowing about

### Video generation
Sora 2 (`fal-ai/sora-2/text-to-video`, `…/image-to-video`, synchronized audio), Veo 3.1
(`fal-ai/veo3.1`), Kling 3 (`fal-ai/kling-video/v3/{pro,standard,turbo/pro}/…`, plus
`kling-video/v3/4k/text-to-video` which outputs 4K directly with no post-upscale), Seedance 2.0
and 2.5 (`fal-ai/bytedance/seedance-2.5/{text,image,reference}-to-video` — 30-second single
takes, up to 50 multimodal references), MiniMax H3 (2K), Grok Imagine 1.5, and FLUX.3
(`blackforestlabs/flux-3/…` with `text-to-video`, `image-to-video`, `first-last-frame-to-video`,
`keyframes-to-video`, `extend-video`, each with a cheap `/draft` tier plus `/draft-enhance` to
re-render the approved draft at full quality — **that draft/enhance split is a pattern worth
copying in our own wizard**).

### Video editing
`fal-ai/heygen/v3/filler-word-removal` (strips "uh"/"um" from a talking video),
`fal-ai/xai/grok-imagine-video/edit-video` and `…/extend-video`.

### Lip-sync and avatars — relevant to F7 (AI influencer)
`fal-ai/veed/lipsync/v2`, `fal-ai/sync-lipsync/v3` and `…/v3/image-to-video` (single still →
talking character), `fal-ai/sync-lipsync/react-1`, `fal-ai/sync-lipsync/v2/pro`,
`fal-ai/heygen/v3/lipsync/{precision,speed}` (dub an existing video),
`fal-ai/kling-video/lipsync/{audio,text}-to-video`, `fal-ai/pixverse/lipsync`,
`fal-ai/latentsync`, `fal-ai/flashtalk` (audio-driven talking avatar), `fal-ai/ai-avatar`.

### Image generation and editing
Nano Banana 2 / Pro / Lite (`fal-ai/nano-banana-2`, `…/edit`), GPT Image 2
(`openai/gpt-image-2`, `…/edit`), FLUX.2 pro/dev/klein/turbo/flash, FLUX.1 dev/schnell,
FLUX.1 Kontext (`fal-ai/flux-pro/kontext`, instruction-based local edits), Seedream 4.5/5.0
(`bytedance/seedream/v5/pro/edit` is region-precise — changes one element and leaves the rest
intact), Qwen Image 3, Ideogram v3, Recraft V3 (vector art and brand styles), Krea 2, Z-Image
Turbo, Bria FIBO (licensed data, JSON-structured prompts).

### Background removal
`fal-ai/birefnet/v2`, `fal-ai/bria/background/remove` (licensed data).

### Product / e-commerce — directly relevant to a COD ad tool
`fal-ai/image-apps-v2/product-photography` (professional product shots with realistic lighting
and backgrounds), virtual try-on: `fal-ai/flux-pro/v1/vto`, `fal-ai/fashn/tryon/v1.6`,
`fal-ai/kling/v1-5/kolors-virtual-try-on`, `fal-ai/cat-vton`, `fal-ai/leffa/virtual-tryon`,
`fal-ai/image-apps-v2/virtual-try-on`.

### Speech and audio
ElevenLabs is on fal too (`fal-ai/elevenlabs/tts/turbo-v2.5`), plus
`fal-ai/minimax/speech-2.8-{hd,turbo}`, `fal-ai/minimax/voice-clone`, `fal-ai/xai/tts/v1`,
`fal-ai/gemini-3.1-flash-tts` (granular audio tags for directing delivery),
`fal-ai/qwen-3-tts/…`, `fal-ai/inworld-tts`, `fal-ai/chatterbox/text-to-speech`,
`fal-ai/whisper` (speech-to-text). Note we already call ElevenLabs directly — routing it through
fal would consolidate billing but adds a hop.

### 3D and training
`fal-ai/trellis` (image → 3D), Hi3D and Tripo3D families, `fal-ai/flux-lora-fast-training` and
`fal-ai/wan-22-image-trainer` (train a style, then call it as your own endpoint).

### Language models
`fal-ai/any-llm` — one endpoint fronting Claude, GPT, Gemini and Llama. Not needed; we use
OpenRouter.

---

## 4. What this changes for AdGen

1. **`enhance` is unblocked** — Topaz, both media types, affordable. It is a wiring job now, not
   a research question.
2. **`remove_text` is half unblocked** — the image path is cheap and exact; the video path has
   no affordable option and should not be advertised until one exists.
3. **Two ideas worth stealing:** FLUX.3's draft → approve → full-quality-enhance flow maps
   almost exactly onto our script-review step, and `image-apps-v2/product-photography` is a
   product-shot tool a COD seller would pay for on its own.
4. **Method note:** anything else we need from fal should come from `llms.txt` or their MCP
   server. Searching the gallery by hand, which is how this file's first half was gathered, was
   the slow way.
