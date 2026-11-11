# Forms and choices

A form on a `Screen` is a column of `FormSection`s (`layout="split"`, the default): heading and hint on the left (200px), fields on the right, a hairline between sections. In a list workbench's main column they are `FormSection layout="stacked"` inside `ColumnBody width="form"`. See [layout.md](layout.md).

## Saved at once, or with a button?

- **Settings and preferences apply at once.** No Save button. A change that can fail says so on the status line (`ctx.report`). This is how `Settings.tsx` works.
- **Content is saved with a button**: a skill file, a case, a check. Those forms have `FormActions` or a `ColumnHeader`, and "Discard" acts only when they are dirty.

## Which control?

Walk the questions in order. The first match is the answer.

```
Is it on or off?
 ├── A preference, applied at once → Segmented with two named options,
 │     such as "Show" / "Hide". Name what each state does, not "On" / "Off".
 ├── A tool in a toolbar, or the state of one item in a row → Toggle
 └── Part of a form saved with a button → CheckRow
One of the items in a list above, applied at once? → SelectBox under the list,
  not a control on every row: ten identical icons say nothing until one is on.
Is it one of 2 to 5 fixed values, all worth seeing? → Segmented
One value from a longer or changing list? → SelectBox
Usually one of a few known names, but any other may be typed (a model)? → ComboBox
Several of a set to show or hide? → FilterGroup
Any other number (a bound, minutes)? → NumberInput
One line of text? → Input
More than one line? → TextArea
```

```tsx
// Correct: screens/Settings.tsx. On or off, as a preference.
<Segmented<Hints>
  aria-labelledby={ids.hints}
  value={preferences.hints}
  onChange={(hints) => hints && choose({ hints })}
  options={HINTS} // [{ value: 'show', label: 'Show' }, { value: 'hide', label: 'Hide' }]
/>

// Incorrect: a Toggle for a preference. Its off state does not say what off means.
<Toggle variant="outline" pressed={hints === 'show'}>Screen hints</Toggle>
```

A native `<select>`, `<input type="number">` or `<input type="checkbox">` in a screen is a bug: each has a component here that carries the focus ring, the sizes and the dark values.

## Field

Every control sits in a `Field` with a `Label` above it. Never a placeholder as the label: it disappears on the first key and takes the field's name with it.

- An `Input`, `TextArea` or `NumberInput`: `<Label htmlFor="case-title">` and the same `id` on the control.
- A `Segmented`, `SelectBox` trigger, or a group of controls: `<Label id={…}>` and `aria-labelledby` on the control, or `role="group"` with `aria-labelledby` on the `Field`.
- Help goes under the control in a `Hint`. An error is `<Hint tone="destructive">` under the control, and the control gets `aria-invalid`.
- A hint says what the reader cannot see from the control: one sentence, two at most. It never names the control's parts ("Pick the kind, then a case") or repeats what a confirm dialog will say.
- In a form with one required field, the others say so: `<Label optional>` puts "optional" after the name in muted text (the case's Title, Files and A good answer). A checkbox is optional by being one, so it takes no mark.
- A unit goes in the label: "Minimum run length, in minutes". Never as a suffix inside the field.
- A row of buttons or toggles inside a `Field` sits in a `Toolbar`, so they keep their own width.
- A short label before a control on one line ("From" before a select) is `InlineField`.
- One quiet action about a field's content sits at the end of its label's row: `FieldHead` takes the `Label` as its child and the action as `action`, a `ghost-muted` button at `xs` with the arrow when it opens elsewhere. The case's Files has the one there is, `REVEAL_LABEL`, on a saved case. It is never in the row of buttons that add to the field, where it would read as one more of them.
- Files a field holds are rows of `CaseFiles` (`components/InputFiles.tsx`): a 40px tile (a picture's thumbnail, which opens it, or a file's or folder's icon on `bg-muted`), the name in mono, a count for a folder, and the remove button at the row's end, with a hairline between rows. Its two add buttons sit under the list, 12px below it, and stay where they are as rows come and go. Pictures and other files are one list: a picture is a file of the case, and what is added under Files stays under Files. The field keeps to `max-w-xl`, so a remove button is never a column's width from its name. Its hint shows only while the list is empty.

```tsx
// Correct: screens/Settings.tsx
<Field>
  <Label id={ids.theme}>Theme</Label>
  <Segmented<Theme> aria-labelledby={ids.theme} value={preferences.theme} onChange={…} options={THEMES} />
</Field>

// Incorrect: no Field, no label, the name as a placeholder
<Input placeholder="Theme" />
```

## Disabling

`FilterGroup` has no `disabled` prop. `Segmented` takes one, for a choice whose change is being saved. Do not fake one with opacity at the call site. If a control truly cannot apply, add `disabled` to the component first. Otherwise leave it enabled and say why it has no effect in a `Hint` under it.

## Input

`Input` props that change its look: `width` (`full`, `auto`, `wide`, `search`), `font` (`sans`, `mono`), `size` (`default` 36px, `sm` 28px). Nothing else exists.

- `font="mono"` for a path, a name used as an id, a key, or a command to copy. A command to copy is `readOnly` under its own label ("Run in Terminal"), selects whole on focus, and has a **Copy command** button under it (`CliSetup` in `components/Connections.tsx`).
- `width="search"` for a search field in a `ListBar`.
- `size="sm"` only for a field in a narrow list column: a new file's name on the Skill screen.
- An input's fill is `bg-card`. On porcelain its 1.5:1 edge is not enough to find it. Every field (`Input`, `TextArea`, the `Select` trigger) takes its edge and fill from `FIELD_SURFACE` in `ui/input.tsx`: change it there, once.

`TextArea` variants: `default` (84px minimum, grows), `line` (one line that grows as it wraps, 36px to start: a check reads as an input until it needs more). Under it, `Textarea` in `ui/textarea.tsx` takes `variant`: `default`, the field's edge and fill from `FIELD_SURFACE`, or `bare`: no edge, no fill and no shadow in any theme, and no resize grip. `bare` is for a field inside a frame that draws the edge and shows the focus, and is used only by the composer. `Composer` takes `frame`: `box`, an edge that turns to `--ring` while the field has focus ([color.md](color.md)), in the side panel (the Assistant and Help me improve); or `bare` (the default), no frame at all, in a popover, where the composer is the popover's one field. A picture held over it rings the `box` edge, or tints a `bare` composer with `accent`. A `bare` field on its own would show neither where it is nor that it has focus. `CheckRow` takes `size` (`default`, `sm`) and a `description` line under its label. `NumberInput` takes `width` (`default`, `full`). `SelectBox` takes `width` (`auto`, `full`, `fill`: see [Segmented and FilterGroup](#segmented-and-filtergroup)), `size` (`default`, `sm` 32px), `none` (the label of the choice that means no value) and `groups`. Nothing else on these changes their look.

## Corner actions

An action about a field's own content sits in the field's corner as a `CornerButton` (`components/CornerButton.tsx`): "write with AI" on every field that takes `assist`, and on a check the picture it is about (`PicturePicker variant="corner"`, passed as the `TextArea`'s `corner`; its other variant is `icon-sm`, in a row of controls such as the composer's). The pen is last; one more corner action stands before it, 12px away, so their hit areas meet without overlapping. A field a list repeats takes no pen of its own: the list's one button writes for all of it, so a check's corner holds the picture alone and **Write checks with AI** sits under the list. A setting of the row the field is in, and the row's removal, sit outside the field, after it: a check row in `Cases.tsx` reads statement, ×2, remove. Once added, the check's picture sits inside the field under the text (`TextArea`'s `foot`, a `PictureStrip size="sm"`, 8px between pictures; `md`, the default, has 12px), within the field's edge as the composer holds its pictures, and the corner button goes. A picture outside the field reads as a thing beside the check, not part of it. Nothing else goes in a corner.

## ComboBox

`ComboBox` (`components/ComboBox.tsx`) is a text field that opens a list under it, for a value that is usually one of a few known names but may be any other: the model under Run's Options. It looks like a `SelectBox` trigger, chevron included, so a row of the two reads as one row. Opening shows the whole list with the current value ticked; a key typed narrows it, and a value the list does not have is used as typed, which the list says. The focus stays in the field: arrows move through the list, Enter picks, Escape closes. Its list is `PopoverContent size="field"`. Never a native `<datalist>`: its popup is the system's, unstyled and outside the theme.

## Segmented and FilterGroup

`SelectBox` (`components/SelectBox.tsx`) takes `width`: `auto` (as wide as its value, the default), `full`, or `fill` (the room its row has to spare, truncating: two in one row come out the same width, as the A and B pickers on Results do). An option may carry a `detail`: a quieter `xs` line under its label, in the list only. The trigger shows the label alone and holds both in its title, so a field stays short where the list has more to say.

`Segmented` is one choice. Its `size` defaults to `sm`, and every call site leaves it there, in forms too. `size="default"` is only for one beside a default-size field, where the two must match: anywhere else a taller one stands out against every other in the app. `fill` spreads its segments over the row's width.

The pressed segment is ink fill (`bg-primary`). A choice not yet made has no segment pressed.

`tone` is `ink`, the default, or `quiet`. `tone="quiet"` is for a choice that stands beside an ink one and must not compete with it: the file and the page width beside the A and B switch over the stage on Results. Its labels stand apart, wrap onto a second line when they must, and the pressed one sits on `accent`, as a pressed `default` toggle does. `font="mono"` and `text="xs"` set every label, for literals such as file names. One ink `Segmented` per row of controls: a second choice in the same row is `quiet`.

`FilterGroup` is several toggles that show or hide: what is shown reads plain, what is hidden fades. It never takes ink fill: a filter is not a commitment.

## Toggle

`Toggle` variants: `default` (hovers as a ghost button, for a bar of them: the Assistant's toggle in the top bar), `outline` (one item's state in a row: an agent's install on Library), `quiet` (a setting of a row that most rows leave off: a check's ×2 on Cases, with no edge and muted text until it is on), `filter`. Sizes: `default`, `sm`, `icon-sm`, `lg`. Every `outline` and `quiet` toggle in the app is `size="sm"`. `place`: `alone` (the focus line outside the toggle, the default) or `group` (inside it, for a segment of a `Segmented` or `FilterGroup`; see [color.md](color.md)). Two more set the label: `font` (`sans`, the default, or `mono` for a literal such as a file's name) and `text` (`sm`, the default, or `xs`). `xs` is for a picker over an object, at the size of the meta around it: the files and the transcript over an output (`ArtifactPicker` in `components/Artifact.tsx`, a `default` group with its items apart, the same look as a `Segmented tone="quiet"`). A `ToggleGroup` sets `variant` and `size` for its items; `font` and `text` are each item's own.

The pressed `outline` or `quiet` toggle is ink fill, the same as `Segmented`, so "on" reads the same everywhere. A pressed `default` toggle stays `bg-accent`, as the Assistant's toggle does while its panel is open.

```tsx
// Correct: screens/Library.tsx. One agent's install state for one skill, applied at once.
<Toggle
  variant="outline"
  size="sm"
  pressed={state === 'here' || state === 'link'}
  onPressedChange={() => fixed || toggle(s, a.id, a.label)}
>
  {a.label.replace(' Code', '')}
</Toggle>

// Incorrect: a button that swaps its own variant to look pressed
<Button variant={installed ? 'default' : 'outline'} size="sm">Claude</Button>
```

## Actions

- `FormActions` at the foot of a saved form: primary first, destructive last after `Spacer`.
- A form whose one action costs something says what it will do on the action itself: Run's button reads "Run 3 cases" or "Run 3 cases, 2 attempts each", so the size of the run is the strongest line in the panel, and a `Hint` under it says who does the work (`components/Run.tsx`). Ticking a case or changing a count changes only the button's words, so nothing under the pointer moves.
- A warning that holds before the action (unsaved files, no Jev key) is a `Status` with `tone="warning"` above it. A reason the action cannot run at all is a `Status` in place of the line under it, tied to the disabled button by `aria-describedby`; when the button's own words can say it, they do ("Tick a case to run").
- An action that is the only control of its section ("Reset Skill Studio…") sits in a `Toolbar` inside a `FormSection` of its own, as in `Settings.tsx`.
- "Discard" acts only when the form is dirty, and goes through `ctx.confirm`. A case and Graded as show it only then; the Skill screen's header keeps it in place, disabled.
- Adding or removing a repeated row moves focus with it: to the new row, or to the next row's remove button.
- Fields in a repeated row start on the column's edge. Row numbers hang in the margin. Trailing icon actions end on the edge and use `ghost-muted`.

## Confirming

```
Does it lose something a person made?
 ├── No (preferences back to defaults) → act at once. No dialog, no Undo.
 └── Yes
      ├── Can the status line's Undo take it back? → act at once, report with `{ undo }`. No dialog.
      └── No → ctx.confirm first, then act
```

Never both a dialog and an Undo: two guards teach people to click through both. `VersionDetail.tsx` shows the split: a version with no runs comes back with Undo, and deleting runs asks first because their results cannot come back.

One exception, in `Change.tsx`: applying a file the assistant proposes over unsaved edits. The dialog and the Undo guard two different things. Undo brings back the saved file; nothing brings back the unsaved edits, so those are asked about first, and the dialog says which of the two Undo covers. With no unsaved edits to lose there is no dialog, only the Undo.

A stored key is the other side of the tree: removing it cannot be undone, so "Remove the stored key…" asks first (`KeyField` in `components/Connections.tsx`).
