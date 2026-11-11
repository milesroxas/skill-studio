# Buttons

`Button` in `src/renderer/components/ui/button.tsx`. Use it for an action. A choice between values is `Segmented` or `Toggle` ([forms.md](forms.md)). A place in the app is `NavItem`. An item to open in a list column is `NavButton`.

## Variants

These are all the variants there are. A variant missing from this table is missing from the component, so add it there before you use it.

| Variant | Use | Count |
| --- | --- | --- |
| `default` | the main action of a screen or dialog: ink fill | one per view |
| `outline` | every other action. **This is the one to reach for first.** | any |
| `ghost` | an action beside other buttons in a toolbar or header | any |
| `signal` | the next step of the loop, in the top bar only: yellow fill. Either "Next: …" or Run, never both. | one per window |
| `secondary` | not used by any screen. Do not start. | 0 |
| `link` | a name that opens its item: a skill's name in the Library's table | rare |
| `link-muted` | navigation inside a table cell or under a form | any |
| `ghost-muted` | an action a row repeats, such as "show in Finder", and the tools in the editor's toolbar | any |
| `destructive` | the confirm button of a destructive dialog: red fill, its label in `destructive-foreground` (porcelain, ink in the dark) | one per dialog |
| `destructive-outline` | a destructive action alone in its section | one per section |
| `destructive-ghost` | a destructive action beside other buttons | rare |
| `destructive-muted` | a delete icon a row repeats: quiet until pointed at | any |

`default` is the cva default, so a bare `<Button>` is the filled one. Most call sites name `outline` or `ghost`, and a few pick their variant in a ternary. Two filled buttons on one screen compete for the first look: make one `outline`.

`CornerButton` (`components/CornerButton.tsx`) is `ghost` at `icon-xs`, in `muted-foreground` at 80% until pointed at, with a 36px hit area around its 24px: the action in a field's corner. Where it goes is in [forms.md](forms.md).

**Destructive** means it deletes something a person made (a skill, a case, a version, a run, a key) or resets the whole app. Putting preferences back to their defaults is not destructive: it is `outline`, like "Show every hint again" in `Settings.tsx`.

```
Is it the next step of the loop, in the top bar?
 ├── Yes → variant="signal" size="sm"
 └── No
      ├── Is it destructive, by the definition above?
      │    ├── It confirms inside a dialog → destructive
      │    ├── A row repeats it as an icon → destructive-muted
      │    ├── It stands alone in a section → destructive-outline
      │    └── It sits beside other buttons → destructive-ghost
      ├── Is it navigation inside a table or under a form? → link-muted
      ├── Is it an action a row repeats, or a tool in the editor's toolbar? → ghost-muted
      ├── Is it the one action the screen exists for? → default
      ├── Does it sit in a toolbar or header beside others? → ghost
      └── Otherwise → outline
```

```tsx
// Correct: screens/Cases.tsx. Alone in its section, so its edge sits on the column's edge.
// Busy while the delete runs, and disabled while the case is being saved.
<Button
  type="button"
  variant="destructive-outline"
  size="sm"
  disabled={busy}
  busy={deleting}
  busyLabel="Deleting…"
  onClick={remove}
>
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
| `row` | grows | a full-width row in a list, left-aligned and wrapping, at the text's own weight: the questions to ask on the Assistant's empty state (`Chat.tsx`), with `ghost`. Nowhere else. |

```
Is it in a table cell?
 ├── A text link → size="cell-inline" with variant="link-muted"
 └── A boxed button → size="cell"
Is it one icon? → icon-sm in chrome, icon on a Screen
Is it in workbench chrome or the top bar? → sm
Otherwise → default
```

```tsx
// Correct: components/ResultsSummary.tsx
<Button variant="link-muted" size="cell-inline" aria-label={`Read ${o.sample.name}`} onClick={…}>
  Read
</Button>

// Incorrect: a default-size button in a cell makes the row 36px taller than its neighbours
<Button variant="outline" onClick={…}>Read</Button>
```

## The next step

The top bar shows where the loop goes next. It is the app's one yellow control. Only `App.tsx` renders it: a screen never adds its own. Below `lg` it reads the step's name alone ("Read the results"), "Next:" kept for a screen reader, and it is the last part of the bar to give way (see `TopBar` in [layout.md](layout.md)).

The loop is write, run, compare, and running is a button, not a place. So the next step is one of two things: a place to go ("Next: Add a case", "Next: Read the results"), drawn as below, or the run itself. `RunButton` (`components/Run.tsx`) stands in the top bar whenever the skill has a case. It is `signal` when running is the next step and `outline` otherwise, and its label is the same either way ("Run v2"), so it keeps its place. It opens a `form` popover that says what the run will do before the button that starts it, because a run costs money.

```tsx
// Correct: App.tsx
<Button
  type="button"
  variant="signal"
  size="sm"
  className="min-w-0 shrink"
  title={`Next: ${next.label}`}
  onClick={() => go(next.screen, next.params)}
>
  <span className="truncate">
    <span className="max-lg:sr-only">Next: </span>
    {next.label}
  </span>
  <ArrowRightIcon aria-hidden="true" />
</Button>

// Incorrect: a tone inside it. muted-foreground is light grey in the dark scope
// and disappears on yellow. Text on signal is always signal-foreground.
<Button type="button" variant="signal" size="sm" onClick={…}>
  <Text tone="muted">Next:</Text>
  {next.label}
</Button>

// Incorrect: signal on the action inside Run's own panel. It is the panel's primary: default.
<Button variant="signal" onClick={start}>Start a run</Button>
```

## Every button

- `type="button"` unless it submits a form. A bare button inside a form submits it.
- An icon-only button has `aria-label` and `title` with the same words.
- An icon inside a button is `aria-hidden="true"` and takes its size from the button. Do not add `size-*`. The `aria-hidden` is also how `Button` knows which side the icon is on: that side gives up 2px of padding (`data-icon="lead"` or `"trail"`), because a 16px icon holds about 2px of air inside its box and its ink would otherwise sit further from the edge than the text's. Text is centred on its cap height already, so never nudge a label with a margin.
- A label ends in an ellipsis in two cases only: it is busy ("Saving…", "Starting…"), or it opens a dialog that asks more before acting ("Reset Skill Studio…"). A button that acts at once has none.
- A button is `disabled` when pressing it would change nothing: "Show every hint again" is disabled when no hint has been seen.
- Every button whose press awaits something is busy until it lands: `busy={saving} busyLabel="Saving…"`. `busy` disables the button and sets `aria-busy`; `busyLabel` is what it says meanwhile, laid over the label in the same cell so the button is as wide as the wider of the two from the start and nothing beside it moves. Never write the swap as a ternary in the label, and never leave an `await` behind a button that stays enabled: a button that comes straight back asks to be pressed again.
- A button that starts a job stays busy until the job is over, not until the call returns: starting returns as soon as the job is queued. `useJobStart(jobs, kind, report)` in `renderer/job-start.ts` holds the button: its `busy(title?)` is true from the press until the job is over; Run says "Running…" while the run's count shows at the foot of the sidebar, and "Regrade" says "Grading…". It is busy from the press, too: a browser polls the list of jobs every few seconds, so the hook holds the button until the job shows there, or for five seconds when it never does (`Run.tsx`, `Comparison.tsx`, `ResultsSummary.tsx`). One start at a time: while one is held, the other buttons of the same kind are `disabled`.
- The composer's Stop is `disabled` until there is a reply to stop: a request still being sent has no id yet (`Composer` takes no `onStop` then).
- The other buttons of the same form or row are `disabled` while one of them is busy, so Save and Delete, or Restore on two rows, cannot run at once. A row's controls in a list wait on the row's own key (`pending` in `Library.tsx`), not on every row.
- "Try again" after a failed read is busy while the read runs again: `useFetch` returns `loading`, and `ReadFailed` takes it as `retrying`.
- A label is a verb and its object: "Start a run", "Delete case", "Save case", and "Add case" for an item's first save. Never "OK", "Submit" or "Click here". "Save" alone is right where what it saves is plain: the Skill screen's `ColumnHeader`, where it saves the open file.
- A dialog's confirm button is one verb: "Restart", "Restore", "Delete", "Discard", "Reset". The title above it names the object, so the button does not repeat it. The button that opens the dialog keeps its object: "Restart walkthrough…" opens a dialog whose button says "Restart".
- Press feedback (`active:scale-[0.96]`) and the focus ring (`focus-ring`: keyboard only, see [color.md](color.md#focus)) are built in. Do not restyle them.
- Never show an action only on hover. A row's actions are `ghost-muted` at rest, so touch and keyboard reach them.
- Never hide a row's actions on a narrow window. `RowActions` folds them into a "More actions" menu instead ([data.md](data.md)). A `ghost-muted` button that opens something keeps its hover look while it is open (`data-state="open"`).
