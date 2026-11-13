# Typography

Two families, set once in `styles.css`: `--font-sans` (Geist) for everything read, `--font-mono` (Geist Mono) for everything measured or typed. No serif. A component never names a family: it uses `font-sans` by inheritance and `font-mono` through `Text font="mono"`, `Code`, or a variant that carries it.

## The scale

Every size is one of these steps. `--text-*: initial` removes Tailwind's own scale, so `text-2xl` means this table and `text-4xl` does not exist. Never write `text-[13px]`.

| Step | Size | Use |
| --- | --- | --- |
| `2xs` | 11px | mono chips, chart ticks, caps labels. Never running text. |
| `xs` | 12px | hints, captions, meta beside a value, the labels of a picker over an object (`text="xs"` on a toggle) |
| `ui` | 13px | dense chrome: sidebar, labels, menus, table cells |
| `sm` | 14px | body text and controls. The default: `body` sets it. |
| `md` | 15px | reading: outputs, the guide, the formatted editor; the page title |
| `base` | 16px | section headings |
| `lg` | 18px | dialog titles, a lead paragraph |
| `xl` | 21px | document headings |
| `2xl` | 26px | a welcome step's title (`Heading level="step"`), and the guide's title on a small window |
| `3xl` | 30px | the guide's title, and the tour's two scores, before the edit and after |
| `display` | 64px | the welcome's headline, `Heading level="display"`, and the version lift's latest mean (`Lift.tsx`). Weight 700 and tracking -0.045em come with the step. |
| `numeral` | 136px | the welcome's step number. Weight 700 and tracking -0.055em come with the step. |
| `code` | 0.9em | mono inside running text, sized to its sans neighbours. `Text font="mono"` and `Code` apply it. |

Never go below 11px. Never set running text below 12px. Sizes above 30px exist only in the welcome and in one figure. See [brand.md](brand.md).

## Which component do I use for text?

```
Is it a heading in the page's outline?
 ├── Yes → Heading
 │         ├── the welcome's headline → level="display" (the welcome only)
 │         ├── a welcome step's title → level="step" (the welcome only)
 │         ├── the screen's name in the top bar, the Assistant panel's title → level="page"
 │         ├── a section of a screen, an empty state's title → level={2}
 │         └── a group of fields, a part of a column → level={3}
 └── No
      ├── Help under a control, or a note at the top of a section? → Hint
      ├── A path, a file name, a command, a version, an id? → Code or Text font="mono"
      ├── A label over a group that is not in the outline? → Text caps
      ├── A passage of the skill's own text set apart, such as the selection a tool works on? → Excerpt
      └── Anything else → Text, with tone, size and weight named as props
```

The guide's title is its Markdown `h1`, set to `3xl` (`2xl` on a small window) by `.guide-body` in `styles.css`. A screen's title is `level="page"` in the top bar. A screen never repeats its own name in its body.

Markdown the app renders itself (a reply, an output, the changelog) goes through `Prose` (`components/Prose.tsx`), which sets `.doc` in `styles.css`. Its `density` is `reading` (a column read at length), `compact` (a narrow column with no padding of its own) or `notes` (a release's changes, one to a line under small labels, bullets hung in the margin).

```tsx
// Correct: components/layout.tsx, ListHeader
<Heading level={3} as="h2">
  {title}
</Heading>
<Text tone="muted" size="xs" tabular>
  {count}
</Text>

// Incorrect: the size and color set at the call site
<h2 className="text-sm font-semibold">{title}</h2>
<span className="text-xs text-muted-foreground">{count}</span>
```

## Text props

`Text` takes these and nothing else: `tone` (`default`, `muted`, `faint`, `destructive`, `success`, `warning`), `font` (`sans`, `mono`), `size` (`inherit`, `ui`, `xs`), `weight` (`normal`, `medium`, `semibold`), and the booleans `tabular`, `block`, `clamp`, `truncate`, `measure`, `caps`, plus `align` (`start`, `end`), `wrap` (`normal`, `pre`, `anywhere`) and the element it renders, `as` (`span`, `p`, `b`, `small`, `div`, `li`). The default is inherit everything.

`Hint` takes `tone` (`default`, `destructive`), `measure` (`default`, `narrow`, `none`), `inset`, `tabular` and `as` (`p`, `span`, `div`). `Excerpt` is `ui` text on the muted panel (`bg-muted`). It takes `edge`: `inset`, the default, with a container's corners (`rounded-md`), or `bleed`, across a side panel's full width between hairlines. And `holds`: `text`, the default, a paragraph with its line breaks kept, or `writing`, a block held to 18rem and scrolled, for a rewrite as it is written. "The selection" in Help me improve (`Improve.tsx`) is `text`; Auto refine's Revision (`Refine.tsx`) and the reply under a field in the assist panel (`Assist.tsx`, `bleed`) are `writing`. `Heading` takes `as` (`h1`, `h2`, `h3`, `span`, `legend`, `p`) and `tabular` (a heading that is a number, such as a version) beside its `level`.

Weights are 400, 500 and 600. 700 belongs to the `display` and `numeral` steps, which carry it: never write `font-bold`. Body text is never bold for emphasis: use `weight="medium"`.

## Mono and numbers

Mono says "this is a literal or a measurement". Use it for:

- paths, file names, commands, run names, version tags (`v1`), ids
- numbers a person compares down a column: scores, costs, durations, counts, word counts

A number in a sentence stays in sans, and so does a live count under a field ("42 words", a `Hint` with `tabular`). A date is sans, written by `shortDate` from `model.ts`: never format one by hand. Every number that can change or sits in a column is `tabular`, so digits do not shift as it updates. In a table, `TableCell numeric` and `TableHead numeric` carry right alignment and tabular figures, and the cell is mono: do not add them by hand. A right-aligned column that is not a number (actions, a date) is `trailing`, and stays sans.

```tsx
// Correct: components/ResultsSummary.tsx
<TableHead numeric>Mean</TableHead>

// Incorrect: alignment and figures rebuilt at the call site
<TableHead className="text-right tabular-nums">Mean</TableHead>
```

## Caps labels

`Text caps` is 11px, weight 500, uppercase, tracked `--tracking-caps` (0.08em). It names a group without being a heading. Use it for exactly these: a section of the composer's slash menu ("Assistant", "Skills"), a caption over a part of a picture in the welcome, the label of a figure, the tag before each line of a rule pair (`PairList` in `starters.tsx`: "vague" and "check" by default, "vague" and "exact" on the Skill screen), the part labels of a case change in the Assistant ("Prompt", "A good answer", "Checks"), a rewrite's kind ("Best practice", "More direct", "Shorter"), the section labels of Auto refine and Help me improve ("What drifts", "Worth a look", "Revision", "The selection", "The draft against the guide"), and the guide line over each writing-check finding in the selection popout (`FindingList` in `Refine.tsx`). Keep it short. Never for a button, a table head or a heading: caps slow reading, so they stay where a reader only glances.

## Display type

Large type carries its own negative tracking from the scale (`lg` and up). Do not add `tracking-tight`: `AlertTitle` in `ui/alert.tsx` is the one place that carries it, from shadcn. Do not set a line height on a heading: the step sets it. Text that wraps to two or more lines in a heading uses `text-balance`, which `Heading` already has; a paragraph uses `text-pretty`.

## Geist, not the kit's Inter

The brand kit recommends Inter. The app uses Geist: its sizes and tracking are tuned on it, and Geist Mono pairs with it. Do not add Inter or any third family.

Geist has no italic file, and `body` sets `font-synthesis: none`, so italic shows upright. Emphasis is `weight="medium"`, never italic. The Markdown editor is the one exception: it sets `fontSynthesis: 'style'` in `editor/theme.ts` so a skill's own `*emphasis*` still shows.
