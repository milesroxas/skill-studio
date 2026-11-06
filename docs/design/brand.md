# Brand

The brand is three things: the Flow mark (two identical ribbons), ink on porcelain, and lime for what is live. The app shows it through restraint. The welcome is the one place it speaks up.

Today `Mark.tsx` draws the old yellow tile with three bars, and `Highlight` is the old yellow stroke. The ribbon `Mark`, the `Slab` and the welcome below land in phase 4. Do not add a use of the old ones.

## The mark

Two paths in a 184 x 152 box. The second ribbon is the first moved down 64 units.

```
M 0 56 H 64 C 104 56 104 0 144 0 H 184 V 32 H 144 C 104 32 104 88 64 88 H 0 Z
M 0 120 H 64 C 104 120 104 64 144 64 H 184 V 96 H 144 C 104 96 104 152 64 152 H 0 Z
```

- Render it with `Mark` from `components/Mark.tsx`. Never paste the paths into a screen, and never redraw them by eye.
- Never stretch, rotate, outline, tilt or recolor it. It is `fill-foreground` on paper and porcelain on ink. The kit's lime mark is not used in the app: lime means live, and a logo is not live.
- Clear space is one band height on every side: 17.4% of the mark's width. Minimum width is 16px.
- Sources are in `build/icon-src/`. Icons are in `build/` (`icon.icns`, `icon.ico`, `icon.png`). Regenerate every size from the SVG master. Never scale a small PNG up.

## Where the brand appears in the app

| Place | What | Why there |
| --- | --- | --- |
| The app icon | the mark on an ink tile | the kit's own |
| The sidebar's drag strip, macOS only | the mark, 23px wide, porcelain | the strip is 48px tall and empty there. Other platforms have a title bar that names the app. |
| The welcome's opening | the mark, cropped by the frame | the one expressive moment |
| Results | one ribbon as the version lift figure | the ribbon's rise is the score's rise |

Nowhere else. No mark in an empty state, a dialog, a loading state or the top bar. A logo the reader meets on every screen stops being seen and starts being in the way.

## The ribbon as a figure

The version lift on Results is the only data figure drawn as a ribbon: flat at the first version's mean, one S-curve, flat at the latest version's mean.

- The curve is the mark's own: both control points sit at the horizontal midpoint. `C mx y0, mx y1, x1 y1`.
- The band keeps one thickness. Rise divided by thickness stays between 1.5 and 2 (the mark's is 1.75). Scale the vertical axis to hold that, and label both ends with their real numbers.
- It is ink on porcelain. The baseline without the skill is a dashed hairline in `muted-foreground`.
- If the latest mean is not higher than the first, draw no ribbon: show the two numbers and the `Delta`. A ribbon that falls or lies flat would misstate the brand's one motif.

Never use a ribbon as a divider, a background, a progress bar or a loading animation.

## The slab

A `Slab` is a lime rectangle under ink display type. It replaces the old yellow `Highlight`. Its edges are square to the page: no rotation, no rounding. It hangs 8px left of the text column, so the letters inside stay on the column's edge.

One slab per frame, and only in the welcome: on "works" in the opening and on the final score in the last step.

## The welcome

The welcome runs in its own 760 x 600 window. It is the only surface with display type above 30px, the ink cover and the cropped mark.

| Frame | Ground | Holds |
| --- | --- | --- |
| Opening | ink (`data-surface="ink"`) | version in mono, headline with one slab, one sentence, one button, Skip |
| Steps 01 to 06 | porcelain | step numeral, title, one sentence, one picture, Back and Next |

- **One idea and one action per frame.** Anything more comes one step later, on request. The reader is new and the words are new: six facts in a row are easy, six at once are a wall.
- The step numeral is sans display type: 136px, weight 700, tracking -0.055em, moved 6px left so its stroke sits on the column's edge.
- The picture is a sheet with a 1px `border-foreground` edge and no shadow.
- Progress is the six step numbers in mono. The current one is lime on ink.
- Every small label is true: the version, the step number, the screen's name. Never a decorative code, a fake serial, a ™ or text in a language the reader is not using. A label a reader cannot use is noise, and a reader who finds one fake label doubts the rest.
- The way out stays in one corner on every step. It reads "Skip" on a first visit and "Close" after.

## Motion

- State changes in the app: 150ms, `ease-out`. Movement that travels: `ease-out-strong`. Only `transform`, `opacity` and color move.
- Things used many times a day do not animate: the skill switcher (⌘K), menus opened by key.
- The welcome may say more, because it is seen once or twice: the mark draws (`animate-draw`), text rises in reading order (`animate-rise`), the slab crosses its word (`animate-swipe`). Delays come from `after(ms)` in `renderer/motion.ts`.
- Nothing waits on an animation. Next works from the first frame.
- `data-motion="reduced"` cuts every duration and delay. Never add an animation that hides content until it has played.

## Never

- A gradient, a glow, glass blur, a drop shadow on text, or a second accent color.
- An emoji as an icon. Icons are `lucide-react`, 16px in chrome, `aria-hidden`.
- A serif, a script or a third typeface.
- Yellow. `#ffe500` was the old brand.

## Words

- Sentence case everywhere. No title case, no trailing period on a label.
- A button is a verb and its object. The run button is always "Start a run". The review button is "Rate blind". The thing graded is an "output".
- Plain and specific. No "powerful", "seamless", "simply". Say what happens.
- An error says what failed and the next step. Never "Something went wrong".
