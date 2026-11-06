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
| `leaving` | `TableRow` | boolean | a row fading out after a delete, with `inert` |
| `numeric` | head, cell | boolean | a number: right-aligned and tabular. The cell is mono; the head stays a word in sans |
| `trailing` | head, cell | boolean | not a number, at the row's end: actions, a date, a note. Right-aligned, narrow and tabular, in sans |
| `wide`, `wrap`, `filler` | head, cell | boolean | the column that takes spare width; text that may wrap |
| `optional` | head, cell | boolean | hidden below `lg`, so the table fits a 720px window |
| `col` | head | `auto`, `xs`, `sm`, `md`, `lg`, `xl` | a fixed column's width |
| `fold` | head, cell | `never`, `last`, `second`, `first` | the order columns drop out as the table narrows |

A row that opens a detail uses `TableRowToggle` and `TableDetail`. Do not build a disclosure row by hand: the toggle carries `aria-expanded`, and the open row's `bg-muted` fill comes from it.

```tsx
// Correct: screens/Overview.tsx
<TableHead wide>Run</TableHead>
<TableHead numeric>Mean</TableHead>
<TableHead numeric optional>
  Cost
</TableHead>

// Incorrect: widths and alignment by hand, and a column that overflows at 720px
<TableHead className="w-[300px]">Run</TableHead>
<TableHead className="text-right">Cost</TableHead>
```

Rules:

- Text columns align left. Number columns align right. Never center a column.
- A head cell is a noun of one or two words in sentence case. No caps, no bold.
- An action in a cell is `Button size="cell-inline" variant="link-muted"` for navigation and `variant="ghost-muted"` or `destructive-muted` for a mutation. It is visible at rest. See [buttons.md](buttons.md).
- No zebra stripes. Hairlines separate rows, and a fill means hovered, open or failed.
- An empty cell shows an en dash "–" in `tone="faint"`, never a blank and never "N/A".

## Scores

A score is out of 100 and always shows through one of these, from `components/Scores.tsx`:

| Component | Shows |
| --- | --- |
| `TotalChip` | a score as a chip whose color is its band. Every chip is 40px wide, so a column keeps one edge. |
| `SampleCount` | how many outputs a mean stands for: "×2". Its slot keeps its width when empty. Hidden below `lg`, so a table of cases fits 720px: the score's `aria-label` still says it. |
| `Delta` | a change between two scores: "+15" in `success`, "−4" in `destructive` |
| `Layers` | each layer's score with a bar. Bars stay grey until a layer is weak. |
| `Flags` | the list of what a grader flagged |

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

Only weak things are colored in `Layers`. If every bar is green, the eye has nowhere to land: grey is the resting state and color is the exception.

## Badge

`components/ui/badge.tsx`. A badge is a short state on a thing: one or two words or a number. Its corners are `rounded-sm`, a printed label and not a pill.

Variants that exist: `default`, `secondary`, `destructive`, `outline`, `ghost`, `link`, `success`, `warning`, `danger`. Nothing else.

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
      └── Did an action just finish or fail? → a toast
```

## Status

`components/Status.tsx`: a dot, a state in a word or two, then detail. `tone`: `success`, `warning`, `destructive`, `muted` (the default). Pick the tone from the table in [color.md](color.md): works is `success`, needs the reader's action is `warning`, broken is `destructive`, not set and fine is `muted`. The detail says what to do when the tone is not `success`.

```tsx
// Correct: screens/Settings.tsx
<Status tone="warning" detail="Connect Anthropic or OpenAI below to choose a model.">
  Not connected
</Status>

// Incorrect: color alone carries the state
<Text tone="warning">Not connected</Text>
```

The words carry the state and the dot repeats it, so the line still reads without color.

## Alert

`components/ui/alert.tsx`. A message about the whole screen or section, above its content. Variants: `default`, `destructive`, `success`, `warning`, `muted`. The heading carries the color and the body stays `card-foreground`. A remark that is not a verdict is `muted`. A message about one field is a `Hint` under it, not an alert.

## Figures

A chart or a diagram labels its values directly, in mono `2xs`. It uses `foreground` for the thing measured and `muted-foreground` for references. It never uses lime, and it uses a verdict color only for a verdict. The one figure that uses the ribbon is the version lift. See [brand.md](brand.md).
