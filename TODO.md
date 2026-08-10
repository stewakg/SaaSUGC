# TODO.md — what is missing for the site to actually work

One line per item. **This file is an index, not a second source of truth** — the detail,
the history and the caveats live in `INFRASTRUCTURE.md`. If the two ever disagree,
`INFRASTRUCTURE.md` wins and this file is the one that is stale.

**Last reviewed:** 2026-08-10

## Legend

| Mark | Meaning |
|---|---|
| ✅ | works, and has been run for real |
| 🟡 | code exists and typechecks, but has **never been executed** against the real thing |
| ❌ | does not exist |
| ⛔ | **launch blocker** — the site cannot go live with this open |
| 👤 | needs you: an account, money, or a decision |
| 🤖 | needs me: code |

---

## 1. Hosting & infrastructure

| Status | Item | Who | Note |
|---|---|---|---|
| ❌ ⛔ | **Web hosting** — no Vercel account exists | 👤 | Or self-host on the same VPS. Note: Vercel's ~4.5MB request-body cap would break `POST /api/upload` for real video; self-hosting has no such limit |
| ❌ ⛔ | **Domain + DNS + email** | 👤 | ~€10/yr. Nothing is reserved |
| 🟡 | **Worker on the VPS** — container runs, but on **all mocks** | 🤖 | `/opt/adgen-saas/apps/worker/.env` has no OpenRouter/ElevenLabs/kie/fal keys, so production would ship fake ads. Currently **stopped** on purpose (see §6) |
| ✅ | **Redis** — `adgen-redis-prod` on the VPS, healthy | — | Loopback-only by design; reached from here over an SSH tunnel |
| ✅ | **Supabase cloud** — auth, DB, migrations 0001–0006 applied | — | Project `iqfzhnndhhrprkrkfygd` |
| ❌ ⛔ | **R2 bucket** — no bucket exists | 👤 then 🤖 | `storage.r2.ts` is written and has never run. Without it there is nowhere for rendered files to live in production |
| ❌ ⛔ | **Decision: presigned URLs vs public bucket** | 👤 | `getUrl` currently returns a permanent unauthenticated URL with guessable keys — that is cross-user asset exposure, the exact thing `/api/storage`'s auth check exists to prevent |
| ❌ | **Remotion Lambda** — never deployed | 👤 then 🤖 | Needs an AWS account plus a one-time `remotion lambda functions deploy`. `REMOTION_SERVE_URL` is the *output* of that, not a value to invent. Alternative: keep rendering on the VPS |
| ❌ | **Error alerting + cost dashboard** | 👤 | Nothing reports a failed job today |

## 2. Money

| Status | Item | Who | Note |
|---|---|---|---|
| ❌ ⛔ | **No payment provider at all** | 👤 | Lemon Squeezy deleted 2026-08-10. A real user has no way to buy credits |
| ✅ | **Dev credits** | — | Dashboard "Dodaj kredit" → `/api/dev/credits/add`. 404s in production |
| ⏸️ | **Per-stage billing** (scripts ~1 credit, audio ~2, video on creation) | 👤 | **Parked by you** — pricing a product still being built. Two open questions recorded in `INFRASTRUCTURE.md` F5 |
| 🤖 | `database.types.ts:158` still declares `charge_credits` with 3 args; the live function takes 4 | 🤖 | Blocks any caller that wants to pass `p_reason`. Only matters once billing is unparked |

## 3. Tools — does the thing the card promises actually happen?

| Status | Tool | Note |
|---|---|---|
| 🟡 | **Matrix** | Deepest path. Real script + real voice + real local render. Never yet run start-to-finish in one click-through |
| 🟡 | **AI slike** | ✅ Runs for real end-to-end (2026-08-10, 4 credits): kie.ai returned a genuine generated image. **But the image is never saved.** `ai.kiefal.ts` contains no storage call at all, so `assets.url` holds kie.ai's own temp CDN link (`tempfile.aiquickdraw.com/...`) with `storageKey: null`. When kie.ai expires it, a paid asset becomes a dead link in "Moje reklame". Voice and Matrix renders *are* persisted through `Storage`; images are the gap |
| 🟡 | **Brzi test / Edit / Mix / Prevod** | **They used to charge and return Big Buck Bunny** — confirmed live 2026-08-10, Brzi test took 2 credits and returned `w3schools.com/html/mov_bbb.mp4`. **Fixed the same day**: the generic branch now throws `tool_not_implemented`, the job handler marks it `error`, and `charge_credits` never runs. Re-verified live — the job lands as "Greška", balance unchanged. They still do not *work*; they now fail honestly. Cause remains `apps/worker/src/index.ts` rendering every non-matrix, non-image job through `providers.renderer`, which is `MockRenderer` while the Remotion Lambda env is unset |
| 🟡 | **Enhance** | Not wired yet, but no longer blocked on anything: `FalMediaEditProvider.upscaleImage/upscaleVideo` exists and is tested (`packages/core/src/providers/media-edit.fal.ts`). Decision in `research/provider-decisions.md`: **video → fal** `fal-ai/topaz/upscale/video` ($0.30 for 15s at 1080p, half of kie's $0.60 for the same model), **image → kie** `topaz/image-upscale`. ⚠️ Topaz image defaults `face_enhancement` to **true** — it retouches faces unless told not to, which on a product shot is an edit nobody asked for |
| 🟡 | **Remove text** | Image path ready to wire: `FalMediaEditProvider.removeTextFromImage` → `fal-ai/image-editing/text-removal`, $0.04. Chosen over kie's $0.02 `nano-banana-edit` because it takes **no prompt at all** — a general editor asked to "remove all text" can regenerate the frame or invent a label, and this tool promises no blur or smearing. **Video path: do not ship.** At 6 credits (≈€1.20–1.80) against $2.10 of erase cost the margin is negative before a frame renders |
| ❌ | **AI influencer** (`ai_video`) | F7. `generateVideo` has never been called |

## 3b. Two NEW standalone tools — owner's decision 2026-08-10

Both were things I had ruled out *for Matrix*. The owner's point: not fitting inside a Matrix
video's margin is not a reason to drop a capability — it is a reason to sell it **separately,
priced on its own**. Neither is part of the Matrix flow.

| Status | Tool | Model | Cost to us | Note |
|---|---|---|---|---|
| ❌ | **Ukloni objekat iz videa** | `fal-ai/bria/video/erase/keypoints` or `…/mask` | **$0.14 per second** | Priced as its own job, the $2.10 for a 15s clip is chargeable instead of eaten. ⚠️ Two hard limits: the keypoints variant **refuses input longer than 5 seconds**, and the mask variant needs a **mask video** we would have to generate. Chunking a longer clip into 5s pieces breaks temporal consistency at the seams — verify before promising anything over 5s |
| ❌ | **Fotografija proizvoda** | `fal-ai/image-apps-v2/product-photography` | not captured | Professional product shots with realistic lighting and backgrounds. A COD seller would buy this on its own, independent of any video |

### ⚠️ The language problem, and how each tool answers it

Owner's constraint: **our users are Serbian and may not speak English**, but these models take
English instructions. Two different answers, and the first one is the better pattern wherever
it is available:

1. **Don't use language at all.** `bria/video/erase/keypoints` takes coordinates —
   `{x: 100, y: 100, type: 'positive' | 'negative'}` — not a description. The user taps the
   watermark on a frame and taps anything that must be preserved. Point at it, don't describe
   it. Nothing to translate, nothing to get wrong, and it is a better interface in any language.
2. **Serbian in, English out, invisibly.** Product photography genuinely needs a description.
   Take Serbian free text and have OpenRouter turn it into the English prompt before the call —
   `ScriptProvider` already runs through OpenRouter, so this is a prompt, not new plumbing.
   Pair it with Serbian preset buttons (bela pozadina, drvo, mermer, studio svetlo…) so most
   users never type at all; free text is the escape hatch, not the main path.

**Rule to apply to every future tool:** if the model can be driven by clicks, coordinates, or
presets, do that. Reach for translation only when the task is genuinely descriptive.

## 4. Output quality

| Status | Item | Who | Note |
|---|---|---|---|
| ❌ ⛔ | **Other platforms' burned-in UI in source clips** | 🤖 | Someone else's handle and watermark inside a paying customer's ad. Legal weight, not cosmetic. **Approach DECIDED by the owner 2026-08-10: exclude the dirty shots — never erase them.** Backed by measured prices: fal.ai's only video erasers (`bria/video/erase/{mask,keypoints}`) cost **$0.14/s**, which is $2.10 for a 15s ad against ~€3.00–4.50 of revenue for the whole video, and the keypoints one refuses input over **5 seconds**. Buying our way out is not affordable, so detection + shot filtering is the only path. See `research/fal-ai-catalogue.md` §2 |
| ❌ | **Imported clips arrive at 360p** and get upscaled to 1080×1920 | 🤖 | Measured 2026-08-10: the imported clip was **640×360**. If output looks soft, this is why |
| ❌ | **A 16:9 source is cover-cropped into 9:16 and roughly two thirds of the frame is thrown away** | 🤖 | Measured on the same clip: 640×360 (16:9) in, 1080×1920 out. Filling 1920 of height from 360 keeps only ~202 of the 640 px of width and upscales ~5.3×, which is why the render reads as an extreme zoom. Output size is hardcoded in `remotion/src/Root.tsx:48-49`; the crop is `objectFit: 'cover'` at `remotion/src/compositions/MatrixAd.tsx:266` |
| 🟡 | **Let the user choose the aspect ratio** — owner's request 2026-08-10 | 🤖 | **Output format DONE and verified live**: 9:16 / 1:1 / 16:9 picker in the Matrix wizard, size flows through Remotion's `calculateMetadata`, and a real 16:9 job rendered a **1920×1080** h264 file (`matrix-ad-1786382389944.mp4`, 22.3s). Unset still falls back to 9:16 so older jobs are unaffected. **Still open: the search side** — labelling or filtering clip results by orientation, which needs checking whether yt-dlp's `--flat-playlist` metadata carries width/height at all |
| 🟡 | **Serbian model choice** | 👤 | The blind eval ran; 30 variants sit on disk **ungraded**. Only you can grade them. Until then the model choice is a guess |

## 5. Legal (before any real customer)

| Status | Item | Who |
|---|---|---|
| ❌ ⛔ | Uslovi korišćenja / Privatnost / Impressum | 👤 |
| ❌ ⛔ | GDPR + cookie consent | 👤 |

Deliberately not drafted by me: this carries real legal weight across DE/RS/EU, and generated
placeholder text is worse than none because it reads as if it were coverage.

## 6. Testing — the current pass

| Status | Screen | Note |
|---|---|---|
| ✅ | Login | Works (session was live 2026-08-10) |
| ❌ | Signup | Not clicked this round |
| ❌ | **Password recovery** | Never clicked. Sends a real email to your address |
| ✅ | Dashboard `/app` | Tool cards match `JOB_COST`; balance renders; "Dodaj kredit" verified against the live DB (3 → 723, `pack_agency` = 600 + 120) |
| ✅ | `/app/reklame` (history) | Shows the finished job: Matrix · Gotovo · 15 kredita |
| ✅ | Matrix — script generation | Click-test 2 passed: OpenRouter wrote real Serbian copy, correct gender |
| ✅ | Matrix — caption + sound controls | Click-test 4 passed |
| ✅ | Matrix — **submit a job and get a finished video** | **DONE 2026-08-10.** Clip search → yt-dlp import → OpenRouter script → ElevenLabs (Charlie) → scene-detect montage → Remotion render → charge → history, all in one click-through. Output: `matrix-ad-1786378804132.mp4`, 10.7 MB, h264 **+ aac**, 18.67s, word-synced Serbian captions. Balance 723 → 708 |
| ✅ | **Brzi test** | Ran. **Failed the only thing that matters**: charged 2 credits, returned Big Buck Bunny (see §3) |
| ✅ | **AI slike** | Ran. Real kie.ai image, charged 4 credits — but the result is not persisted (see §3) |
| ⏭️ | Edit / Mix / Prevod | **Deliberately not run.** All three share `index.ts:331` with Brzi test, which is already proven to return a placeholder. Spending 18 + 12 + 15 credits to re-prove one line is waste; they become testable the moment that line has a real renderer |
| ❌ | Signup, password recovery | Need your inbox — password recovery sends a real email to your address |
| ❌ | Enhance, Remove text | Nothing to test until a model is chosen |

**Current local rig** (temporary, not how production works): SSH tunnel forwards the VPS
Redis to `127.0.0.1:6379`, the worker runs **here** with real keys, and the VPS worker is
**stopped** so it cannot steal jobs off the same queue and answer them with mocks.
Restart it with:

```
ssh root@46.225.214.52 "docker start adgen-worker-prod"
```

## 6b. Known smaller defects, found but not fixed

| Item | Where | Note |
|---|---|---|
| **Serbian plurals are wrong everywhere** | `kredita` used unconditionally across the app | `1 kredita` should be `1 kredit`; 2–4 take `kredita`, 5+ take `kredita`. Needs one shared pluralisation helper, not a local patch |
| **AI-generated images are never persisted** | `packages/core/src/providers/ai.kiefal.ts` | No storage call at all — `assets.url` holds kie.ai's temp CDN link with `storageKey: null`, so a paid image becomes a dead link once kie expires it |
| **Queue poller burns its full timeout on a dead job** | `ai.kiefal.ts` | Any status it does not recognise keeps it looping to the timeout (up to 10 min) instead of failing immediately. `media-edit.fal.ts` already does it correctly — back-port that |
| **`charge_credits` typed with 3 args** | `packages/db/src/generated/database.types.ts:158` | The live function takes four. Blocks any caller that wants `p_reason` |

## 7. Next up

1. **Wire `enhance` and `remove_text`** to `FalMediaEditProvider`. The provider is written and
   tested; what is missing is the worker branch (replace the `tool_not_implemented` throw for
   those two types), a `capability → provider` routing table (the winner is no longer the same
   provider for every capability), and copying results into our own storage — fal returns CDN
   URLs that expire, the same defect the image path already has.
2. **Clip search by orientation** — the other half of the aspect-ratio request.
3. **Signup and password recovery click-tests** — need the owner's inbox.
4. Then the smaller defects in §6b.
