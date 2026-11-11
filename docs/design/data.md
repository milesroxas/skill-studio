# Data: tables, scores, status

The app's content is measurements. They are set in mono, aligned in columns, and colored only when the color is a verdict.

## Table

`src/renderer/components/ui/table.tsx`. Use a `Table` for records with three or more fields a reader compares down a column. Records of one or two lines are `Rows` ([layout.md](layout.md)). A list of things to open is `NavButton`s.

A table sits directly on the page. Never put it in a card or give it an outer border: its head rule and row hairlines are its edges.

| Prop | On | Values | Use |
| --- | --- | --- | --- |
| `layout` | `Table` | `auto` (default), `fixed` | `fixed` when the list is filtered or two tables must line up |
| `bleed` | `Table` | `false` (default), `true` | `true` when rows fill on hover, open a detail or mark a failure |
| `interactive` | `TableRow` | `false` (default), `true` | the row opens something |
| `align` | `TableRow` | `middle` (default), `baseline` | `baseline` when one cell wraps to several lines |
| `variant` | `TableRow` | `default`, `destructive` | a failed sample |
| `motion` | `TableRow` | `none` (default), `leaving`, `arrived` | a row moving to another list at the reader's word: `leaving` while the change is saved, `arrived` where it lands (Mark done in `Library.tsx`). Never on a list's first draw |
| `numeric` | head, cell | boolean | a number: right-aligned and tabular. The cell is mono; the head stays a word in sans |
| `trailing` | head, cell | boolean | not a number, at the row's end: actions, a date, a note. Right-aligned, narrow and tabular, in sans |
| `wide`, `wrap`, `filler` | head, cell | boolean | the column that takes spare width; text that may wrap |
| `col` | head | `auto`, `xs`, `sm`, `md`, `lg`, `xl` | a fixed column's width |
| `fold` | head, cell | `never`, `last`, `second`, `first`, `menu` | the order columns drop out as the table narrows. `menu` is a row's actions: the column stays, one icon wide, where `first` goes, and `RowActions` folds them into a menu |

A row that opens a detail uses `TableRowToggle` and `TableDetail`. Do not build a disclosure row by hand: the toggle carries `aria-expanded`, and the open row's `bg-muted` fill comes from it.

```tsx
// Correct: components/ResultsSummary.tsx
<TableHead wide>Run</TableHead>
<TableHead numeric>Mean</TableHead>

// Incorrect: widths and alignment by hand, and a column that overflows at 720px
<TableHead className="w-[300px]">Run</TableHead>
<TableHead className="text-right">Mean</TableHead>
```

Rules:

- Text columns align left. Number columns align right. Never center a column.
- A head cell is a noun of one or two words in sentence case. No caps, no bold.
- An action in a cell is `Button size="cell-inline" variant="link-muted"` for navigation and `variant="ghost-muted"` or `destructive-muted` for a mutation. It is visible at rest. See [buttons.md](buttons.md).
- A row's actions at its end are `RowActions` (`components/RowActions.tsx`), one `RowAction` each, in a column with `fold="menu"`. While the table has room they are `ghost-muted` buttons (`show="icon"` for one drawn as its icon alone); when it is narrow they fold into one "More actions" button whose menu holds each as an icon and its label. Never let a row's actions fold away: a narrow window must still reach them (`Library.tsx`).
- No zebra stripes. Hairlines separate rows, and a fill means hovered, open or failed.
- An empty cell shows an en dash "–" in `tone="faint"`, never a blank and never "N/A".

## Scores

A score is out of 100 and always shows through one of these, from `components/Scores.tsx`:

| Component | Shows |
| --- | --- |
| `TotalChip` | a score as a chip whose color is its band. Every chip is 40px wide (`Badge numeric`), so a column keeps one edge. |
| `SampleCount` | how many outputs a mean stands for: "×2". Its slot keeps its width when empty. Hidden below `lg`, so a table of cases fits 720px: the score's `aria-label` still says it. |
| `Delta` | a change between two scores: "+15" in `success`, "−4" in `destructive` |
| `ScoreMove` | a score's move from one version to the next: the earlier chip, an arrow, the later chip and the `Delta`. With no earlier score it is the later chip alone, so a list keeps one edge. |
| `Parts` | the parts one score is made of, each with a bar: "Rules 4 of 5", "Checks 2 of 3". A part counted from facts says the count, each fact by its weight so a ×2 check counts two and the count agrees with the bar; any other says its score. Bars stay grey until a part is weak. |
| `CheckWeight` | a check's ×2 mark after its statement, only when it counts more than 1 |

What a score is counted from shows under it as `Verdicts` (`components/Verdicts.tsx`), on an `OutputCard`: **Missed** first and open, one row per rule broken or check not met, then **Marked as met by you**, open, so the reader's own answers stay in view, then **Met** folded under its count. A row is a mark (a red cross or a green tick, which repeat the words "Missed" and "Met"), the rule or check in full, and under it its kind in `faint` ("Rule", "Check ×2") and `link-muted` actions at `inline-sm`: "Open rule" for a rule SKILL.md still holds, and "Mark as met" or "Mark as missed" for a fact Jev answered. A fact code measured, such as a word count, has no answer to give and no action. A fact the reader answered says "your answer", or "your answer, agrees with Jev" when the skill's threshold gives Jev the same answer, and its action is "Take back" either way.

Bands come from `scoreBand()` in `model.ts`. Never compare a score to a number in a component: the bands are tuned in one place.

| Band | Chip |
| --- | --- |
| `hi` | `success` |
| `mid`, `na` | `secondary` (neutral) |
| `lo` | `warning` |
| `vlo` | `danger` |

```tsx
// Correct
<TotalChip total={mean} />

// Incorrect: a verdict color picked at the call site
<Badge variant={mean > 90 ? 'success' : 'warning'}>{mean}</Badge>
```

Only weak things are colored in `Parts`. If every bar is green, the eye has nowhere to land: grey is the resting state and color is the exception.

## Badge

`components/ui/badge.tsx`. A badge is a short state on a thing: one or two words or a number. Its corners are `rounded-sm`, a printed label and not a pill.

Variants that exist: `default`, `secondary`, `destructive`, `outline`, `ghost`, `link`, `success`, `warning`, `danger`. Nothing else. One boolean beside them, `numeric`: a number a reader compares down a column, as wide as "100" (40px) and centred, in mono with tabular figures. `TotalChip` is the one that sets it: a score is a `TotalChip`, never a `Badge numeric` of its own.

```
Does it state how good something is?
 ├── Yes → success / warning / danger
 └── No
      ├── A neutral count or state → secondary
      ├── A state that needs an edge on a filled row → outline
      └── A state that must be acted on now → warning, as a button (asChild)
```

`default` (ink fill) and `destructive` (solid red) are not used by any screen. A solid badge outweighs the row it labels. Do not start.

## Status or Alert?

```
Is it the standing of one thing (connected, installed, allowed, set)?
 ├── Yes → Status, inside the section that thing belongs to
 └── No
      ├── Must the reader act before the whole screen works? → Alert, above the content
      ├── Is it about one field? → Hint under that field
      └── Did an action just finish or fail? → report it: `ctx.report`, read on the status line
```

## Status

`components/Status.tsx`: a dot, a state in a word or two, then detail. `tone`: `success`, `warning`, `destructive`, `muted` (the default), `signal` for a job that is running. `size`: `default` in a section's text, `ui` at the end of a row whose title is `text-ui`, such as a change in the Assistant panel. Pick the tone from the table in [color.md](color.md): works is `success`, needs the reader's action is `warning`, broken is `destructive`, not set and fine is `muted`. The detail says what to do when the tone is not `success`.

```tsx
// Correct: screens/Settings.tsx
<Status tone="warning" detail="Set up Claude Code or Codex below to choose a model.">
  Not connected
</Status>

// Incorrect: color alone carries the state
<Text tone="warning">Not connected</Text>
```

The words carry the state and the dot repeats it, so the line still reads without color.

## Status line

`components/StatusLine.tsx`, fed by `ctx.report`. One line at the foot of the window's frame, in a strip the frame keeps for it, so it never lies over the work: under the pane in the app and in the changelog window (`place="foot"`), in the first cell of the welcome's title strip (`place="head"`). While it speaks the foot's strip is ink, drawn in from the left on `ease-stroke` in 300ms, and the words rise in after it; then it goes quiet and the strip is paper again. The head keeps the title strip's own surface and draws no stroke. Its Undo is an `outline` button, so the offer is seen. It is the only place a finished or failed step is announced. Nothing floats over the screen to say so, and a question that must be answered first is `ctx.confirm` ([forms.md](forms.md)), not a notice.

```tsx
// Correct: components/VersionDetail.tsx
report(`Restored ${found.version}`)
report(e as Error)
report(`Deleted ${v.version}`, { undo })

// Incorrect: a failure in the plain tone, or a message of its own over the screen
report(e.message)
<div className="fixed bottom-4 …">Saved</div>
```

- A string alone is a fact, with the plain dot: "Saved 1.2.0", "Run started: 3 outputs".
- An `Error`, or a string with `{ tone: 'destructive' }` when the caller words it ("Not saved: …"), is a step that failed. Red dot.
- `{ tone: 'warning' }` is a step the reader must change something before taking ("1.2.0 already exists."). Amber dot.
- `{ undo }` offers Undo, and the Undo shortcut takes it while the line stands. `{ action }` offers the one step that follows. One offer at most: a notice is one line, and the line truncates past the strip.
- Never `success`. A notice that something worked is the fact itself.
- A fact leaves on its own once it can be read: 2.6s at least, about 200 words a minute past that, 7s with an offer. It waits while the pointer or the keyboard is on the line. A failure or a warning stays until the reader presses its Dismiss (`ghost` at `icon-sm`, after any offer) or the next notice takes its place.
- `{ stays: true }` keeps a fact on the line the same way, with the plain dot and Dismiss. It is for news that ends on its own time and is easy to miss: the one use is an update ready to install (`updates.ts`).
- A long message truncates; its whole text is the line's `title`.

The dot is `Dot` from `components/Status.tsx`, the one dot in the app. `Status`, the jobs line and a `NavItem`'s unsaved mark use it too, so a color means the same thing wherever it is read: `signal` runs, `success` works, `warning` needs the reader, `destructive` failed, `muted` is a fact.

## Alert

`components/ui/alert.tsx`. A message about the whole screen or section, above its content. Variants: `default`, `destructive`, `success`, `warning`, `muted`. The heading carries the color and the body stays `card-foreground`. A remark that is not a verdict is `muted`. A message about one field is a `Hint` under it, not an alert.

## File size

`components/TextSize.tsx`: `TextSizeIndicator`, at the far end of the editor's toolbar. It is five segments in a row, 14 by 6px with 2px corners (`rounded-xs`) and 2px between, filled up to the file's level from `textSize()` in `domain/size.ts`. The color comes from `sizeBand()` there. Never set a level or a band by hand: the steps are tuned in one place.

| Band | Levels | Filled bars |
| --- | --- | --- |
| `fine` | 1 to 3 | `bg-current`: the toolbar's muted text, darker with the button on hover |
| `long` | 4 | `bg-warning` |
| `over` | 5 | `bg-destructive` |

- Empty bars are `bg-input`. They are never yellow.
- `long` and `over` also say so in words, in the hover card and the button's label, so color is never the only sign. The counts take the same tone.
- Pointing at it opens `HoverCardContent size="note"` with the lines and tokens. Clicking puts the counts in place of the bars, in mono `xs`, and the button is `aria-pressed`. The choice holds across files until the window closes.

## Figures

A chart or a diagram labels its values directly, in mono `2xs`. It uses `foreground` for the thing measured and `muted-foreground` for references, with axes in `input`. It never uses yellow, and it uses a verdict color only for a verdict. Every figure is a component. The app has one: the version lift on Results, the one figure that uses the ribbon. See [brand.md](brand.md).
