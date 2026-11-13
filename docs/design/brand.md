# Brand

The brand is three things: the Flow mark (two identical ribbons), ink on porcelain, and yellow for what is live. The app shows it through restraint. The welcome is the one place it speaks up.

`Mark` and `Slab` live in `components/Mark.tsx`.

## The mark

Two paths in a 184 x 152 box. The second ribbon is the first moved down 64 units.

```
M 0 56 H 64 C 104 56 104 0 144 0 H 184 V 32 H 144 C 104 32 104 88 64 88 H 0 Z
M 0 120 H 64 C 104 120 104 64 144 64 H 184 V 96 H 144 C 104 96 104 152 64 152 H 0 Z
```

- Render it with `Mark` from `components/Mark.tsx`: `size="strip"` in the sidebar, `size="cover"` in the welcome. Never paste the paths into a screen, and never redraw them by eye.
- Never stretch, rotate, outline, tilt or recolor it. It takes the text color (`fill-current`): ink on paper, porcelain on ink. The mark is never yellow: yellow means live, and a logo is not live.
- Clear space is one band height on every side: 17.4% of the mark's width. Minimum width is 16px.
- Sources are in `build/icon-src/` (`mac.svg`, `tile.svg`, `mark.svg`, from the brand kit). Icons are in `build/` (`icon.icns`, `icon.ico`, `icon.png`). Regenerate every size from the SVG master. Never scale a small PNG up.

## Where the brand appears in the app

| Place | What | Why there |
| --- | --- | --- |
| The app icon | the mark on an ink tile | the kit's own |
| The sidebar's drag strip, macOS only | the mark, 23px wide, porcelain | the strip is 48px tall and empty there. Other platforms have a title bar that names the app. |
| The welcome's opening | the mark, cropped by the frame | the one expressive moment |
| Results | one ribbon as the version lift figure | the ribbon's rise is the score's rise |

Nowhere else. No mark in an empty state, a dialog, a loading state or the top bar. A logo the reader meets on every screen stops being seen and starts being in the way.

## The ribbon as a figure

The version lift on Results (`VersionLift` in `components/Lift.tsx`, fed by `versionLift` in `domain/lift.ts`) is the only data figure drawn as a ribbon: flat at the first version's mean, one S-curve, flat at the latest version's mean. It compares one writer with itself, on the first version and on the latest. The band's top edge stands for the mean. The figure is a fixed height and stretches only sideways, so the band keeps its thickness; its labels are HTML text over it, so they stay on the type scale.

- The curve is the mark's own: both control points sit at the horizontal midpoint. `C mx y0, mx y1, x1 y1`.
- The band keeps one thickness. Rise divided by thickness stays between 1.5 and 2 (the mark's is 1.75). Scale the vertical axis to hold that, and label both ends with their real numbers.
- It is ink on porcelain. The baseline without the skill is a dashed hairline in `muted-foreground`.
- If the latest mean is not higher than the first, draw no ribbon: the latest mean and its `Delta` since the first say it. A ribbon that falls or lies flat would misstate the brand's one motif.

Never use a ribbon as a divider, a background, a progress bar or a loading animation.

## The slab

A `Slab` is a yellow rectangle under ink display type. Its edges are square to the page: no rotation, no rounding. It hangs 8px left of the text column, so the letters inside stay on the column's edge. It is drawn across from the left (`animate-draw`), carrying an ink copy of the word, so the word reads in its own color before the slab lands and in ink after.

One slab per frame, and only in the welcome: on "works" in the opening and on the final score in the last step.

## The welcome

The welcome runs in its own 760 x 600 window, laid out for exactly that size and scaled by zoom. Display type that fits at 100% can clip at 110%: check both. It is the only surface with display type above 30px, the ink cover and the cropped mark.

| Frame | Ground | Holds |
| --- | --- | --- |
| Opening | ink (`data-surface="ink"`) | the name, the version in mono, headline with one slab, one sentence, two ways in: **Try it on a sample skill** (`default`) and **See how it works** (`ghost`) |
| Tour, steps 01 to 03, on request | porcelain | step numeral, title, one sentence, one picture, Back and Next; the last step's way forward is **Try it on a sample skill** |
| Setup, one step, only while Jev's key is missing | porcelain | title, one sentence, the key's controls, Back and the way forward |

- **One idea and one action per frame.** Anything more comes one step later, on request. The reader is new and the words are new: three facts in a row are easy, three at once are a wall.
- The headline is `Heading level="display"` (`text-display`). The step numeral is `text-numeral`, moved 6px left so its stroke sits on the column's edge. Both are in the scale in [typography.md](typography.md).
- The picture is a sheet with a 1px `border-foreground` edge, `rounded-chin` corners and no shadow.
- Progress is the step numbers of the tour in mono, the current one yellow on ink. The setup is one step and shows no progress and no numeral: "01" of one counts nothing.
- Doing teaches more than watching: the sample skill's walkthrough is the way in, and the tour is the second way, for a reader who wants to see first. Both end at the sample skill.
- The tour and the setup share one step frame (`StepFrame` in `components/WelcomeStep.tsx`): numeral (left out for a lone step), title and sentence on the left, the step beside them, Back and the way forward at the foot, with nothing between them.
- The setup asks only for what the walkthrough's first run needs: Jev's key. With the key set, the way in skips it. Where skills are found waits for the Library, and a model to write with waits for Settings. Its controls are the same components Settings uses (`components/Connections.tsx`), never copies. They sit in a `StepPanel`, not a sheet: a region is never a card.
- The setup's way forward is one button. While the key is missing, the key's own control is `default` and the way forward is `outline`, reading "Configure later". Once it is set, the way forward is `default` and reads "Start the walkthrough".
- A frame says each thing once. The sentence under the title says what the step is for, the status says how it stands, and the button says what happens next. No status detail, hint or footnote repeats one of them, and no line explains the screen that comes after: that screen explains itself when it opens.
- A key the app walks someone through (`account` on its entry in `domain/secrets.ts`, today only Jev's) shows a sign-up link and, under it, a `Disclosure` reading "Show me". A quiet line, never a boxed button: it must not outweigh the key's field. It opens the steps, each a mono number, a verb in medium and a few muted words.
- Every small label is true: the version, the step number, the screen's name. Never a decorative code, a fake serial, a ™ or text in a language the reader is not using. A label a reader cannot use is noise, and a reader who finds one fake label doubts the rest.
- The way out stays in the title strip's right corner on every frame, the opening included. It reads "Skip" on a first visit and "Close" after.

## Motion

- State changes in the app: 150ms, `ease-out`. Movement that travels: `ease-out-strong`. Only `transform`, `opacity` and color move, with two exceptions in the welcome: the mark and the slab reveal through `clip-path` (`animate-draw`), and text rising in (`animate-rise`) comes out of a 4px blur.
- The small arrivals have their own utilities, in `styles.css`: `animate-pop` (a mark stamped or a choice made, on `ease-out-back`, so it may overshoot: the status line's dot, a mark stamped in the tour), `animate-ink` (a word written: a change's title, an opened disclosure), `animate-vanish` (what a stamp replaces, gone as it lands), `animate-turn` (one turn of a refresh icon in answer to its press), `animate-send` (a message sent in the side panel, up 6px from 97% out of its bottom-right corner, 220ms) and `animate-tick` (a short label changed in place, up 4px, 200ms; also a score that lands in All cases while the table is in view, 40ms apart down its column, never one there when the view opened). Each waits for `--delay`, set where it is used.
- The side panel's arrivals, each in answer to the reader and never on what was there when it opened (`useRested`, `useArrived` in `renderer/motion.ts`): a message sent rises in (`animate-send`), never a reply, which writes itself in as it streams. A change marked Applied by a click stamps its dot (`Status stamp`, `animate-pop`). A draft's added words are written in 140ms after its struck words show (`WordDiff arrive`), so old reads before new. The rule line over the composer ticks when a draft is applied from the panel and never as the reader types, and the question count ticks as it moves on. `EmptyState arrive` brings up its title, words and actions 50ms apart, all within 300ms: Help me improve's opening, which the reader just asked for. Nothing here plays on a keyboard step.
- A row the reader moves to another list (Mark done in the Library) fades out and drops 4px in 150ms on `ease-in` while the change is saved, a transition, so a failed save turns it round, and writes itself in where it lands with `animate-ink`. The rows below it close up at once: height never animates. `TableRow motion` in [data.md](data.md).
- Text the app puts in the editor, such as a picked rewrite, keeps the selection's tint for a moment and fades out in 1.4s (`cm-landed` in `editor/theme.ts`). Color only: it marks where the change is, it does not move.
- Things used many times a day do not animate: the skill switcher (⌘K), menus opened by key.
- The status line is the one place in the app that draws: its ink is laid down left to right on `ease-stroke` in 300ms (a `scale-x` of its own layer, not `clip-path`), its words rise in after it, and it withdraws in 150ms. A notice is occasional and asks to be seen; nothing else in the app does this.
- The welcome may say more, because it is seen once or twice: the mark draws (`animate-draw`), text rises in reading order (`animate-rise`), the slab crosses its word (`animate-draw`). Delays come from `after(ms)` in `renderer/motion.ts`.
- Nothing waits on an animation. Next works from the first frame.
- Hazard bars are the brand's one texture: yellow hairlines on ink at 45 degrees, hard-edged, moving left at a constant speed across the composer's button while the assistant writes a reply (`hazard`, `animate-hazard`). They fade in over the ink and out again. Nowhere else, never static as decoration, and never as a progress bar.
- `data-motion="reduced"` cuts every duration and delay. Never add an animation that hides content until it has played.

## Never

- A gradient, a glow, glass blur, a drop shadow on text, or a second accent color.
- An emoji as an icon. Icons are `lucide-react`, 16px in chrome, `aria-hidden`.
- A serif, a script or a third typeface.

## Words

- Sentence case everywhere. No title case, no trailing period on a label.
- A button is a verb and its object, except a dialog's confirm button, which is one verb ([buttons.md](buttons.md)). The button that starts a run names what it runs: "Run 3 cases", or "Run 3 cases, 2 attempts each". The thing graded is an "output", and the model that grades it is "Jev", never "the judge": a judge's verdict is final, and here the reader's is. What an output fails is "missed", what it passes is "met", and the reader's own answer on one verdict is a "correction", shown as "your answer".
- Plain and specific. No "powerful", "seamless", "simply". Say what happens.
- An error says what failed and the next step. Never "Something went wrong".
