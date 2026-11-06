# Buttons

`Button` in `src/renderer/components/ui/button.tsx`. Use it for an action. A choice between values is `Segmented` or `Toggle` ([forms.md](forms.md)). A place in the app is `NavItem`. An item to open in a list column is `NavButton`.

## Variants

These exist. Nothing else does: an unlisted variant is a bug, not an option.

| Variant | Use | Count |
| --- | --- | --- |
| `default` | the single most important action of a screen or dialog: ink fill | one per view |
| `outline` | every other action. **This is the one to reach for first.** | any |
| `ghost` | an action beside other buttons in a toolbar or header | any |
| `signal` **(phase 3)** | the next step of the loop, in the top bar only: lime fill. Today the top bar uses `outline`. | one per window |
| `secondary` | not used by any screen. Do not start. | 0 |
| `link` | a link in a sentence that leaves the screen | rare |
| `link-muted` | navigation inside a table cell or under a form | any |
| `ghost-muted` | an icon action a row repeats, such as "show in Finder" | any |
| `destructive` | the confirm button of a destructive dialog | one per dialog |
| `destructive-outline` | a destructive action alone in its section | one per section |
| `destructive-ghost` | a destructive action beside other buttons | rare |
| `destructive-muted` | a delete icon a row repeats: quiet until pointed at | any |

`default` is the cva default, so a bare `<Button>` is the filled one. Count them: 34 call sites use `outline`, 28 use `ghost`. If a screen has two filled buttons, it has no hierarchy: make one `outline`.

**Destructive** means it deletes something a person made (a skill, a case, a version, a run, a key) or resets the whole app. Putting preferences back to their defaults is not destructive: it is `outline`, like "Show every hint again" in `Settings.tsx`.

```
Is it the next step of the loop, in the top bar?
 ├── Yes → variant="signal" size="sm" (phase 3; outline until then)
 └── No
      ├── Is it destructive, by the definition above?
      │    ├── It confirms inside a dialog → destructive
      │    ├── A row repeats it as an icon → destructive-muted
      │    ├── It stands alone in a section → destructive-outline
      │    └── It sits beside other buttons → destructive-ghost
      ├── Is it navigation inside a table or under a form? → link-muted
      ├── Is it an icon a row repeats? → ghost-muted
      ├── Is it the one action the screen exists for? → default
      ├── Does it sit in a toolbar or header beside others? → ghost
      └── Otherwise → outline
```

```tsx
// Correct: screens/Cases.tsx. Alone in its section, so its edge sits on the column's edge.
<Button type="button" variant="destructive-outline" size="sm" onClick={remove}>
  Delete case
</Button>

// Incorrect: a ghost that leads a left-aligned row. Its box shows only on hover,
// so at rest the label looks indented against the fields above it.
<Button type="button" variant="destructive-ghost" size="sm" onClick={remove}>
  Delete case
</Button>
```

## Sizes

| Size | Box | Use |
| --- | --- | --- |
| `default` | 36px | forms on a `Screen` |
| `sm` | 32px | workbench chrome, the top bar, toolbars |
| `lg` | 40px | the welcome only |
| `xs` | 24px | inside a dense row |
| `icon`, `icon-sm`, `icon-xs`, `icon-lg` | square | one icon and an `aria-label` |
| `inline`, `inline-sm` | none | a link in running text, or small under a form |
| `cell` | 28px | a button filling a table cell |
| `cell-inline` | none | a text link in a table cell |

```
Is it in a table cell?
 ├── A text link → size="cell-inline" with variant="link-muted"
 └── A boxed button → size="cell"
Is it one icon? → icon-sm in chrome, icon on a Screen
Is it in workbench chrome or the top bar? → sm
Otherwise → default
```

```tsx
// Correct: screens/Overview.tsx
<Button variant="link-muted" size="cell-inline" aria-label={`Compare ${o.sample.name}`} onClick={…}>
  Compare
</Button>

// Incorrect: a default-size button in a cell makes the row 36px taller than its neighbours
<Button variant="outline" onClick={…}>Compare</Button>
```

## The next step

The top bar shows where the loop goes next. It is the app's one lime control. Only `App.tsx` renders it: a screen never adds its own.

```tsx
// Correct after phase 3: App.tsx
<Button type="button" variant="signal" size="sm" onClick={() => go(next.screen, next.params)}>
  Next: {next.label}
  <ArrowRightIcon aria-hidden="true" />
</Button>

// Incorrect: a tone inside it. muted-foreground is light grey in the dark scope
// and disappears on lime. Text on signal is always signal-foreground.
<Button type="button" variant="signal" size="sm" onClick={…}>
  <Text tone="muted">Next:</Text>
  {next.label}
</Button>

// Incorrect: signal on a screen's own action. A run button is the screen's primary: default.
<Button variant="signal" onClick={start}>Start a run</Button>
```

## Every button

- `type="button"` unless it submits a form. A bare button inside a form submits it.
- An icon-only button has `aria-label` and `title` with the same words.
- An icon inside a button is `aria-hidden="true"` and takes its size from the button. Do not add `size-*`.
- A label ends in an ellipsis in two cases only: it is busy ("Saving…", "Starting…"), or it opens a dialog that asks more before acting ("Reset Skill Studio…"). A button that acts at once has none.
- A button is `disabled` while busy, and when pressing it would change nothing: "Show every hint again" is disabled when no hint has been seen. It keeps its width while busy.
- A label is a verb and its object: "Start a run", "Delete case", "Save case", and "Add case" for an item's first save. Never "OK", "Submit" or "Click here". "Save" alone is right in one place: an inspector's `ColumnFooter`, where it saves everything in the column (`Knobs.tsx`).
- Press feedback (`active:scale-[0.96]`) and the focus ring are built in. Do not restyle them.
- Never show an action only on hover. A row's actions are `ghost-muted` at rest, so touch and keyboard reach them.
