# Forms and choices

A form on a `Screen` is a column of `FormSection`s (`layout="split"`, the default): heading and hint on the left (200px), fields on the right, a hairline between sections. In a list workbench's main column they are `FormSection layout="stacked"` inside `ColumnBody width="form"`. In an inspector they are `ColumnSection`s. See [layout.md](layout.md).

## Saved at once, or with a button?

- **Settings and preferences apply at once.** No Save button. A change that can fail says so on the status line (`ctx.report`). This is how `Settings.tsx` works.
- **Content is saved with a button**: a skill file, a case, a check. Those forms have `FormActions` or a `ColumnFooter`, and show "Discard" only when dirty.

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
A number on a continuous range, tuned by feel? → Knob
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
- `Knob` is the one exception: it draws its own label, exact value and description. Use it bare, not in a `Field`. Help goes under the control in a `Hint`. An error is `<Hint tone="destructive">` under the control, and the control gets `aria-invalid`.

- A unit goes in the label: "Minimum run length, in minutes". Never as a suffix inside the field.
- A row of buttons or toggles inside a `Field` sits in a `Toolbar`, so they keep their own width.
- A short label before a control on one line ("From" before a select) is `InlineField`.

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

`Knob` and `FilterGroup` have no `disabled` prop. `Segmented` takes one, for a choice whose change is being saved. Do not fake one with opacity at the call site. If a control truly cannot apply, add `disabled` to the component first. Otherwise leave it enabled and say why it has no effect in a `Hint` under it.

## Input

`Input` props that change its look: `width` (`full`, `auto`, `grow`, `narrow`, `wide`, `search`), `font` (`sans`, `mono`), `size` (`default` 36px, `sm` 28px). Nothing else exists.

- `font="mono"` for a path, a name used as an id, a key, or a command to copy. A command to copy is `readOnly` under its own label ("Run in Terminal"), selects whole on focus, and has a **Copy command** button under it (`CliSetup` in `components/Connections.tsx`).
- `width="search"` for a search field in a `ListBar`.
- `size="sm"` only in workbench chrome.
- An input's fill is `bg-card`. On porcelain its 1.5:1 edge is not enough to find it. Every field (`Input`, `TextArea`, the `Select` trigger) takes its edge and fill from `FIELD_SURFACE` in `ui/input.tsx`: change it there, once.

`TextArea` variants: `default` (84px minimum, grows), `line` (one line that grows as it wraps, 36px to start: a check reads as an input until it needs more). `CheckRow` takes `size` (`default`, `sm`) and a `description` line under its label. `NumberInput` takes `width` (`default`, `value` for a number beside a slider, `full`). `SelectBox` takes `width` (`auto`, `full`, `wide` for a run with its writer and time), `size` (`default`, `sm` 32px), `none` (the label of the choice that means no value) and `groups`. Nothing else on these changes their look.

## Corner actions

An action about a field's own content sits in the field's corner as a `CornerButton` (`components/CornerButton.tsx`): "write with AI" on every field that takes `assist`, and on a check the picture it is about (`PicturePicker variant="corner"`, passed as the `TextArea`'s `corner`). The pen is last; one more corner action stands before it, 12px away, so their hit areas meet without overlapping. A setting of the row the field is in, and the row's removal, sit outside the field, after it: a check row in `Cases.tsx` reads statement, ×2, remove. Once added, the check's picture sits inside the field under the text (`TextArea`'s `foot`, a `PictureStrip size="sm"`), within the field's edge as the composer holds its pictures, and the corner button goes. A picture outside the field reads as a thing beside the check, not part of it. Nothing else goes in a corner.

## ComboBox

`ComboBox` (`components/ComboBox.tsx`) is a text field that opens a list under it, for a value that is usually one of a few known names but may be any other: a writer's model on New run. It looks like a `SelectBox` trigger, chevron included, so a row of the two reads as one row. Opening shows the whole list with the current value ticked; a key typed narrows it, and a value the list does not have is used as typed, which the list says. The focus stays in the field: arrows move through the list, Enter picks, Escape closes. Its list is `PopoverContent size="field"`. Never a native `<datalist>`: its popup is the system's, unstyled and outside the theme.

## Segmented and FilterGroup

`Segmented` is one choice. Its `size` defaults to `sm`, and call sites leave it there, in forms too. The one exception is a `ListBar` beside a default-size search field: "Whose skills" in `Library.tsx` passes `size="default"` so the two match. Anywhere else a taller one stands out against every other in the app. An option's `tone` (`success`, `destructive`) colors it when pressed, for a choice that states a verdict such as pass or fail.

The pressed segment is ink fill (`bg-primary`). A segment with a `tone` takes its verdict tint instead.

`FilterGroup` is several toggles that show or hide: what is shown reads plain, what is hidden fades. It never takes ink fill: a filter is not a commitment.

## Toggle

`Toggle` variants: `default` (hovers as a ghost button, for a toolbar), `outline` (one item's state in a row: an agent's install on Library, a check's ×2 on Cases), `filter`. Sizes: `default`, `sm`, `icon-sm`, `lg`. Every `outline` toggle in the app is `size="sm"`. `tone`: `default`, `success`, `destructive`. `place`: `alone` (the focus line outside the toggle, the default) or `group` (inside it, for a segment of a `Segmented` or `FilterGroup`; see [color.md](color.md)).

The pressed `outline` toggle is ink fill, the same as `Segmented`, so "on" reads the same everywhere. A pressed `default` toggle in a toolbar stays `bg-accent`: a formatting tool is a state of the cursor, not a setting.

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
- `FormActions layout="summary"` for a form whose one action costs something: what it will do on the left, from the form's own edge (New run: the output count over its sum), and the action at the far end. New run is the one form that uses it, `pinned`.
- An action that is the only control of its section ("Reset Skill Studio…") sits in a `Toolbar` inside a `FormSection` of its own, as in `Settings.tsx`.
- "Discard" shows only when the form is dirty, and goes through `ctx.confirm`.
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

Never both a dialog and an Undo: two guards teach people to click through both. `Versions.tsx` shows the split: a saved copy alone comes back with Undo, and deleting runs asks first because their results cannot come back.
