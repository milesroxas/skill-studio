# Typography

Two families, set once in `styles.css`: `--font-sans` (Geist) for everything read, `--font-mono` (Geist Mono) for everything measured or typed. No serif. A component never names a family: it uses `font-sans` by inheritance and `font-mono` through `Text font="mono"`, `Code`, or a variant that carries it.

## The scale

Every size is one of these steps. `--text-*: initial` removes Tailwind's own scale, so `text-2xl` means this table and `text-4xl` does not exist. Never write `text-[13px]`.

| Step | Size | Use |
| --- | --- | --- |
| `2xs` | 11px | mono chips, chart ticks, caps labels. Never running text. |
| `xs` | 12px | hints, captions, meta beside a value |
| `ui` | 13px | dense chrome: sidebar, labels, menus, table cells |
| `sm` | 14px | body text and controls. The default: `body` sets it. |
| `md` | 15px | reading: outputs, the guide, the formatted editor; the page title |
| `base` | 16px | section headings |
| `lg` | 18px | dialog titles, a lead paragraph |
| `xl` | 21px | document headings |
| `2xl` | 26px | the guide's title on a small window |
| `3xl` | 30px | the guide's title |
| `code` | 0.9em | mono inside running text, sized to its sans neighbours. `Text font="mono"` and `Code` apply it. |

Never go below 11px. Never set running text below 12px. Sizes above 30px exist only in the welcome and in one figure. See [brand.md](brand.md).

## Which component do I use for text?

```
Is it a heading in the page's outline?
 ├── Yes → Heading
 │         ├── the screen's name in the top bar → level="page"
 │         ├── a section of a screen, an empty state's title → level={2}
 │         └── a group of fields, a part of a column → level={3}
 └── No
      ├── Help under a control, or a note at the top of a section? → Hint
      ├── A path, a file name, a command, a version, an id? → Code or Text font="mono"
      ├── A label over a group that is not in the outline? → Text caps (phase 3; Text size="xs" tone="muted" until then)
      └── Anything else → Text, with tone, size and weight named as props
```

`Heading level={1}` (30px) is for the guide's title only. A screen's title is `level="page"` in the top bar. A screen never repeats its own name in its body.

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

`Text` takes these and nothing else: `tone` (`default`, `muted`, `faint`, `destructive`, `success`, `warning`), `font` (`sans`, `mono`), `size` (`inherit`, `ui`, `xs`), `weight` (`normal`, `medium`, `semibold`), and the booleans `tabular`, `block`, `clamp`, `truncate`, `measure`, plus `align` (`start`, `end`) and `wrap` (`normal`, `pre`, `anywhere`). The default is inherit everything.

Weights are 400, 500 and 600. `font-bold` (700) is for the welcome's display type only. Body text is never bold for emphasis: use `weight="medium"`.

## Mono and numbers

Mono says "this is a literal or a measurement". Use it for:

- paths, file names, commands, run names, version tags (`v1`), ids
- numbers a person compares down a column: scores, costs, durations, counts, word counts

A number in a sentence stays in sans, and so does a live count under a field ("42 words", a `Hint` with `tabular`). A date is sans, written by `shortDate` from `model.ts`: never format one by hand. Every number that can change or sits in a column is `tabular`, so digits do not shift as it updates. In a table, `TableCell numeric` and `TableHead numeric` carry tabular figures, right alignment and, from phase 3, mono: do not add them by hand.

```tsx
// Correct: screens/Overview.tsx
<TableHead numeric optional>
  Cost
</TableHead>

// Incorrect: alignment and figures rebuilt at the call site
<TableHead className="text-right tabular-nums">Cost</TableHead>
```

## Caps labels (phase 3)

`Text caps` is 11px, weight 500, uppercase, tracked `--tracking-caps` (0.08em). It names a group without being a heading. Use it for exactly these: a `SidebarSection` label, a caption over a part of a picture in the welcome, and the label of a figure. Two words at most. Never for a button, a table head or a heading: caps slow reading, so they stay where a reader only glances.

## Display type

Large type carries its own negative tracking from the scale (`lg` and up). Do not add `tracking-tight`. Do not set a line height on a heading: the step sets it. Text that wraps to two or more lines in a heading uses `text-balance`, which `Heading` already has; a paragraph uses `text-pretty`.

## Why Geist, not the kit's Inter

The brand kit recommends Inter. Miles chose to keep Geist (2026-11-05): the app is built and tuned on it, and Geist Mono already pairs with it. Do not add Inter or any third family.

Geist has no italic file, and `body` sets `font-synthesis: none`, so italic shows upright. Emphasis is `weight="medium"`, never italic. The Markdown editor is the one exception: it sets `fontSynthesis: 'style'` in `editor/theme.ts` so a skill's own `*emphasis*` still shows.
