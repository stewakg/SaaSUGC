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
| ✅ | **AI slike** | Runs for real end-to-end (2026-08-10, 4 credits): kie.ai returned a genuine generated image. **The persistence gap this row used to describe is CLOSED** (`123d0de`): `persistRemoteAsset()` in `apps/worker/src/index.ts` fetches the provider result and uploads it through `Storage`, so `assets.url` is ours and `storageKey` is set. kie.ai hands back `tempfile.aiquickdraw.com` links — the name says why this mattered |
| 🟡 | **Brzi test / Edit / Mix / Prevod** | **They used to charge and return Big Buck Bunny** — confirmed live 2026-08-10, Brzi test took 2 credits and returned `w3schools.com/html/mov_bbb.mp4`. **Fixed the same day**: the generic branch now throws `tool_not_implemented`, the job handler marks it `error`, and `charge_credits` never runs. Re-verified live — the job lands as "Greška", balance unchanged. They still do not *work*; they now fail honestly. Cause remains `apps/worker/src/index.ts` rendering every non-matrix, non-image job through `providers.renderer`, which is `MockRenderer` while the Remotion Lambda env is unset |
| 🟡 | **Enhance** | **Wired since `123d0de`** — `runMediaEditPipeline` routes it to `FalMediaEditProvider.upscaleImage/upscaleVideo`, refuses when `FAL_API_KEY` is absent, and refuses a `localhost` source because fal cannot fetch it (so it is hard-blocked until R2 exists, RELEASE_PLAN L1.3). **Never executed against real fal.ai** — its 21 tests all mock `fetch`. `faceEnhancement` is explicitly off: Topaz retouches faces by default, which on a product shot is an edit nobody asked for |
| 🟡 | **Remove text** | **Image path wired since `123d0de`** via `FalMediaEditProvider.removeTextFromImage` (`fal-ai/image-editing/text-removal`, $0.04), chosen over kie's cheaper `nano-banana-edit` because it takes **no prompt** — a general editor told to "remove all text" can regenerate the frame or invent a label. **Never executed against real fal.ai.** **Video path: still do not ship** — negative margin before a frame renders |
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
| 🟡 | **Let the user choose the aspect ratio** — owner's request 2026-08-10 | 🤖 | **Output format DONE and verified live**: 9:16 / 1:1 / 16:9 picker in the Matrix wizard, size flows through Remotion's `calculateMetadata`, and a real 16:9 job rendered a **1920×1080** h264 file (`matrix-ad-1786382389944.mp4`, 22.3s). Unset still falls back to 9:16 so older jobs are unaffected. **Search side: measured 2026-08-10, and it is harder than it looks.** `--flat-playlist --dump-json` returns **no `width`/`height` for the video** — the only dimension-bearing field is `thumbnails`, and those are YouTube's fixed sizes (480×270), which say nothing about the source's orientation. Knowing it at search time therefore costs one full `--dump-json` network call **per result**, which is exactly the cost `--flat-playlist` exists to avoid. Two cheaper options worth weighing instead: probe the file at **import** time (we download it anyway) and warn "ovaj klip je 16:9, izabrani format je 9:16 — gubiš oko dve trećine kadra", or fetch full metadata only for a clip the user actually previews |
| ✅ | **Serbian model choice** | — | **Graded 2026-08-10: all 30 acceptable.** Default moved to the cheapest tier, `google/gemini-3.1-flash-lite`. Caveat recorded rather than buried: the 3 canned control variants passed too, so the eval did not separate the models — this is "nothing is broken", not "cheapest equals best" |

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
| ✅ | **AI slike** | Ran. Real kie.ai image, charged 4 credits. Persistence closed `123d0de` (see §3) |
| ⏭️ | Edit / Mix / Prevod | **Deliberately not run.** All three share `index.ts:331` with Brzi test, which is already proven to return a placeholder. Spending 18 + 12 + 15 credits to re-prove one line is waste; they become testable the moment that line has a real renderer |
| ❌ | Signup, password recovery | Need your inbox — password recovery sends a real email to your address |
| 🟡 | Enhance, Remove text | Models chosen and wired (`123d0de`); blocked on R2 (fal cannot fetch a `localhost` source) and never run live |

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
| ~~AI-generated images are never persisted~~ | `apps/worker/src/index.ts` | **FIXED `123d0de`** — `persistRemoteAsset()` copies every provider result into our Storage before the url is recorded. Kept as a row because the same mistake reappeared a third time in the Lambda renderer (`515f90c`) |
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
