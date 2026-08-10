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
| 🟡 | **AI slike** | Real scrape + real image generation (kie/fal both live-tested) |
| 🟡 | **Edit / Mix / Translate / Brzi test** | Wizards wired to the generic pipeline; none click-tested end to end |
| ❌ | **Enhance** | **No model chosen.** The wizard runs and returns a fake video. The function does not exist |
| ❌ | **Remove text** | Same — no model chosen |
| ❌ | **AI influencer** (`ai_video`) | F7. `generateVideo` has never been called |

## 4. Output quality

| Status | Item | Who | Note |
|---|---|---|---|
| ❌ | **Other platforms' burned-in UI in source clips** | 🤖 | Someone else's handle and watermark inside a paying customer's ad. Legal weight, not cosmetic. You asked to leave it for now |
| ❌ | **Imported clips arrive at 360p** and get upscaled to 1080×1920 | 🤖 | If output looks soft, this is why |
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
| ❌ | Dashboard `/app` | Not clicked since the credits button was rewired |
| ❌ | `/app/reklame` (history) | Not clicked |
| ✅ | Matrix — script generation | Click-test 2 passed: OpenRouter wrote real Serbian copy, correct gender |
| ✅ | Matrix — caption + sound controls | Click-test 4 passed |
| ❌ | Matrix — **submit a job and get a finished video** | The one that matters. Never done |
| ❌ | Every other wizard | Not started |

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
