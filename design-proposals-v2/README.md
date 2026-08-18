# Design proposals v2 — landing + dashboard

Four standalone HTML files, same two screens (public landing, signed-in dashboard),
exact production Serbian copy, everything inline, system font stacks only, no external
requests. Every file was verified in a real 375px viewport: `scrollWidth === 375`, zero
elements past the right edge. (That check earned its keep again: file 4 failed it twice
on the first pass — a horizontal-scroll strip propagating its min-content width through
a grid parent, and an absolutely-positioned spotlight extending the scroll area — both
found and fixed before delivery.)

Accessibility floor in all four: visible `:focus-visible` rings on everything clickable,
body text ≥ 4.5:1 (contrast values in each file's token comments), real `<a>`/`<button>`,
one `<h1>` + `<h2>` hierarchy, `aria-hidden` on decorative SVGs, `prefers-reduced-motion`
disarm, ≥ 44px touch targets on primary actions, `text-wrap: balance` on headlines
(no orphaned words), `tabular-nums` wherever numbers stack.

Craft floor in all four — the v1 tells, killed:
- **Radius varies by element size** (each file documents its radius system in the header comment).
- **Depth is a tuned system, not one blanket shadow** — Pult has two elevations, Studio
  three plus a recessed state; Prelom and Reflektor are flat *on purpose* and say so.
- **Buttons have hover, active (pressed), focus-visible and disabled states**; transitions
  120–160ms ease-out, never on input.
- **The USKORO problem is solved structurally, not with opacity** — see below.

---

## The one structural decision all four share

The dashboard has 7 "big" tools of which 4 are unreleased. v1's four proposals all kept
7 equal tiles and dimmed 4 — which reads as a half-dead product no matter how pretty the
dimming. v2 demotes unreleased tools into a *different, smaller form* per direction, so
the page reads "3 strong tools + a roadmap" instead of "7 tiles, 4 broken":

- **Prelom** — a numbered editorial index ("Stiže uskoro", roman numerals, price, badge)
- **Pult** — a dashed secondary ledger with a count chip ("Uskoro · 4"), compact rows
- **Studio** — a *recessed inset well*: elevation carries meaning (raised = usable now,
  sunk below the surface = not yet)
- **Reflektor** — a horizontal scroll-snap strip ("U pripremi"), the app-native pattern

Prices stay visible in all four — the roadmap is honest, not hidden.

---

## 1 — `1-prelom.html` · "Prelom" (type-led editorial, light)

Georgia display — a real serif, on-system everywhere, with true old-style numerals —
over warm paper. No boxes on the landing: tools are set as ruled broadsheet columns.
One vermilion accent; tool hues survive as small-caps kickers with a dot. The dashboard
is a ledger, not a grid. This is the only proposal where the answer to "what's your
brand?" is *the typesetting itself*.

- **Optimises for:** distinctiveness per euro. Zero images, zero shadows, zero gradients —
  and it's the file a design-literate person will remember.
- **Sacrifices:** all SaaS conventions. No cards means no card affordances; hit targets
  are typographic rows.
- **Audience fit:** flatters the seller who wants to look like a *publisher* of ads —
  and anyone tired of interchangeable AI-tool UIs. Risks reading "magazine, not tool"
  to the most cautious COD seller; it is the least "AI product" page of the four.
- **Token survival:** semantic names (~70%) survive; nearly all *values* are new, and a
  serif display stack is a whole new token category. Gradient and shadow tokens die.
- **Theme cost — plainly:** one-theme personality. "Paper" does not translate to dark;
  obsidian/neon become legacy options.
- **Implementation cost (19 screens / 14 components): highest.** A second type system
  threads through every component, and the ledger pattern replaces the card grid; nobody
  has proven a wizard form in this voice yet.
- **Honest risk:** Georgia's rendering varies on cheap Android panels (fallback chain
  lands on Roboto/Noto Serif — acceptable, but metrics shift), and editorial restraint
  executed at 90% reads as unstyled HTML rather than confident.

## 2 — `2-pult.html` · "Pult" (Stripe-calm utility, light)

Information density that stays quiet: true 1px hairlines, two tuned elevations (resting
card, one raised hero panel), a single working blue that only ever means "action", tool
hues reduced to tinted icon plates. The dashboard is a statement: rows in one sheet,
prices right-aligned in a tabular column like transaction amounts, chevrons, 68px targets.
This is v1's own recommendation ("Papir's authority + Kiosk's rows") actually executed —
without Papir's 1.5px wireframe heaviness or Kiosk's everything-is-800-bold flatness.

- **Optimises for:** trust-per-second on a phone. It pattern-matches to the apps this
  audience already gives money to (bank, courier), but with real typographic hierarchy
  (750-weight display, 650 labels, 400 body — not one bold everywhere).
- **Sacrifices:** spectacle. Nobody screenshots it. The hero panel and the blue are as
  loud as it ever gets.
- **Audience fit:** the safest fit for COD sellers deciding fast whether to pay. Puts off
  only the young dropshipper who wants the tool to look like the TikTok feed it serves.
- **Token survival:** highest of the light options — poluton is the natural host, ~80%
  of names carry over; washes become plates, the two-elevation shadow pair replaces the
  single card shadow.
- **Theme cost:** light-native. A dark render is *workable* (it's just tokens) but
  generic — dark would be a maintained option, not a co-equal soul.
- **Implementation cost: lowest.** The shapes are conventional SaaS; the sheet/row
  pattern generalizes to jobs, wizard steps and every future money screen for free.
- **Honest risk:** anonymity. Calm blue-and-white SaaS is a crowded genre; if the
  spacing and type discipline slips even slightly, it becomes a template. Execution *is*
  the brand here.

## 3 — `3-studio.html` · "Studio" (dark as material, layered)

The dark direction done the Raycast way instead of the glass way: opaque surfaces lit
from above (every raised element carries a 1px top-edge highlight), three tuned
elevations plus a recessed state, no blur, no gradients, no glow. The primary button is
near-white — *light itself is the accent* — with one coral mark for brand/active. Tool
hues stay as icon inks. On the dashboard, elevation is semantics: available tools are
raised, unreleased ones sit in a well sunk below the surface.

- **Optimises for:** perceived quality of the surface itself. This is the "feels
  expensive before you click" file.
- **Sacrifices:** daylight legibility on cheap panels — the honest cost of any dark UI
  for this audience — and colour theatre: coral is a mark, not a wash.
- **Audience fit:** flatters the TikTok-native cohort and anyone who reads dark as
  "pro tool". The cautious seller's "gamer thing" objection to dark UIs still applies,
  softened by the absence of glow and gradient.
- **Token survival:** ~90% by name — this is obsidian taken seriously. Values re-tuned;
  glass, washes and `--action-grad` die; the edge-highlight and elevation tokens are new.
- **Theme cost:** dark-native. Poluton can host the structure but loses the light-from-
  above idea; neon maps trivially (swap coral for lime).
- **Implementation cost: medium.** Mostly a token-level sweep (surfaces, shadows,
  edge highlight); component geometry stays conventional.
- **Honest risk:** the near-white primary needs discipline — add a second bright element
  per view and the lighting story collapses into ordinary dark-grey admin.

## 4 — `4-reflektor.html` · "Reflektor" (imagery-led, near-black + lime)

The 9:16 slot is the page. On mobile it sits centre-stage directly under the headline,
framed with lime crop marks under one functional spotlight — built so the real render
drops in and owns the screen. Flat surfaces, no shadows; lime speaks only for action and
price. Sentence case at up to 88px — swagger without Signal's ALL-CAPS shouting — and
unlike Signal, the per-tool hues survive (the owner reinstated them deliberately on
2026-08-13; a design proposal shouldn't silently reverse a product decision).

- **Optimises for:** the product's own promise. A video tool whose landing is built
  around a video. Best conversion story of the four *once a sample render exists*.
- **Sacrifices:** everything else on the page is deliberately quiet staging; the landing
  has exactly one idea.
- **Audience fit:** flatters the seller who lives inside TikTok; the lime-on-black feels
  like the creator economy it serves. The cautious-seller risk is real but smaller than
  Signal's: sentence case and kept hues read energetic, not aggressive.
- **Token survival:** neon is the natural host — lime and surfaces map straight over;
  tool hues kept; shadows die (flat by design).
- **Theme cost — plainly:** one-theme personality, same as Signal was. In light tokens
  the spotlight and crop marks lose their meaning.
- **Implementation cost: medium.** Flat is cheap; the stage is one component; the
  scroll-snap strip is new but small.
- **Honest risk:** until the owner picks a sample render, the whole hero is a promise —
  an empty stage lit for an actor who hasn't arrived. And lime-on-black will date;
  it pins the product to this moment.

---

## What the four earlier attempts (design-proposals/) got wrong

Judged against the same bar they were supposed to clear:

1. **Staklo Editorial** used two moves the brief explicitly bans — a violet→cyan gradient
   *on the headline word itself* plus two blurred ambient gradient blobs — and one
   blanket `--shadow-card` on every card (the single-shadow tell). Display type capped at
   ~68px. Its "evolution, not replacement" framing meant it never risked anything: it is
   the status quo with nicer margins.
2. **Papir** had the right instinct (trust = bank-app light) and wireframe execution:
   one `--r: 8px` on every corner of every element (the exact identical-radius tell),
   1.5px ink borders on *everything* so the page reads as a printed form rather than a
   product, bullets boxed in border-top scaffolding, and no pressed states anywhere.
   With zero depth allowed, hierarchy had to come from type — and the type scale
   (max 4rem, two effective weights) wasn't strong enough to carry it.
3. **Kiosk** set essentially everything in weight 800 — all-bold is the same failure as
   one-weight, inverted. H1 topped out at 48px. Solid-colour icon tiles are 2014
   app-icon shorthand. "It has almost no personality" was written up as a feature;
   for a product asking for money, forgettable is not a strategy.
4. **Signal** shouted: ALL-CAPS Serbian display with diacritics at 6.5rem plus mono
   captions on everything reads aggressive, and it silently reversed the owner's
   deliberate 2026-08-13 decision to keep per-tool colour. Its striped USKORO cells
   still occupied equal grid cells — half the grid remained dead.

**Common to all four:** one skeleton in four palettes — same hero grid, same section
furniture, same card DNA ("four shades of the same idea" is exactly the failure the
brief named). None solved the 7-tiles-4-dead dashboard structurally; all four dimmed
instead of restructured. And none varied corner radius, elevation, or interaction
states enough to pass the "generated design" tells they were never checked against.

## 5 — `5-premijera.html` · "Premijera" (the EcomAlati class, done our way)

Added 2026-08-18 after analyzing the competitor, at the owner's request: their emotional
register — dark, warm, colour-coded tools, heavy display type — with our identity and
better craft. Not a copy; a point-by-point answer:

| EcomAlati | Premijera |
|---|---|
| orange brand | **violet** — continuity with AdGen's existing obsidian accent tokens, instantly not-them |
| page-wide ambient glow | **one functional spotlight on the 9:16 stage** — the product is vertical video, so the stage is the signature, not a blob |
| white text on saturated gradient washes (their weakest pattern) | **hue lives in a card header strip; the body stays dark and readable** — their best pattern (UBACIŠ/DOBIJEŠ header strips), applied to fix their worst |
| centred hero | asymmetric: type left, crop-marked stage right |
| Manrope 800 (their font) | **Space Grotesk 700/800** named as the bundleable display (OFL, full č ć š ž đ coverage), tuned to hold on the system stack so the file is complete offline |
| dark-only | dark-native, but every colour is a token; obsidian hosts it at ~85% name survival, neon = violet→lime swap |

- **Optimises for:** beating the competitor at their own game — "appealing" to the same
  eye that likes their site, while reading as a different company.
- **Sacrifices:** the light-theme story (same one-theme cost as Studio/Reflektor) and
  some of Pult's daylight-readability advantage.
- **USKORO solve:** Studio's recessed well (elevation = availability), prices kept.
- **Implementation cost: medium.** Strip-header card is one new component; violet maps
  onto existing accent tokens; the stage is shared with Reflektor.
- **Honest risk:** it competes in the genre the competitor defined — side by side, a
  visitor sees "same kind of product, different colour". The distance comes from craft
  (readable bodies, tuned elevations, honest USKORO) and the stage; if those slip, it
  degrades into "EcomAlati, but violet".

---

## Competitive context: EcomAlati (analyzed 2026-08-18)

Fonts confirmed from their HTML: **Manrope 800** (display), **Archivo 500–800**
(secondary headings), **Inter 400–700** (body) — all Google Fonts, all OFL, all
bundleable. The single biggest gap between "their site looks appealing" and any
system-font mockup is that heavy display face; dropping a self-hosted Manrope 800 into
any of these four proposals is a few lines of `@font-face`.

What they do well (worth stealing regardless of direction):
- **Two-tone headlines** — key word white, rest silver-grey. Cheap, strong hierarchy.
- **UBACIŠ / DOBIJEŠ cards** — input/output rows with a gradient strip only in the
  header and a plain dark body. The best tool-explanation format for a non-technical
  seller on either of our screens.
- **Honest trust copy sold loudly** — "Krediti se skidaju tek kad video izađe",
  "0 kredita za neuspeo izlaz". AdGen already implements exactly this (fail-not-charge
  guards, refund state machine) and currently says it nowhere.
- **Landing USKORO framing** — "Još nije dostupan i zato se ovde ne prodaje": the same
  demote-honestly philosophy these four proposals apply to the dashboard.
- **Product screenshot as hero demo** — until a sample render exists, a real app
  screenshot can fill the hero where our empty 9:16 slot waits.

What they do badly (attackable): checkmark bullets sitting directly on saturated
gradient washes (contrast and noise), a single dark-only theme, and a hero glow that is
technically the banned ambient-blob move — theirs survives only because it is
monochrome warm and low-saturation, not violet-to-cyan.

## Recommendation

**Pult (2) as the product, Reflektor's (4) stage grafted onto the landing hero the day
a real sample render exists.**

The audience decides in seconds, on a phone, whether a paid tool is trustworthy — that
was the deciding fact in v1's recommendation and it hasn't changed. Pult is that
recommendation (light utility + transaction rows) executed to the current bar, and it is
also the cheapest direction to carry across 19 screens and 14 components, because its
sheet/row/plate patterns *are* the app's future screens (jobs, wizard, billing).

Its one real weakness — no theatre — is precisely what the product itself will fix: the
only theatre this landing needs is a real vertical ad playing in the slot. That is
Reflektor's stage. Transplant the crop-marked 9:16 frame (recoloured to Pult's blue) into
Pult's hero panel when the render is chosen, and you get the trust of a bank app with a
product demo as the centrepiece — without committing the whole UI to lime-on-black.

If the owner wants the app itself to feel more premium than "calm SaaS", **Studio is the
upgrade path, not a rival**: its elevation semantics (raised = available, recessed =
uskoro) can be adopted by Pult's dark theme later, token-for-token. **Prelom** is the
one to pick only if differentiation-at-any-cost becomes the strategy — it is the most
memorable and the most expensive, and it would make the three-theme system a fiction.

**Post-EcomAlati addendum:** if the deciding criterion has shifted from "what does a
cautious COD seller trust" to "what wins the head-to-head against EcomAlati in the same
visual genre", then **Premijera (5)** is the pick — it is Studio's construction wearing
the competitor's emotional register with our violet identity and the 9:16 stage as the
signature they don't have. The original recommendation stands on the original brief;
Premijera is the answer to the new question the competitor's site raised. Pick by which
question matters more — they lead to different files.
