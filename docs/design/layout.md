# Layout

The window never scrolls. `AppFrame` is a window-sized grid, the sidebar and top bar hold still, and only `Pane` (`<main id="main">`) scrolls. Every screen starts at the same left edge.

## The shell

All in `src/renderer/components/Shell.tsx`, except `StatusLine`, which has its own file. A screen never renders these: `App.tsx` does.

| Part | Rule |
| --- | --- |
| `Sidebar` | ink in both themes: it carries `data-surface="ink"`. 208px, 232px from the `lg` breakpoint. |
| `SidebarSection` | a label over its `NavItem`s, `Text caps` |
| `NavItem` | one place. `meta` is its count, mono and tabular. `dot` is unsaved work, in `warning`. |
| `SidebarFooter` | Library, Guide, Settings, with a running job above them. `lead` holds the update. |
| `TopBar` | history, `Heading level="page"`, then the next step (`App.tsx` only), then help and the assistant |
| `Pane` | `layout="page"` for a `Screen` (the default), `layout="flush"` for a `Workbench` |
| `StatusLine` | under the pane: what just happened, read for a moment in a 48px strip kept for it, the top bar's mirror, ink while it speaks. Fed by `ctx.report`. See [data.md](data.md). |

The sidebar lists every screen flat so a reader always sees where they are. Never a second level of navigation, tabs inside a screen, or a link in the top bar.

## A new screen, or a section of one?

```
Is it a preference about how the app behaves on this computer?
 ├── Yes → a FormSection in Settings.tsx. Never a screen of its own.
 └── No
      ├── Is it a step of the loop (write, run, review, tune)? → a new screen: ask first
      ├── Is it about every skill, not the one open? → a section of Library, or ask
      └── Otherwise → a section of the screen whose work it serves
```

A new screen needs all of these in one pull request, or a test or the help breaks:

1. an entry in `SECTIONS` in `places.ts`: its route, sidebar label and icon
2. its branch in `App.tsx`, and an entry in `WORKBENCH` in `places.ts` if it is a workbench
3. an entry in `SCREEN_HELP` in `help.ts`: `help.test.ts` fails without one
4. a `##` section in `docs/guide.md` with the name the help links to
5. the screen in `screens/`. A screen about the open skill takes `{ ctx }: { ctx: Ctx }`. An app-level screen (Library, Settings) takes its own props from `App.tsx`.

## Which page type?

```
Does the reader pick one item from a list and work on it?
 ├── Yes → Workbench layout="list": Column kind="list" + Column kind="main"
 └── No
      ├── Is the work in front with its controls beside it? → Workbench layout="inspector"
      ├── Is it a form of settings? → Screen width="form" of FormSection
      ├── Is it prose or a document? → Screen width="reading"
      └── Tables and comparisons → Screen width="wide". This is the default.
```

`Screen` widths: `wide` 1200px, `form` 880px, `reading` 760px. All are left-aligned. Never center a screen: content that jumps sideways between screens reads as a different app.

## Regions are never cards

A region is a part of the page: a column, a section, a group of fields. It ends at a hairline and has no fill, radius or shadow of its own. `Card` (`components/ui/card.tsx`) is for an object, and today only `OutputCard` uses it.

```tsx
// Correct: screens/Settings.tsx
<FormSection title="Appearance" hint="How Skill Studio looks and moves on this computer.">
  <Field>
    <Label id={ids.theme}>Theme</Label>
    <Segmented<Theme> aria-labelledby={ids.theme} value={preferences.theme} onChange={…} />
  </Field>
</FormSection>

// Incorrect: a region boxed as a card
<Card>
  <CardHeader><CardTitle>Appearance</CardTitle></CardHeader>
  <CardContent>…</CardContent>
</Card>
```

A box around a region adds an edge the eye has to cross and takes 32px of width from every row inside it.

## Workbench

`Workbench` holds `Column`s that each scroll on their own. Lists sit on the left, inspectors on the right.

| Part | Use |
| --- | --- |
| `Column kind` | `list` (260px), `main`, `inspector` (340px) |
| `ListHeader` | a list column's title, count and add button |
| `ColumnHeader`, `ColumnTitle` | the main column's name and its actions |
| `ColumnToolbar`, `ToolbarGroup`, `ToolbarItem` | a row of tools under the header |
| `ColumnBody`, `ColumnSection` | the scrolling content, split by hairlines |
| `ColumnFooter` | actions that stay in view |

Insets are fixed: 16px in a list, 24px in main, 20px in an inspector (`inset="list" | "main" | "inspector"`). A header, a toolbar and the body of one column share one inset, so their left edges line up. Never pad a column by hand.

### A list workbench, the Cases pattern

Copy `screens/Cases.tsx` for any screen that lists items and edits the one picked.

- The selection lives in the route: read `route.params`, change it with `go(screen, params)`. Back and Forward then follow it. Never hold it in `useState`.
- The main column is `ColumnHeader` (the item's name, then Save, primary last) over `ColumnBody width="form"`, which holds `FormSection layout="stacked"` sections.
- Edits are kept with `ctx.drafts` while unsaved. Add new keys there if a new kind of item needs them.
- The add button opens an unsaved item (`new=1` in the route) that becomes real on its first save ("Add case"). It does not create one at once.
- After a delete, the next item is selected. When the last one goes, the screen shows the new-item form.
- With no items yet, the screen is `Workbench layout="single"` with the new-item form: making the first item is the next step, and an empty state would only point at it.

An inspector workbench (`screens/Knobs.tsx`) puts its form in `ColumnSection`s and its Save in `ColumnFooter`.

Below `lg` the columns stack and the pane scrolls. Check every workbench at 720px wide.

## Rows of actions

- A header or a trailing row puts the primary action last.
- A left-aligned footer (`FormActions`, `ColumnFooter`, `ActionBar`) puts the primary first and a destructive action last, after `Spacer`.
- Workbench chrome uses `size="sm"` controls. A `Screen` form uses the default size.
- A long form keeps its actions in view with `ActionBar`.

## Lists

| Need | Use |
| --- | --- |
| Items to open in a list column | `NavButton` inside `PlainList` |
| Records with several fields | `Table`. See [data.md](data.md). |
| Records of one or two lines, not tabular | `Rows` (hairlines, never boxed) |
| Filters on the left, actions on the right, over a list | `ListBar` |

## Empty, loading and failed

```
Does the whole screen have nothing to show?
 ├── Yes
 │    ├── Is the first item made by a form on this screen? → show that form (the Cases pattern above)
 │    └── No → return <EmptyState size="screen"> in place of the screen, never inside Screen
 └── No, one part is empty → <EmptyState> (size "default") or size="compact" in a column
```

- The step that fills the empty state is the default `Button`. A second way out is `outline`.
- Loading is `<Loading size="screen" />` or `<Loading />` inline. Never a spinner of your own.
- The standing of something a section depends on (a connection, a permission, a key) is a `Status` inside that section, under its fields or as its first line. Never a free line above the first section. See [data.md](data.md).
- A read that failed takes the place of what it would have shown, with "Try again". The whole screen failed: `EmptyState size="screen"` with a default "Try again", the only way forward (`Editor.tsx`, `Blind.tsx`). One part failed: `ReadFailed size="compact"`, whose "Try again" is outline because the rest of the screen still works (`Settings.tsx`). Either "Try again" is busy ("Trying again…") while the read runs again: pass `useFetch`'s `loading` as `busy`, or as `ReadFailed`'s `retrying`.

```tsx
// Correct: screens/Overview.tsx
<EmptyState
  size="screen"
  title="No runs yet"
  actions={<Button type="button" onClick={() => go('generate')}>Start a run</Button>}
/>
```

## Spacing

Spacing comes from Tailwind's 4px scale. `Screen` sets 40px between sections, `Section` 12px inside one, `FormSection` 28px above its rule. Use `Stack` for a vertical group and `Toolbar` for a horizontal one rather than a bare `flex gap-*` when one fits. Related things sit closer than unrelated ones: if two gaps are equal, the grouping is not showing.
