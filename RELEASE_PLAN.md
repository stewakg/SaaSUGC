# RELEASE_PLAN.md — from here to the first paying stranger

**Written 2026-08-11.** This is the first release plan the project has had. `INFRASTRUCTURE.md`
tracks BUILD phases (F0–F7); this file tracks the LAUNCH path, which is a different axis and
mostly not code. Where the two disagree, this file is about shipping and F-phases are about
features.

## The definition of done

> A stranger who has never spoken to the owner finds the site, pays real money, and receives
> a real video they can post — and the owner can prove the money arrived and the cost of
> serving them.

Every item below exists because that sentence is currently impossible. Nothing else counts as
launch. A demo to a friend on `localhost` is not launch; the project already passed that bar on
2026-08-10 when the first real ad was produced from the wizard.

## Where the project actually is

Verified working, live, with real keys: Supabase auth + DB, OpenRouter scripts, ElevenLabs
voice, kie.ai and fal.ai image generation, yt-dlp clip import, scene-detect montage, and a
local Remotion render that produced a real h264+aac file with word-synced Serbian captions.
The three-theme UI redesign is complete and swept.

That is the whole product loop, and it works. **What is missing is not the product. It is
everything around it that turns a working pipeline into a business:** somewhere to host it,
somewhere durable to put the files, a way to take money, and a legal surface that does not
create liability.

## The five blockers, in the order they unblock each other

The order is not preference, it is dependency. You cannot test the money path without hosting;
you cannot ship a video without durable storage; you cannot charge for a video you cannot
deliver.

---

### L1 — Infrastructure spine
*Nothing else can be tested end-to-end until this exists.*

| # | Item | Who | Notes |
|---|---|---|---|
| L1.1 | Register a domain and point DNS | **Owner** | Nothing is reserved yet. Needed before auth callbacks, email, or a payment provider can be configured. |
| L1.2 | Decide the web host: Vercel vs the existing VPS | **Owner decides, Claude implements** | Vercel caps a request body at ~4.5 MB, which **breaks `POST /api/upload` for real video**. Either upload direct-to-R2 from the browser (extra work, correct long-term) or self-host on the VPS (no cap, more ops). This decision changes real code, so make it before L1.4. |
| L1.3 | Create a Cloudflare R2 bucket, set `R2_*` | **Owner** | `storage.r2.ts` is written and typechecks but **has never made a single real call**. Until this exists, rendered files have nowhere durable to live, and `enhance`/`remove_text` are hard-blocked — they refuse `localhost` source URLs because fal.ai cannot fetch them. |
| L1.4 | Settle how R2 URLs are exposed | Claude | ✅ capability done @ `ac117d1` — `signedDownloadUrl` (1 h) and `signedUploadUrl` (15 min, content-type bound), 9 tests that verify real signatures offline. **Not wired yet**: switching reads to signed links changes what `assets` stores and how "Preuzmi" behaves, and it cannot be confirmed against Cloudflare until L1.3. |
| L1.5 | A sending email address | **Owner** | Supabase auth mail (confirmations, password resets) currently goes out on Supabase defaults. |
| L1.6 | 30-day retention on generated assets | **Owner sets the rule, Claude handles the aftermath** | Owner's decision, 2026-08-11: everything created on the site stays available for 30 days. The deletion itself is a **bucket lifecycle rule in the Cloudflare dashboard**, not code. The code part is what happens AFTER an object disappears — see the note below. |

**Copying provider output into our own storage is already built**, and is the reason
`persistRemoteAsset()` exists (`apps/worker/src/index.ts:59`). kie.ai answers with URLs on
`tempfile.aiquickdraw.com` and fal's are temporary by design, so before 2026-08-10 a paid image
was stored as a link that expired — a dead asset in "Moje reklame" weeks later. Every generated
asset now goes: provider generates → we fetch it → we upload it to `providers.storage` → the DB
records OUR url. Applied on the `image_ads`, `enhance` and `remove_text` paths; matrix renders
never touched a provider CDN because we render them ourselves. **Switching to R2 changes no
code at all** — the same call writes to R2 instead of local disk the moment `R2_*` is set.

**Owner's decision, 2026-08-11: 30 days for EVERYTHING, sources included**, stated plainly in
the terms — anything made on the platform is available to download for 30 days. One rule, one
sentence, no exceptions to explain, and storage stays inside one Cloudflare plan forever.

I had warned that expiring sources would break re-running a job. **I checked, and that warning
was overstated:** the app has no re-run, retry or regenerate path anywhere — a job consumes its
sources once, at creation. Nothing in the product today reads an `uploads/` object after its
job finishes. The warning becomes real only if a "run this again" feature is ever added, and
then it is that feature's problem to solve.

The key prefixes are ALREADY separated, so per-prefix lifecycle rules need no code:

| Prefix | What | Suggested rule |
|---|---|---|
| `uploads/<userId>/` | customer's own clips + yt-dlp imports | 30 days |
| `renders/` | finished matrix videos | 30 days |
| `image-ads/`, `enhance/`, `remove-text/` | generated results | 30 days |
| `voice/` | TTS mp3, an INTERMEDIATE the render consumes and nothing reads again | **much shorter — a day or two is enough** |

`voice/` is worth splitting out: a matrix job with `count=15` writes 15 mp3s that exist only to
be muxed into the render. Keeping them 30 days is pure waste.

The one consequence that IS code: **the `assets` rows outlive the objects.** Once the rule
fires, "Moje reklame" will list jobs whose files are gone and render dead links. The history
needs an expired state, and if 30 days is sold as a feature the remaining time should be
visible. The wording is Serbian copy, so the owner's call; the state is mine.

One known limit worth fixing before large video passes through it: `persistRemoteAsset` buffers
the whole file in memory (`Buffer.from(await res.arrayBuffer())`). Fine for images, a memory
spike on the worker for an upscaled video. Streaming it would be the fix.

---

### L2 — Production truth
*Making the deployed system behave like the one that was tested.*

| # | Item | Who | Notes |
|---|---|---|---|
| L2.1 | Give the VPS worker real provider keys | **Owner** | **This is the sharpest edge in the project.** The production worker was found running on `mock-script` and `mock-voice` — it would have answered real paying jobs with canned text that looks like success. It is deliberately STOPPED right now for that reason (`howto.md` §5). |
| L2.2 | Make it impossible to repeat L2.1 by accident | Claude | The worker should refuse to start in production when any provider resolved to a mock, instead of running and quietly lying. A code guard is the only thing that makes L2.1 permanent. |
| L2.3 | Decide the render path: Remotion Lambda vs VPS | **Owner decides** | Lambda is NOT "just add a key" — it needs a one-time `remotion lambda functions deploy` + `sites create` against a real AWS account, and `REMOTION_LAMBDA_FUNCTION_NAME`/`REMOTION_SERVE_URL` are OUTPUTS of that deploy. Rendering on the VPS is viable at low volume and is the cheaper first step. |
| L2.4 | Run `enhance` and `remove_text` against real fal.ai once | Claude, after L1.3 | Both are wired and typecheck but have **never been executed**. Their 21 tests all mock `fetch`. First customer use must not be the first live test. |
| L2.5 | Capture real per-job cost against provider dashboards | **Owner** | `BUSINESS.md` margins are modelled, never measured. A matrix job with `count=15` makes 15 real ElevenLabs calls. |

---

### L3 — Money
*Currently the product cannot take a single euro.*

| # | Item | Who | Notes |
|---|---|---|---|
| L3.1 | Choose a payment provider | **Owner** | Lemon Squeezy was deleted on 2026-08-10 and **nothing replaced it**. There is no `/api/billing` route of any kind. For Serbia/Balkans + EU VAT, a merchant-of-record (Paddle, Lemon Squeezy again, Polar) removes the VAT problem; Stripe does not. |
| L3.2 | Implement checkout + webhook | Claude | The old implementation is in git history and is worth reading before rewriting — including its idempotency fix. |
| L3.3 | Idempotent credit granting | Claude | Non-negotiable. Webhooks are at-least-once; the previous implementation granted credits twice per purchase until migration `0004` added `credits_ledger.external_ref` + `add_credits_idempotent`. That migration still exists — reuse it, do not reinvent it. |
| L3.4 | Remove or hard-gate the dev credit button | Claude | `AddCreditsButton` navigates to `GET /api/dev/credits/add`, which 404s in production. It fails safe, but it ships a button that is visibly broken to a paying user. |
| L3.5 | Tests on the money path | Claude | ✅ done @ `77594e9` — 67 → 105 tests. Still no coverage of the job state machine; see the seam note under L2. |
| L3.6 | **Reversals: refund, chargeback, failed capture** | Claude, once L3.1 is chosen | Owner's requirement, 2026-08-11: if a payment is reversed, the credits must not be granted — or must be taken back if they already were. Mirror image of L3.3: the same `credits_ledger` + `external_ref` that stops double-granting is what lets a reversal find the exact grant to undo. Three cases, and they are not the same: (a) reversal arrives before the grant → never grant; (b) after the grant, credits unspent → debit them back; (c) after the grant, credits already SPENT → the balance would go negative. Case (c) needs a decision, not code: allow a negative balance, clamp at zero and eat the loss, or freeze the account. **Do not let the balance silently clamp by accident.** |

| L3.7 | Paid "keep it forever" tier (owner's idea, 2026-08-11) | Claude, after L1.6 | Cheap to build: retention already maps onto key prefixes, so a paid asset writes to an `archive/` prefix with no lifecycle rule and everything else to the 30-day one. The BUSINESS side needs a decision first, see below. |

**On selling permanent storage — worth deciding with open eyes, then it is a one-line code
change.** Three things to weigh, none of them blocking:

- A one-time fee buys a forever obligation. Revenue happens once; the storage bill recurs for
  as long as the account exists. It is the one product decision here that gets *more* expensive
  the more successful it is. A yearly renewal, or "forever" with a per-account size cap, keeps
  the same upsell without the open-ended tail.
- Willingness to pay may be low for a reason that is nobody's fault: **the customer already
  downloaded the file.** They are paying for convenience, not access. That is a real product
  but a modest one.
- "Forever" and GDPR erasure pull against each other. When someone asks for their account to be
  deleted, the promise has to yield — say so in the terms rather than discover it later.

**Owner's policy decision, recorded 2026-08-11: all credit purchases are final, no refunds.** Two
things that must not be confused with each other:

- A no-refund POLICY does not prevent a REVERSAL. A customer can dispute the charge with their
  bank and win regardless of what the terms say, and the money leaves the account either way.
  L3.6 exists because the system has to survive that, policy or no policy.
- Whether a blanket no-refund clause is enforceable is a question for L4.1, not for me. EU
  consumer law gives a 14-day withdrawal right on digital goods **unless** the customer
  expressly consents to immediate performance and acknowledges losing that right — which is
  exactly what the existing `uslovi` page already gestures at. Selling to EU customers on a
  flat "no refunds" line, without that consent step at checkout, is the kind of thing that
  looks fine until it is not. Have the lawyer answer it, then the checkout may need a
  tick-box, which is code.

---

### L4 — Legal and content safety
*Cheap to skip, expensive to be wrong about.*

| # | Item | Who | Notes |
|---|---|---|---|
| L4.1 | Have Uslovi / Privatnost / Impressum reviewed | **Owner** | The pages exist and are now styled, but every `[[POPUNITI: …]]` marker is still unfilled and no lawyer has read them. An Impressum with invented data is worse than none. |
| L4.2 | GDPR / cookie consent | Claude, after L4.1 | Not started. |
| L4.3 | Third-party watermarks in imported clips | Claude | A creator's handle or a TikTok watermark can currently end up inside a paying customer's ad. The decision is already recorded — exclude dirty shots, never erase them — but none of it is built. |
| L4.4 | Refund and failure policy in writing | **Owner** | Two different promises, and the terms must not blur them. (1) A FAILED JOB is never charged — the code already refunds, so this exists in behaviour and needs to exist in text. (2) A SUCCESSFUL PURCHASE of credits is final and not refundable — owner's decision, 2026-08-11. See the note under L3 about whether (2) is enforceable in the EU without a consent step at checkout. |

---

### L5 — Launch rehearsal
*The step everyone skips.*

Do the whole thing as a stranger, on production, with a real card and a real payout: sign up
with an email nobody has used, buy the smallest credit pack, run one Matrix job end to end,
download the video, then check that the money arrived, the credits were charged exactly once,
and the cost matches the model. Then do it again on a phone.

Only after that does the site get shared.

---

## Explicitly NOT in v1

Cutting these is what makes the rest reachable.

- **AI influencer / UGC (F7).** The Veo video path has never been called and has no wired job
  type. It is the reason the project exists long-term and it is not a launch feature.
- **A music and SFX library.** Bring-your-own-audio ships; a catalogue does not.
- **Video-side `remove_text`.** Already decided against on margin.
- **Scaling the render path.** One VPS render process is enough until someone complains.

## Risk register, ordered by how much it hurts on launch day

1. No way to accept money at all — L3 is the entire critical path.
2. A production worker on mocks charges real credits for canned output. Guard it in code (L2.2).
3. No hosting decision means the upload cap question is still open, and it changes real code.
4. No R2 means nothing durable, and two tools stay hard-blocked.
5. Public, guessable asset URLs would leak one customer's video to anyone who guesses.
6. Someone else's watermark inside a paying customer's ad.
7. First real `enhance`/`remove_text` call happening in front of a customer.
8. Unreviewed legal pages with unfilled placeholders.
9. Zero test coverage on the money path.
10. Costs modelled but never measured, so the margin is a guess.

## How to use this file

Tick items here, not in `INFRASTRUCTURE.md` — that file tracks features. When an item lands,
add the commit hash next to it. When an item turns out to be wrong, say so in the row rather
than deleting it; the wrong turns are the useful part of a plan later.
