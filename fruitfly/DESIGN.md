# FruitFly: DESIGN.md

Paste this whole file into Stitch (or any UI generator) as the design brief. It describes the product, the visual language, every screen, the character and how it moves. Where it says "exact", follow it exactly.

---

## 0. One-paragraph brief

FruitFly is a browser agent: a small, real-feeling fruit fly that does errands in your browser, asks before anything risky, and keeps your documents on your device. The UI must feel **premium, cinematic and tactile**, like a high-end 3D product site: a dark, full-bleed moving-image world, huge confident monospace numerals and headlines, hairline details, and one living character that you can believe in. Calm, never noisy. Every surface has depth; every motion has weight.

Surfaces to design:
1. **Landing page** (cinematic, scroll-driven, 3D feel)
2. **Chrome side panel** (the main product, 400 px wide)
3. **Page overlay** (the fly and a control pill on the website being driven)
4. **Popup, Options (settings), Onboarding**
5. **Empty, error, 404 and system states**
6. **The character**: anatomy, materials, lighting, animation

---

## 1. Design principles

1. **Cinematic first.** A full-viewport moving background, nothing on top that does not earn its place. No cards for the sake of cards.
2. **Depth you can feel.** Layered parallax, soft real shadows, specular edges, subtle perspective tilt. Depth comes from light, not from borders.
3. **Typography is the hero.** Oversized mono numerals and short sentences. Few words, set large.
4. **One character, always honest.** The fly shows what the agent is doing. It never decorates; it informs.
5. **Quiet motion.** Slow, eased, physical. Only `transform` and `opacity` animate. No bounce for its own sake.
6. **Trust is visible.** Approvals, privacy and "stays on your device" are first-class visuals, not footnotes.
7. **Human microcopy.** Short, present tense, no emoji in system UI, never "As an AI".

---

## 2. Visual language

### 2.1 Two worlds

| World | Where | Mood |
| --- | --- | --- |
| **Night Orchard** (primary) | Landing hero, 404, onboarding, page overlay, dark mode of everything | Black, cinematic, luminous white type, warm honey accent glints |
| **Ivory Orchard** | Side panel, popup and options in light mode | Warm paper white, near-black ink, soft shadows, same honey accent |

Dark is the hero look for marketing. The side panel supports both and follows the system by default.

### 2.2 Color tokens

```
/* Night Orchard */
--night-0:  #000000   /* page fallback behind video */
--night-1:  #0B0A08   /* panel base */
--night-2:  #14120E   /* raised surface */
--night-3:  #1E1B15   /* hover / pressed surface */
--ink-hi:   #FFFFFF   /* headlines, numerals */
--ink-mid:  rgba(255,255,255,.72)
--ink-low:  rgba(255,255,255,.44)
--hairline: rgba(255,255,255,.14)

/* Ivory Orchard */
--ivory-0:  #FAF6EE   /* page */
--ivory-1:  #FFFDF8   /* surface */
--ivory-2:  #FFFFFF   /* raised */
--sunken:   #F3EDE0
--ink:      #17140F
--muted:    #6B6458
--border:   #E8E0D0
--border-strong: #D6CBB4

/* Fruit accents (both worlds) */
--honey:    #E0A04A   /* primary accent, focus ring, CTA */
--honey-ink:#3B2608   /* text on honey */
--ruby:     #C2342B   /* the fly's eyes, "needs you" */
--peach:    #F2A07B   /* soft highlights */
--lime:     #A9C84A   /* success (lime-deep #5E7A1C on light) */
--plum:     #6B3E5B   /* private / local-only */
--cherry:   #C23B3B   /* danger */
```

Rules: honey is the only accent used for interactive emphasis. Ruby appears only in the fly's eyes and "needs you" states. Plum means "private, stays on device". Never use more than one accent per component.

### 2.3 Typography

- **Display and numerals:** `Geist Mono` SemiBold (600), tight tracking. For 404-style hero numerals and big headlines: line-height 1.1, letter-spacing about -8% of font size. Gradient text allowed on hero numerals only: `linear-gradient(247deg, #fff 2.5%, rgba(255,255,255,.4) 93.6%)`, `background-clip: text`.
- **Editorial accent:** `Fraunces` (variable serif), italic for one emphasized phrase per headline (honey-tinted). Optional on the landing; use sparingly.
- **UI text:** `Geist` (variable sans) 400/500/600. Sizes 12, 13, 14, 15, 16, 18; panel body is 14.
- **Mono details:** `Geist Mono` for timers, token counts, URLs, keyboard hints (11 to 13 px).
- Scale for landing: 14 / 18 / 24 / 40 / 64 / 96 / 160 / 295 (hero numeral).
- Never center long paragraphs. Max measure 62 characters.

### 2.4 Depth system (3D feel without clutter)

- **Elevation by light, not borders.** Key light from upper left. Shadows are layered: contact + ambient + key.
  ```
  --shadow-1: 0 0 0 1px rgb(0 0 0/.04), 1px 1px 2px rgb(0 0 0/.05), 2px 4px 10px -3px rgb(0 0 0/.08);
  --shadow-2: 0 0 0 1px rgb(0 0 0/.05), 1px 2px 3px rgb(0 0 0/.06), 4px 10px 24px -8px rgb(0 0 0/.14);
  --shadow-3: 0 0 0 1px rgb(0 0 0/.06), 2px 3px 5px rgb(0 0 0/.07), 8px 22px 48px -14px rgb(0 0 0/.24);
  ```
  In dark: use a 1px inner top highlight `inset 0 1px 0 rgba(255,255,255,.08)` instead of a visible border.
- **Perspective tilt.** Hero objects (browser mock, panel, fly stage) sit in `perspective: 1200px` and rotate by at most 4 degrees toward the pointer, eased 600 ms. Disabled for reduced motion.
- **Parallax layers.** 3 depth planes on the landing: background video (0), content (1x), fly and floating details (1.3x). Translate only.
- **Specular edge.** Raised dark surfaces get a 1px top-left gradient edge (white 18% to transparent).
- **Radius.** 6, 10, 14, 20, 28. Panel sheet 18. Pills fully round.
- No glassmorphism, no blur overlays, no neon glow, no gradient washes on the video.

### 2.5 Background video language

Landing hero, 404 and onboarding use a **full-bleed looping video** (muted, `playsInline`, opacity 100%, no tint, no overlay). Brief for the footage: slow macro orchard scene at night, warm light motes drifting, shallow depth of field, a single ripe fruit catching a rim light, camera barely moving. Dark enough that white type passes AA with no scrim. Content sits above it with a higher z-index. Add a still poster frame for load and for reduced motion.

---

## 3. Motion system

### 3.1 Tokens

```
--dur-instant: 90ms   --dur-fast: 140ms   --dur-base: 220ms
--dur-slow: 360ms     --dur-cinematic: 700ms
--ease-standard:   cubic-bezier(.2, 0, 0, 1)
--ease-emphasized: cubic-bezier(.3, 0, 0, 1)
--ease-exit:       cubic-bezier(.4, 0, 1, 1)
spring-ui:    stiffness 380, damping 32
spring-panel: stiffness 260, damping 30
```

### 3.2 Rules

- Animate **only `transform` and `opacity`**.
- Pattern for anything that arrives: **anticipate (small pull back), act, overshoot about 6%, settle**.
- Stagger lists 30 to 50 ms per item. Reveal on scroll once, 600 ms, `ease-emphasized`, 18 px rise.
- Press: scale .98 in 90 ms. Hover lift: translateY(-1.5px) in 140 ms.
- One continuous background animation only (the video, plus the fly). Nothing else loops.
- `prefers-reduced-motion`: no parallax, no tilt, no flights (the fly cross-fades to its target), poster instead of video, reveal becomes opacity only.
- Frame budget: 60 fps on a mid laptop; one shared animation loop.

---

## 4. The character: the fruit fly

The fly is the soul of the product. It must read as a **real small creature rendered with premium craft**: believable anatomy, translucent wings, glossy ruby eyes, soft real shadows, physically plausible flight. Cute through accuracy and personality, not cartoon exaggeration.

### 4.1 Anatomy and proportions (Drosophila-inspired)

- **Body:** three segments. Head (about 22% of body length), thorax (about 30%, humped, slightly warm tan), abdomen (about 48%, elongated, **dark banded stripes** in honey-brown and deep brown, rounded tip).
- **Eyes:** two large compound eyes, **ruby (#C2342B)**, covering most of the head. Faceted look: fine hex texture at 8% opacity, a wet specular highlight upper left, a small darker pupil-like depth gradient. Eyes are the emotional center; they carry attention and mood.
- **Wings:** two long, **translucent** wings (white to faint amber tint, 35 to 55% opacity) with visible vein lines (1 px, 25% opacity), slightly longer than the abdomen, resting at about 25 degrees to the body, splitting apart in flight. Add soft iridescent rim (very subtle blue-pink at the wing edge).
- **Legs:** six thin jointed legs (three on the visible side, rest hinted behind), each with two bends, tiny tarsi, subtle bristle hairs. Legs plant, shift weight and clean themselves.
- **Antennae:** two tiny feathery arista that twitch independently.
- **Bristles:** a few fine hairs on thorax and abdomen catching rim light.
- Overall size: 38 px in the overlay, 58 px in the panel, 96 to 160 px on hero and onboarding, up to 420 px for a hero 3D stage.

### 4.2 Materials and lighting (what makes it feel real)

- **Light:** key from upper left, soft fill from lower right in peach, rim light from behind in honey. This light direction matches every UI shadow.
- **Body:** satin chitin: smooth gradient shading, a narrow specular streak along the thorax, ambient occlusion where segments meet.
- **Eyes:** glossy with a thin wet highlight and a faint reflection of the environment (a soft window shape).
- **Wings:** thin-film translucency, brighter at edges, veins catch light, wing shadow cast softly on the surface below.
- **Contact shadow:** a small soft ellipse under the fly that scales and fades with height (higher = larger, lighter, blurrier). Always present, even in flight.
- **Depth of field cue:** when the fly crosses the page it is sharp; its shadow blurs with altitude.

### 4.3 Rendering options (pick by ambition)

1. **Layered SVG with depth faking (current approach, upgraded).** Multi-layer gradients, filters kept static (no animated blur), parallax between wing, body and leg layers, a rendered shadow. Fast, tiny, crisp everywhere.
2. **Rive or Lottie state machine** driven by the same mood names, hand-authored in a vector tool with bones for wings, legs, antennae.
3. **Real-time 3D (three.js / WebGL, GLB model, about 150 KB)** for the landing hero stage only: PBR material, HDRI studio lighting, soft shadows, depth of field. The panel and overlay keep the lightweight 2D version so the extension stays small.

All three share one **mood and motion contract** (section 4.4 and 4.5) so they are interchangeable.

### 4.4 Moods (state machine)

Each mood changes body language, wing behavior, eye behavior and where the fly goes. Transitions blend over 220 to 360 ms, never snap.

| Mood | Meaning | Body language |
| --- | --- | --- |
| `idle` | Ready | Slow breathing (abdomen +/-1.5%), wings folded, occasional antenna twitch, head follows pointer gently |
| `greeting` | First hello | Small hop, wings flutter once, head tilts, eyes widen 8% |
| `curious` | Something new | Head tilts 12 degrees, antennae forward, slow small steps |
| `thinking` | Model is working | Hovers a few px up, slow wing hum (low amplitude), eyes drift up-left, tiny pulsing glow in eye highlight |
| `searching` | Looking through results | Quick small lateral hops, head scans left to right, wing buzz medium |
| `reading` | Reading a page | Perched, head lowers, eyes track a line left to right in small saccades, forelegs rub lightly |
| `acting` | About to click | Lands beside the element, forelegs raise, body leans 4 degrees toward the target, then a crisp tap |
| `typing` | Typing in a field | Rapid alternating foreleg taps, head bobs 1 px per key, wings tucked |
| `waiting` | Waiting for page or user | Settles, slow blink, abdomen breathing deepens |
| `asking` | Needs approval | Hovers near the approval card, wings spread slightly, one foreleg raised, eyes steady and brighter, ruby warmth +10% |
| `success` | Done | Small upward flit, quick wing shimmer, settles on the result card with a satisfied abdomen pulse |
| `confused` | Unexpected page | Head tilts side to side, stutters back one step, antennae droop |
| `error` | Failed | Wings drop, body lowers 6%, eyes dim 15%, slow shake once, then a calm recover pose |
| `sleeping` | Idle for 45 s | Perches in a corner, wings flat, eyes closed to slits, breathing very slow, tiny "z" free (no text) |

### 4.5 Flight and locomotion physics

- **Spring-driven position.** Critically damped spring toward the target with slight overshoot (about 6%). Flights follow a gentle **curved path** (quadratic Bezier with a perpendicular offset about 12% of distance) and arrive with a decelerating hover-then-land.
- **Wings:** while flying, wing beat reads as a blurred fan (two translucent copies with 20 to 30% opacity phase-offset) rather than a literal 200 Hz flap. Wing angle widens during acceleration and narrows while gliding.
- **Body tilt:** pitches 6 to 10 degrees into the direction of travel, banks 5 degrees into turns, abdomen lags slightly behind (secondary motion).
- **Idle noise:** a low-frequency 2D noise (simplex, 0.2 Hz) adds a 1 to 2 px hover wander so it is never perfectly still.
- **Landing:** legs extend 80 ms before touch, compress 4% on contact, rebound 2%, wings fold in a quick 120 ms cascade (back to front).
- **Blinking and saccades:** eyes micro-shift every 0.8 to 2.5 s (seeded randomness); a blink every 3 to 6 s; never the same micro-behavior twice in a row.
- **Attention:** head turns toward the pointer within 140 px with 160 ms lag, capped at 18 degrees. In reduced motion the head does not follow.
- **Collision guard:** the fly never lands on text it is not about to act on; it chooses a free gutter (right side first) next to its target.
- **Determinism:** all randomness comes from a seeded generator so tests and screenshots are reproducible.

### 4.6 Signature moments (sequences with timing)

1. **Entrance (hero):** fly enters from off-screen top-right on a curved path, 900 ms, decelerates, hovers 300 ms, lands on the headline's last word; shadow appears on landing; one blink.
2. **Take a job:** user submits; fly lifts (anticipation: crouch 80 ms, spring up 220 ms), turns toward the browser mock.
3. **Click:** fly lands beside the target (stagger: 120 ms hover, 100 ms settle), a thin honey ring (2 px, 3 px offset) draws around the element over 160 ms, the foreleg taps at 40 ms, ring pulses once and fades.
4. **Approval:** fly flies back to the panel, hovers beside the card, card rises with `variants.fadeUp`; for sensitive actions the button reads "Approve", then "Press again to confirm" with a 600 ms enable delay.
5. **Result:** fly lands on the card edge, wings shimmer, card unfolds (scale .96 to 1, 360 ms emphasized), table rows stagger 40 ms.
6. **Rate-limit / catching breath:** fly slows, perches, slow breathing, a quiet "Catching my breath." line. No alarm colors.
7. **Sleep:** after 45 s idle, drifts to a corner perch, folds, and sleeps; any pointer movement wakes it with a small stretch.

### 4.7 Sound (optional, off by default)

Very soft, organic: a faint wing hum on flight, a tiny tap on click, a soft chime on success. Never autoplay; one master toggle.

### 4.8 Accessibility for the character

Decorative: `aria-hidden`. Status always also appears as text ("Reading the page", "Needs you"). Reduced motion: no flights; the fly cross-fades position, breathing stops, eye saccades stop. Never convey state by color alone.

---

## 5. Screens

For each screen: layout, content, depth and motion. Replace any placeholder with this copy.

### 5.1 Landing page (Night Orchard, cinematic)

**Global:** black fallback, no horizontal scroll, `min-height: 100svh` sections, Geist Mono display type, one video world per hero.

**Section A: Hero (100svh)**
- Full-bleed background video, opacity 100%, no overlay.
- Top center: wordmark/logo, 233 x 40 desktop (top 80 px), white fill only. Mobile: top 32 px, scaled 75%.
- Centered column, 483 px wide, vertical gaps 44 px: giant gradient numeral or one-word headline, 1 px white divider (425 px), one sentence (24 px Geist Mono 600, -2 px tracking).
- Headline copy: **"A small fly that does your errands."** (the last two words in Fraunces italic honey-white). Under it one line: "It browses, asks before anything risky, and keeps your documents on your device."
- The fly lands on the last word after 900 ms entrance. A single quiet text link "Watch it work" with a down arrow, no buttons on the hero.
- A 3D-tilted browser mock appears on scroll (section B), not in the hero.

**Section B: Live demo stage**
- A large rounded (28 px) dark stage in perspective: left a mock browser window (tabs, url bar, a shop page), right the real 400 px side panel. The fly works across both. Scenario chips above: Cheapest laptop, Cheapest flight, Pay a bill, Ask my lease, A page tries to boss me.
- Stage tilts up to 4 degrees with the pointer; shadow shifts opposite.
- Caption: "A sample browser. Nothing here is recorded."

**Section C: Safety ("It asks first.")**
- Oversized mono headline, four hairline-separated columns (no cards): Pages are data, never orders / Take over any time / Secrets never travel / A replay you can read. Each has a tiny 3D-ish line icon (isometric stroke, 1.5 px).
- Interactive: "Run the bill job" scrolls to the stage and runs it; the approval card appears with the "Press again to confirm" behavior.

**Section D: Pantry ("Knows you, stays home.")**
- Left: question input and a three-way segmented control "Model on this device / Remote model / Remote, public only". Right: stacked passage sheets with doc name, heading path, sensitivity badge (Personal = amber, Stays on device = plum). Switching the control makes plum sheets **slide away and fade**, replaced by a lock row "1 passage kept back because of who is asking." Real search, runs in the page.

**Section E: Models ("Never runs dry.")**
- Three route lanes as horizontal glass-less bars with a status LED: Free pool auto, Free pool smart, On this device. Press "Hit a rate limit": lane 1 turns ruby-outlined "Rate limited", a thin honey line travels to lane 2, lane 2 becomes lime "Serving". Log lines stream in below.

**Section F: Privacy ledger**
- Two tall columns: "Stays on your device" (lime ticks) and "What can leave, and only if you allow it" (hairline X). Big type, wide spacing.

**Section G: Install**
- Full-bleed second video loop (night, sleeping fly on a leaf). Center: "Give it a job." three numbered steps, one honey button "Add to Chrome". Footer hairline.

**Navigation:** a slim top bar appears after the hero (logo, 5 text links, one honey "Get it" pill), solid `--night-1`, no blur.

### 5.2 Chrome side panel (400 px wide, full height)

Ivory by default, Night when system is dark. This is the product; it must feel like a physical instrument.

**Header (56 px):** fly avatar 40 px (live, in its current mood), title "FruitFly", subtitle = active route ("Free pool · auto" / "On this device" / "Demo mode"). Right: status pill (dot + label: Ready / Working / Needs you / Catching breath / Done), context ring (shows % of context used), nectar ring (budget left, honey), overflow menu.
**Tabs:** segmented control "Task" and "Pantry", with a sliding pill indicator (spring-ui).
**Task view:**
- Empty state: fly sitting in half a peach, "Give me a job." plus one sentence, four suggestion chips.
- Running: goal line, "Thinking it through" row with the fly's current mood label, **timeline of steps** (icon, title, target, duration in mono). The active step has a pulsing honey dot. Finished steps collapse to one line; error steps show a quiet ruby edge.
- Approval card: raised sheet, 20 px radius, action in a mono line, reason, site chip, buttons "Approve" (honey) / "Not now" / "I'll do it" (take over). Sensitive: button becomes "Press again to confirm" after a 600 ms enable delay.
- Result card: top honey-to-peach hairline, title (Fraunces 20), summary, optional comparison table (best row highlighted lime-tint), sources chips, verification line "Checked against 6 sources", actions Copy / Markdown / Save as task / Replay / Start fresh.
- Callouts for: injection ("This page seems to be giving me instructions. I'm ignoring them."), permission needed, gateway unreachable, catching breath.
**Composer (bottom):** raised rounded input (20 px), placeholder "What should I do?", paperclip (add to Pantry), "/" for commands hint, round send button that becomes a square Stop button while working. Slash menu rises above with a listbox. Suggestion chips sit above the composer when empty.
**Pantry tab:** documents as rows with type icon, size, sensitivity toggle (Public / Personal / Private on this device), status ring while indexing; drag-and-drop zone with a gentle "Drop it here" state; profile card; notes proposed by the agent with Keep / Dismiss; vault section (locked/unlocked) with a plum accent.
**Depth:** header and composer are raised (shadow-2); the scroll area sits slightly lower. Content has 16 px gutters and a right gutter where the fly can land.

### 5.3 Page overlay (on the website being driven)

Closed shadow DOM, click-through, never blocks the page.
- **Fly** (38 px) with a soft contact shadow, flying to the element about to be touched.
- **Target ring:** 2 px honey outline, 3 px offset, 7 px honey 20% halo; small dark label tag ("Add to cart") above or below.
- **Control pill** bottom right (14 px inset): dot, "FruitFly is working", `Take over`, `Stop`. Dark (#17140F) pill, 12 px type, fully round, fades up 8 px on appear. It turns ruby-dot "Needs you" when waiting for approval.
- Everything fades out 600 ms after the task ends (2.6 s after a result).

### 5.4 Popup (320 px wide)
Fly avatar, route + status, "Open FruitFly" (honey button), three quick actions (Add this page to Pantry, Pause, Settings). Footer: nectar bar and "Stays on your device" with plum lock.

### 5.5 Options / Settings (full tab, two columns)
Left nav (220 px): General, Models, Privacy, Pantry, History, Advanced, About, each with a line icon. Right: stacked sections on raised sheets with 24 px padding.
- **General:** mode (Demo / Live), steps per task, nectar budgets, fly theme (Auto / Light / Night orchard), energy (Calm / Normal / Lively), reduced motion, sounds.
- **Models:** route cards (Gateway, Ollama, Anthropic key, Gemini key) with connection state LEDs, drag-to-reorder fallback chain, per-route "allow personal info" switch (default off for remote), "Test connection" with live results.
- **Privacy:** egress ledger table (category, host, requests, bytes out, sensitivity), site permissions list with Revoke, "Delete everything" with a typed confirmation.
- **Pantry:** storage meter, embedder choice (Basic on-device / Smart via Ollama), export/import encrypted backup.
- **History:** tasks and replays with a scrubbable timeline and the fly's path drawn as a thin honey line over a page thumbnail.
- **About:** version, licenses, shortcut (Alt+Shift+F).

### 5.6 Onboarding (full tab, Night Orchard, 7 beats, about 70 s)
Full-bleed video, one beat on screen at a time, big mono headline, the fly performing the beat: 1 Open (fly wakes) / 2 The idea / 3 Live demo (laptop job with cookie-dialog stumble) / 4 Trust (approval) / 5 Pantry (drop a doc, lock icon) / 6 Brain (Demo, Gateway, or Key as three large selectable tiles) / 7 Finish ("Press Alt+Shift+F anywhere"). Skip is always visible bottom left; progress is 7 hairline ticks at the top.

### 5.7 404 and empty/error pages
Match the cinematic spec: full-viewport video background, logo top center, centered column (483 px) with the giant gradient "404" (295.751 px Geist Mono 600, line-height 1.1, letter-spacing -24.6459 px), 425 px x 1 px white divider, message "The path may be broken, but the journey isn't. Let's get you back." (24 px, -2 px tracking), gaps 44 px. Mobile at max-width 640 px: logo top 32 px at 75%, content `min(100% - 40px, 360px)`, gap 28 px, numeral `clamp(140px, 52vw, 200px)` with -0.09em tracking and bottom padding so it never clips. No overlay on the video. The fly sits on the "4" for the 404 version and sleeps on the divider.

---

## 6. Components (build once, reuse)

- **Button:** primary (honey fill, honey-ink text, shadow-2, inner top highlight), secondary (surface + hairline), ghost, danger. Height 36 (md), 46 (hero). Radius 10. Press scale .98.
- **Chip:** pill, 1 px border, 13 px text, hover raises 1.5 px, selected = honey border + raised.
- **Segmented control:** sliding indicator with spring; keyboard arrows.
- **Status pill, Badge** (Public, Personal amber, Private plum with lock), **Progress ring** (context, nectar), **Toggle**, **Slider**, **Tooltip**, **Popover**, **Dialog** with focus trap, **Sheet**, **Toast**.
- **Timeline row, Approval card, Result card, Callout (info/warn/danger), Table (comparison), Source chip, Document row, Command palette** (Cmd+K: New task, Compact context, Stop, Pause, Open Pantry, Switch model).
- **Fly:** `<Fly mood size energy seed />` plus a global fly layer with anchors (`composer`, `approval-card`, `result-card`, `page-preview`, `perch`).

---

## 7. Layout, responsive and a11y

- Side panel 360 to 480 px; design at 400. Single column. 16 px gutters (24 px on options). 8 px spacing grid.
- Landing breakpoints: 640 (mobile), 980 (stage stacks), 1280 (desktop). Preserve the desktop composition above 1280.
- Contrast WCAG AA everywhere (white on video is checked against the darkest and brightest frames). Focus ring: 2 px honey, 2 px offset.
- Full keyboard use; `aria-live="polite"` for status and step announcements; semantic `<main>`, one `<h1>` per page; decorative SVG and video `aria-hidden`.
- Touch targets at least 40 px on mobile.

---

## 8. Microcopy (voice: short, human, present tense)

- Empty: "Give me a job." / "I browse for you, ask before anything risky, and know your documents without sending them anywhere."
- Working: "Opening the shop", "Reading the page", "Comparing prices", "Waiting for you".
- Approval: "I'm about to pay ₹2,210 to MSEDCL. Okay?" Buttons: "Approve", "Not now", "I'll do it".
- Rate limit: "Catching my breath." Gateway down: "I can't reach your gateway."
- Injection: "This page seems to be giving me instructions. I'm ignoring them."
- Privacy: "Stays on your device." "1 passage kept back because of who is asking."
- Forbidden: emoji in system UI, "As an AI", exclamation marks, "Oops".

---

## 9. Implementation constraints (so the generated UI drops straight in)

- React 19 + Vite, plain CSS on the tokens above (Tailwind v4 acceptable for the landing if tokens are mapped).
- Motion library: `motion` (Framer Motion v12). Icons: Lucide, 1.5 px stroke. Fonts: Geist, Geist Mono, Fraunces (self-hosted).
- Animate only `transform` and `opacity`. One shared `requestAnimationFrame` for all fly engines.
- Extension pages: no remote fonts or scripts (CSP). Fly renderer is procedural SVG; the 3D hero stage is landing-only.
- Existing implementation to restyle (keep behavior and class names where possible): `packages/ui/src/styles/tokens.css`, `components.css`, `packages/ui/src/fly/*`, `packages/ui/src/panel/SidePanel.tsx`, `apps/landing/src`, `apps/extension/src/ui`.

---

## 10. Stitch prompts (copy per screen)

**Landing hero.** "Full-viewport cinematic hero, black fallback, full-bleed looping night-orchard video at 100% opacity with no overlay. White Geist Mono SemiBold. Centered 483 px column: huge gradient headline, 1 px white divider 425 px wide, one 24 px sentence. A small realistic fruit fly with ruby compound eyes and translucent veined wings perches on the last word, with a soft contact shadow. Logo centered at top. No buttons, no cards, no nav in the hero. Premium, calm, 3D depth through light and shadow."

**Demo stage.** "Dark rounded 28 px stage in 1200 px perspective, tilted 3 degrees. Left: a mock browser with tabs and a shop page. Right: a 400 px browser-agent side panel in ivory with a task timeline and a raised approval card. A honey 2 px ring around a button, a small realistic fly landing beside it. Layered soft shadows, specular top edges, no glass."

**Side panel.** "400 px browser extension side panel, warm ivory (#FAF6EE), near-black ink, honey (#E0A04A) accent. Header with a live fly avatar, status pill, context and budget rings. Segmented tabs Task / Pantry. Step timeline with mono durations, a result card with a comparison table and sources, a raised rounded composer with a round send button. Premium, tactile, layered shadows from an upper-left light."

**The fly (character sheet).** "A realistic fruit fly mascot: three-segment body with banded honey-brown abdomen, large glossy faceted ruby eyes with a wet highlight, long translucent veined wings with faint iridescent edge, six thin jointed legs with bristles, feathery antennae. Satin chitin shading, key light upper left, honey rim light, soft contact shadow. Show 14 mood poses: idle, greeting, curious, thinking, searching, reading, acting, typing, waiting, asking, success, confused, error, sleeping. Premium product-render quality, transparent background."

**404.** Use section 5.7 exactly.

---

## 11. Definition of done (visual)

- Every screen passes a squint test: one focal point, clear hierarchy, nothing competing with the fly or the primary action.
- The fly is always visible when it matters and never covers content the user must read.
- 60 fps with the fly active; no layout shift; Lighthouse 95+ on the landing; axe AA clean; reduced motion verified.
- Dark and light both verified; mobile (390 px) verified for the landing and 404.
