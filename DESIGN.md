---
name: Tipperoos
description: A private Premier League prediction competition, designed like a matchday programme.
colors:
  floodlit-ink: "#123c43"
  trophy-gold: "#f0a63d"
  trophy-gold-ink: "#123c43"
  pitch-green: "#3d7b3c"
  red-card: "#c23540"
  yellow-card: "#ebc94c"
  neutral-teal: "#3e7c86"
  matchday-paper: "#f6f3ec"
  paper-line: "#e2dbc9"
  surface: "#ffffff"
  text: "#123c43"
  text-muted: "#567376"
  text-decorative: "#a6b3b1"
  on-ink: "#f6f3ec"
  on-ink-muted: "#b2bcb9"
typography:
  display:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 800
    lineHeight: 1
    fontFeature: "tnum"
  headline:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.9rem"
    fontWeight: 800
  title:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.3rem"
    fontWeight: 700
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.5
  body-dense:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9rem"
    fontWeight: 400
  caption:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8rem"
    fontWeight: 400
  label:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.7rem"
    fontWeight: 700
    letterSpacing: "0.08em"
  micro-label:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.7rem"
    fontWeight: 800
    letterSpacing: "0.06em"
rounded:
  btn-sm: "11px"
  btn: "14px"
  card: "20px"
  badge: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  card-inset: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.trophy-gold}"
    textColor: "{colors.trophy-gold-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.btn}"
    padding: "12px 20px"
  button-secondary:
    backgroundColor: "{colors.floodlit-ink}"
    textColor: "{colors.on-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.btn}"
    padding: "12px 20px"
  button-ghost:
    textColor: "{colors.floodlit-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.btn}"
    padding: "12px 20px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "24px"
  card-shell-header:
    backgroundColor: "{colors.floodlit-ink}"
    textColor: "{colors.on-ink}"
    padding: "12px 16px"
  card-shell-body:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    padding: "16px"
  digit-cell:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.btn-sm}"
    height: "44px"
  digit-cell-selected:
    backgroundColor: "{colors.trophy-gold}"
    textColor: "{colors.trophy-gold-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.btn-sm}"
    height: "44px"
  status-chip-final:
    backgroundColor: "{colors.matchday-paper}"
    textColor: "{colors.floodlit-ink}"
    typography: "{typography.micro-label}"
    rounded: "{rounded.badge}"
    padding: "2px 8px"
  status-chip-called-off:
    backgroundColor: "{colors.yellow-card}"
    textColor: "{colors.floodlit-ink}"
    typography: "{typography.micro-label}"
    rounded: "{rounded.badge}"
    padding: "2px 8px"
  text-field:
    backgroundColor: "{colors.matchday-paper}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.btn}"
    padding: "12px 16px"
  tab-bar:
    backgroundColor: "{colors.matchday-paper}"
    textColor: "{colors.text-muted}"
    typography: "{typography.label}"
    height: "64px"
---

# Design System: Tipperoos

## Overview

**Creative North Star: "The Matchday Program"**

Tipperoos looks like the programme you'd buy at the turnstile: warm paper, dark printer's ink, one gold highlight, and each fixture set like a team sheet. It's playful, not childish. The palette comes from what football already means (floodlights, the trophy, the pitch, the yellow and red card), not from generic "sporty blue" or any league's broadcast branding. The youngest players are ten and the app is often read over a shoulder on a shared family phone, so a calm system makes the few loud moments land.

The page is crisp and printed. Controls are flat and precise, like type on a page: digit cells, buttons, chips and rows carry no shadow. Depth is atmosphere. A single warm, soft shadow lifts the things that sit above the paper (cards, menus, sheets) the way a programme rests on a table. Floodlit Ink is used as a _surface_, not only as text. An ink header carrying club identity, a kit-coloured seam and a white body is the shape you'll recognise everywhere.

Restraint is deliberate. Two brighter directions were tried and rejected: "Sticker Book" was too loud at this data density and read too young, and "Scoreboard" was polished but felt too muted and clean. The accent is spent by rule, motion is saved for saving a pick and revealing a result, and there are no club crests anywhere.

**Key Characteristics:**

- Warm paper ground, Floodlit Ink type and surfaces, Trophy Gold spent by rule.
- The ink-header card shell: identity band, kit-colour seam, white body.
- One typeface (Geist) on a closed scale with a hard 0.7rem floor.
- Flat, printed controls on 44px targets; one warm ambient shadow for raised surfaces.
- Real kit colours only on fixtures and Predict the Table, always passed through the clash rule and contrast floor.
- Emoji are personal (the player's own, 🤖 for bots) or awards (🔥 and the Gameweek wrap marks); functional icons are lucide line icons.

## Colors

A warm programme-paper palette: one deep teal ink, one trophy gold, and football's own signal colours for verdicts.

### Primary

- **Floodlit Ink** (#123c43): headings, primary text, the bottom nav's text, and the ink surface of every card-shell header. Used as structure, not decoration. Text on it uses On-Ink or On-Ink Muted.

### Secondary

- **Trophy Gold** (#f0a63d): the single accent. It always carries Floodlit Ink text (Trophy Gold Ink), never white. As text on a light ground it fails contrast, so it appears as a fill, a bar, a ring, or a scoreline on ink.

### Tertiary

- **Pitch Green** (#3d7b3c): a correct pick, a rank rise, points gained. Works as text on paper or white, or as a fill under paper text. Never as text on ink.
- **Red Card** (#c23540): a wrong pick, a rank drop. Same ground rules as Pitch Green.
- **Yellow Card** (#ebc94c): caution: the closing-soon countdown on ink, a corrected result, a Called Off match. A called-off match is yellow, never red, because it's a non-event for everyone, not a mistake.
- **Neutral Teal** (#3e7c86): Bot, Admin and Late Joiner badges. Neutral and non-alarming, never good or bad.

### Neutral

- **Matchday Paper** (#f6f3ec): the app background, warm rather than stark white. Also the tab bar and text-field ground.
- **Paper Line** (#e2dbc9): hairlines, control borders and dividers on paper.
- **Surface** (#ffffff): card bodies and digit cells. White sits _on_ paper, never as the page.
- **Text** (#123c43, 12.0:1 on paper): headings, primary text, any number a player reads.
- **Text Muted** (#567376, 4.61:1 on paper): secondary text. The floor for anything that carries meaning.
- **Text Decorative** (#a6b3b1, 1.95:1): dividers, disabled glyphs, the `v` between codes. Never text a player must read.
- **On-Ink** (#f6f3ec) and **On-Ink Muted** (#b2bcb9, 6.15:1 on ink): primary and secondary text on an ink surface.

### Named Rules

**The Accent Budget Rule.** Trophy Gold has two tiers. _Emotional_ (as a fill): the 1st-place leaderboard row, a player's own predicted scoreline, and Predict the Table's Champion pick. _Functional_: the primary button, the "You" badge, the active-tab bar and the focus ring, with at most one functional accent object per viewport (the focus ring doesn't count). Gold never colours a value, a label, a status chip, metadata or a secondary link.

**The Named Roles Rule.** Text colour comes from the five named roles, never from an alpha over ink (`text-ink/60`, `text-paper/80`). An alpha inverts meaninglessly the moment ink becomes a light colour, and five of the twelve alphas once in use failed AA.

**The Kit Colour Rule.** Real club colours appear only on fixtures (the Tipped Match card's badges, seam and digit-row rails) and on Predict the Table. Two rules are mandatory wherever they're rendered. _Clash_: when both clubs' colours are too close to tell apart, the away side falls back to its secondary, then to ink. _Contrast floor_: a kit outside the readable band is mixed toward paper or ink, hue kept, until it clears every ground it's drawn on.

## Typography

**Display Font:** Geist (with ui-sans-serif, system-ui)
**Body Font:** Geist
**Label Font:** Geist, uppercase and tracked

**Character:** One variable sans across its whole weight range, so hierarchy comes from weight and size rather than a second family. It reads like a programme's fixture list: confident 800-weight numerals, plain 400-weight prose.

### Hierarchy

- **Display** (800, 1.75rem, line-height 1, tabular numerals): scorelines and ranks read at a glance. On a finished card the player's own pick steps down to Title beside the result.
- **Headline** (800, 1.9rem): page titles.
- **Title** (700, 1.3rem): section and gameweek headers, the Pick Board's "Andy's picks" line.
- **Body** (400, 1.0625rem, max 52ch): prose and digit cells.
- **Body Dense** (400, 0.9rem): leaderboard rows and other repeated lists.
- **Caption** (400, 0.8rem): secondary lines, deadlines, card metadata. Usually Text Muted.
- **Label** (700, 0.7rem, 0.08em, uppercase): section labels and field labels.
- **Micro-label** (800, 0.7rem, 0.06em, uppercase): inside chips only.

### Named Rules

**The Closed Scale Rule.** These eight sizes are the only sizes. No Tailwind size keywords (`text-xs` to `text-xl`) appear in app code, and 0.7rem is a hard floor at any weight on any ground. The app once shipped eighteen sizes, down to 0.55rem.

**The Steady Digits Rule.** Every number a player compares (scores, ranks, points, countdowns) uses tabular numerals so columns never jitter.

## Layout

Mobile-first, one column. Unprefixed styles are the phone layout; `md:` (768px) and `lg:` (1024px) layer on top, and `sm:` never means "mobile". Pages sit in a centred column capped at 56rem (`max-w-4xl`) with a 16px page gutter and 16px vertical gaps between blocks. From `md:` up, paired blocks go side by side in two columns: the two Tipped Match cards, and the recap beside the leaderboard ladder.

A fixed 64px bottom tab bar (plus the safe-area inset) serves every breakpoint; there's no sidebar or top nav on desktop. The app shell reserves its height once, so pages never pad for it themselves. Use `min-h-dvh`, never `min-h-screen`.

Spacing is Tailwind's 4px scale. **One card inset: 16px horizontal, on every card, on every screen.** Vertical padding varies with density (8px for a dense row, 12px standard, 14px for a header); horizontal never does, and a card's content never steps in or out from its own header. Tight groups sit 6–8px apart; separate blocks 12–16px.

## Elevation & Depth

Depth is ambient warmth, not structure. The page is flat paper, and anything that rests above it (cards, the More menu, bottom sheets) gets one soft, warm, teal-tinted shadow that reads as light falling on paper, never a hard edge. Controls stay printed and flat: buttons, digit cells, chips, rows and the tab bar never cast a shadow, and cards never carry a border, since the shadow alone separates them.

### Shadow Vocabulary

- **Matchday Lift** (`box-shadow: 0 10px 24px -12px rgba(18, 60, 67, 0.28)`): every card, the More menu and sheets. The literal lives in one place in code (`CARD_SHADOW`).

### Named Rules

**The Printed Controls Rule.** If you tap it, it's flat. Shadow belongs to surfaces that rest above the paper, never to controls on them. A press is shown by a small scale (0.96–0.98), not by lifting or sinking.

## Shapes

Gently rounded, never sharp, never blobby. Four radii: tap chips and digit cells at 11px, buttons and fields at 14px, cards at 20px, and fully round pills (999px) for badges and status chips. The club-code badge is a small rounded rectangle, not a pill. `rounded-full` isn't used in app code; pills use the badge radius. Hairlines are 1px Paper Line. The kit seam is a 6px two-tone bar, hairlined top and bottom so it holds regardless of which way a kit's luminance leans.

## Components

### Buttons

Flat and sure-footed, with no shadow.

- **Shape:** 14px radius; 12px by 20px padding at Body size (small: 8px by 14px at Body Dense).
- **Primary:** Trophy Gold fill, Floodlit Ink text, 700 weight. It counts as the viewport's one functional accent.
- **Secondary:** Floodlit Ink fill, paper text. Used for strong calls that mustn't spend the accent, such as "See everyone's picks".
- **Ghost:** transparent, ink text, a Paper Line wash on hover.
- **States:** a slight brightness lift on hover, a 0.98 press scale, 50% opacity when disabled, and the gold focus ring always.
- **Quiet control:** full-width, 44px, white with a Paper Line border and uppercase Caption text, for low-stakes card actions (Change, Keep 2–1).

### Chips

- **Status chip (on ink):** pill, Micro-label. _Open_ and _Filed ✓_ sit on a faint paper wash; _Locked_ on a stronger wash at 800 weight; _Final_ is a solid paper pill with ink text; _Called off_ is Yellow Card with ink text. Never gold.
- **Club-code badge:** a three-letter code on the club's kit colour (after the clash rule and contrast floor), with ink or paper text chosen by measured luminance. Elsewhere it's ink on paper. Never a crest.
- **Emoji chip:** the player's emoji in a small round chip. Its fill never signals state; the chosen emoji is the player's identity, not the system's.

### Cards / Containers

- **Plain surface:** white, 20px radius, Matchday Lift, 24px padding, no border. The default.
- **Ink-header shell:** an ink header (identity: clubs, status, whose pick), a kit-colour seam, and a white body for content and controls. A card never ends below the seam in more ink, because the seam's job is bridging dark to light. Skip the seam when there's no kit colour to bridge.
- **Doors:** when a card leads to another screen, only its heading is tappable, with a `›` at the end of that heading line. Rows inside stay inert.

### Inputs / Fields

- **Style:** Matchday Paper ground, Paper Line border, 14px radius, 12px by 16px padding, Body text.
- **Focus:** border shifts to gold, plus the focus ring.
- **Error:** Red Card border and a Body Dense message beneath it naming the problem and the fix.

### Navigation

- **Bottom tab bar:** paper ground, a Paper Line top hairline, 64px tall, three destinations plus a More menu, with an icon over a Label in each slot. Inactive slots are Text Muted. The active slot is Floodlit Ink with a 3px gold bar at its top edge; gold never colours the label. More opens a small card (Matchday Lift) anchored above its slot, holding Switch player, How it works and Admin.

### The Tipped Match Card (signature)

The app's centre of gravity, built on the ink-header shell.

- **Header:** an eyebrow line (provenance icon and word, kickoff, "Closes in 2d 4h" counting to the lock, turning Yellow Card inside the last hour) with the status chip at its end, then one row per club: league position, club badge, full name. The home side is bold On-Ink; the away side is medium On-Ink Muted.
- **Scoreline:** once a pick or result exists, Display-size numbers sit in their own column. The player's own pick is Trophy Gold; the result is paper. A finished card puts You and Final side by side, captioned in the eyebrow. With no pick, the column is dropped and the words "No pick" say so. Never a dash.
- **Entry (white body):** two rows of 44px digit cells, `0 1 2 3 4` plus a dashed `5+` that opens `5 6 7 8 9` beneath. A kit-colour rail sits beside each row. A selected cell is a Trophy Gold fill. The second tap files the pick, with no Save button.
- **Filing:** "Filing…" while the save is pending. Once confirmed, the scoreline settles into place (0.42s, decelerating, only with motion allowed) and the chip reads "Filed ✓".

## Do's and Don'ts

### Do:

- **Do** reference named tokens (`bg-ink`, `text-text-muted`, `rounded-card`) and never a raw hex in component code. That's what keeps a future dark theme a token swap.
- **Do** keep every tap target at least 44px and give every interactive element the gold focus ring (2px, offset 2px).
- **Do** render the four facts differently: no pick is the words "no pick", scored nothing is `0`, not played is blank, called off is "off" or "Called off".
- **Do** write points as `+5` for a gain and `0`, never `+0`, for nothing.
- **Do** keep motion to the moments that matter (saving a pick, revealing a result), start it from an already-visible state, and honour `prefers-reduced-motion`. Save the bigger celebration for the season-winner reveal.
- **Do** use lucide icons at `stroke-2` in a text-role colour for functional UI, and keep emoji for personalisation and awards only.

### Don't:

- **Don't** use club crests, league logos or broadcast branding anywhere. It's a trademark constraint, not a style preference.
- **Don't** spend Trophy Gold on a value, label, status chip, metadata or secondary link, or use it as small text on a light ground (about 2:1).
- **Don't** put Pitch Green or Red Card text on an ink surface. Use a fill, and keep rank movement on a light ground.
- **Don't** set any text below 0.7rem, or add a size outside the closed scale.
- **Don't** put a shadow on a control, or a border on a card.
- **Don't** colour text with an alpha over ink or paper. Use a named text role.
- **Don't** use a dash to stand in for a missing pick, score or value.
