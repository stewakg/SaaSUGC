# Redesign prompts — hand these to the implementing model one at a time

**Chosen direction (owner approved 2026-08-10):** *Obsidian* as the base — deep charcoal
glass, violet→cyan gradient reserved for actions — with *Neon studio*'s pulse used in exactly
one place: the render progress and the "video is done" moment. *Poluton* (the light theme)
falls out of the same tokens nearly for free and ships as the light mode.

Reference mockups with exact hexes and live card examples:
https://claude.ai/code/artifact/7c43b5c2-cf42-4cb7-bd6e-6fc757166564

**How to use this file:** paste PROMPT 0 plus exactly ONE numbered prompt per session, in
order. Each prompt is self-contained and ends with a definition of done. Do not run two at
once — later prompts assume earlier ones landed. After each one: commit, and append the
`SESSION_LOG.md` block the repo's CLAUDE.md requires.

---

## PROMPT 0 — shared context (prepend to every task)

```
You are restyling AdGen, a Serbian AI ad-generator SaaS. pnpm monorepo; the web app is
apps/web (Next.js 15, Tailwind, dark UI). Read CLAUDE.md first and obey its rituals.

Non-negotiable constraints:
- UI copy is SERBIAN. Code, comments, commit messages: English. Do not translate or
  reword existing Serbian copy while restyling — copy changes are out of scope.
- This is a RESTYLE, not a rewrite. Do not change component logic, props, routes, API
  calls, state, or behaviour. If a visual goal seems to require a logic change, stop and
  record it as an open question instead of doing it.
- Gates before claiming done: `pnpm -r typecheck` and `pnpm --filter @adgen/web build`
  must pass. State plainly in your report whether you ran the app and looked at it, or
  only compiled it (the repo's VERIFIED vs CODE-COMPLETE discipline).
- Design system precedence: tokens in apps/web/tailwind.config.ts + globals.css are the
  single source of truth. Never hardcode a hex in a component; if a needed value is not
  a token, add the token first.
- Both themes always: dark ("Obsidian") is default, light ("Poluton") must not regress.
  Theme is token-level — components never branch on theme.
- Respect prefers-reduced-motion on every animation you add.

The visual direction, in one paragraph: deep charcoal glass surfaces (#0B0C10 ground,
#191B22 lines, rgba-white 1px borders, subtle blur), text #EDEEF2 / #A6A6B5 / #63636F,
ONE gradient accent violet #7C5CFF → cyan #4DD6FF used ONLY on primary actions, active
states and progress. Lime #C6FF4D exists for exactly one purpose: the live render pulse
and the "done" flash. Typography: one variable grotesk, headings 700–800 weight with
tight (-.02 to -.035em) tracking; every number that can line up (credits, timers,
dimensions) is mono with tabular figures. Layout: full-width bento grids, no floating
centered column. Depth separates elements; colour carries STATE (running/done/error),
never tool identity — the six per-tool gradients are being retired.
```

---

## PROMPT 1 — design tokens (do this first, nothing else)

```
Task: replace AdGen's ad-hoc colours with a token system. Touch ONLY
apps/web/tailwind.config.ts, apps/web/src/app/globals.css, and (if it exists)
apps/web/src/lib/tool-theme.ts. No component files in this task.

1. In tailwind.config.ts define the new scales, keeping the OLD names working during
   migration (map old `ink`/`brand` to the new values rather than deleting them, so
   nothing breaks before Prompt 2+ lands):
   - surface: 950 #08090B, 900 #0B0C10, 850 #0E0F14, 800 #101218, 700 #191B22,
     600 #22242C
   - line: DEFAULT rgba(255,255,255,.08), strong rgba(255,255,255,.14)
   - txt: hi #EDEEF2, mid #A6A6B5, low #63636F
   - accent: violet #7C5CFF, cyan #4DD6FF (gradient pair — never used as flat fills
     for large areas)
   - pulse: #C6FF4D (render-progress and done-flash ONLY — add a comment saying so)
   - semantic: ok #35C48F, warn #F5B83D, err #F0564A (states, separate from accent)
2. In globals.css express the same palette as CSS custom properties on :root, with the
   light "Poluton" values under [data-theme="light"]: ground #F6F6F9, panel #FFFFFF,
   line #E8E8EE, txt #16161C/#4A4A56/#8A8A96, accent #5B3DF5 replacing the gradient
   pair (light theme uses the flat violet, no gradient). Components will consume ONLY
   the custom properties / Tailwind tokens.
3. Type + spatial tokens: heading tracking utilities (tight -.02em, tighter -.035em),
   a `tabular` utility (font-variant-numeric: tabular-nums), radius scale (panel 24px,
   card 16px, control 10px, pill 999px), and two shadows (card: 0 1px 2px rgba(0,0,0,.4),
   0 10px 30px -14px rgba(0,0,0,.8); glow: 0 0 0 1px rgba(124,92,255,.2),
   0 12px 30px -18px rgba(124,92,255,.55)).
4. In tool-theme.ts: do NOT delete it yet (callers exist), but make every key in
   THEME_GRADIENTS resolve to the same neutral surface treatment and add a deprecation
   comment: per-tool colour is retired, colour now means state. Removal happens in
   Prompt 3 when the callers are restyled.

Done when: typecheck + web build pass, the app still renders exactly as before (this
task adds capability, changes nothing visible), and your report lists every token name
added so later prompts can reference them.
```

---

## PROMPT 2 — primitives

```
Task: restyle the shared primitives to the Obsidian direction using ONLY Prompt 1's
tokens. Files: globals.css component classes (.btn-primary, .btn-ghost, .card,
.card-gradient, .badge and friends) plus any small shared components
(apps/web/src/components/*) that define button/card/pill/input styling. Do not touch
page files yet.

- .btn-primary: violet→cyan gradient (92deg), dark text #0B0C10, radius 10px, weight
  600; hover lifts 1px with the glow shadow; focus-visible gets a 2px cyan outline.
- .btn-ghost: transparent, 1px line border, txt-mid; hover raises surface one step.
- .card: surface-850 with a subtle top-light gradient (rgba-white .05 → .02), 1px line
  border, radius 16px, card shadow. An "active/selected" variant swaps the border for
  the violet glow treatment.
- .badge / price pills: mono, tabular figures, rgba-violet .14 background with #C9BBFF
  text in dark; light theme derives from tokens automatically.
- Inputs/selects/textareas: surface-900 fill, line border, radius 10px, focus border
  cyan at 50% — one consistent treatment everywhere.
- Progress bar primitive (.progress > i): track surface-700, fill the violet→cyan
  gradient; add a `.progress--live` variant where the fill animates a slow sheen using
  pulse #C6FF4D blended in — this is the ONE place pulse appears. Gate the animation
  behind prefers-reduced-motion.
- Wizard step chips (the KORAK n/6 strip): restyle as a segmented rail — inactive
  surface-800/txt-low, active violet-tinted with inset 1px violet border.

Done when: gates pass, every wizard still functions (spot-check /app/quick-test through
its 2 steps in the browser if a dev server is available), and no component file
contains a raw hex.
```

---

## PROMPT 3 — dashboard (/app) + app shell

```
Task: rebuild the signed-in dashboard layout to full-width bento and retire per-tool
colour. Files: apps/web/src/app/app/page.tsx, apps/web/src/components/app-shell.tsx,
apps/web/src/components/tool-cards.tsx, and delete-or-empty
apps/web/src/lib/tool-theme.ts once its last caller is gone.

- App shell: sidebar surface-900 with 1px line border-right; active nav item gets the
  violet-tinted treatment from Prompt 2's step chips. Keep the existing legal links
  (Uslovi/Privatnost/Impressum) and logout exactly where they are.
- Kill the floating centered column: the content area becomes a full-width grid with
  24px gutters (max-width none; use padding, not auto margins).
- Tool cards: ALL cards use the neutral .card treatment — the six gradients go. The
  two "main" tools (matrix, revoice per JOB_DESCRIPTORS tiers) may span 2 columns in
  the bento; utility tools sit in a denser row of compact cards. Price badge mono
  top-right, benefits as a quiet list, hover = 4px lift + glow border.
- Credit balance in the header: the number becomes the largest thing in that cluster,
  mono/tabular, with `creditsWord()` from @adgen/core for the label (never hardcode
  "kredita" — the 1/11/21 rule exists in code).
- Move the credit-packs section visually below the tools with a section label, or to
  its own clearly-separated bento band — it must stop competing with the tools (this
  exact complaint is recorded in INFRASTRUCTURE.md §8).
- "Uskoro" (ai_video) card: dimmed to 60% with a mono USKORO chip, not a different hue.

Done when: gates pass, dashboard verified in the browser at desktop and 375px widths,
tool-theme.ts is gone (or provably caller-free), and no per-tool gradient remains
anywhere in apps/web.
```

---

## PROMPT 4 — wizards (matrix first, then the other five by the same recipe)

```
Task: apply the system to the wizard screens. Files: the JobWizard shell component
(apps/web/src/components/job-wizard.tsx) first — most of the win is there — then
apps/web/src/app/app/matrix/page.tsx, then edit/mix/translate/enhance/remove-text/
ai-slike/quick-test pages, which mostly inherit.

- Wizard shell: step rail from Prompt 2 at top; content in a single surface-850 panel
  (radius 24px) instead of stacked borderless sections; the footer (price + Nazad/
  Dalje) becomes a sticky bar inside the panel with the price in mono.
- Matrix specifics, all restyle-only: script candidate cards use .card with the active
  variant when expanded; the aspect-ratio picker buttons and the two amber clip
  warnings restyle to warn-token treatment (semantic warn, not accent); voice select,
  caption controls and sliders take the shared input treatment.
- The RENDER moment is the showpiece and the only theatrical element in the app:
  while a job runs, use .progress--live with the elapsed timer in mono
  ("00:42 / 01:38" style if elapsed data exists — do not invent data that isn't
  there; a pulsing indeterminate bar is fine otherwise). On completion, the result
  block gets a one-time pulse-coloured border flash (~600ms, reduced-motion aware),
  then settles to the ok-green state border.
- Error states (the job history and in-wizard failures): err token treatment, message
  text stays exactly as-is (Serbian, already humanised in reklame/page.tsx).

Done when: gates pass; matrix wizard walked in the browser through at least step 3
with screenshots or a text report of each step; the other five wizards spot-checked;
zero logic diffs (assert by keeping the diff to className/markup/CSS — call out any
line that isn't).
```

---

## PROMPT 5 — landing page + auth screens

```
Task: the public face. Files: apps/web/src/app/page.tsx, the (auth) pages
(login/signup/zaboravljena-lozinka/nova-lozinka), and the (legal) layout only if its
inline styles clash with the new tokens (content untouched — legal text is frozen).

- Hero: keep the existing Serbian copy verbatim. Type goes to clamp(44px→88px),
  weight 800, tracking -.035em, with ONE gradient-text phrase (the existing
  "prodaju" highlight maps to the violet→cyan pair). Ambient background: two large
  blurred radial glows (violet top-left, cyan top-right, ~.14 opacity, fixed,
  pointer-events none) — no other decoration.
- A phone-frame mockup in the hero showing a 9:16 video placeholder — static CSS
  frame, surface treatment, no fake screenshots of features that don't exist. If a
  real render thumbnail is available under /storage this may embed it; otherwise a
  neutral gradient placeholder with a mono "1080×1920" caption.
- Tool grid: same neutral cards as the dashboard (import the same component if
  practical rather than duplicating).
- Footer: keep the legal links block exactly as-is.
- Auth pages: one centered surface-850 panel on the ambient-glow ground, shared input
  treatment, .btn-primary submit. No copy changes.

Done when: gates pass, landing + login verified in the browser in BOTH themes, and
lighthouse-obvious regressions (contrast of txt-mid on surface-900, focus states)
spot-checked and reported.
```

---

## PROMPT 6 — sweep + verdict

```
Task: close the loop. Grep apps/web for stray raw hexes, leftover `ink-`/`brand-`
classes, per-tool gradient remnants, and any `kredita` string not going through
creditsWord/creditsLabel. Fix what you find within the restyle scope. Then run the
full gates (pnpm -r typecheck, pnpm -r test, pnpm --filter @adgen/web build), walk
/, /login, /app, /app/matrix, /app/reklame in the browser, and append a REVIEWED:
line to SESSION_LOG.md's ledger anchored to the final commit, stating exactly which
screens were runtime-verified and which merely compile. If the old `brand` yellow
(#FFE000) still has callers, list them rather than force-migrating blind.
```

---

## Open questions for the owner (answer before Prompt 3 if possible)

1. Sidebar always visible on desktop, or collapsible? (Prompt 3 assumes always visible.)
2. Does the light "Poluton" theme ship user-facing at launch, or stay token-ready but
   hidden? (Prompts assume: ship it, defaulting to dark.)
3. The landing hero phone-frame: real render thumbnail or neutral placeholder?
