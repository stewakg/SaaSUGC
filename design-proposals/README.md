# Design proposals — landing + dashboard

Four standalone HTML files, each showing the SAME two screens (public landing, signed-in
dashboard) with the exact production Serbian copy. No external requests of any kind —
system font stacks only, inline SVG icons, all CSS inline. Every file opens directly in a
browser and holds at 375px (verified in a real 375px viewport: `scrollWidth === 375`,
zero elements past the right edge — file 3's four-item navbar failed this check on the
first pass and was fixed to a 2×2 grid, which is why the check exists).

Common accessibility floor in all four: visible `:focus-visible` rings on every
interactive element, body text ≥ 4.5:1 (values noted per direction below), real
`<a>`/`<button>`, one `<h1>` + `<h2>` hierarchy, `aria-hidden` on every decorative SVG,
`prefers-reduced-motion` disarm, 44px+ touch targets on primary actions.

---

## 1 — `1-staklo-editorial.html` · "Staklo Editorial"

A refined evolution of the current dark-glass look, not a replacement. Same glass panels,
same violet→cyan gradient, same per-tool hue washes — but the type scale is sharper
(clamp up to 4.25rem, -.035em tracking), sections get editorial numbering (`01`, `02`)
with hairline top rules, and spacing is looser and more deliberate.

- **Optimises for:** continuity. It reads as "the app, but grown up." Zero re-learning
  for anyone who has seen the current UI.
- **Sacrifices:** surprise. Nobody will screenshot it because it looks new — it looks
  *finished*, which is a different compliment.
- **Audience fit:** flatters sellers who equate dark + glow with "modern tech tool"
  (the TikTok-native cohort). Might put off the older, more cautious COD seller for whom
  dark UIs read as "gamer thing", not "business thing".
- **Token survival: ~95%.** It IS the obsidian token set — `--panel`, `--line`,
  `--txt-*`, `--action-grad`, the tool washes, all reused as-is. The only new things are
  the section-number treatment and slightly changed radii (24→20, 16→14).
- **Implementation cost: lowest of the four.** Landing hero and section heads need
  markup touches; the dashboard, cards, buttons, badges inherit essentially free.
  All three themes stay fully viable because nothing branches — this direction is
  literally "obsidian, tuned".
- **Honest risk:** it entrenches the look before the owner has decided whether dark
  glass is even the right instinct for a trust-sensitive, non-technical audience. Picking
  it because it's cheap is a way of not deciding.
- Contrast notes: `--txt-mid` #a6a6b5 ≈ 7.9:1, `--txt-low` #8a8a99 ≈ 4.9:1 on ground.

## 2 — `2-papir.html` · "Papir"

The real departure the brief asked for. Paper-white ground, near-black ink, hard 1.5px
borders, **no shadows, no gradients**, black primary button, one violet accent for
links/active states. Per-tool colour survives only as a 5px identity strip on the card
edge plus a tinted icon — text never sits on colour. The feel is an invoice or a bank
app: boring on purpose, because boring is what trust looks like to someone deciding
whether to give a tool money.

- **Optimises for:** perceived legitimacy and daylight readability (these users are on
  phones, often outdoors, often on cheap panels where dark-UI contrast collapses).
- **Sacrifices:** all of the "AI product" theatre. No glow, no glass, no gradient — the
  headline underline-highlight is the loudest thing on the page.
- **Audience fit:** flatters the seller who runs their business from Viber and a bank
  app and wants tools that look like the bank app. Might put off the young
  dropshipper who expects an AI tool to look like one — to them this could read as plain.
- **Token survival: ~70% of the *system*, ~20% of the *values*.** The semantic token
  names (`--panel`, `--line`, `--txt-*`, `--accent`) all still work; poluton is the
  natural host and would be re-valued (harder borders, shadows zeroed out). But
  `--shadow-card`/`--shadow-glow` become no-ops and `--action-grad` collapses to flat
  black — which the token system already supports (poluton's "gradient" is already one
  flat colour), so no component branches.
- **Implementation cost: medium.** Buttons, cards, badges restyle via token values;
  the border-weight change (1px → 1.5px hard ink) and the identity-strip card variant
  are real CSS work across the card system. Wizard/progress components inherit cheaply.
- **Theme cost — say it plainly:** this direction only truly *is itself* in a light
  theme. Obsidian and neon can technically render it (hard borders, no shadows), but
  the "paper" idea doesn't survive translation to dark; you'd be keeping dark themes as
  legacy options rather than equals.
- **Honest risk:** flat + bordered lives or dies on typographic discipline. Executed
  95% well it looks cheap rather than confident — there is no glow to hide behind.
- Contrast notes: ink #16161c ≈ 16.6:1; mid #45454f ≈ 8.6:1; low #63636e ≈ 5.4:1 on
  white; colored icon inks all ≥ 5.6:1.

## 3 — `3-kiosk.html` · "Kiosk"

Dense mobile-app utilitarian — designed phone-first and then merely given more columns
on desktop, not the reverse. List rows instead of decorative cards: 72px touch rows,
solid colour icon tiles (white glyph on saturated square — the only place colour
appears), bold 17px labels, chevrons, prices right-aligned like transaction amounts, a
segmented 2×2 nav that behaves like a native app tab bar. One loud full-width blue
primary CTA.

- **Optimises for:** the actual usage session — a non-technical seller, on a phone, with
  30 seconds, looking for "the button that makes the video". Everything is a tappable
  row with an obvious price.
- **Sacrifices:** brand. It has almost no personality; it borrows the authority of the
  banking-app genre instead of building its own.
- **Audience fit:** flatters exactly this audience — mobile-first, fast-deciding,
  pattern-matching against apps they already trust. Puts off nobody functionally, but
  gives a design-literate visitor nothing to remember.
- **Token survival: ~50%.** Text/line/panel tokens map over; the solid colour tiles
  invert the current rule that colour is a wash *under* text (here colour is a filled
  chip that text never touches — safer for contrast, but the `card-tool--*` wash system
  gets replaced, not reused). `--radius-*` and shadow tokens survive with new values.
- **Implementation cost: highest for the dashboard, cheapest for everything after.**
  The tool grid becomes a list component (new), the nav becomes a segmented bar (new).
  But wizard steps, job lists, and every future money-touching screen inherit the row
  pattern almost free — this direction pays off most in the screens not shown here.
- **Theme note:** works in light and dark; the tile colours would need per-theme
  re-measurement (white-on-colour tiles need ≥4.5:1 in both). All three themes viable,
  but the design's soul is the light one.
- **Honest risk:** on desktop it can feel like a stretched phone app. The mockup
  mitigates with a two-column row grid, but a wide-screen "wow" moment simply isn't in
  this direction's vocabulary.
- Contrast notes: ink #14171c ≈ 15.9:1; mid #444b55 ≈ 8.0:1; primary #1546cc carries
  white at ≈ 7.6:1; tile colours carry white at ≥ 5.4:1.

## 4 — `4-signal.html` · "Signal"

High personality: near-black matte (no glass, no blur), ONE lime accent, oversized
uppercase display type (clamp to 6.5rem), mono captions, tools numbered `01 /`–`10 /`
like tracks on a record sleeve, hard 1px grid borders with cells sharing edges, one
restrained motion moment (underline sweep inside the primary CTA). Per-tool hue is
deliberately dropped — only lime speaks, and it only ever means "action or price".

- **Optimises for:** memorability and swagger. Of the four, this is the one that gets
  screenshotted, and the one that looks most like it belongs to the creator economy the
  product serves.
- **Sacrifices:** per-tool colour identity (the owner deliberately reinstated coloured
  cards on 2026-08-13 after comparing with EcomAlati — this direction undoes that call,
  which is a real product decision, not a styling one) and some approachability: ALL-CAPS
  display type in Serbian with diacritics is loud, and loud can read as aggressive.
- **Audience fit:** flatters younger TikTok-native sellers and anyone who wants their
  tools to feel like streetwear. Risks alienating the cautious COD seller deciding
  whether to trust a paid tool — swagger and trust pull in opposite directions.
- **Token survival: ~85% by name — it is essentially the neon theme taken seriously.**
  `--ground/--panel/--line/--lime` map straight onto neon's existing values; the flat
  `--action-grad` convention already handles the solid lime button. The parts that die:
  tool hues, glass panels, glow shadows.
- **Implementation cost: medium.** Colours are nearly free (neon exists); the real work
  is typographic — the uppercase display scale, mono caption system, numbered cards, and
  shared-border grid are new patterns across both screens.
- **Theme cost — say it plainly:** like Papir, this is a one-theme personality. It IS
  neon; rendered through poluton's values it becomes a generic light UI and the whole
  point evaporates. Keeping three equal themes and this direction are in tension.
- **Honest risk:** it's a fashion statement, and fashion dates. Lime-on-black is having
  a moment (Spotify Wrapped, half of fintech); in two years it may pin the product to
  2025 the way glassmorphism pins things to 2021.
- Contrast notes: lime #c6ff4d ≈ 14.7:1 on ground; mid #a9b3ae ≈ 8.0:1; low #7f8a84 ≈
  4.9:1; lime button carries near-black ink at ≈ 14:1.

---

## Recommendation

**Papir (2), with Kiosk's (3) dashboard row pattern folded into it.**

The deciding fact is the audience, not the aesthetics: e-commerce sellers doing
cash-on-delivery, mostly on phones, mostly non-technical, **deciding fast whether a paid
tool is trustworthy**. That last clause is the whole brief. Dark glass (1) and lime
swagger (4) are both better *demos* — but they optimise for impressing people who
evaluate software, and this audience evaluates *businesses*. The visual language they
already trust with money is light, flat, hard-edged and legible: their bank, their
courier's tracking page, their tax portal. Papir borrows that authority directly, and it
is also simply the most readable option on a cheap phone screen in daylight, which is
where these users live.

Papir's weakness — a landing page with no theatre — is real but bounded: the hero's job
here is done by the copy and, once the owner picks a render, by the 9:16 sample itself.
A real product video carries more "AI wow" than any gradient, and it will look *better*
against paper-white than inside dark glass competing with its own background.

Kiosk's dashboard rows (price right-aligned like a transaction, whole row tappable,
72px targets) are a genuinely better post-login model for this audience than any card
grid, and they transplant into Papir's visual language with almost no friction — flat
white rows with ink borders are the same idea in both files. Landing from Papir,
dashboard interaction model from Kiosk.

The honest cost to say out loud: Papir demotes obsidian and neon from equal themes to
legacy options, and the owner's 2026-08-13 decision to bring back per-tool colour
survives only as edge-strips and tinted icons rather than washes. If keeping three
equal themes is non-negotiable, Staklo Editorial (1) is the fallback — it's 95% free and
genuinely better than the status quo — but it should be chosen as that trade-off, not
as the default because it's nearest.
