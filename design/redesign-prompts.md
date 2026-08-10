# Redesign prompts — hand these to the implementing model one at a time

**What is being built (owner's decision, clarified 2026-08-10):** ALL THREE directions from
the approved proposal ship as **user-selectable themes**. Nobody picks a winner — the site
has a theme switcher and the user chooses:

| `data-theme` | Name in UI | Ground | Character |
|---|---|---|---|
| `obsidian` (default) | Obsidian | dark charcoal glass | violet→cyan gradient on actions |
| `poluton` | Poluton | light, soft depth | flat electric violet, black primary button |
| `neon` | Neon studio | near-black matte | single lime accent on live/active things |

Reference mockups with exact hexes and live card examples for all three:
https://claude.ai/code/artifact/7c43b5c2-cf42-4cb7-bd6e-6fc757166564

**The one architectural consequence, and it is the whole game:** components may NEVER know
which theme is active. Everything renders through CSS custom properties; a theme is one
block of token values under `[data-theme="…"]`. If a component branches on the theme, the
third theme costs as much as the first — done right, it costs one CSS block.

**How to use this file:** paste PROMPT 0 plus exactly ONE numbered prompt per session, in
order. Each ends with a definition of done. After each: commit, and append the
`SESSION_LOG.md` block the repo's CLAUDE.md requires.

---

## PROMPT 0 — shared context (prepend to every task)

```
You are restyling AdGen, a Serbian AI ad-generator SaaS. pnpm monorepo; the web app is
apps/web (Next.js 15, Tailwind, currently dark-only). Read CLAUDE.md first and obey its
rituals.

Non-negotiable constraints:
- UI copy is SERBIAN. Code, comments, commit messages: English. Do not translate or
  reword existing Serbian copy while restyling — copy changes are out of scope.
- This is a RESTYLE plus a THEME SYSTEM, not a rewrite. Do not change wizard logic,
  props, routes, API calls, or job behaviour. The only new behaviour allowed anywhere
  is the theme switcher itself (Prompt 2).
- THREE user-selectable themes ship: obsidian (default, dark glass, violet #7C5CFF →
  cyan #4DD6FF gradient on actions), poluton (light #F6F6F9 ground, flat violet
  #5B3DF5, black primary button), neon (near-black #08090B matte, single lime #C6FF4D
  accent reserved for live/active states). Exact palettes are in Prompt 1.
- Components NEVER branch on theme. All styling flows through CSS custom properties;
  each theme is exactly one [data-theme="…"] token block in globals.css. If you catch
  yourself writing a theme conditional in TSX, you are doing it wrong — stop and move
  the difference into a token.
- Colour carries STATE (running / done / error / selected), never tool identity. The
  six per-tool gradients are being retired.
- Typography in every theme: one variable grotesk, headings 700–800 with tight
  (-.02 to -.035em) tracking; every alignable number (credits, timers, dimensions) is
  mono with tabular figures. Serbian credit labels only through creditsWord()/
  creditsLabel() from @adgen/core — the 1/11/21 grammar rule lives there.
- Respect prefers-reduced-motion on every animation.
- Gates before claiming done: `pnpm -r typecheck` and `pnpm --filter @adgen/web build`
  pass. State plainly whether you RAN the app and looked, or only compiled
  (VERIFIED vs CODE-COMPLETE — the repo treats these as different words).
```

---

## PROMPT 1 — the token system, all three themes (first, nothing else)

```
Task: build the three-theme token foundation. Touch ONLY apps/web/src/app/globals.css,
apps/web/tailwind.config.ts, and (read-only for now) apps/web/src/lib/tool-theme.ts.
No component files.

1. In globals.css define the FULL semantic token set as CSS custom properties. Semantic
   names, not colour names — a component asks for "panel" or "accent", never "violet":

   --ground, --panel, --panel-2      (page and surface fills)
   --line, --line-strong             (1px borders)
   --txt-hi, --txt-mid, --txt-low
   --accent, --accent-2              (accent-2 may equal accent in single-accent themes)
   --accent-contrast                 (text colour ON the accent)
   --action-grad                     (background-image for primary buttons; solid
                                      color(--accent) in themes without a gradient)
   --live                            (the "happening right now" colour: render pulse,
                                      done-flash)
   --ok, --warn, --err               (semantic states, same hues in all themes)
   --shadow-card, --shadow-glow
   --radius-panel 24px, --radius-card 16px, --radius-control 10px

2. Three theme blocks, defaulting to obsidian on :root:

   :root, [data-theme="obsidian"]:
     ground #0B0C10, panel rgba(255,255,255,.035)…, lines rgba(255,255,255,.08/.14),
     txt #EDEEF2/#A6A6B5/#63636F, accent #7C5CFF, accent-2 #4DD6FF,
     action-grad linear-gradient(92deg,#7C5CFF,#4DD6FF), accent-contrast #0B0C10,
     live #C6FF4D
   [data-theme="poluton"]:
     ground #F6F6F9, panel #FFFFFF, line #E8E8EE/#D9D9E2,
     txt #16161C/#4A4A56/#8A8A96, accent #5B3DF5, accent-2 #5B3DF5,
     action-grad none→solid #16161C (primary button is BLACK in this theme; accent is
     for selection/links/progress), accent-contrast #FFFFFF, live #5B3DF5
   [data-theme="neon"]:
     ground #08090B, panel #0D0F12, line #16191E/#222833,
     txt #EAF2EE/#9AA5A0/#7C8781, accent #C6FF4D, accent-2 #C6FF4D,
     action-grad solid #C6FF4D, accent-contrast #0A0C08, live #C6FF4D
   Semantic ok/warn/err identical across themes: #35C48F / #F5B83D / #F0564A.

3. Also honour the OS: @media (prefers-color-scheme: light) makes poluton the default
   only when the user has not chosen (i.e. when html carries no data-theme attribute).
   An explicit data-theme always wins.

4. tailwind.config.ts: map utility names onto the custom properties (colors reference
   var(--…)), add heading-tracking utilities, a `tabular` utility
   (font-variant-numeric: tabular-nums), the radius scale, both shadows. Keep the old
   `ink`/`brand` names resolving to sensible new values so the app keeps compiling
   until Prompts 2–5 migrate the callers.

Done when: gates pass; the app renders unchanged (this adds capability, changes no
pixel yet); manually setting data-theme="poluton" and "neon" on <html> in devtools
recolours the whole app crudely-but-coherently; report lists every token name.
```

---

## PROMPT 2 — theme switcher (the only new behaviour in the project)

```
Task: let the user pick a theme, persist it, no flash on load. This is the one prompt
allowed to add behaviour.

1. New client component apps/web/src/components/theme-switcher.tsx: three options
   (Obsidian / Poluton / Neon studio) rendered as small swatch buttons — each shows
   its ground+accent as a mini swatch, current one ringed with --accent. Serbian
   labels: "Tema". Place it in the app shell sidebar bottom (near the legal links)
   AND on the public landing footer.
2. Selection sets document.documentElement.dataset.theme and persists to BOTH
   localStorage and a cookie named `adgen-theme` (path=/, 1 year). The cookie exists
   so the SERVER can render the right theme on first paint.
3. No-flash: in apps/web/src/app/layout.tsx, read the cookie server-side and put
   data-theme on the <html> element during SSR. Absent cookie → no attribute (so the
   prefers-color-scheme default from Prompt 1 applies). Do not use a blocking inline
   script if the cookie approach covers it.
4. Accessibility: the switcher is a radiogroup with keyboard support and visible
   focus; each option's accessible name is the theme name.

Done when: gates pass; switching is instant with no reload artefacts; a hard refresh
keeps the chosen theme with NO flash of the wrong one (verify in the browser and say
so); works logged-out on the landing page too.
```

---

## PROMPT 3 — primitives

```
Task: restyle the shared primitives to consume ONLY Prompt 1's tokens, so they are
automatically correct in all three themes. Files: globals.css component classes
(.btn-primary, .btn-ghost, .card, .card-gradient, .badge and friends) plus small
shared components (apps/web/src/components/*) that carry styling. No page files.

- .btn-primary: background var(--action-grad, var(--accent)); color
  var(--accent-contrast); radius var(--radius-control); weight 600; hover lifts 1px
  with --shadow-glow; focus-visible 2px outline in --accent-2.
- .btn-ghost: transparent, 1px var(--line) border, --txt-mid; hover fills --panel-2.
- .card: --panel fill, 1px --line border, --radius-card, --shadow-card. Selected/
  active variant: border-color --accent + --shadow-glow.
- .badge / price pills: mono, tabular, --accent at ~14% opacity as fill with a
  readable accent-derived text colour (use color-mix(in srgb, var(--accent), var(--txt-hi) 35%)).
- Inputs/selects/textareas: one treatment — --ground fill, --line border,
  --radius-control, focus border --accent-2 at 50%.
- Progress primitive (.progress > i): track --panel-2, fill var(--action-grad,
  var(--accent)). Variant .progress--live: slow sheen animation blending --live —
  THE one theatrical element, reduced-motion gated.
- Wizard step chips: segmented rail — inactive --panel/--txt-low, active tinted with
  --accent (fill at low opacity + inset 1px --accent border).
- While migrating each class, replace its raw hexes; leave a grep-able
  `/* MIGRATED to tokens */` comment per class so Prompt 7 can audit.

Done when: gates pass; a quick browser pass over /app/quick-test in ALL THREE themes
shows coherent primitives (report screenshots or text per theme); no raw hex remains
in the touched files.
```

---

## PROMPT 4 — dashboard (/app) + app shell

```
Task: full-width bento dashboard, per-tool colour retired. Files:
apps/web/src/app/app/page.tsx, apps/web/src/components/app-shell.tsx,
apps/web/src/components/tool-cards.tsx, and delete apps/web/src/lib/tool-theme.ts
once caller-free.

- Shell: sidebar --panel with 1px --line border-right; active nav item uses the
  step-chip active treatment. Keep legal links and logout exactly where they are;
  the theme switcher from Prompt 2 sits above the legal links.
- Kill the floating centered column: content is a full-width grid, 24px gutters,
  padding not auto-margins.
- Tool cards: ALL neutral .card — the six gradients go. Main-tier tools (per
  JOB_DESCRIPTORS tier) may span 2 columns; utility tools in a denser compact row.
  Price badge mono top-right; hover = 4px lift + accent border.
- Credit balance in the header: number is the largest element in its cluster, mono/
  tabular, label via creditsWord().
- Credit packs move below the tools into their own clearly separated band with a
  section label — they stop competing with the tools (recorded complaint,
  INFRASTRUCTURE.md §8).
- "Uskoro" (ai_video): 60% dimmed + mono USKORO chip, not a different hue.

Done when: gates pass; dashboard verified in the browser at desktop and 375px in all
three themes; tool-theme.ts deleted; grep confirms no per-tool gradient remains in
apps/web.
```

---

## PROMPT 5 — wizards

```
Task: apply the system to wizard screens. Files: apps/web/src/components/
job-wizard.tsx first (most of the win), then app/matrix/page.tsx, then edit/mix/
translate/enhance/remove-text/ai-slike/quick-test, which mostly inherit.

- Shell: step rail on top; content in one --panel panel (--radius-panel) instead of
  stacked borderless sections; footer (price + Nazad/Dalje) becomes a sticky bar
  inside the panel, price in mono via creditsLabel().
- Matrix, restyle-only: script candidate cards = .card with active variant when
  expanded; aspect-ratio picker buttons and the two amber clip warnings move to the
  --warn treatment (semantic, not accent); voice select, caption controls, sliders
  take the shared input treatment.
- The RENDER moment is the showpiece: while a job runs, .progress--live plus mono
  elapsed text (only if elapsed data actually exists — do not invent data; an
  indeterminate pulsing bar is fine otherwise). On completion the result block gets
  a one-time ~600ms border flash in --live, settling to an --ok border.
- Error states: --err treatment; Serbian message text untouched (already humanised
  in reklame/page.tsx).

Done when: gates pass; matrix walked in the browser to at least step 3 in all three
themes; other wizards spot-checked; the diff is className/markup/CSS only — call out
any line that is not.
```

---

## PROMPT 6 — landing + auth

```
Task: the public face. Files: apps/web/src/app/page.tsx, the (auth) pages, and the
(legal) layout only if its inline styles clash with tokens (legal TEXT is frozen).

- Hero: existing Serbian copy verbatim. Type clamp(44px→88px), weight 800, tracking
  -.035em; the existing "prodaju" highlight becomes background-image
  var(--action-grad) text-clip in themes that have a gradient, plain --accent colour
  in themes that don't (this must come from tokens, not a theme conditional).
- Ambient ground: two large blurred radial glows in --accent / --accent-2 at low
  opacity, fixed, pointer-events none. In poluton keep them barely-there.
- Phone-frame mockup showing a 9:16 placeholder: static CSS frame, mono "1080×1920"
  caption. A real render thumbnail only if one exists under /storage — never a fake
  screenshot.
- Tool grid: reuse the dashboard's card component rather than duplicating.
- Footer: legal links stay; theme switcher added (Prompt 2 already placed it —
  verify, don't duplicate).
- Auth pages: one centered --panel panel on the ambient ground, shared inputs,
  .btn-primary submit. No copy changes.

Done when: gates pass; landing + login verified in the browser in all three themes;
contrast of --txt-mid on --ground spot-checked per theme and reported.
```

---

## PROMPT 7 — sweep + verdict

```
Task: close the loop. Grep apps/web for raw hexes, leftover ink-/brand- classes,
per-tool gradient remnants, theme conditionals in TSX (the forbidden pattern), and
any "kredita" string bypassing creditsWord/creditsLabel. Fix findings within restyle
scope. Run full gates (pnpm -r typecheck, pnpm -r test, pnpm --filter @adgen/web
build). Walk /, /login, /app, /app/matrix, /app/reklame in the browser in ALL THREE
themes. Append a REVIEWED: line to SESSION_LOG.md's ledger anchored to the final
commit, stating which screens were runtime-verified per theme and which merely
compile. If the old brand yellow #FFE000 still has callers, list them rather than
force-migrating blind.
```

---

## Open questions for the owner — ANSWERED 2026-08-10, before implementation

1. **Sidebar:** always visible on desktop, overlay on mobile — i.e. keep the current
   behaviour. No collapse control.
2. **Default theme for a brand-new visitor:** follow the OS via `prefers-color-scheme`
   (light OS → poluton, otherwise obsidian) until the user picks. An explicit pick always
   wins, forever.
3. **Landing hero phone-frame:** neutral CSS placeholder with a mono "1080×1920" caption.
   No fake screenshots, and no thumbnail unless a real render exists.
