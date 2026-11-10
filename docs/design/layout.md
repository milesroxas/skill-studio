# Layout

The window never scrolls. `AppFrame` is a window-sized grid, the sidebar and top bar hold still, and only `Pane` (`<main id="main">`) scrolls. Every screen starts at the same left edge.

## The shell

All in `src/renderer/components/Shell.tsx`, except `StatusLine`, which has its own file. A screen never renders these: `App.tsx` does.

| Part | Rule |
| --- | --- |
| `AppFrame` | the window-sized grid: the sidebar, then `Workspace`, then `AssistantPane` when the Assistant is open |
| `Sidebar` | ink in both themes: it carries `data-surface="ink"`. 208px, 232px from the `lg` breakpoint. `SidebarBody` is its middle, scrolling on its own when the window is short. Its `foot` (the Walkthrough box) stands at its end and scrolls with it, so a short window hides the foot and never the places. |
| `SidebarSection` | the open skill's three places, one `NavItem` each: Skill, Cases, Results |
| `NavItem` | one place. `meta` is its count, `xs` sans at 55%, tabular: the cases, and on Results the cases that wait for a pick. `dot` is unsaved work, in `warning`. |
| `SidebarFooter` | Library, Guide, Settings, with a running job above them. `lead` holds the update. |
| `Workspace` | the column beside the sidebar: the top bar over the pane |
| `AssistantPane` | the Assistant's panel: a 360px column beside `Workspace` on a wide window, over its right edge on a narrow one |
| `TopBar` | `HistoryNav` (back and forward), `Heading level="page"`, then the "No Jev key" badge while there is none, the next step and Run (`App.tsx` only), then help and the assistant. Below `sm` a menu button leads it and opens the sidebar as `PopoverContent size="nav"`. |
| `Pane` | `layout="page"` for a `Screen` (the default), `layout="flush"` for a `Workbench` |
| `StatusLine` | under the pane: what just happened, in a 48px strip kept for it (a fact for a moment, a failure until dismissed), the top bar's mirror, ink while it speaks. Fed by `ctx.report`. See [data.md](data.md). |

The sidebar lists every screen flat so a reader always sees where they are. Never a second level of navigation, tabs inside a screen, or a link in the top bar. Run is the one action the top bar holds beside the next step: it is a step of the loop that is not a place (`components/Run.tsx`, see [buttons.md](buttons.md)).

## A new screen, or a section of one?

```
Is it a preference about how the app behaves on this computer?
 ├── Yes → a FormSection in Settings.tsx. Never a screen of its own.
 └── No
      ├── Is it a step of the loop (write, run, compare)? → a new screen: ask first
      ├── Is it about every skill, not the one open? → a section of Library, or ask
      ├── Is it a setting of one skill that few will ever change (its scoring)? → a `Disclosure`
      │     at the foot of the screen whose numbers it changes. Never a screen, never a control on every row.
      └── Otherwise → a section of the screen whose work it serves
```

A new screen needs all of these in one pull request, or a test or the help breaks:

1. an entry in `SKILL_PLACES` in `places.ts` (`APP_PLACES` for an app-level screen): its route, sidebar label and icon
2. its branch in `App.tsx`, and an entry in `WORKBENCH` in `places.ts` if it is a workbench
3. an entry in `SCREEN_HELP` in `help.ts`: `help.test.ts` fails without one
4. a `##` section in `docs/guide.md` with the name the help links to
5. the screen in `screens/`. A screen about the open skill takes `{ ctx }: { ctx: Ctx }`. An app-level screen (Library, Settings) takes its own props from `App.tsx`.

## Which page type?

```
Does the reader pick one item from a list and work on it?
 ├── Yes → Workbench layout="list": Column kind="list" + Column kind="main"
 └── No
      ├── Is it a form of settings? → Screen width="form" of FormSection
      ├── Is it a document with its contents beside it? → GuideLayout (see Lists below)
      └── Tables and comparisons → Screen width="wide". This is the default.
```

`Screen` widths: `wide` 1200px, `form` 880px. All are left-aligned. Never center a screen: content that jumps sideways between screens reads as a different app.

## Regions are never cards

A region is a part of the page: a column, a section, a group of fields. It ends at a hairline and has no fill, radius or shadow of its own. `Card` (`components/ui/card.tsx`) is for an object a person compares or picks up. Two things use it: an output (`OutputCard`, two of them side by side on Results), and a rewrite to pick in the selection popout (`Rewrites.tsx`, a button with the card's surface, since the whole object is the action). The same surface (`rounded-chin border bg-card`) bounds a `Disclosure variant="card"`, a `DisclosureList`, an `Alert`, and a figure or a table in the guide: each is one object standing in a flow of text, never a region of the page.

`Disclosure` (`components/Disclosure.tsx`) folds a block behind one line, in three variants. `plain` is a line of text that opens in place. `card` is one file of a diff, on its own bordered block (a version's changes on the Skill screen). `row` is one row of a `DisclosureList`: the changes an Assistant reply proposes, a title over a line of detail, with one control at the end in a slot of fixed width so the controls line up down the list. A row with nothing to open keeps the chevron's slot empty, so the titles line up too.

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
  <Heading level={3}>Appearance</Heading>
  …
</Card>
```

A box around a region adds an edge the eye has to cross and takes 32px of width from every row inside it.

## Workbench

`Workbench` holds `Column`s that each scroll on their own. The list sits on the left, the item picked from it beside it.

| Part | Use |
| --- | --- |
| `Column kind` | `list` (260px), `main` |
| `ListHeader` | a list column's title, count and add button. A list nothing is added to (the cases on Results) is a `ColumnHeader inset="list"` with the title and count alone. |
| `ColumnHeader`, `ColumnTitle` | the main column's name and its actions |
| `ColumnToolbar`, `ToolbarGroup`, `ToolbarItem` | a row of tools under the header |
| `ColumnBody`, `ColumnSection` | the scrolling content, split by hairlines |
| `ColumnFooter` | what stays in view at the column's foot: the pick between two outputs on Results |

Insets are fixed: 16px in a list, 24px in main (`inset="list" | "main"`). A list's `ColumnBody` is inset 8px and its rows bring the other 8px. `ColumnBody inset="none"` fills the column edge to edge, for an editor. A `ColumnBody` is a column's whole content, and in main it ends in 64px of room, so there is one per column: notes over an editor go in the editor's `banner`, which spaces them itself (`components/MarkdownEditor.tsx`). Its `width` is `full` or `form` (808px). A header and the body of one column share one inset, so their left edges line up. A `ColumnToolbar` starts 8px short of it, so its first icon lands on that edge. Never pad a column by hand.

### A list workbench, the Cases pattern

Copy `screens/Cases.tsx` for any screen that lists items and edits the one picked. `screens/Results.tsx` is the same pattern read-only: it lists the cases and compares the one picked.

- The selection lives in the route: read `route.params`, change it with `go(screen, params)`. Back and Forward then follow it. Never hold it in `useState`.
- The main column is `ColumnHeader` (the item's name, then Save, primary last) over `ColumnBody width="form"`, which holds `FormSection layout="stacked"` sections.
- Edits are kept with `ctx.drafts` while unsaved. Add new keys there if a new kind of item needs them.
- The add button opens an unsaved item (`new=1` in the route) that becomes real on its first save ("Add case"). It does not create one at once.
- After a delete, the next item is selected. When the last one goes, the screen shows the new-item form.
- With no items yet, the screen is `Workbench layout="single"` with the new-item form: making the first item is the next step, and an empty state would only point at it.

The list column may hold more than one list, each in a `ColumnSection`: the Skill screen lists the files, then the versions. An item of either opens in the main column, named in the route (`file`, `version`).

Below `lg` the columns stack and the pane scrolls, and a `ColumnFooter` stands at its column's end, not over the window's foot. Check every workbench at 720px wide.

## Rows of actions

- A header or a trailing row puts the primary action last.
- A left-aligned footer (`FormActions`, `ColumnFooter`) puts the primary first and a destructive action last, after `Spacer`.
- Workbench chrome uses `size="sm"` controls. A `Screen` form uses the default size.

## Lists

| Need | Use |
| --- | --- |
| Items to open in a list column | `NavButton` inside `PlainList` |
| A list to pick from while typing (the skill switcher, the composer's slash menu) | `PopoverContent size="menu" still` holding `role="option"` rows in a `role="listbox"`: one `PopoverSection` in the skill switcher, the whole popover in the slash menu, with a `role="group"` section each |
| Records with several fields | `Table`. See [data.md](data.md). |
| Records of one or two lines, not tabular | `Rows` (hairlines, never boxed) |
| The steps of a transcript | `TranscriptEvent` rows in `Rows`: when, kind, body; a tool call on `muted`, an error or a failed step on the destructive tint |
| Filters on the left, actions on the right, over a list | `ListBar` |
| A document with its contents beside it (the guide) | `GuideLayout`, `GuideBody` and the `Toc*` parts in `components/Guide.tsx`: a `TocNav` that stays in view on a wide window, a `TocCompact` line that opens on a narrow one, `TocButton` rows with a rail on the one being read |

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
- A read that failed takes the place of what it would have shown, with "Try again". The whole screen failed: `EmptyState size="screen"` with a default "Try again", the only way forward (`Editor.tsx`). One part failed: `ReadFailed size="compact"`, whose "Try again" is outline because the rest of the screen still works (`Settings.tsx`). Either "Try again" is busy ("Trying again…") while the read runs again: pass `useFetch`'s `loading` as `busy`, or as `ReadFailed`'s `retrying`.

```tsx
// Correct: screens/Results.tsx
<EmptyState
  size="screen"
  title="No runs yet"
  actions={<Button type="button" onClick={openRun}>Run {current.version}</Button>}
/>
```

## Popovers

`PopoverContent` in `components/ui/popover.tsx` takes one `size`. These exist; an unlisted one does not.

| Size | Use |
| --- | --- |
| `default` | a short list under a trigger |
| `menu` | a list to pick from, in `PopoverSection`s |
| `nav` | the sidebar on a narrow window: ink |
| `wide` | a log or a long reading |
| `form` | a few fields under their labels: Run, opened from the top bar |
| `compose` | a request to write and its reply (`Assist`, Auto refine) |
| `compose-wide` | the same for a reply as long as a file, or three rewrites side by side in a column |
| `help` | what a screen is for |
| `note` | one word and what it means |
| `field` | the list under a `ComboBox`: as wide as its field |
| `selection` | the row of actions over a selection in the editor: as wide as its buttons, no focus of its own |

Inside one: `PopoverSection` with `pad="rows"` (rows to pick from, the default) or `pad="text"`, and `scroll` for a list that may outgrow 320px; `PopoverAction` is a row that does something (an icon, what it does, its shortcut); `PopoverLabel` names a section. A `HoverCardContent` (`ui/hover-card.tsx`) is `default` (360px) or `note` (one word and what it means, `xs`), with `HoverCardSection part="head" | "body" | "foot"`.

The selection popout (`SelectionTools.tsx`) opens over four or more selected words in SKILL.md, 150ms after the selection settles, anchored to the selection itself. It is `selection` while it is a row of buttons, `compose` when the writing checks found something in the selected rule (the findings in a `PopoverSection` over the row), and `compose` or `compose-wide` once a result is in it. Its buttons are `ghost` `sm`, in one fixed order: Auto refine, Suggest changes, Help me improve. Nothing in it is yellow. It takes no focus as it opens, and Tab indents in the editor, so F6 moves the focus from the text into it (the key that moves to the next part of a window, bound in `MarkdownEditor.tsx`) and Escape goes back to the text.

Suggest changes (`Rewrites.tsx`) shows its three cards from the first frame, each with its label, what it does and its number key, and "Writing…" in place of the text, so the popout does not jump when the rewrites land. Each card is pickable unless it is the selection again; Jev's verdicts are lines on the card (`warning` for a dropped fact), never a lock. A footer section says what is happening on the left and holds Stop, or Try again, on the right. Once the rewrites are in, the first card that can be picked takes focus: 1 to 3 pick, the arrows walk the cards. A picked rewrite closes the popout, tints the new text in the editor for 1.4s (`editor/landed.ts`) and reports "Replaced the selection." with Undo on the status line; Auto refine's Replace and the side panel's Replace selection take the same path. Closing the popout stops a run still writing. The popout always works on whole lines: `sceneOf` widens any selection to its lines.

## Spacing

Spacing comes from Tailwind's 4px scale. `Screen` sets 40px between sections, `Section` 12px inside one, `FormSection` 28px above its rule. Use `Stack` for a vertical group and `Toolbar` for a horizontal one rather than a bare `flex gap-*` when one fits. Related things sit closer than unrelated ones: if two gaps are equal, the grouping is not showing.

The groups in `layout.tsx`, with every variant they have:

| Group | Variants |
| --- | --- |
| `Section`, `SectionHead` | a titled part of a `Screen` or of a main column |
| `Columns` | `count` 1 or 2 side by side |
| `Fieldset` | fields under one legend |
| `Toolbar` | `gap` `xs` 4px, `sm` 8px, `md` 12px; `justify` `start`, `end`; `wrap`; `grow`; `line` keeps a text baseline when it holds only an icon |
| `Stack` | `gap` `xs` 4px, `sm` 6px, `md` 10px, `lg` 20px |
| `PlainList` | `gap` `none`, `xs`, `sm`, `md`; `bleed` pulls it 8px past the column's inset |
| `List` | `variant` `bullet`, or `number` with the "01" mono counter; `size` `inherit`, `xs`; `font` `sans`, `mono`; `gap` `none`, `sm` |
| `FormActions` | the actions under the fields of a split form |
| `RefreshButton` | the round arrow, one `animate-turn` per press |
