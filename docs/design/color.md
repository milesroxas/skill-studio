# Color

All color lives in `src/renderer/styles.css` as semantic tokens, written in `oklch()`. Components use the Tailwind class of a token. Nothing else names a color.

The values below are in `styles.css`.

## The three scopes

A token has one value per scope. The page picks the scope; a component never checks which one it is in.

| Scope | Set by | Where |
| --- | --- | --- |
| Light | `:root` | the page in the light theme |
| Dark | `data-theme="dark"` on `<html>` | every surface in the dark theme |
| Ink | `data-surface="ink"` on an element | the sidebar and the welcome's opening, in both themes |

Ink uses the dark scope's values, with `--background` set to `--sidebar` and the sidebar tokens taken from the theme around it. So a component inside the sidebar uses `text-muted-foreground` and `bg-accent` as it would anywhere, and gets values that work on ink. A popover opened from the sidebar renders in `<body>`, outside the scope, and is a paper sheet. That is intended. The one exception is the sidebar itself opened as a popover on a narrow window (`PopoverContent size="nav"`), which carries the scope.

## Tokens

| Token | Light | Dark and ink | Role |
| --- | --- | --- | --- |
| `--background` | `oklch(0.961 0.01 94)` porcelain | `oklch(0.198 0.004 165)` ink | the page |
| `--foreground` | `oklch(0.198 0.004 165)` | `oklch(0.961 0.01 94)` | text, icons |
| `--card`, `--popover` | `oklch(0.985 0.005 95)` | `oklch(0.225 0.004 165)`, `oklch(0.245 0.004 165)` | an object, a floating sheet, an input's fill |
| `--muted` | `oklch(0.936 0.011 95)` | `oklch(0.255 0.004 165)` | code blocks, an open row |
| `--accent`, `--secondary` | `oklch(0.917 0.011 95)` | `oklch(0.27 0.004 165)` | hover, a selected list item |
| `--muted-foreground` | `oklch(0.483 0.011 140)` | `oklch(0.78 0.012 130)` | secondary text |
| `--primary` / `--primary-foreground` | ink / porcelain | porcelain / ink | the filled button |
| `--border` | `oklch(0.198 0.004 165 / 0.1)` | `oklch(0.29 0.004 165)` | hairlines |
| `--input` | `oklch(0.198 0.004 165 / 0.2)` | `oklch(0.35 0.004 165)` | a control's edge |
| `--ring` | `oklch(0.198 0.004 165)` | `oklch(0.961 0.01 94)` | focus ring, always used at `/50` |
| `--sidebar` | `oklch(0.198 0.004 165)` | `oklch(0.165 0.004 165)` | the sidebar's ground |
| `--sidebar-accent` | `oklch(0.29 0.004 165)` | `oklch(0.25 0.004 165)` | the current place |
| `--success` | `oklch(0.452 0.095 148)` | `oklch(0.78 0.12 150)` | a good score, a pass |
| `--warning` | `oklch(0.489 0.1 69)` | `oklch(0.8 0.11 70)` | a weak score, unsaved |
| `--destructive` | `oklch(0.473 0.148 27)` | `oklch(0.76 0.12 25)` | a failing score, an error, a delete |
| `--signal` / `--signal-foreground` | `oklch(0.927 0.168 120)` / ink | the same | next and running |

`--signal` is the same in every scope. It is the brand's lime `#D9F76B`.

## What background do I use?

```
Is it the page or a column?
 ├── Yes → bg-background
 └── No
      ├── Does it float over the page (popover, dialog, toast)? → bg-popover
      ├── Is it an object someone compares or picks up, or an input's fill? → bg-card
      ├── Is it code, front matter, or a table row that is open? → bg-muted
      ├── Is it hovered or the selected item of a list? → bg-accent
      └── Is it the sidebar? → bg-sidebar, and the element carries data-surface="ink"
```

## What text color do I use?

```
Does the color state a verdict (pass, weak, fail)?
 ├── Yes → text-success / text-warning / text-destructive
 └── No
      ├── Is it the thing being read or pressed? → text-foreground
      ├── Does it support that thing (hint, meta, caption, unit)? → text-muted-foreground
      └── Is it a placeholder for no value, such as "–"? → Text tone="faint"
```

`tone="faint"` is 3.05:1 on porcelain. Never put a word a person must read in it.

## Lime

`bg-signal` with `text-signal-foreground`, or `text-signal` on an ink surface. No other pairing: lime on porcelain is 1.07:1 and cannot be seen.

Lime marks exactly these:

- the next step: `Button variant="signal"` **(phase 3)** in the top bar. See [buttons.md](buttons.md).
- a running job: the dot in `JobsIndicator`, on the ink sidebar. It is the one lime that may sit beside the next step.
- in the welcome: the current step in the progress row, and one `Slab` per frame. See [brand.md](brand.md).

```tsx
// Correct: the dot of a running job, in components/Jobs.tsx
running: 'animate-pulse bg-signal',

// Incorrect: lime as a highlight for something that is neither next nor running
<Badge className="bg-signal">New</Badge>
```

Never use lime for success. A pass is `success`. Lime next to green makes a reader ask which one means good.

## Verdicts

Green, amber and red say how something stands and nothing else. A decorative use spends the meaning.

| Color | Means | Examples |
| --- | --- | --- |
| `success` | works, passes, good | a high score, a passed check, a connected provider, an allowed permission, results that match the current text |
| `warning` | needs an action from the reader to work | a weak score, not connected, unsaved, a permission not granted, results older than the last edit |
| `destructive` | broken, failed, or deletes | a failing score, an error, a failed job, a delete button |
| none (`muted`) | not set, and nothing is wrong | an optional key left empty, a permission not asked yet |

 A verdict on a surface is a 10% tint under colored text (`bg-success/10 text-success`), 20% in the dark and ink scopes. `Badge` and `TableRow` already do this: use their variants, do not rebuild the tint.

## Borders and depth

- A region ends at a hairline: `border-b`, `border-r`, `divide-y`. The default border color is `--border`. Do not name it.
- A control's edge is `border-input`.
- One depth cue per surface. A floating sheet uses `shadow-popover`. A raised object uses `shadow-raised`. Never both, never a shadow plus a border on the same element. In the dark and ink scopes both collapse to a ring.
- Radius comes from the scale: `rounded-xs` 5px (chips, inline links), `rounded-sm` 7.5px (code blocks), `rounded-md` 8.75px (controls), `rounded-lg` 10px (alerts), `rounded-xl` 15px (cards). `rounded-full` is for dots only.

## Checked pairs

Measured with WCAG 2 and APCA. A new text pair needs 4.5:1, and |Lc| 60 when it is running text. A control's indicator needs 3:1.

| Pair | Light | Dark and ink |
| --- | --- | --- |
| foreground on background | 16.2:1 | 16.2:1 |
| muted-foreground on background | 5.7:1, Lc 74 | 9.1:1, Lc 63 |
| muted-foreground on accent | 5.0:1, Lc 66 | Lc 61 |
| success, warning, destructive on their tint | 5.5, 5.0, 5.6:1 | above 5:1, Lc 59, 59, 52 (chips only, never running text) |
| ink on lime | 15.1:1 | 15.1:1 |
| focus ring (`ring-ring/50`) on background | 3.4:1 | 4.8:1 |

Two known gaps. `border-input` on porcelain is 1.5:1, so an input is found by its `bg-card` fill and its label, not its edge: never draw an input without both. The brand kit's secondary grey `#7C817B` is 3.6:1 on porcelain and is not a token: use `muted-foreground`.

## Changing a token

Change the value in `styles.css` in all three scopes, re-measure every pair in the table that uses it, and update this file in the same pull request. To fix a failing pair, move L only: chroma and hue do not change contrast.
