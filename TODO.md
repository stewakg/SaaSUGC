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
| ❌ ⛔ | **Brzi test / Edit / Mix / Prevod** | **THEY CHARGE AND RETURN BIG BUCK BUNNY.** Confirmed live 2026-08-10: Brzi test took 2 credits (708 → 706) and returned `https://www.w3schools.com/html/mov_bbb.mp4#mock=quick_test…`. Cause is one line, not config: `apps/worker/src/index.ts:331` renders every non-matrix, non-image job through `providers.renderer`, which is `MockRenderer` whenever the Remotion Lambda env is unset. Only `matrix`/`revoice` get the real renderer, because line 41 constructs `LocalRemotionRenderer` separately for them |
| ❌ | **Enhance** | No model chosen. Worse than "returns nothing": with an **image** source, `index.ts:327` asks the image model for `"enhance result"` — a brand-new unrelated picture, not the user's file enhanced. With a video source it falls to line 331 above |
| ❌ | **Remove text** | Same two paths, same outcome |
| ❌ | **AI influencer** (`ai_video`) | F7. `generateVideo` has never been called |

## 4. Output quality

| Status | Item | Who | Note |
|---|---|---|---|
| ❌ | **Other platforms' burned-in UI in source clips** | 🤖 | Someone else's handle and watermark inside a paying customer's ad. Legal weight, not cosmetic. You asked to leave it for now |
| ❌ | **Imported clips arrive at 360p** and get upscaled to 1080×1920 | 🤖 | Measured 2026-08-10: the imported clip was **640×360**. If output looks soft, this is why |
| ❌ | **A 16:9 source is cover-cropped into 9:16 and roughly two thirds of the frame is thrown away** | 🤖 | Measured on the same clip: 640×360 (16:9) in, 1080×1920 out. Filling 1920 of height from 360 keeps only ~202 of the 640 px of width and upscales ~5.3×, which is why the render reads as an extreme zoom. Output size is hardcoded in `remotion/src/Root.tsx:48-49`; the crop is `objectFit: 'cover'` at `remotion/src/compositions/MatrixAd.tsx:266` |
| ❌ | **Let the user choose the aspect ratio** — owner's request 2026-08-10 | 🤖 | Two places: filter/label clips by orientation during search, and pick the output format (9:16 / 1:1 / 16:9) before generating. Needs the composition size to come from props (Remotion `calculateMetadata`) rather than the two hardcoded numbers above |
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

## 7. Next up

- Finish the click-test pass in §6.
- Then: catalogue every kie.ai and fal.ai service/model into a local file — pick providers
  for Enhance and Remove text, and look for capabilities worth adding.
