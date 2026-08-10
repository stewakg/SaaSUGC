# kie.ai — capability catalogue for AdGen

**Captured 2026-08-10** from kie.ai's own surfaces only: `https://kie.ai`,
`https://docs.kie.ai`, `https://docs.kie.ai/llms.txt` (index of every doc page — 253 English
pages, all downloaded and parsed), each model's `<doc-url>.md` OpenAPI page, and the two
**public, unauthenticated JSON APIs the site itself calls**:

| Surface | What it gives |
|---|---|
| `https://docs.kie.ai/llms.txt` | Index of every doc page. Any doc URL + `.md` returns that page as markdown (the full OpenAPI 3.0.1 spec: model enum, every input field, types, defaults, size/duration limits). **This is the authoritative source for endpoint ids and parameters.** |
| `POST https://api.kie.ai/client/v1/model-pricing/page` body `{"pageNum":N,"pageSize":100}` | **The entire pricing table — 408 rows**, with credit price, USD price, billing unit, provider and an anchor URL that usually contains the exact `?model=<id>`. No auth needed. `pageSize` is capped at 100. |
| `POST https://api.kie.ai/api/v1/playground/pagePlaygroundGroup` body `{"pageNum":N,"pageSize":30}` | 94 model groups with `taskType` tags (Text to Video, Image Editing, Lip Sync, Video Upscale, …) and provider. |

Notes on method: `WebFetch` gets 403 on kie.ai, and the HTML `kie.ai/market` and `kie.ai/pricing`
pages render **empty without login** (console throws `No Login`). Plain `curl` against
`docs.kie.ai` and the two JSON APIs above works fine and is the fast path — nobody should scrape
the HTML. Prices below are USD list price from the pricing API; **credits convert at 200
credits = $1**. Where a page states no limit, this file says "not stated" rather than guessing.

---

## 0. How the API is shaped — dedicated vs generic Jobs API

This distinction is already load-bearing in `packages/core/src/providers/ai.kiefal.ts` (image goes
through the Jobs API, video through the dedicated Veo endpoints) and the response shapes genuinely
differ.

**Generic Jobs API** — nearly everything in the Market. One pair of endpoints for all of it:

```
POST https://api.kie.ai/api/v1/jobs/createTask     body: { model, input:{…}, callBackUrl? }
GET  https://api.kie.ai/api/v1/jobs/recordInfo?taskId={taskId}
```

The model is selected by the `model` string in the body. Everything in sections 1–7 below marked
**Jobs** works this way.

**Dedicated endpoints** — legacy/first-party families with their own paths and their own response
shapes. Marked **Dedicated** below:

| Family | Create | Poll | Extras |
|---|---|---|---|
| Veo 3.1 | `POST /api/v1/veo/generate` | `GET /api/v1/veo/record-info` | `/api/v1/veo/get-1080p-video`, `/api/v1/veo/get-4k-video`, `/api/v1/veo/extend` |
| Runway | `POST /api/v1/runway/generate` | `GET /api/v1/runway/record-detail` | `/api/v1/runway/extend` |
| Runway **Aleph** | `POST /api/v1/aleph/generate` | `GET /api/v1/aleph/record-info` | — |
| Flux Kontext | `POST /api/v1/flux/kontext/generate` | `GET /api/v1/flux/kontext/record-info` | — |
| 4o Image | `POST /api/v1/gpt4o-image/generate` | `GET /api/v1/gpt4o-image/record-info` | `/api/v1/gpt4o-image/download-url` |
| Suno (music) | `POST /api/v1/generate` and ~20 siblings | `GET /api/v1/generate/record-info` | see §6 |
| Gemini Omni | `POST /api/v1/omni/audio/create`, `POST /api/v1/omni/character/create` | via Jobs recordInfo | `gemini-omni-video` is Jobs |
| Chat / LLM | `POST /api/v1/responses` (OpenAI-responses style) or Anthropic-style, per model page | n/a (sync, streaming) | — |

**Auth** for everything: `Authorization: Bearer <KIE_API_KEY>`, `Content-Type: application/json`.
Base `https://api.kie.ai`.

**File upload** (needed for both `enhance` and `remove_text` — every model takes a *URL*, never
raw bytes). Base host is **different**: `https://kieai.redpandaai.co`.

| Endpoint | Purpose |
|---|---|
| `POST /api/file-stream-upload` | Binary stream, for large files |
| `POST /api/file-base64-upload` | Base64, small files |
| `POST /api/file-url-upload` | Fetch from a remote URL; max **100 MB** |

Uploads are **free** and auto-deleted after **24 hours**. Generated media is retained **14 days**,
logs 2 months. Failed tasks are not charged. Rate limit: 20 new tasks / 10 s per account (429
otherwise, rejected not queued).

---

## 1. Upscaling / restoration — candidates for AdGen's `enhance`

| Endpoint (`model`) | Kind | Input | Output | Limits stated | Price |
|---|---|---|---|---|---|
| `topaz/image-upscale` | Jobs | `image_url` (jpeg/png/webp, **max 10 MB**), `upscale_factor` `1`\|`2`\|`4` (default `2`) | upscaled image | factor max 4 | **$0.05** /img to 2K · **$0.10** to 4K · **$0.20** to 8K |
| `topaz/video-upscale` | Jobs | `video_url` (mp4/mov/mkv, **max 50 MB**), `upscale_factor` `1`\|`2`\|`4` (default `2`) | upscaled video | factor max 4; no duration cap stated | **$0.04 /s** at 1x–2x · **$0.07 /s** at 4x |
| `recraft/crisp-upscale` | Jobs | `image` only — no factor, no options | sharpened image | not stated | **$0.0025** /image |
| `grok-imagine/upscale` | Jobs | `task_id` (**must be a prior kie.ai video task id**), `resolution` `720p`\|`1080p` | upscaled video | **cannot take an uploaded file** | $0.05 (360p→720p) · $0.10 (720p→1080p) · $0.15 (480p→1080p) |
| `veo/get-1080p-video`, `veo/get-4k-video` | Dedicated | a Veo `taskId` | higher-res render of that Veo job | Veo-generated only | $0.025 (1080p) · $0.60 (4K) |

**The trap:** `grok-imagine/upscale` and the Veo `get-*-video` endpoints only accept task ids from
media kie.ai itself generated. They are useless for a user upload. **Only the two Topaz endpoints
accept an arbitrary uploaded file.**

Also relevant: `recraft/remove-background` (Jobs, **$0.005**/image) — background removal, not
upscaling, but the other cheap Recraft utility.

---

## 2. Inpainting / object & text removal — candidates for `remove_text`

kie.ai has **no endpoint named for watermark, text, or object removal**. Grepping all 253 doc
pages for `inpaint`, `watermark removal`, `object removal`, `erase` returns only the two Ideogram
pages. So this has to be done either with a **mask** (one endpoint) or by **prompting a general
image-editor** ("remove all text from this image").

### Image — true masked inpainting (only one)

| Endpoint | Kind | Input | Limits | Price |
|---|---|---|---|---|
| `ideogram/v3-edit` | Jobs | `prompt` (≤5000 chars) + `image_url` + **`mask_url` (required)** — mask must match input dimensions, jpeg/png/webp, max 10 MB; `rendering_speed` TURBO\|BALANCED\|QUALITY | mask is mandatory — caller must produce it | **$0.0175** TURBO · **$0.035** BALANCED · **$0.05** QUALITY |
| `ideogram/character-edit` | Jobs | same, plus `reference_image_urls` for character identity | mask mandatory | $0.06 / $0.09 / $0.12 (T/B/Q) |

### Image — prompt-driven editing (no mask; tell it to remove the text)

| Endpoint | Kind | Input | Price |
|---|---|---|---|
| `google/nano-banana-edit` | Jobs | `prompt`, `image_urls[]`, `aspect_ratio`, `image_size`, `output_format` | **$0.02** /image |
| `nano-banana-2` | Jobs | prompt + image | $0.04 (1K) · $0.06 (2K) · $0.09 (4K) |
| `nano-banana-2-lite` | Jobs | prompt + image | **$0.02** (1K) |
| `nano-banana-pro` | Jobs | prompt + image | $0.09 (1/2K) · $0.12 (4K) |
| `qwen/image-edit` | Jobs | `prompt`, `image_url`, `image_size`, `num_inference_steps`, `guidance_scale`, `negative_prompt`, `seed` | **$0.03** per megapixel |
| `qwen2/image-edit` | Jobs | prompt + image | $0.028 /image |
| `seedream/4.5-edit` | Jobs | prompt + image | $0.0325 /image |
| `seedream/5-lite-image-to-image` | Jobs | prompt + image | $0.0275 /image |
| `seedream/5-pro-image-to-image` | Jobs | prompt + image | $0.035 (1K) · $0.07 (2K) |
| `bytedance/seedream-v4-edit` | Jobs | prompt + image | not stated separately |
| `gpt-image-2-image-to-image` | Jobs | prompt + image | $0.03 (1K) · $0.05 (2K) · $0.08 (4K) |
| `gpt-image/1.5-image-to-image` | Jobs | prompt + image | $0.02 medium · $0.11 high |
| `flux-2/pro-image-to-image` | Jobs | prompt + image | $0.025 (1K) · $0.035 (2K) |
| `flux-2/flex-image-to-image` | Jobs | prompt + image | $0.07 (1K) · $0.12 (2K) |
| `qwen3/image-to-image`, `qwen3/pro-image-to-image` | Jobs | prompt + image | $0.024 · $0.032 (1K) / $0.06 (2K) |
| `wan/2-7-image`, `wan/2-7-image-pro` | Jobs | generation **and editing** | $0.024 · $0.06 /image |
| `ideogram/v3-remix`, `ideogram/character-remix` | Jobs | prompt + image, no mask | $0.0175–$0.05 · $0.06–$0.12 |
| Flux Kontext | **Dedicated** `POST /api/v1/flux/kontext/generate` | prompt + optional input image; the classic instruction-edit model | $0.025 Pro · $0.05 Max |
| 4o Image | **Dedicated** `POST /api/v1/gpt4o-image/generate` | prompt + optional image | $0.03 /image |

### Video — the honest picture

There is **no video text/watermark removal model**. The closest are general video-to-video
editors, which regenerate pixels from a prompt:

| Endpoint | Kind | Input | Limits stated | Price |
|---|---|---|---|---|
| Runway **Aleph** | **Dedicated** `POST /api/v1/aleph/generate` | `prompt` + `videoUrl` (both required), optional `referenceImage`, `aspectRatio`, `seed`, `waterMark` | no duration/size limit stated | **$0.55 per video** (flat) |
| `wan/2-7-videoedit` | Jobs | `prompt`, `video_url` (mp4/mov, **2–10 s**, 240–4096 px per side, **≤100 MB**), `resolution` 720p\|1080p, `duration` 0–10 s | 10 s hard cap | **$0.08 /s** 720p · **$0.12 /s** 1080p |
| `happyhorse/video-edit` | Jobs | `prompt`, `video_url` (mp4/mov, **3–60 s**, long side ≤2160 px, ≤100 MB), `resolution` 720p\|1080p | 60 s | **$0.14 /s** 720p · **$0.24 /s** 1080p |
| `wan/2-6-video-to-video`, `wan/2-6-flash-video-to-video` | Jobs | `prompt`, `video_urls[]` (≤3, **max 10 MB each**), 5 s or 10 s, 720p\|1080p | 10 MB per clip is very tight | 5 s: $0.35 (720p) / $0.5225 (1080p) · 10 s: $0.70 / $1.0475 · 15 s: $1.05 / $1.575 |
| `kling-2.6/motion-control`, `kling-3.0/motion-control` | Jobs | video-to-video motion transfer | — | $0.10 /s 720p · $0.135 /s 1080p (v3) |
| `bytedance/seedance-2`, `-2-fast`, `-2-mini`, `-2-5` | Jobs | `reference_video_urls[]` — **reference-conditioned generation, not faithful editing** | 4–15 s | see §4 |

Aleph's flat **$0.55 regardless of length** is the notable one — it beats every per-second option
past ~7 s at 720p.

---

## 3. Image generation (text-to-image)

| Endpoint | Kind | Price |
|---|---|---|
| `nano-banana-2` | Jobs | $0.04 (1K) · $0.06 (2K) · $0.09 (4K) |
| `nano-banana-2-lite` | Jobs | $0.02 (1K) |
| `nano-banana-pro` | Jobs | $0.09 (1/2K) · $0.12 (4K) |
| `google/nano-banana` | Jobs | $0.02 |
| `google/imagen4-fast` / `google/imagen4` / `google/imagen4-ultra` | Jobs | $0.02 · $0.04 · $0.06 |
| `gpt-image-2-text-to-image` | Jobs | $0.03 (1K) · $0.05 (2K) · $0.08 (4K) |
| `gpt-image/1.5-text-to-image` | Jobs | $0.02 medium · $0.11 high |
| `seedream/5-pro-text-to-image` | Jobs | $0.035 (1K) · $0.07 (2K) |
| `seedream/5-lite-text-to-image` | Jobs | $0.0275 |
| `seedream/4.5-text-to-image` | Jobs | $0.0325 |
| `bytedance/seedream-v4-text-to-image`, `bytedance/seedream` (3.0) | Jobs | not stated separately |
| `seedream/5-pro-layer-decomposition` | Jobs | $0.035 (1K/1.5K) · $0.07 (2K) — splits an image into layers |
| `flux-2/pro-text-to-image` | Jobs | $0.025 (1K) · $0.035 (2K) |
| `flux-2/flex-text-to-image` | Jobs | $0.07 (1K) · $0.12 (2K) |
| `z-image` | Jobs | **$0.004** — cheapest image model on the platform |
| `qwen/text-to-image` | Jobs | $0.02 per megapixel |
| `qwen2/text-to-image` | Jobs | $0.028 |
| `qwen3/text-to-image` · `qwen3/pro-text-to-image` | Jobs | $0.024 · $0.032 (1K) / $0.06 (2K) |
| `ideogram/v3-text-to-image` | Jobs | $0.0175 / $0.035 / $0.05 (T/B/Q) |
| `ideogram/character` | Jobs | $0.06 / $0.09 / $0.12 |
| `grok-imagine/text-to-image` | Jobs | $0.02 per 6 images (standard) · $0.025 per 4 images (quality) |
| `grok-imagine/image-to-image` | Jobs | $0.02 /image |
| `wan/2-7-image` · `wan/2-7-image-pro` | Jobs | $0.024 · $0.06 |
| Flux Kontext | Dedicated | $0.025 Pro · $0.05 Max |
| 4o Image | Dedicated | $0.03 |

Priced but with **no doc page in `llms.txt`**: `Ideogram V3 Reframe` ($0.0175/$0.035/$0.05,
anchor `kie.ai/ideogram-reframe`) — outpainting/reframing. Endpoint id not published; do not guess it.

---

## 4. Video generation

| Endpoint | Kind | Price |
|---|---|---|
| Veo 3.1 | **Dedicated** `/api/v1/veo/generate` | Lite 720p **$0.15** · Lite 1080p $0.175 · Lite 4K $0.75 · Fast 720p $0.30 · Fast 1080p $0.325 · Fast 4K $0.90 · Quality 720p $1.25 · Quality 1080p $1.275 · Quality 4K $1.85 — all **per video**. Extend: $0.15 / $0.30 / $1.25 |
| Runway | **Dedicated** `/api/v1/runway/generate` | t2v & i2v: $0.06 (5 s 720p) · $0.15 (10 s 720p or 5 s 1080p) |
| `bytedance/seedance-2` | Jobs | per second — 480p $0.095 · 720p $0.205 · 1080p $0.51 · 4K $1.04 (cheaper "with video input": $0.057 / $0.125 / $0.31 / $0.64) |
| `bytedance/seedance-2-fast` | Jobs | $0.059–$0.124 /s |
| `bytedance/seedance-2-mini` | Jobs | **$0.012–$0.041 /s** |
| `bytedance/seedance-2-5` | Jobs | $0.085–$0.315 /s; up to 30 s |
| `bytedance/seedance-1.5-pro` | Jobs | $0.00875–$0.075 /s |
| `bytedance/v1-pro-*`, `v1-lite-*`, `v1-pro-fast-image-to-video` | Jobs | not stated in the pricing table |
| `kling-3.0/video` | Jobs | 720p $0.07 /s (no audio) → 4K $0.335 /s |
| Kling 3.0 Turbo | (group `kling-3-0-turbo`) | $0.09 /s 720p · $0.1125 /s 1080p — **endpoint id not published in docs** |
| `kling/v3-turbo-text-to-video`, `kling/v3-turbo-image-to-video` | Jobs | see above |
| `kling-2.6/text-to-video`, `kling-2.6/image-to-video` | Jobs | $0.275 (5 s no audio) → $1.10 (10 s with audio) per video |
| `kling/v2-5-turbo-text-to-video-pro`, `kling/v2-1-master-*`, `kling/v2-1-pro`, `kling/v2-1-standard` | Jobs | not stated separately |
| `wan/2-7-text-to-video`, `wan/2-7-image-to-video`, `wan/2-7-r2v` | Jobs | $0.08 /s 720p · $0.12 /s 1080p |
| `wan/2-6-text-to-video`, `wan/2-6-image-to-video`, `wan/2-6-flash-image-to-video` | Jobs | 5 s $0.35/$0.5225 · 10 s $0.70/$1.0475 · 15 s $1.05/$1.575 (720p/1080p) |
| `wan/2-5-text-to-video`, `wan/2-5-image-to-video` | Jobs | $0.30–$1.00 per video |
| `wan/2-2-a14b-text-to-video-turbo`, `…-image-to-video-turbo` | Jobs | $0.20 (480p) · $0.30 (580p) · $0.40 (720p) per 5 s |
| `wan/2-2-animate-move`, `wan/2-2-animate-replace` | Jobs | $0.03–$0.0625 /s |
| `hailuo/02-*`, `hailuo/2-3-*` | Jobs | not stated in the pricing table |
| `minimax-h3/text-to-video`, `…/image-to-video`, `…/reference-to-video` | Jobs | $0.08 /s 768p · $0.13 /s 2K |
| `pixverse-v6/text-to-video`, `…/image-to-video`, `…/transition`, `…/extend`, `…/reference-to-video` | Jobs | not stated in the pricing table |
| `happyhorse/text-to-video`, `…/image-to-video`, `…/reference-to-video` | Jobs | $0.14 /s 720p · $0.24 /s 1080p |
| `happyhorse-1-1/text-to-video`, `…/image-to-video`, `…/reference-to-video` | Jobs | $0.1125 /s 720p · $0.145 /s 1080p |
| `grok-imagine/text-to-video`, `grok-imagine/image-to-video` | Jobs | $0.008 /s 480p · $0.015 /s 720p |
| `grok-imagine-video-1-5-preview` | Jobs | $0.012 /s 480p · $0.0225 /s 720p |
| `grok-imagine/extend` | Jobs | $0.072–$0.225 per extension |
| `gemini-omni-video` | Jobs | $0.315–$1.26 per video by length/res |
| Gemini Omni audio / character | **Dedicated** `/api/v1/omni/audio/create`, `/api/v1/omni/character/create` | not stated |

---

## 5. Lip sync / talking avatars

| Endpoint | Kind | Price |
|---|---|---|
| `kling/ai-avatar-standard` | Jobs | $0.04 /s, ≤15 s, 720p |
| `kling/ai-avatar-pro` | Jobs | $0.08 /s, ≤15 s, 1080p |
| `infinitalk/from-audio` | Jobs | **$0.015 /s** 480p · $0.06 /s 720p, ≤15 s |
| `omnihuman-1-5` (+ `omnihuman-1-5/human-identification`, `omnihuman-1-5/subject-detection`) | Jobs | $0.135 /s |
| `volcengine/video-to-video-lip-sync` | Jobs | **$0.04 /s** |
| `wan/2-2-a14b-speech-to-video-turbo` | Jobs | $0.06 /s 480p · $0.09 /s 580p · $0.12 /s 720p |

---

## 6. Audio, speech and music

### TTS / speech (Jobs API)

| Endpoint | Price |
|---|---|
| `elevenlabs/text-to-speech-turbo-2-5` | **$0.03 / 1000 chars** |
| `elevenlabs/text-to-speech-multilingual-v2` | $0.06 / 1000 chars |
| `elevenlabs/text-to-dialogue-v3` | $0.07 / 1000 chars |
| `elevenlabs/audio-isolation` (voice isolation from noise) | **not stated** |
| `google/gemini-3-1-flash-tts` | $0.70 /M input tokens · $14 /M audio-output tokens |
| `google/gemini-2-5-pro-tts` | $0.70 /M input · $14 /M audio output |

ElevenLabs multilingual v2 covers Serbian; relevant if AdGen ever consolidates its ElevenLabs
billing onto kie.ai.

### Suno music (all **Dedicated** paths)

| Endpoint | Price |
|---|---|
| `POST /api/v1/generate` (generate music) | $0.06 |
| `POST /api/v1/generate/extend` · `/upload-extend` · `/upload-cover` | $0.06 each |
| `POST /api/v1/generate/add-instrumental` · `/add-vocals` | $0.06 each |
| `POST /api/v1/generate/mashup` | $0.06 |
| `POST /api/v1/generate/replace-section` | $0.025 |
| `POST /api/v1/generate/sounds` | $0.0125 |
| `POST /api/v1/generate/generate-persona` | free ($0) |
| `POST /api/v1/lyrics` | $0.002 |
| `GET /api/v1/generate/get-timestamped-lyrics` | $0.0025 |
| `POST /api/v1/style/generate` (boost style) | $0.002 |
| `POST /api/v1/wav/generate` | $0.002 |
| `POST /api/v1/vocal-removal/generate` | $0.05 vocal split · $0.10 advanced · $0.25 multi-stem |
| `POST /api/v1/midi/generate` | free ($0) |
| `POST /api/v1/mp4/generate` (music video) | $0.01 |
| `POST /api/v1/suno/cover/generate` | free ($0) |
| `/api/v1/voice/validate`, `/voice/generate`, `/voice/record-info`, `/voice/regenerate`, `/voice/check-voice`, `/voice/validate-info` | custom-voice workflow; not stated |

---

## 7. LLM / chat

All chat models are priced per million tokens. Endpoint style is per-model (OpenAI-responses
`POST /api/v1/responses` for the GPT/Codex/Grok family, Anthropic-style for Claude, with streaming).

| Model | Input | Output |
|---|---|---|
| `claude-haiku-4-5` | $0.275 | $1.425 |
| `claude-sonnet-4-5` / `4-6` / `sonnet-5` | $0.850 | $4.275 |
| `claude-opus-4-5` / `4-6` / `4-7` | $1.425 | $7.150 |
| `claude-opus-4-8` / `claude-opus-5` | $2.00 | $10.00 |
| `claude-fable-5` | $4.00 | $20.00 |
| GPT-5.2 | $0.44 | $3.50 |
| GPT-5.4 / GPT-5.4-codex | $0.70 | $5.60 |
| GPT-5.5 | $1.40 | $8.40 |
| GPT-5.6 Luna | **$0.056** | $0.336 |
| GPT-5.6 Terra | $0.56 | $3.36 |
| GPT-5.6 Sol | $1.40 | $8.40 |
| GPT-5-codex / 5.1-codex | $0.50 | $4.00 |
| Gemini 2.5 Flash | $0.09 | $0.75 |
| Gemini 2.5 Pro | $0.38 | $3.00 |
| Gemini 3 Flash | $0.15 | $0.90 |
| Gemini 3 Pro / 3.1 Pro | $0.50 | $3.50 |
| Gemini 3.5 Flash | $0.45 | $2.70 |
| Gemini 3.6 Flash | $0.45 | $2.25 |
| Grok 4.3 | $0.50 | $1.00 |
| Grok 4.5 | $0.80 | $2.40 |

Roughly 71% under Anthropic list for Claude. AdGen uses Claude directly and OpenRouter elsewhere;
this is a price-arbitrage option, not a capability gap.

---

## 8. Utility endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/chat/credit` | Remaining account credits |
| `GET /api/v1/common/download-url` | Direct/CORS-safe download link for a generated file |
| `GET /api/v1/gpt4o-image/download-url` | Same, for 4o Image; valid 20 min |
| `GET /api/v1/jobs/recordInfo?taskId=` | Unified poll for every Jobs-API model |
| Webhook verification | `docs.kie.ai/common-api/webhook-verification` — signature check for `callBackUrl` |

---

## Candidates for AdGen's two unimplemented tools

### `enhance` — **use Topaz. Two endpoints, one per media type.**

* **Image:** `topaz/image-upscale` via `POST /api/v1/jobs/createTask`.
  `input: { image_url, upscale_factor: "1"|"2"|"4" }`. Input ≤10 MB, jpeg/png/webp.
  **$0.05 to 2K, $0.10 to 4K, $0.20 to 8K per image.** For the "sharp HD up to 1080p" promise
  the 2K tier at **$0.05** is the one that applies.
* **Video:** `topaz/video-upscale`, same createTask. `input: { video_url, upscale_factor }`.
  Input ≤50 MB, mp4/mov/mkv. **$0.04/s at 1x–2x, $0.07/s at 4x.** A 15 s clip to 1080p ≈ **$0.60**
  — that has to be priced into the tool, it is not a rounding error like the image path.
* **Cheap fallback for images only:** `recraft/crisp-upscale` at **$0.0025** — 20× cheaper, but
  it takes nothing but `image` (no factor, no controls) and is a sharpener, not a restorer. Good
  as a free-tier path.
* **Do not use** `grok-imagine/upscale` or the Veo `get-1080p/4k-video` endpoints for this tool:
  they take a kie.ai `task_id`, not a user's uploaded file. The docs are explicit —
  "Only Kie AI–generated task IDs are supported."
* The 50 MB ceiling on `topaz/video-upscale` is the real product constraint: a user's phone clip
  can exceed it easily, so AdGen needs a transcode/downscale step before the call.

### `remove_text` — **image: yes. Video: no honest option.**

* **Image, best quality:** `ideogram/v3-edit` — the *only* real inpainting endpoint on the
  platform (`mask_url` is required, must match input dimensions). Prompt the masked region with
  a plain-background description. **$0.0175 TURBO / $0.035 BALANCED / $0.05 QUALITY per image.**
  Cost: AdGen must generate the mask itself — kie.ai has no text-detection endpoint, so this
  needs OCR/box-detection on our side before the call.
* **Image, no mask needed (recommend shipping this first):** `google/nano-banana-edit` at
  **$0.02/image** — prompt-driven edit, `input: { prompt, image_urls: [url] }`, tell it to remove
  all text/subtitles/watermarks and reconstruct the background. Same family already powers
  AdGen's image generation, so the client code and credentials are already in place.
  `qwen/image-edit` ($0.03/MP) and `seedream/4.5-edit` ($0.0325) are equivalent alternates.
* **Video: kie.ai has nothing suitable.** There is no text-removal, watermark-removal or object-
  removal video model — I checked every one of the 253 doc pages. The three general video editors
  all *regenerate* the frames from a prompt rather than surgically erase a region, so the
  "without blur or smearing" promise cannot be kept:
  * Runway **Aleph** (`POST /api/v1/aleph/generate`, `{prompt, videoUrl}`) — **$0.55 flat per
    video**, the closest thing and the only one with no stated duration limit. Aleph is marketed
    upstream for object removal, so it is the one worth a real test — but its output is a
    re-render, and it is a *dedicated* endpoint with its own poll path (`/api/v1/aleph/record-info`),
    not the Jobs API.
  * `wan/2-7-videoedit` — **$0.08/s 720p, $0.12/s 1080p**, but capped at **10 seconds** of input.
  * `happyhorse/video-edit` — $0.14–$0.24/s, accepts 3–60 s, the priciest.

  **Recommendation: ship `remove_text` for images only** (nano-banana-edit, $0.02) and either
  leave the video path unadvertised, or gate it behind an explicit "experimental, output is a
  re-render" warning wired to Aleph at $0.55/clip. This matches the conclusion in
  `research/fal-ai-catalogue.md` — neither provider solves video text removal, so this is a
  category gap, not a kie.ai-vs-fal.ai choice.
