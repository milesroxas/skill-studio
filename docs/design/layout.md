# Layout

The window never scrolls. `AppFrame` is a window-sized grid, the sidebar and top bar hold still, and only `Pane` (`<main id="main">`) scrolls. Every screen starts at the same left edge.

## The shell

All in `src/renderer/components/Shell.tsx`, except `StatusLine`, which has its own file. A screen never renders these: `App.tsx` does.

| Part | Rule |
| --- | --- |
| `AppFrame` | the window-sized grid: the sidebar, then `Workspace`, then `AssistantPane` when the Assistant is open |
| `Sidebar` | ink in both themes: it carries `data-surface="ink"`. 208px, 232px from the `lg` breakpoint. `SidebarBody` is its middle, scrolling on its own when the window is short. Its `foot` (the Walkthrough box) stands at its end and scrolls with it, so a short window hides the foot and never the places. |
| `SidebarSection` | the open skill's three places, one `NavItem` each: Skill, Cases, Results |
| `NavItem` | one place. `meta` is its count, `xs` sans at 55%, tabular: the cases. `dot` is unsaved work, in `warning`. |
| `SidebarFooter` | Library, Guide, Settings, with a running job above them. `lead` holds the update. |
| `Workspace` | the column beside the sidebar: the top bar over the pane |
| `AssistantPane` | the Assistant's panel: a 360px column beside `Workspace` on a wide window, over its right edge on a narrow one |
| `TopBar` | `HistoryNav` (back and forward), `Heading level="page"`, then `TopBarEnd` (`App.tsx` only). Below `sm` a menu button leads it and opens the sidebar as `PopoverContent size="nav"`. The place's name never shrinks. Below `lg` the bar gives way from its right end in this order: the warning hides (Run's panel says the same before a run), the next step drops "Next:" (a screen reader still hears it), the gaps close, and last the step's name truncates, with the whole name in its title. |
| `TopBarEnd` | the bar's right end, in three groups, 20px apart (12px below `lg`): `TopBarWarning` while the skill lacks Jev's key, then `TopBarGroup kind="actions"` (the next step and Run, 8px apart), then `TopBarGroup kind="tools"` (help and the Assistant, 4px apart, 12px under a finger). More room between the groups than inside them, so the eye reads three things. Every control in it is 32px high. |
| `TopBarWarning` | "No Jev key": a `ghost` `sm` button with the warning `Dot` before the state, as `Status` says one. It opens where it is fixed. Never a filled badge: next to the yellow step a fill reads as one more thing to press. |
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

A region is a part of the page: a column, a section, a group of fields. It ends at a hairline and has no fill, radius or shadow of its own. `Card` (`components/ui/card.tsx`) is for an object a person compares or picks up. Two things use it: an output (`OutputCard`, two of them side by side on Results), and a rewrite to pick in the selection popout (`Rewrites.tsx`, a button with the card's surface, since the whole object is the action). The same surface (`rounded-chin border bg-card`) bounds a `Disclosure variant="card"`, a `DisclosureList`, an `Alert`, and a figure or a table in the guide: each is one object standing in a flow of text, never a region of the page. The stage on Results (see [The stage](#the-stage)) is the one ground with a fill of its own: it holds an output as a browser draws it, as a proof is laid on a light table.

`Disclosure` (`components/Disclosure.tsx`) folds a block behind one line, in four variants. `plain` is a line of text that opens in place. `section` is the same line between a form's sections, folding parts of the form: what it opens is spaced as the column's sections are (32px apart, 16px under the line) and fades in with `animate-ink`, since a whole part of the form arrives at once. A case's optional parts use it. `card` is one file of a diff, on its own bordered block (a version's changes on the Skill screen). `row` is one row of a `DisclosureList`: the changes an Assistant reply proposes, a title over a line of detail, with one control at the end in a slot of fixed width so the controls line up down the list. A row with nothing to open keeps the chevron's slot empty, so the titles line up too.

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
| `Column kind` | `list` (260px), `side` (260px, a list beside an item that is the screen's point: after the item once the columns stack, as the Skill screen's files follow the document), `main` |
| `Column over` | a picture is held over a column that takes a drop: the column takes `bg-accent` at 60% until it is dropped or leaves. The case's main column, where a picture dropped anywhere joins the case. A note that changes while a picture is dragged would move everything under it. |
| `ListHeader` | a list column's title, count and add button. A list nothing is added to (the cases on Results) is a `ColumnHeader inset="list"` with the title and count alone. |
| `ColumnHeader`, `ColumnTitle` | the main column's name and its actions |
| `ColumnToolbar`, `ToolbarGroup`, `ToolbarItem` | a row of tools under the header |
| `ColumnBody`, `ColumnSection` | the scrolling content, split by hairlines |

Insets are fixed: 16px in a list, 24px in main (`inset="list" | "main"`). A list's `ColumnBody` is inset 8px and its rows bring the other 8px. `ColumnBody inset="none"` fills the column edge to edge, for an editor. A `ColumnBody` is a column's whole content, and in main it ends in 64px of room, so there is one per column: notes over an editor go in the editor's `banner`, which spaces them itself (`components/MarkdownEditor.tsx`). Its `width` is `full` or `form` (808px). A header and the body of one column share one inset, so their left edges line up. A `ColumnToolbar` starts 8px short of it, so its first icon lands on that edge. Never pad a column by hand.

### A list workbench, the Cases pattern

Copy `screens/Cases.tsx` for any screen that lists items and edits the one picked. `screens/Results.tsx` is the same pattern read-only: it lists the cases and compares the one picked.

- The selection lives in the route: read `route.params`, change it with `go(screen, params)`. Back and Forward then follow it. Never hold it in `useState`.
- The main column is `ColumnHeader` (the item's name, then Save, primary last) over `ColumnBody width="form"`, which holds `FormSection layout="stacked"` sections. Save is `default` only while pressing it saves something, and `ghost` and disabled otherwise, so a saved item's header has no filled slab in it (the Skill screen's Save does the same).
- An item's optional parts fold under one `Disclosure variant="section"` line after the fields it cannot do without. The line names every part it holds ("A good answer, checks and length", and size where it shows). It is open while any part holds something and closed while all are empty, on a new item and a saved one alike, so saving never changes the form's shape. The reader's own open or close wins until they leave the item; filling it from an example opens it again (`open`/`onOpenChange` on `Disclosure`).
- Examples to start from sit under the first field in a `Disclosure` ("Start from an example"), as an `ExampleList`: each row fills the form in place and ends in "Use". The kind of example comes from how the skill is graded; only a skill graded as generic shows the `Segmented` that picks one.
- Edits are kept with `ctx.drafts` while unsaved. Add new keys there if a new kind of item needs them.
- The add button opens an unsaved item (`new=1` in the route) that becomes real on its first save ("Add case"). It does not create one at once.
- After a delete, the next item is selected. When the last one goes, the screen shows the new-item form.
- With no items yet, the screen is `Workbench layout="single"` with the new-item form: making the first item is the next step, and an empty state would only point at it.

The list column may hold more than one list, each in a `ColumnSection`: the Skill screen lists the files, then the versions. An item of either opens in the main column, named in the route (`file`, `version`).

Below `lg` the columns stack and the pane scrolls, a `side` column after the main one. A `ColumnToolbar` sticks under its header only from `lg`: stacked, it scrolls with the document. A header whose actions leave its title no room wraps instead (the Skill screen's: `max-lg:flex-wrap` on the header, `max-lg:basis-full` on its `ColumnTitle`), so the file's name takes the first row. Check every workbench at 720px wide.

## The stage

An output a reader looks at rather than reads, a page or a picture, is judged on the stage (`components/Stage.tsx`), above the cards on Results (`Flip` in `components/Comparison.tsx`). The stage is a ground, not a card: `bg-muted` with a container's corners, 60% of the window high, the output standing on it on the artifact's own white with `shadow-raised`.

- **A page** is drawn at the width the reader picks and scaled down to fit, never up: `STAGE_WIDTHS` in `src/renderer/stage.ts` is the closed set, Phone 390, Tablet 820, Desktop 1280 and Fit (the stage's own width). The choice is kept for the next case and the next launch. A case with a size (`bench.size`) adds one more, "Case, 1440", first, and its page opens at it. A page runs its own scripts, sandboxed (see `SECURITY.md`).
- **A picture** is fitted whole, never enlarged.
- **Any other file** (code, Markdown) stands on `bg-card` and scrolls, through `ArtifactView`.
- **Both outputs** are on the stage at once, one in view. Flipping is instant, with no transition: the change between A and B is what the reader is looking for. Two pages scroll together, so a flip lands on the same part of both.
- **One at a time, full width.** Two frames side by side show a desktop page at about 38% on a 1280px window, too small to judge type and spacing, and a swipe line across one frame hides half of each output and fails when the two layouts differ. Text outputs stay side by side, where reading both at once is the point.

The bar over it is two `Toolbar`s. The first: which output is in view, a `Segmented` of A and B with each version and total, "Press A or B to flip" as a `Hint`, and **Open full size** at the end (ghost). The second: the file, when an output wrote more than one, the width for a page, and the size line in `Text font="mono" size="xs" tone="muted" tabular` ("1280 px · shown at 55%"). The A and B keys flip the stage anywhere on the screen unless a field, an editor, a menu or a dialog has the focus.

## Rows of actions

- A header or a trailing row puts the primary action last.
- A left-aligned footer (`FormActions`) puts the primary first and a destructive action last, after `Spacer`.
- Workbench chrome uses `size="sm"` controls. A `Screen` form uses the default size.

## Lists

| Need | Use |
| --- | --- |
| Items to open in a list column | `NavButton` inside `PlainList`. Its first line is `NavButtonTitle`: the name, truncated, and the `warning` dot after it while the item has unsaved changes. |
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
| `note` | one word and what it means; what an underlined word in SKILL.md set off (`FindingNote`) |
| `field` | the list under a `ComboBox`: as wide as its field |
| `actions` | a narrow table row's actions (`RowActions`): `role="menu"`, as wide as its longest label, arrows, Home and End move between items, opened from a `ghost-muted` button that stays lit while it is open |
| `selection` | the row of actions over a selection in the editor: as wide as its buttons, no focus of its own |

Inside one: `PopoverSection` with `pad="rows"` (rows to pick from, the default) or `pad="text"`, and `scroll` for a list that may outgrow 320px; `PopoverAction` is a row that does something (an icon, what it does, its shortcut); `PopoverLabel` names a section. A `HoverCardContent` (`ui/hover-card.tsx`) is `default` (360px) or `note` (one word and what it means, `xs`), with `HoverCardSection part="head" | "body" | "foot"`.

The selection popout (`SelectionTools.tsx`) opens over four or more selected words in SKILL.md, 150ms after the selection settles, anchored to the selection itself. It is `selection` while it is a row of buttons, `compose` when the writing checks found something in the selected rule (the findings in a `PopoverSection` over the row), and `compose` or `compose-wide` once a result is in it. Its buttons are `ghost` `sm`, in one fixed order: Auto refine, Suggest changes, Help me improve. Nothing in it is yellow. It takes no focus as it opens, and Tab indents in the editor, so F6 moves the focus from the text into it (the key that moves to the next part of a window, bound in `MarkdownEditor.tsx`) and Escape goes back to the text.

A word the writing checks underlined opens a `note` popover under it (`FindingNote.tsx`) once the pointer has rested on it for 150ms, and the note goes 120ms after the pointer leaves both: the same beats as `HoverCard`. With one note open, the next word's opens at once. The note lists the findings with `FindingList`, the same lines the selection popout shows, takes no focus, and closes on typing, scrolling, Escape or a press elsewhere. While it is open the words take the warning tint, 10% (20% in the dark), fading in and out over 150ms. The editor decides when it opens (`editor/graded.ts`); the component only draws it.

Suggest changes (`Rewrites.tsx`) shows its three cards from the first frame, each with its label, what it does and its number key, and "Writing…" in place of the text, so the popout does not jump when the rewrites land. Each card is pickable unless it is the selection again; Jev's verdicts are lines on the card (`warning` for a dropped fact), never a lock. A footer section says what is happening on the left and holds Stop, or Try again, on the right. Once the rewrites are in, the first card that can be picked takes focus: 1 to 3 pick, the arrows walk the cards. A picked rewrite closes the popout, tints the new text in the editor for 1.4s (`editor/landed.ts`) and reports "Replaced the selection." with Undo on the status line; Auto refine's Replace and the side panel's Replace selection take the same path. Closing the popout stops a run still writing. The popout always works on whole lines: `sceneOf` widens any selection to its lines.

## Spacing

Spacing comes from Tailwind's 4px scale. `Screen` sets 40px between sections, `Section` 12px inside one, `FormSection` 28px above its rule. The first `FormSection` has no rule, and neither has one right after an `Alert`: the alert's edge already divides. A `FormSection`'s hint keeps to 48ch beside the fields (`split`) and 72ch over them (`stacked`). Use `Stack` for a vertical group and `Toolbar` for a horizontal one rather than a bare `flex gap-*` when one fits. Related things sit closer than unrelated ones: if two gaps are equal, the grouping is not showing.

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
