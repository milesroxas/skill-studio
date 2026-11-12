# Color

All color lives in `src/renderer/styles.css` as semantic tokens, written in `oklch()`. Components use the Tailwind class of a token. Nothing else names a color.

The values below are in `styles.css`.

## The three scopes

A token has one value per scope. The page picks the scope; a component never checks which one it is in.

| Scope | Set by | Where |
| --- | --- | --- |
| Light | `:root` | the page in the light theme |
| Dark | `data-theme="dark"` on `<html>` | every surface in the dark theme |
| Ink | `data-surface="ink"` on an element | the sidebar, the welcome's opening and the status line while it speaks, in both themes; and a chip that carries yellow: the welcome's current step, a running skill's `RunningTag` |

Ink uses the dark scope's values, with `--background` set to `--sidebar` and the sidebar tokens taken from the theme around it. So a component inside the sidebar uses `text-muted-foreground` and `bg-accent` as it would anywhere, and gets values that work on ink. A popover opened from the sidebar renders in `<body>`, outside the scope, and is a paper sheet. That is intended. The one exception is the sidebar itself opened as a popover on a narrow window (`PopoverContent size="nav"`), which carries the scope.

## Tokens

| Token | Light | Dark and ink | Role |
| --- | --- | --- | --- |
| `--background` | `oklch(0.961 0.01 94)` porcelain | `oklch(0.155 0.01 267.3)` near-black, `#0A0C11` | the page |
| `--foreground` | `oklch(0.177 0.035 267.3)` | `oklch(0.961 0.01 94)` | text, icons |
| `--card`, `--popover` | `oklch(0.985 0.005 95)` | `oklch(0.18 0.01 267.3)`, `oklch(0.2 0.01 267.3)` | an object, a floating sheet, an input's fill |
| `--muted` | `oklch(0.936 0.011 95)` | `oklch(0.21 0.01 267.3)` | code blocks, an open row, a passage set apart |
| `--accent`, `--secondary` | `oklch(0.917 0.011 95)` | `oklch(0.225 0.01 267.3)` | hover, a selected list item |
| `--muted-foreground` | `oklch(0.483 0.011 140)` | `oklch(0.78 0.008 267.3)` | secondary text |
| `--primary` / `--primary-foreground` | ink / porcelain | porcelain / ink | the filled button |
| `--border` | `oklch(0.177 0.035 267.3 / 0.1)` | `oklch(0.25 0.01 267.3)` | hairlines |
| `--input` | `oklch(0.177 0.035 267.3 / 0.2)` | `oklch(0.31 0.01 267.3)` | a control's edge |
| `--ring` | `oklch(0.177 0.035 267.3)` | `oklch(0.961 0.01 94)` | focus: the keyboard's line at 50%, a field's edge at full |
| `--sidebar` | `oklch(0.177 0.035 267.3)` | `oklch(0.125 0.01 267.3)` | the sidebar's ground |
| `--sidebar-accent` | `oklch(0.269 0.035 267.3)` | `oklch(0.205 0.01 267.3)` | the current place |
| `--sidebar-foreground` | porcelain | porcelain | text on the sidebar |
| `--success` | `oklch(0.49 0.133 148)` | `oklch(0.8 0.207 150)` | a good score, a pass |
| `--warning` | `oklch(0.51 0.105 69)` | `oklch(0.8 0.152 70)` | a weak score, unsaved |
| `--destructive` | `oklch(0.52 0.199 27)` | `oklch(0.76 0.134 25)` | a failing score, an error, a delete |
| `--destructive-foreground` | porcelain | ink | text on a solid red fill: a destructive dialog's confirm button |
| `--signal` / `--signal-foreground` | `oklch(0.928 0.168 109)` / ink | the same | next and running |
| `--scrim` | `oklch(0 0 0 / 0.5)` | the same | what a dialog lays over the page it stops |
| `--artifact` | `oklch(1 0 0)` white | the same | an agent's HTML page, framed: the ground a browser gives it, so a page that assumes white reads as written |

`--signal`, `--scrim` and `--artifact` are the same in every scope. `--signal` is the brand's highlighter yellow `#F0F059`.

Each surface token has a `-foreground` partner (`--card-foreground`, `--popover-foreground`, `--accent-foreground`, `--secondary-foreground`) for text on it. So does `--destructive`, for a solid red fill: `--destructive-foreground` turns from porcelain to ink with the red, as `--primary-foreground` does with the filled button. The depth and corner values are tokens too: `--elevation-raised` and `--elevation-popover` behind `shadow-raised` and `shadow-popover`, `--radius-chin-top` (0.625rem) and `--radius-chin-bottom` (0.78125rem) behind `rounded-chin`.

Ink is a blue-black, `#0A1020`: the light theme's text, its filled button and its sidebar. The dark theme's surfaces are near-black on the same hue, 267.3, at chroma 0.01, so they read as black with a cool cast. Only porcelain, the verdicts and yellow sit off that hue. The scrim's black and the artifact's white have no hue at all: neither is a surface of the app's own.

## Picking a background

```
Is it the page or a column?
 ├── Yes → bg-background
 └── No
      ├── Does it float over the page (a popover, a menu)? → bg-popover
      ├── Is it a dialog? → bg-background, over bg-scrim, which dims the page it stops
      ├── Is it an agent's own page, framed (an HTML output)? → bg-artifact
      ├── Is it an object someone compares or picks up, or an input's fill? → bg-card
      ├── Is it code, front matter, a passage set apart (Excerpt), or a table row that is open? → bg-muted
      ├── Is it hovered or the selected item of a list? → bg-accent
      ├── Is it the reader's own message in the chat, or a Badge variant="secondary"? → bg-secondary
      └── Is it the sidebar? → bg-sidebar, and the element carries data-surface="ink"
```

## Picking a text color

```
Does the color state a verdict (pass, weak, fail)?
 ├── Yes → text-success / text-warning / text-destructive
 └── No
      ├── Is it the thing being read or pressed? → text-foreground
      ├── Does it support that thing (hint, meta, caption, unit)? → text-muted-foreground
      └── Is it a placeholder for no value, such as "–"? → Text tone="faint"
```

`tone="faint"` is 3.05:1 on porcelain. Never put a word a person must read in it.

## Yellow

`bg-signal` with `text-signal-foreground`, or `text-signal` on an ink surface. No other pairing: yellow on porcelain is 1.07:1 and cannot be seen.

Yellow marks exactly these:

- the next step: `Button variant="signal"` in the top bar, which is either "Next: …" or Run. See [buttons.md](buttons.md).
- a running job: the dot in `JobsIndicator` on the ink sidebar, and in `RunningTag` on its skill's row in the Library. It is the one yellow that may sit beside the next step. A job's progress bar is foreground, not yellow.
- a reply being written: the composer's Stop button, yellow hairlines on ink moving left under the square (`hazard` and `animate-hazard`). It is that reply's running dot, so it too may sit beside the next step, and the yellow is there only while the reply is written. The square stays porcelain: red would say failed, not stop.
- in the welcome: the current step in the progress row, and one `Slab` per frame. See [brand.md](brand.md).

```tsx
// Correct: the dot of a running job, Dot in components/Status.tsx
signal: 'animate-pulse bg-signal',

// Incorrect: yellow as a highlight for something that is neither next nor running
<Badge className="bg-signal">New</Badge>
```

Never use yellow for success. A pass is `success`. Yellow next to green makes a reader ask which one means good.

## Verdicts

Green, amber and red say how something stands and nothing else. A decorative use spends the meaning.

| Color | Means | Examples |
| --- | --- | --- |
| `success` | works, passes, good | a high score, a passed check, a connected provider, an allowed permission, results that match the current text |
| `warning` | needs an action from the reader to work | a weak score, not connected, unsaved, a permission not granted, results older than the last edit |
| `destructive` | broken, failed, or deletes | a failing score, an error, a failed job, a delete button |
| none (`muted`) | not set, and nothing is wrong | an optional key left empty, a permission not asked yet |

A verdict on a surface is a 10% tint under colored text (`bg-success/10 text-success`), 20% in the dark and ink scopes. `Badge` and `TableRow` already do this: use their variants, do not rebuild the tint.

A diff (`.diff` and `.diff-lines` in `styles.css`) takes the same tints, but its text stays in text color, because colored running text on a tint is too faint to read. The color goes on a mark instead: a word diff underlines an added word and strikes through a removed one in the verdict color, and a line diff colors only the `+` or `-`. Unchanged lines in a line diff are `muted-foreground`, so the changed lines are the brightest text in the listing.

## Borders and depth

- A region ends at a hairline: `border-b`, `border-r`, `divide-y`. The default border color is `--border`. Do not name it.
- A control's edge is `border-input`. How focus shows is in [Focus](#focus) below.
- A surface gets one kind of depth, never two. A floating sheet uses `shadow-popover`. A raised object uses `shadow-raised`. Never both, and never one of them on a bordered region. In the dark and ink scopes both collapse to a ring. A control is not a surface: a field (`FIELD_SURFACE`), an `outline` button or toggle, and a checkbox carry Tailwind's `shadow-xs` under their `border-input` edge, set once in `ui/`. That hairline is part of the control's edge, not depth: never add it at a call site.
- Corners are a closed set, in `styles.css`:
  - `rounded-sm` 4px: a button, a field, a toggle, a checkbox, a chip, a list row or menu item.
  - `rounded-chin` 10px on top, 12.5px below: a container. A card, a popover, a menu, a dialog, an alert, the composer, a muted panel, a code block, a chat bubble, the welcome's picture sheet. Top and bottom stay 4 to 5.
  - `rounded-xs` 2px: a mark inside running text (an inline link's focus ring, inline code, a diff mark), a part nested inside a control, and each segment of a stepped indicator (the walkthrough's progress, the file size meter). A segment is at least 6px tall, so its corners read as corners and not as a pill.
  - `rounded-full`: dots and the remove button on a picture only. A row of steps is never pills.

## Focus

Focus answers one question, "where did I land?", and only a keyboard asks it. A person who clicked knows where they clicked. So every focus style is one of four utilities in `styles.css`, and none of them is a halo stacked on an edge.

| Utility | What shows | Where |
| --- | --- | --- |
| `focus-ring` | a 2px line in `--ring` at 50%, 2px clear of the control, from the keyboard only | anything pressed rather than typed in: a button, a toggle, a checkbox, a select trigger, a card, a link |
| `focus-ring-inset` | the same line 2px inside the control | a row in a list that scrolls (the sidebar, a list column, a menu), which would clip a line outside it |
| `focus-ring-segment` | the line 4px inside one segment of a joined group, in the segment's own text color | `ToggleGroup` items (`Segmented`, `FilterGroup`), set by `toggleVariants({ place: 'group' })`. A pressed segment is ink, so a line in the ring color would vanish into it. |
| `focus-edge` | the field's own edge turns `--ring`, on any focus | a text field: the caret already says where typing goes, so nothing is added around it |

"From the keyboard only" is `data-input` on `<html>`, which `renderer/focus.ts` sets to `pointer` on a press and `keyboard` on a key. The browser's own `:focus-visible` is not enough: when a menu or dialog closes, its script hands the focus back to its trigger, and the browser lights the trigger up under the pointer that just closed it. Before the first input there is no attribute, so the line shows: a keyboard user is never left without it. A select's edge also turns ink while its list is open (`data-[state=open]:border-ring`). `focus-key:` is the same keyboard test as a variant, for a reveal: a `ghost-muted` icon turns to text color when focused (`focus-key:text-foreground`).

- A component names one of the four. Never `outline-none` alone on something focusable, and never a `ring-*` for focus: a ring is a box shadow, it sits on top of the edge, and it is a heavy halo. A bare `outline-none` is only on what a reader lands in, not on: `Pane` (`tabIndex={-1}`), which only the skip link focuses, and the `role="option"` rows of a list whose focus stays in its field (`tabIndex={-1}`: the field's `aria-activedescendant` marks the active row in `bg-accent`).
- Anything focusable that names none of them still gets the line from the base layer: a link in prose, a `summary`.
- The composer's `box` frame shows focus as its edge in `border-ring` (`focus-within`), because it holds the focus for a whole conversation.
- A field in error keeps its red edge when focused: `focus-edge` does not paint over `aria-invalid`.

```tsx
// Correct: ui/button.tsx
'… focus-ring active:scale-[0.96] …'

// Incorrect: an edge and a 3px halo on every focus, mouse included
'outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'
```

## Checked pairs

Measured with WCAG 2 and APCA. A new text pair needs 4.5:1, and |Lc| 60 when it is running text. A control's indicator needs 3:1.

| Pair | Light | Dark and ink |
| --- | --- | --- |
| foreground on background | 16.9:1 | 17.5:1 |
| muted-foreground on background | 5.7:1, Lc 74 | 9.8:1, Lc 63 |
| muted-foreground on accent | 5.0:1, Lc 66 | 8.5:1, Lc 62 |
| success, warning, destructive on their tint | 4.9, 4.9, 5.0:1, Lc 67, 67, 64 | 7.2, 6.6, 5.9:1, Lc 66, 60, 53 (chips only, never running text) |
| success, warning, destructive on background | 5.3, 5.3, 5.5:1 | 11.3, 10.2, 8.6:1 |
| foreground on a diff's tint | 15.4:1 and above | 11.1:1 and above |
| a diff's `+`, `-` on its tint (card) | 4.9, 5.0:1 | 7.2, 5.9:1 (a mark, not running text) |
| ink on yellow | 15.6:1 | 15.6:1 (yellow text on the dark page 16.1:1) |
| destructive-foreground on destructive (porcelain, ink) | 5.5:1, Lc 75; hovered 4.9:1 | 8.4:1, Lc 59; hovered 6.9:1 (a button's label, not running text) |
| focus line (`--ring` at 50%) on background | 3.5:1 | 4.9:1 |

Two known gaps. `border-input` on porcelain is 1.5:1, so an input is found by its `bg-card` fill and its label, not its edge: never draw an input without both. The brand kit's secondary grey `#7C817B` is 3.6:1 on porcelain and is not a token: use `muted-foreground`.

## Changing a token

Change the value in `styles.css` in all three scopes, re-measure every pair in the table that uses it, and update this file in the same pull request. The three verdict colors are set the same way: in the light scope, as light as 4.9:1 on their own 10% tint over a card allows; in the dark scope, as light as the hue stays itself (red turns pink above L 0.76); and in both, at 94% of the chroma sRGB can show for that hue at that lightness. So no one of them reads duller or darker than the others. A new verdict value follows the same two steps: lightness from the contrast floor, then chroma from the ceiling. `paint.test.ts` (main process) fails when a hex copy outside CSS drifts: the window's first paint, `index.html`'s theme colors, and the guide's diagrams in `docs/images/*.svg`, which may use only the light scope's tokens and their tints. To fix a failing pair, move L only: chroma and hue do not change contrast.
