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
| Results, for a skill none of whose cases can be read on checks | one ribbon as the lift figure | the ribbon's rise is the score's rise |
| Cases, at the head of the checks the assistant suggests | the turning ribbon, in the text color | the ribbon is how the app marks what the assistant made |
| Results, in Fix with AI's popover while the fix is written | the turning ribbon, in the text color | the assistant is at work on something it will hand the reader |

Nowhere else. No mark in an empty state, a dialog, a loading state or the top bar. A logo the reader meets on every screen stops being seen and starts being in the way.

## The ribbon as a figure

The lift on Results (`LiftFigure` in `components/Lift.tsx`, fed by `caseLift` in `domain/standing.ts`) is the only data figure drawn as a ribbon. All cases draws it only when no case can be read on its checks, against the answer without the skill or the one before: a skill whose cases have no checks yet. Otherwise the head counts cases on their checks ([layout.md](layout.md#the-head-of-all-cases)) and no ribbon is drawn. The ribbon runs flat at the mean of the cases' first scores, one S-curve, flat at the mean of their latest. It compares each case with itself, so it holds whatever order the cases were run in. The band's top edge stands for the mean. The figure is a fixed height and stretches only sideways, so the band keeps its thickness; its labels are HTML text over it, so they stay on the type scale.

- The curve is the mark's own: both control points sit at the horizontal midpoint. `C mx y0, mx y1, x1 y1`.
- The band keeps one thickness. Rise divided by thickness stays between 1.5 and 2 (the mark's is 1.75). Scale the vertical axis to hold that, and label both ends with their real numbers.
- It is ink on porcelain. The baseline without the skill is a dashed hairline in `muted-foreground`, in room the figure keeps under the band only when the line is drawn.
- The figure ends where its lower band ends, and that foot stands on the baseline of the mean beside it. The eyebrow over the mean, `Lift` in caps, and the ribbon's upper label share one line.
- The head holds no sentence. Under the mean, one line in `xs`: the change since the first runs as a `Delta` ("No change" when there is none), a middle dot, and the count of cases. The count has the dotted underline of a word that explains itself (`EXPLAINED` in `components/Help.tsx`), and a click opens a `help` popover of `TotalDetailSection`s, one for each thing that stands behind the number (`liftNotes` in `model.ts`). Nothing else is written in the head: a fact about the lift is a section of that note.
- If the latest mean is not higher than the first in the whole points shown (`CaseLift.rises`), draw no ribbon: the latest mean and its `Delta` since the first say it. A ribbon that falls or lies flat would misstate the brand's one motif.

Never use this ribbon, the lift's, as a divider, a background, a progress bar or a loading animation.

## The turning ribbon

`TurningRibbon` in `components/TurningRibbon.tsx` marks what the assistant made. Its places are the head of the checks the assistant suggests on Cases ([layout.md](layout.md#suggested-checks)), and Fix with AI's popover on Results while the fix is written. A new place is a decision about where the assistant speaks, not a decoration: add it here first.

- Eleven hairlines, 1px at any size, each the mark's own curve: both control points at the horizontal midpoint. Each line's two ends rise and fall a beat apart, and each line runs a step behind the one before, so the lines read as one ribbon turning in space.
- A line at the back is a quarter as strong as one in front, which gives the depth. The lines fade out over the first and last 30% of their length, the brand's one gradient, so the figure has no hard edge.
- It takes the text color: ink on paper, porcelain on dark. Never yellow: it is not next or running.
- One turn takes 11 seconds, so it is felt more than watched. It moves by SVG's own animation, sampled once, so nothing renders again while it runs. With movement reduced it stands still at its first frame.
- It fills the column it is laid over and sets no height of its own: the words beside it do. In a sheet the assistant writes into (`WritingBand`), it runs edge to edge across the sheet at 64px on the `muted` ground, under a hairline, with its caption centred below it: what is being written, in a sentence ("Writing a fix…"), `xs` and muted, breathing down to 55% and back every 2.4s (`animate-breathe`) while the ribbon turns. Never a timer or a count beside it. The sheet's own corners round it.

## The slab

A `Slab` is a yellow rectangle under ink display type. Its edges are square to the page: no rotation, no rounding. It hangs 8px left of the text column, so the letters inside stay on the column's edge. It is drawn across from the left (`animate-draw`), carrying an ink copy of the word, so the word reads in its own color before the slab lands and in ink after.

One slab, only in the welcome: on "works" in the opening.

## The welcome

The welcome runs in its own 760 x 600 window, laid out for exactly that size and scaled by zoom. Display type that fits at 100% can clip at 110%: check both. It is the only surface with the ink cover and the cropped mark, and with display type above 30px save the head of All cases on Results, which sets its one figure at `display`: the lift's mean, or the three counts of cases on their checks.

| Frame | Ground | Holds |
| --- | --- | --- |
| Opening | ink (`data-surface="ink"`) | the name, the version in mono, headline with one slab, one sentence, two ways in: **Try it on a sample skill** (`default`) and **See how it works** (`ghost`) |
| Tour, steps 01 to 03, on request | porcelain | step numeral, title, one sentence, one picture, Back and Next; the last step's way forward is **Try it on a sample skill** |
| Setup, one step, only while Jev's key is missing | porcelain | title, one sentence, the key's controls, Back and the way forward |

- **One idea and one action per frame.** Anything more comes one step later, on request. The reader is new and the words are new: three facts in a row are easy, three at once are a wall.
- The headline is `Heading level="display"` (`text-display`). The step numeral is `text-numeral`, moved 6px left so its stroke sits on the column's edge. Both are in the scale in [typography.md](typography.md).
- The picture is a sheet with a 1px `border-foreground` edge, `rounded-md` corners and no shadow.
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

- State changes in the app: 150ms, `ease-out`. Movement that travels: `ease-out-strong`. Only `transform`, `opacity` and color move, with two exceptions in the welcome: the mark and the slab reveal through `clip-path` (`animate-draw`), and text rising in (`animate-rise`) comes out of a 4px blur; and one in a change just written: a struck word's line is drawn across it, the width of its background (`animate-strike`).
- A popover or a menu scales in from what opened it and moves by its animation alone (`transition-none` beside its `duration-*`, which would otherwise ease every property, its origin too). It hangs from its trigger as laid out, not as drawn (`laidOut` in `ui/popover.tsx`), so a button pressed small does not move it.
- The small arrivals have their own utilities, in `styles.css`: `animate-pop` (a mark stamped or a choice made, on `ease-out-back`, so it may overshoot: the status line's dot, a mark stamped in the tour), `animate-ink` (a word written: a change's title, an opened disclosure), `animate-vanish` (what a stamp replaces, gone as it lands), `animate-turn` (one turn of a refresh icon in answer to its press), `animate-send` (a message sent in the side panel, up 6px from 97% out of its bottom-right corner, 220ms) and `animate-strike` (a struck word's line drawn from the left in 240ms on `ease-stroke`, as a proofreader's pen strikes it), `animate-breathe` (words that say something is under way, a verb in progress with an ellipsis such as "Running…", "Thinking…" or "Writing a fix…": down to 55% and back in 2.4s on `ease-in-out`, for as long as they show. Every such line goes through `Working` in `components/text.tsx`, or `Said` for a line built elsewhere, which breathes when it ends in an ellipsis; a button's busy label breathes on its own. Never `animate-pulse` on words), `animate-grow` (a figure coming into a sheet as it opens: unfurled from its top edge from half its height, out of nothing and a 4px blur, 900ms on `ease-stroke`; the ribbon in Fix with AI's popover) and `animate-tick` (a short label changed in place, up 4px, 200ms; also a score that changes in a list of cases while it is in view, and the line under the skill's name when a save or a run changes it, never one there when the view opened). Each waits for `--delay`, set where it is used.
- The side panel's arrivals, each in answer to the reader and never on what was there when it opened (`useRested`, `useArrived` in `renderer/motion.ts`): a message sent rises in (`animate-send`), never a reply, which writes itself in as it streams. A change marked Applied by a click stamps its dot (`Status stamp`, `animate-pop`). A draft's struck words have their line drawn across them, and its added words are written in after, at 220ms (`WordDiff arrive`), so old reads before new. The rule line over the composer ticks when a draft is applied from the panel and never as the reader types, and the question count ticks as it moves on. `EmptyState arrive` brings up its title, words and actions 50ms apart, all within 300ms: Help me improve's opening, which the reader just asked for. Nothing here plays on a keyboard step.
- Fix with AI on Results opens with Stop in its head, away from where Apply and run lands, and the turning ribbon edge to edge under it while the fix is written (`WritingBand`). As the sheet opens the ribbon unfurls down from its top edge, from half its height and out of a soft focus (`animate-grow`, 900ms on `ease-stroke`, at 80ms), and its caption rises in under it near the start, so the reader knows at once what is happening (`animate-rise`, 500ms, at 120ms). It is the one slow entrance in a sheet: nothing waits on it, and it plays once per fix asked for. When the fix lands the band folds away and the fix unfolds in its place, so the sheet grows rather than jumps, and Stop vanishes with the band. The fix comes in reading order: the rule with the change marked (`WordDiff arrive`), the line on why at 300ms, then the buttons at 380ms (`animate-tick`). Apply and run takes the keys at once: nothing waits on the movement. Pressed again, the button closes the popover. It closes on what it showed. Closed while the fix is written, by a click elsewhere, Escape or the button, it asks whether to stop ("Stop writing the fix?", Stop or Let it finish); kept, the fix goes on and the button says "Writing a fix…" (`Working`), then "See the fix", and opens the popover on it. Stop in the popover's head stops at once, without asking.
- A row the reader moves to another list (Mark done in the Library) fades out and drops 4px in 150ms on `ease-in` while the change is saved, a transition, so a failed save turns it round, and writes itself in where it lands with `animate-ink`. The rows below it close up at once: a table row's height never animates. `TableRow motion` in [data.md](data.md).
- A block that comes into a form, or leaves it, while the reader watches unfolds and folds: its height grows from nothing, or goes to nothing, as it fades, so what is under it moves with it and never jumps (`animate-unfold`, 260ms on `ease-out-strong`; `animate-fold`, 180ms). It is the one movement of height in the app, and only for a block the reader caused: the checks the assistant suggests coming and going, a suggestion's row and its Why, a check row that comes into a case's checks from outside, such as a suggestion added, and a fix landing in Fix with AI's popover as the band it waited under folds away. A row typed in, by Enter or Add a check, is there at once: a keyboard step never waits on a movement. The block is `display: grid` round one `min-h-0` child; one leaving stays drawn while it folds (`usePresence`, `useStaying` in `renderer/motion.ts`). `Unfold` in `components/Unfold.tsx` is the block, and clips what it holds only while it moves, so a focus ring at its edge shows once it has come. What is there when a view opens rests.
- Text the app puts in the editor, such as a picked rewrite, keeps the selection's tint for a moment and fades out in 1.4s (`cm-landed` in `editor/theme.ts`). Color only: it marks where the change is, it does not move.
- A keyboard shortcut the reader just chose in Settings is stamped in: each keycap lands with `animate-pop`, 40ms after the one before (`KeyCombo stamp`), and so do the keys of a row that was reset. A row that lost its keys to another writes "None" in with `animate-ink`, as the line under a listening field is written. The modifiers held while a field listens show at once, and the keys there when Settings opened rest: a key pressed never waits on a movement.
- A panel folding or opening moves its width by spring, and draws every other layer from how far open it is, so a drag, a throw and a reversal keep them in step ([layout.md](layout.md#panels-that-fold)). With movement reduced, or a key on its divider, it lands at once.
- Things used many times a day do not animate: the skill switcher (⌘K), menus opened by key.
- The turning ribbon is the one thing that moves without the reader doing anything, slowly, while what the assistant suggested waits, or while a fix it is writing is on its way ([The turning ribbon](#the-turning-ribbon)).
- The status line is the one place in the app that draws: its ink is laid down left to right on `ease-stroke` in 300ms (a `scale-x` of its own layer, not `clip-path`), its words rise in after it, and it withdraws in 150ms. A notice is occasional and asks to be seen; nothing else in the app does this.
- The welcome may say more, because it is seen once or twice: the mark draws (`animate-draw`), text rises in reading order (`animate-rise`), the slab crosses its word (`animate-draw`). Delays come from `after(ms)` in `renderer/motion.ts`.
- Nothing waits on an animation. Next works from the first frame.
- Hazard bars are the brand's one texture: yellow hairlines on ink at 45 degrees, hard-edged, moving left at a constant speed across the composer's button while the assistant writes a reply (`hazard`, `animate-hazard`). They fade in over the ink and out again. Nowhere else, never static as decoration, and never as a progress bar.
- `data-motion="reduced"` cuts every duration and delay. Never add an animation that hides content until it has played.

## Never

- A gradient, save the fade at the ends of the turning ribbon's lines; a glow, glass blur, a drop shadow on text, or a second accent color.
- An emoji as an icon. Icons are `lucide-react`, 16px in chrome, `aria-hidden`.
- A serif, a script or a third typeface.

## Words

The brand's voice is in [copy.md](copy.md).
