# Forms and choices

A form on a `Screen` is a column of `FormSection`s (`layout="split"`, the default): heading and hint on the left (200px), fields on the right, a hairline between sections. In a list workbench's main column they are `FormSection layout="stacked"` inside `ColumnBody width="form"`. In an inspector they are `ColumnSection`s. See [layout.md](layout.md).

## Saved at once, or with a button?

- **Settings and preferences apply at once.** No Save button. A change that can fail reports it in a toast. This is how `Settings.tsx` works.
- **Content is saved with a button**: a skill file, a case, a check. Those forms have `FormActions` or a `ColumnFooter`, and show "Discard" only when dirty.

## Which control?

Walk the questions in order. The first match is the answer.

```
Is it on or off?
 ├── A preference, applied at once → Segmented with two named options,
 │     such as "Show" / "Hide". Name what each state does, not "On" / "Off".
 ├── A tool in a toolbar, or the state of one item in a row → Toggle
 └── Part of a form saved with a button → CheckRow
Is it one of 2 to 5 fixed values, all worth seeing? → Segmented
One value from a longer or changing list? → SelectBox
Several of a set to show or hide? → FilterGroup
A whole number from 1 to 5 in a repeated row? → Stepper
A number on a continuous range, tuned by feel? → Knob
Any other number (a weight, a bound, minutes)? → NumberInput
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

`Segmented`, `Stepper`, `Knob` and `FilterGroup` have no `disabled` prop. Do not fake one with opacity at the call site. If a control truly cannot apply, add `disabled` to the component first. Otherwise leave it enabled and say why it has no effect in a `Hint` under it.

## Input

`Input` props that change its look: `width` (`full`, `auto`, `grow`, `narrow`, `wide`, `search`), `font` (`sans`, `mono`), `size` (`default` 36px, `sm` 28px). Nothing else exists.

- `font="mono"` for a path, a name used as an id, a key.
- `width="search"` for a search field in a `ListBar`.
- `size="sm"` only in workbench chrome.
- An input's fill becomes `bg-card` **(phase 3)**. On porcelain its 1.5:1 edge is not enough to find it.

## Segmented and FilterGroup

`Segmented` is one choice. Its `size` defaults to `sm`, and every call site leaves it there, in forms too. Do not pass `size="default"`: a taller one stands out against every other in the app. An option's `tone` (`success`, `destructive`) colors it when pressed, for a choice that states a verdict such as pass or fail.

The pressed segment becomes ink fill **(phase 3)**; today it is `bg-accent`.

`FilterGroup` is several toggles that show or hide: what is shown reads plain, what is hidden fades. It never takes ink fill: a filter is not a commitment.

## Toggle

`Toggle` variants: `default` (hovers as a ghost button, for a toolbar), `outline` (one item's state in a row), `filter`. Sizes: `default`, `sm`, `icon-sm`, `lg`. Every `outline` toggle in the app is `size="sm"`. `tone`: `default`, `success`, `destructive`.

The pressed `outline` toggle becomes ink fill **(phase 3)**, the same as `Segmented`, so "on" reads the same everywhere. A pressed `default` toggle in a toolbar stays `bg-accent`: a formatting tool is a state of the cursor, not a setting.

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

## Stepper

`Stepper` takes `label` as its accessible name, and fills its container. Today it is used only in the check rows of `Cases.tsx`, where the row's grid gives it an 88px track. A `Stepper` in a `Field` on a `Screen` needs `width` and `labelledBy` props first **(phase 3)**. Until then use `NumberInput`.

## Actions

- `FormActions` at the foot of a saved form: primary first, destructive last after `Spacer`.
- An action that is the only control of its section (a reset, "Open the welcome") sits in a `Toolbar` inside a `FormSection` of its own, as in `Settings.tsx`.
- "Discard" shows only when the form is dirty, and goes through `ctx.confirm`.
- Adding or removing a repeated row moves focus with it: to the new row, or to the next row's remove button.
- Fields in a repeated row start on the column's edge. Row numbers hang in the margin. Trailing icon actions end on the edge and use `ghost-muted`.

## Confirming

```
Does it lose something a person made?
 ├── No (preferences back to defaults) → act at once. No dialog, no Undo.
 └── Yes
      ├── Can the next toast take it back? → act at once, toast with Undo. No dialog.
      └── No → ctx.confirm first, then act
```

Never both a dialog and an Undo: two guards teach people to click through both. `Versions.tsx` shows the split: a saved copy alone comes back with Undo, and deleting runs asks first because their results cannot come back.
