# Layout

The window never scrolls. `AppFrame` is a window-sized grid, the sidebar and top bar hold still, and only `Pane` (`<main id="main">`) scrolls. Every screen starts at the same left edge.

## The shell

All in `src/renderer/components/Shell.tsx`, except `StatusLine`, which has its own file. A screen never renders these: `App.tsx` does.

| Part | Rule |
| --- | --- |
| `AppFrame` | the window-sized grid: the sidebar, then `Workspace`, then `AssistantPane`, each panel as wide as it is drawn (see [Panels that fold](#panels-that-fold)) |
| `Sidebar` | ink in both themes: it carries `data-surface="ink"`. A `FoldPanel` from `sm`: 232px until dragged, folded to a 48px strip of its places (`SidebarRail`, one `RailItem` each, the app's own at its foot). Its top is a 48px drag strip holding the fold button and the mark. `SidebarBody` is its middle, scrolling on its own when the window is short. Its `foot` (the Walkthrough box) stands at its end and scrolls with it, so a short window hides the foot and never the places. |
| `SidebarSection` | the open skill's three places, one `NavItem` each: Skill, Cases, Results |
| `NavItem` | one place. `meta` is its count, `xs` sans at 55%, tabular: the cases. `dot` is unsaved work, in `warning`. |
| `SidebarFooter` | Library, Guide, Settings, with a running job above them. `lead` holds the update. |
| `Workspace` | the column beside the sidebar: the top bar over the pane |
| `AssistantPane` | the Assistant's panel: a `FoldPanel` beside `Workspace` from `lg`, 360px until dragged, folded to a 48px strip with the chat's icon. Its fold button stands where `PanelHeader`'s close button stands on a narrow window, where the panel lies over the page's right edge and is gone when closed. Its contents are there only while it is open or folding. It holds the chat or Help me improve, in a `PanelView`: the view that replaces the other slides 12px in from the side it was pushed from (Help me improve from the right, the chat from the left) over 200ms; the first view rests, since the panel plays its own arrival. Help me improve's `PanelHeader` takes `back`, an arrow before the title that returns to the chat. |
| `TopBar` | `HistoryNav` (back and forward), `Heading level="page"`, then `TopBarEnd` (`App.tsx` only). On a Mac with the sidebar folded the sidebar's fold button stands on the bar, right of the window's buttons, and the bar's padding grows with it (`--fold-lead`, set by `panels.ts`). The bar leaves a hole in its drag region under the button (`--fold-hole`), since Electron lets a drag region later in the page take a click from a button before it. No sheet, menu or dialog is a drag region either, as each may lie over the bar; a dialog's scrim over the bar still moves the window (`styles.css`). Below `sm` a menu button leads it and opens the sidebar as `PopoverContent size="nav"`. The place's name never shrinks. Below `lg` the bar gives way from its right end in this order: the warning hides (Run's panel says the same before a run), the next step drops "Next:" (a screen reader still hears it), the gaps close, and last the step's name truncates, with the whole name in its title. |
| `TopBarEnd` | the bar's right end, in three groups, 20px apart (12px below `lg`): `TopBarWarning` while the skill lacks Jev's key, then `TopBarGroup kind="actions"` (the next step and Run, 8px apart), then `TopBarGroup kind="tools"` (help, and below `lg` the Assistant, 4px apart, 12px under a finger). From `lg` the Assistant opens from its own strip. More room between the groups than inside them, so the eye reads three things. Every control in it is 32px high. |
| `TopBarWarning` | "No Jev key": a `ghost` `sm` button with the warning `Dot` before the state, as `Status` says one. It opens where it is fixed. Never a filled badge: next to the yellow step a fill reads as one more thing to press. |
| `Pane` | `layout="page"` for a `Screen` (the default), `layout="flush"` for a `Workbench` |
| `StatusLine` | under the pane: what just happened, in a 48px strip kept for it (a fact for a moment, a failure until dismissed), the top bar's mirror, ink while it speaks. Fed by `ctx.report`. See [data.md](data.md). |

### Panels that fold

The sidebar, a workbench's list column and the Assistant can be dragged wider or narrower and folded to a 48px strip at their side (`components/FoldPanel.tsx`, moved by `renderer/panels.ts`, numbers in `renderer/fold.ts`). Each remembers its width and whether it is open.

| Part | Rule |
| --- | --- |
| Fold button | `ghost-muted` `icon-sm`, a panel outline with a chevron the way the panel will go; the chevron turns over 200ms when it folds. It stands 8px in from the panel's fixed side, 8px down, the same place open or folded, so the second click lands where the first did. The sidebar's stands right of the window's buttons on a Mac. Its keys are in its hover text: `⌘\` the sidebar, `⌥⌘\` the list, ⌘J the Assistant. |
| Divider | 8px to grab over the panel's edge; a 2px line in `--ring` shows at 30% once the pointer rests 120ms, 75% while dragged or focused. Arrows resize it by 16px (64px with Shift), Enter folds or opens it, Home and End go to its narrowest and widest, all at once. A click on a folded panel's divider opens it; a double-click puts an open one back to its first width. |
| Strip | the folded panel: a click anywhere on it opens the panel. The sidebar's shows its places; a list's, its count; the Assistant's, the chat's icon. While the panel passes under it, it is frosted glass. |
| Sizes | sidebar 180 to 320px, list 200 to 420px, Assistant 300 to 560px. A drag leaves the page's own column 400px. A release within 20px of the first width lands on it. |

How it moves:

- The width is the one thing that moves, by spring, so a release carries the hand's speed and a panel sent back mid-flight turns round. A click is critically damped and rests by about 350ms; a release overshoots a few pixels and settles. Where a release lands is where the throw would carry it: the release point plus 150ms of the hand's speed. Pulled 72px past its narrowest, or flicked shut, a panel folds.
- Every other layer is drawn from one number, how far open it is, read from the width, so nothing can fall out of step: the strip's icons leave first, the contents come in while the strip lifts away, and folding plays the same in reverse. While a panel changes state its contents ride its moving edge and slide under the strip, cut 32px short of the fold button, so the moving edge never slices a line.
- Below its breakpoint a panel steps aside: the sidebar is the top bar's menu below `sm`, the list stacks over the item below `lg`, and the Assistant lies over the page.

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

A region is a part of the page: a column, a section, a group of fields. It ends at a hairline and has no fill, radius or shadow of its own. `Card` (`components/ui/card.tsx`, `rounded-md bg-card shadow-raised`) is for an object a person compares or picks up. Two things use it: what an output missed (`OutputCard`, two of them side by side on Results), and a rewrite to pick in the selection popout (`Rewrites.tsx`, a button with the card's surface, since the whole object is the action). The same corners and fill with a border in place of the shadow (`rounded-md border bg-card`) bound a `Disclosure variant="card"`, a `DisclosureList`, an `Alert`, the checks the assistant suggests on a case, and a figure or a table in the guide: each is one object standing in a flow of text, never a region of the page. The stage on Results (see [The stage](#the-stage)) is the one ground with a fill of its own: it holds an output as a browser draws it, as a proof is laid on a light table.

`Disclosure` (`components/Disclosure.tsx`) folds a block behind one line, in four variants:

| Variant | Use |
| --- | --- |
| `plain` | a line of text that opens in place |
| `section` | the same line between a form's sections, folding a part of the form, such as how a case's answer is judged. What it opens is spaced as the column's sections are (32px apart, 16px under the line and 16px after its last part) and fades in with `animate-ink`, since a whole part of the form arrives at once |
| `card` | one file of a diff, on its own bordered block: a version's changes on the Skill screen |
| `row` | one row of a `DisclosureList`: a title over a line of detail, with one control at the end in a slot of fixed width, so the controls line up down the list. A row with nothing to open keeps the chevron's slot empty, so the titles line up too |

A `Disclosure` takes `detail`: what the block holds, said after its line in `xs` `faint` while it is closed ("7 checks"), and gone once it is open and shows them.

What the model thought before an Assistant reply (with Claude Code, Codex, or an Anthropic key on a model that thinks by default, so showing it costs nothing more) folds under a `plain` `Disclosure` over the reply: "Thinking…", pulsing, while it thinks, then "Thought for 12s" once the reply begins, or "Thought" when it stopped first. It is closed until the reader opens it, and opens on `Prose density="thinking"`. A reply with no thinking shows no line.

The changes an Assistant reply proposes are `row`s. A draft from Help me improve is the same row (`RowAction` in `Change.tsx`):

- It reads SKILL.md, how the draft stands against the guide, its length in words, and Apply. Once the rule reads as the draft, Apply becomes Applied.
- It opens to a `WordDiff size="row"` against the rule as it reads now, by phrase. Changes a word or two apart on one line join, so a rewrite does not read word by word. A line break keeps them apart.
- The newest opens on arrival, and an earlier one folds.

```tsx
// Correct: screens/Settings.tsx
<FormSection title="Appearance">
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
| `Column kind` | `list`, `side` (a list beside an item that is the screen's point: after the item once the columns stack, as the Skill screen's files follow the document), `main` |
| `Column fold` | a `list` or `side` column that folds from `lg` ([Panels that fold](#panels-that-fold)): its panel (`list`, which Cases and Results share, or `files`), its name after "Hide", and the count its strip shows. Its `ColumnHeader` starts its title 44px in, after the fold button. |
| `Column scroll` | `self` (the default): the column scrolls. `parts`: the `SplitPane`s under its header scroll, each on its own |
| `Column over` | a file is held over a column that takes a drop: the column takes `bg-accent` at 60% until it is dropped or leaves. The case's main column, where a picture, file or folder dropped anywhere joins the case's files (`useFileDrop` in `renderer/drop.ts`). A note that changes while a file is dragged would move everything under it. |
| `ListHeader` | a list column's title, count and add button: a plus. A list that adds two kinds of thing names each by its icon (`addIcon`) and takes the second as `also`: the Skill screen's files add a file and a folder. A list nothing is added to (the scores on Results) is a `ColumnHeader inset="list"` with the title alone, named for what it shows that the Cases list does not: "Scores". |
| `ColumnHeader`, `ColumnTitle` | the main column's name and its actions |
| `ColumnToolbar`, `ToolbarGroup`, `ToolbarItem` | a row of tools under the header |
| `ColumnLead` | the head of a main column that opens with a figure: what the column comes to, on `bg-muted`, between `ColumnHeader` and `ColumnBody`. It ends at a hairline, or at the band that closes it. One per column, and only All cases has one: see [The head of All cases](#the-head-of-all-cases) |
| `ColumnBody`, `ColumnSection` | the scrolling content, split by hairlines |
| `ColumnRoom`, `Split`, `SplitPane`, `SplitSection`, `Railed` | the content of a `Column scroll="parts"`: see [A split column](#a-split-column) |

Insets are fixed: 16px in a list, 24px in main (`inset="list" | "main"`). A list's `ColumnBody` is inset 8px and its rows bring the other 8px. The first row of every list column starts 8px under its header: a `ColumnSection` with no title sits 8px inside its rules, a titled one 20px, so its title stands apart from the rows above. `ColumnBody inset="none"` fills the column edge to edge, for an editor. A `ColumnBody` is a column's whole content, and in main it ends in 64px of room, so there is one per column: notes over an editor go in the editor's `banner`, which spaces them itself (`components/MarkdownEditor.tsx`). Its `width` is `full` or `form` (808px). A header and the body of one column share one inset, so their left edges line up. A `ColumnToolbar` starts 8px short of it, so its first icon lands on that edge. Never pad a column by hand.

### A list workbench, the Cases pattern

Copy `screens/Cases.tsx` for any screen that lists items and edits the one picked. `screens/Results.tsx` is the same pattern read-only: it lists the cases and compares the one picked. Its list is two `ColumnSection`s: **All cases**, every case at once, then the cases, so a rule sets the summary apart from the items.

- The selection lives in the route: read `route.params`, change it with `go(screen, params)`. Back and Forward then follow it. Never hold it in `useState`.
- The main column is `ColumnHeader` (the item's name, then Save, primary last) over `ColumnBody width="form"`, which holds `FormSection layout="stacked"` sections. Cases itself lays its column out by the room it has: see [A split column](#a-split-column). Save is `default` only while pressing it saves something, and `ghost` and disabled otherwise, so a saved item's header has no filled slab in it (the Skill screen's Save does the same).
- An item's optional parts fold under `Disclosure variant="section"` lines after the fields it cannot do without, one line per part, 6px apart: on a case, "A good answer and checks", then "Length and size". A new kind of part is one more line. A line names what its fold holds, and closed it says how much in its `detail` ("7 checks", "30 to 120 words, 1280 × 800 px"). A part that decides what the others are about comes first in its fold and first in the line: a case's **File to grade**, which shows only for a case whose answers came as both a page and a picture, stands before A good answer and the checks, since each of those is about that file. A fold is open while its part holds something and closed while it is empty, on a new item and a saved one alike, so saving never changes the form's shape. The reader's own open or close wins until they leave the item; filling it from an example opens it again (`open`/`onOpenChange` on `Disclosure`).
- The checks the assistant suggests for a saved case (`st propose`) stand under its checks, after **Add a check** (`SuggestedChecks` in `components/SuggestedChecks.tsx`), only while one waits. See [Suggested checks](#suggested-checks).
- Examples to start from sit under the first field in a `Disclosure` ("Start from an example"), as an `ExampleList`: each row fills the form in place and ends in "Use". The kind of example comes from how the skill is graded; only a skill graded on its rules and checks alone shows the `Segmented` that picks one.
- Edits are kept with `ctx.drafts` while unsaved. Add new keys there if a new kind of item needs them.
- The add button opens an unsaved item (`new=1` in the route) that becomes real on its first save ("Add case"). It does not create one at once.
- After a delete, the next item is selected. When the last one goes, the screen shows the new-item form.
- With no items yet, the screen is `Workbench layout="single"` with the new-item form: making the first item is the next step, and an empty state would only point at it.

The list column may hold more than one list, each in a `ColumnSection`: the Skill screen lists the files, then the versions. Sections are divided by a rule, and the last has none, so a section is a direct child of its column: one that is a landmark is `as="nav"` with a `label`, never wrapped in one. A section's `hint` is only for what the list cannot show, such as edits no version holds yet. An item of either opens in the main column, named in the route (`file`, `version`). The versions show the newest five; once three or more are older, those fold under one `Disclosure` line, "8 older versions". It opens by itself when the version open in the main column is one of them. Last comes a `Disclosure`, "Recently deleted", only while the skill's trash holds something (`skill.trashed`), with what it holds as its `detail` ("2 versions and 1 run", `deletesLine` in `model.ts`). It opens on `Rows`: each row names what was deleted ("v3", or "A run on v3", `deletedName`), then "Deleted Nov 14, 15:02" in `xs` muted, and ends in **Undo**, `ghost-muted` at `xs`, busy ("Undoing…") until the undo lands, with the other rows' Undo disabled meanwhile. Not a `NavButton`: a deleted thing has nothing to open. Not `RowActions`: it folds by the width of a `Table`, and a list column has none. The undo reports on the status line as the status line's own Undo does ("v3 is back", "Run restored"), and a refusal is said in the store's words. The list is read again whenever the skill is: after a delete, an undo and a reload.

Below `lg` the columns stack and the pane scrolls, a `side` column after the main one. A `ColumnToolbar` sticks under its header only from `lg`: stacked, it scrolls with the document. A header whose actions leave its title no room wraps instead (the Skill screen's: `max-lg:flex-wrap` on the header, `max-lg:basis-full` on its `ColumnTitle`), so the file's name takes the first row. Check every workbench at 720px wide.

### The head of All cases

All cases opens with a `ColumnLead`: the counts of cases on their checks (`ChecksHead` in `components/CaseChecks.tsx`), or, for a skill none of whose cases can be read on checks, the lift (`LiftFigure`, [brand.md](brand.md)); then `Coverage` (`components/Coverage.tsx`), which says how many cases are checked on the version a run would test now.

The counts read each case's newest answer against its answer without the skill, or against its answer before, on its checks alone (`case-checks.ts`, `caseResult` in `domain/case-result.ts`):

- The eyebrow, "Cases by checks met" in caps, `muted`. At its right on the same line, a `Segmented` reads **Without the skill** / **The version before**. The choice is kept in the address (`against=before`; without the skill when it is absent), so it holds as rows open and close, and Back returns to it.
- Three counts of cases, each a numeral at the `display` step with a one-word label after it on its baseline: "better", "same", "worse". The numeral of "better" is `foreground`, of "same" `muted-foreground`, of "worse" `destructive` above nought; a nought is `muted-foreground` at 35%, and its word `faint`. A screen reader hears the figure as one sentence: "Cases by checks met: 1 better, 4 same, 0 worse."
- One line under them in `xs`: the checks the compared cases moved by, added up, as a `Delta` and "check" or "checks" ("No change" when nought), a middle dot, and the count of cases compared. The count has the dotted underline (`EXPLAINED`) and opens a `help` popover of `TotalDetailSection`s (`casesNotes` in `case-checks.ts`): how a case is read, then all checks added up ("Across the 5 cases compared, answers met 11 of 11 checks, from 10."), the score out of 100 over the same cases, and, only where some case ran once on each side and moved by one check, "May be chance". Nothing else is written in the head.
- Better, the same and worse are read on each check's weight (`caseResult`); the change beside them counts each check once, so it matches the counts in the rows.

- The head has a ground of its own, `bg-muted`, so the page reads in three steps: the head, the band that closes it, the list on the page's ground. The working area stays the lightest surface.
- While a case is behind, `Coverage` is a band across the column: `bg-primary` under `text-primary-foreground`, square to the column, never a boxed alert. It is the page's inverse, ink in the light theme and porcelain in the dark, so it stands as far from the page in both. It holds one sentence at `ui`, its count in medium and the rest at 70%, and one `inverse` `sm` button that opens Run on the cases behind ([buttons.md](buttons.md)).
- A case behind whose run on that version only waits to be graded needs no run. The band's second sentence then says how many wait, "1 is waiting to be graded.", in place of the one on earlier scores, and its button runs the others. Once only such cases are behind, the button reads **Grade N runs**.
- The band has no large type, no meter and no yellow. The counts or the lift over it hold the head's display type, the table under it shows the same split in its groups, and yellow is the top bar's.
- Once every case is checked the band is gone and one plain line stands in its place, so the band is seen when it comes.
- It scrolls with the page. Run, in the top bar, never leaves view.

Under the cases, the runs are a `Section rule`: a hairline across the column, since a gap alone would read as more of the table above.

### A split column

A main column whose content is laid out by the column's own width is `Column scroll="parts"`: `ColumnHeader`, then `ColumnRoom` holding a `Split`. The layout is picked from the width of `ColumnRoom` (`useWidth` in `hooks.ts`), never from the window's: the sidebar, the list and the Assistant all take from the column, so opening the Assistant steps the layout down. A layout that changes what is on the page cannot be a CSS breakpoint, since each field is drawn once.

| Part | Use |
| --- | --- |
| `Split layout` | `one`: the whole item in one pane. `pair`: the form (688px at most), then something to read that takes the spare width. `trio`: the form in two halves (400 to 560px, 440 to 640px), then something to read |
| `SplitPane kind` | `form` (the default): form sections, 640px at most. `page`: the whole item, which sets its own width, as a `Railed` form does. `bare`: `SplitSection`s, which bring the inset |
| `SplitSection part` | `lead`: a short strip over the pane's content, ruled off from it. `body`: the content, 960px at most |
| `Railed` | a form (808px) with a still column of facts about it at its side (200px, 48px off) that stays in view while the form scrolls. Its `label` names the rail for a screen reader |

Split are divided by hairlines and each scrolls on its own, so what is read holds still while what is written moves. A pane is never wider than reads well: spare width goes to the last pane, and past its 960px it stays empty. Everything is left-aligned.

Cases is the one screen that uses one. Its case column has four layouts, by the column's width:

| Column | Layout |
| --- | --- |
| under 880px | `one`: the folded form, with the run's size as a meter in the header (`RunSizeMeter`) |
| from 880px | `one`, `Railed`: the folded form with the run's size and the last run beside it (`RunSizeRail`) |
| from 1080px | `pair`: the folded form, then the last answer to the case under the run's size (`RunSizeStrip` over `LastAnswer`) |
| from 1560px | `trio`: the task, then how the answer is judged with nothing folded (A good answer, Checks, Length and size as sections), then the last answer |

- The rail and the strip hold facts about the whole case that nobody types: the form is what is typed. Anything new in them starts as one line or folded.
- The last answer is the one Results opens the case on (`lastAnswer` in `model.ts`), with its score, its version, and what an attempt cost. Its page or picture is a figure (`rounded-md border bg-card`). Before a first run the pane holds one line.
- Below `lg` the columns stack and the pane scrolls, as in every workbench: only `one` fits there.

### Suggested checks

The checks the assistant suggests for a case are one object under the case's checks on Cases: `rounded-md border`, bounded as an `Alert` is ([Regions are never cards](#regions-are-never-cards)). It shows only for a saved case with a suggestion still waiting, and only that case's own: one for every case has no place on Cases.

- **The band**, its head, on `bg-muted`: the turning ribbon ([brand.md](brand.md#the-turning-ribbon)), "Suggested by the assistant" in caps, `muted`, then the count in medium ("3 checks"), a middle dot and how many an answer missed ("2 missed by an answer", or "met by every answer"), `muted`. No button: nothing in it opens or closes. A label and its facts, as the run's size is said beside it: no sentence. The words set the band's height, 8px over and under them, and the ribbon fills its 112px column. Under 512px of its own width the ribbon goes and the words take its place.
- **The list** is always shown under the band, on `bg-card` past one hairline: there is no Show or Hide, so the page changes height only when something the person caused arrives or leaves, never on a click that only looks. The sheet keeps 4px more at its top and foot than a row's own 12px: a band weighs more than a hairline, so the first row needs more room under it.
- **A row**, one per suggestion, the ones an answer missed first, divided by hairlines: its words in `ui`, then **Add** (`outline`, `xs`, with a plus) and the cross that turns it down (`ghost-muted`, `icon-xs`) on the words' first line, the cross's glyph on the band's 16px inset. Under the words, **Why** (`ghost-muted`, `xs`, with a chevron that turns down while it is open) and how the answers read stood on it ("Missed by 2 of 3 answers"), `xs` `muted`. A row has no number: the case's checks just above are numbered, and a second count beside them would read as theirs.
- **Why** opens, under the words, the reason in `ui` `muted`, then the words the check stands on in an `Excerpt` under "Asked for in brief.md", and the words of the answer that missed it under "v1 · Second draft wrote", with **Open that answer** at that line's end, which opens it on Results.
- **Add** puts the suggestion in the case's checks as a typed check, unsaved, so Save and Discard hold it like any edit. A suggestion a check of the case says already, in other case or spacing, is not shown: the one added goes from the list, and comes back if its check is taken out.
- **Turn down** is written at once and reports "Turned down" on the status line with **Undo**, which proposes it again ("Suggested again"). Taken once another skill is open, the Undo says to open the skill again (`inSkill`). While one is turned down the other rows' buttons wait.
- **Write checks with AI**, once the case has runs, asks the assistant to read what the latest runs wrote and suggest checks here (`useReadRuns`, the `proposals.suggest` operation), on the model chosen in Settings. Before a first run there is nothing to read, and it writes checks from the prompt into the list, as it always has. While it reads, the button waits and **Stop** beside it ends the reading, as Stop in the list of jobs does; the band is the one place that says what is happening, and the status line says how it went. A case whose answers are long is asked about first: "Read these long answers?", with how many usual readings it counts as.
- The list is read again whenever the skill is, so a `st propose` run outside the app shows on the next reload.
- **How it moves** ([brand.md](brand.md#motion)), each step after the one before, so the eye always has one place to look:
  - Asked for, the call-out unfolds under the checks, the ribbon turning and "Reading the latest runs" in the band. Only the call-out moves: the button only waits.
  - When the reading lands, the call-out holds its place until what it found is read: it never folds away and comes back. Then, in one movement, the band's line ticks over to the count and the list unfolds under it with its rows.
  - **Add** and the cross fold their row away in 180ms, and the count ticks. **Add**'s check unfolds into the case's checks at the same time, so nothing under them jumps. The last row folds the whole call-out away after it, the section's gap above it with it. **Undo** unfolds the row back in its place.
  - **Why** unfolds the reason under the row and folds it back.
  - A call-out there when the case opens rests. With movement reduced each change lands at once.

### A row in a list column

Every item listed on the left of a screen is one `NavButton` (`components/NavButton.tsx`), whatever it is: a case on Cases, a score on Results, a file or a version on Skill. Its parts, in this order:

```
Title, two lines at most ......... end
One quiet line about it
```

| Part | Rule |
| --- | --- |
| `NavButtonTitle` | the item's name, `ui`, on two lines at most, so names that start alike still show the words that tell them apart, wrapped so the second line never holds one word alone. Opening the item shows the rest of a longer name in its column's header. `font="mono"` for a name that is a literal, a file's name. The `warning` dot follows it while the item has unsaved changes. `lead` is a chevron before the name, for a row that folds what is under it, and `tone="muted"` quiets the name of that same row: a folder in the file tree, and nothing else. |
| `NavButtonMeta` | one fact the reader needs before opening it, `xs` muted, one line, cut short: "3 checks", "Nov 3", "Up 11 from v0". Leave it out when there is none (a file). |
| `end` | at most one value, on the title's first line at the row's end: a score, as `ListScore`. Never two numbers, never an action. A case on Cases has none: the list is for writing, and a case changed since its run would show a score for words it no longer holds. |

Rows are 36px at the least, 6px above and below their text, 2px apart. Pointing at a row tints it at half the open row's fill, so pointing never reads as opening, and the tint fades in over 150ms. The open row takes the full `accent` fill at once: a click or an arrow key moves it, and it must keep up. A score chip on the open row takes a hairline edge, since a grey chip on the grey fill would vanish.

A row that joins the list while the reader watches (a case saved for the first time or duplicated, a new version, the row of edits, a case's first output) fades in with `animate-ink`, by `useArrivals` in `motion.ts`. The rows there when the list opens rest. An unsaved dot that comes while the reader types stamps in (`Dot stamp`), and a score that changes in view, as a run is graded, comes up a few pixels (`animate-tick`). With movement reduced, none of it moves.

### Versions and edits

A version exists once a run has kept it, and only then has a number on the page. Save writes a file and makes no version, so the page never says a version is "saved": a run **keeps** one, and so does the Assistant's **Keep**.

- Files saved since the newest version are a row of their own at the top of the versions list: "Edited since v1", with "Not run yet" under it (`editedSince` in `model.ts`). Its title carries the unsaved dot while a file holds unsaved text, since a run tests the files as saved. It opens the file's Changes, in the open file when that has changes, else in the first file that has some (`changedSince` in `changes.ts`). It is the open row while Changes shows.
- The row comes with the save that first parts the files from the newest version, fading in as any row that joins a list. After the run, the new version's row arrives where it stood.
- Typing alone adds no row: nothing in the list moves on a keystroke. The file's own dot says it is unsaved.
- The line under the skill's name in the sidebar says the same: the version, its name and its score while the files are that version, "Edited since v1" once they were saved since, "Not run yet" before the first version (`versionLine`). When it changes under the reader, the new line comes up a few pixels (`animate-tick`, by `useChangedInPlace`); the line a skill opens with rests.
- The number the next run will take stands only on **Run v2** and in its panel, where it is a promise.
- In Changes, "Changes since" is followed by the version alone. While the file holds unsaved text it is a switch between the version and **The last save**. The line is as tall as the switch either way, so nothing under it moves when the switch comes or goes.

### The file tree

The Skill screen's files are a `FileTree` (`components/FileTree.tsx`): `NavButton` rows, nested by folder.

- At each level the files come first, SKILL.md before the rest, then the folders. A file beside SKILL.md stays beside it, not under every folder.
- A file's row shows its name, in mono, and its whole path as its `title`. A folder's row has a chevron (`lead`), 14px, `muted-foreground`, turned down while the folder is open, and its name is `muted` too (`NavButtonTitle tone="muted"`): a folder only groups, so the files, the things to open, keep the weight. A click folds what the folder holds away and back, and nothing else: a folder is never the open item.
- The chevron's strokes, open, start where a file's name does: its box is pulled back 3px, since the strokes begin 3px into it. It sits half a pixel under the line's middle, between the middle of a capital and of a lowercase letter, since a folder's name is most often lowercase.
- What a folder holds is indented 16px, so it starts under the folder's name.
- A new file or folder is named in the tree, in a `size="sm"` mono `Input` after the files of the folder it goes in. The field takes a row's 36px and its text starts where a row's name does, so the name is typed where it will stand and nothing under it moves when it lands. Enter makes it, Escape lets it go, and so does leaving the field empty; leaving it with a name in it makes it. A name that cannot be used is said under the field in a destructive `Hint`, once the name is sent, and checked as it is typed from then on.
- A folder is there while a file is in it. Naming a folder goes on to naming its first file, with one `Hint` that says so; Escape there lets the folder go.
- The header's two buttons add next to the open file. A right-click on a row adds there: beside a file, inside a folder ([buttons.md](buttons.md#menus-and-right-click)).

## The stage

An output is judged on the stage (`components/Stage.tsx`), under the band on Results (`useOutputStage` in `components/OutputStage.tsx`). The stage is a ground, not a card: `bg-muted` with a container's corners, the output standing on it with `shadow-raised`. It is 60% of the window high, and no higher than what stands on it needs: a picture, or a page drawn whole at its case's size, that the stage's width holds short of that height takes a ground as high as itself, never under 256px. A page with no height of its own, a file and the transcript scroll, so they keep the whole height. Two outputs on one stage take the height the taller needs, so a flip moves nothing, and two stages side by side end on one line. A picture's size is known before it loads where grading measured it or the stage has shown it before; else its ground settles when it loads.

- **A page** is drawn at the size the reader picks and scaled down to fit, never up. `STAGE_WIDTHS` in `src/renderer/stage.ts` is the closed set: Full width (the stage's own width, where a page starts), Phone 390, Tablet 820 and Desktop 1280. The choice is kept for the next case and the next launch. A case with a size (`bench.size`) adds Case size, first, and its page opens at it, fitted whole as a picture is. A page runs its own scripts, sandboxed (see `SECURITY.md`).
- **A picture** is fitted whole, never enlarged, on the artifact's own white.
- **Any other file** (code, Markdown) and the transcript stand on `bg-card` and scroll. Code is colored by its language ([data.md](data.md)) and has no fill of its own: it stands on the sheet, as prose does. A fill would end where the code does and leave a short file's sheet in two tones.

The stage stands in the same place in every view, and the view only says how the pair stands on it. So a change of view moves nothing under the stage.

- **One at a time**: both outputs are on one stage, one in view. Flipping is instant, with no transition: the change between A and B is what the reader is looking for. Two pages scroll together, so a flip lands on the same part of both.
- **Side by side**: a stage each, A under A's head in the band and B under B's (`StagePair`, `StageHalf`). Two pages scroll together here too.
- **Word diff**: the diff of the file in view, on one sheet on the same ground (`StageSheet`). The line under it says how to read the marks, that the files are too long to compare word by word and are compared by line, or "This file is the same in A and B." Until the reader picks a file it opens on the first one both outputs wrote that differs, the file that stands for the output first: code written as several files has some that are the same in both, and a diff with nothing marked reads as no change.

What an output is decides how its case opens, by the file each output opens on (`previewArtifact` in `domain/primary.ts`, `previewOf` in `model.ts`): a page or a picture one at a time, two pieces of code as their diff, anything else side by side. The kind sets what opens first and nothing else: there is one Results screen, and every view stays a press away.

An output opens on what its reader came to see:

- **Code that came with a page or a picture opens on that**, its main page first (`index.html`, `preview.html`). A reader looks before they read, and seldom reads code.
- **Prose opens on its text**, whatever pictures stand beside it: the text is the piece.
- **A page or a picture that is graded opens on itself.**
- **Code alone opens on the file it is graded on.**
- This says only what opens first. The file grading judges does not change, and every file is in the list over the stage.

### Who the wheel moves

The wheel moves the app, never what is on the stage, until the reader asks (`useGate` in `components/Stage.tsx`). The stage is most of the column, so the pointer is nearly always over it: a file or a page that took the wheel there would hold a reader who only meant to move down the app.

- Over what scrolls, a long file, a page, the transcript, the diff, lies a cover that takes nothing from the wheel. A press on it lets the reader scroll inside. It is a button, "Scroll inside this output", so the keyboard reaches it, and the focus goes to what scrolls.
- The cover says "Click to scroll" in a small line at the stage's foot, on `bg-popover` with `shadow-popover`, once the pointer has rested on the stage for 300ms. A reader on their way down the app is told nothing.
- Inside, the ground takes a 2px ring in `border`: the wheel is the stage's now. Leaving the stage, a press anywhere else, or Escape gives it back.
- What does not scroll has no cover: a picture, a short file, a page that fits are used as they are. A file is measured as it is laid out; a page says how far it can scroll (`STAGE_BRIDGE` in `application/api/artifact-page.ts`).
- Never let a region inside the column take the wheel unasked, and never a fade over what scrolls.

A control stands with what it changes. Five places hold them.

### The header

- The views, a `Segmented`: **One at a time**, **Side by side**, **Word diff**. A view sets two outputs against each other, so one output shows none.
- After it, `MoreActions` (`components/RowActions.tsx`) holds what is done now and then: **Edit case**, **Swap A and B** with two outputs in view, then **Regrade this run** (**Grade this run** before its outputs have a score) and **Delete this run**. When A and B come from different runs, each run is a `RowActionGroup` headed by its side and version, "Output A · v9", holding **Regrade run** and **Delete run**: the heading says whose, so no label repeats "A's run". In a group the delete needs no rule of its own: the group's rule sets it apart.
- Grading reads a whole run, so the action names the run, and Regrade never sits on one output.
- Below `lg` the header wraps as the Skill screen's does: the case's name takes the first row.

### The band

The pair is what the rest of the column is about, so it is picked in a band under the header (`PairBand` in `components/PairBand.tsx`) that holds still while the stage and the lists scroll. From `lg` up it sticks under the header; below, where the header wraps, it scrolls with the page.

- One head a side (`PairHead`), in two equal columns: its letter and its version, and nothing that judges the output, no score and no count. The reader reads the two answers first and makes up their own mind; what to fix is the list under the stage. A head bleeds 12px past the column's inset, so its fill stands clear of its text and the text starts on the column's edge. The two heads are one height, whichever says more.
- The letter is `Slot` (`components/OutputCard.tsx`), an outline in the text's color. An output read alone has no letter.
- Where the case has other outputs, the version is a `SelectBox variant="title"` that picks this side's output. Its list names each output in full, with who wrote it and when under the name (`outputNames` and `outputDetail` in `model.ts`).
- A side left empty holds a `Slot` and a `SelectBox width="fill" size="sm"` that fills it (`PairEmpty`).
- **Read one at a time, the two heads are the switch.** The head of the output on the stage takes an open row's fill (`bg-accent`) and its letter is filled (`SlotButton`, pressed). A press on the other head, on its letter, or its shortcut shows it. A press on a head's own control, the version, is for that control. Nothing else on the screen repeats A and B.
- Their shortcuts, A and B unless changed in Settings, flip the stage anywhere on the screen, unless a field, an editor, a menu or a dialog has the focus. In the views that show both outputs no head is filled and the keys do nothing.
- Under the version, the meta (`xs`, muted) shows only when it has something to say, in this order: what tells the two apart besides their version (`apartLine` in `model.ts`); a grading that failed, in `destructive`; and why a graded output has no score ("Graded before its case changed, so it has no score.").
- One `action` ends the meta's line, or the head's first line when there is no meta, only when it is the next step: **Grade** on an output with no score, `ghost-muted` at `xs`. It reads "Grading…" on any head while its run is graded.

### Above the stage

The case stands in one `Stack gap="md"` with the stage. Each line is a `Disclosure`.

- First "The prompt and its checks".
- An output written before its case's prompt or files changed answered another prompt. That one is listed under the first, with whose it is: "The earlier prompt and its checks, which A answered" (`askedBy` in `Comparison.tsx`). For a case since deleted, the prompt its run kept is the one shown.
- Then the file in view, when there is more than one thing to show: a `SelectBox variant="caption"` that names it and changes it, for both outputs at once. Never segments: an agent writes as many files as it likes. The transcript is the list's last choice. Word diff compares the file picked here.

### The size line under the stage

`Stage` draws it from the first frame, so nothing moves when a picture loads. What belongs to the file in view stands here.

- For a page it starts with its `lead`: the size it is drawn at, as a `SelectBox variant="caption"` (`PageSizeSelect`). The size is changed where it is read, and no other file shows the control. It shows the size's name alone, "Case size" or "Phone"; the pixels are in its list.
- Then the rest, in `Text size="xs" tone="muted" tabular`: for a page the scale ("45%"), or under Full width the pixels it came to ("697 px"); for a picture its own size and its scale.
- It is one line at every width: a line that wraps under one stage and not the other sets what follows at different heights.
- Its `action` ends it: **Open full size** (`OpenFullSize` in `components/Artifact.tsx`, `ghost-muted` at `xs`, with an arrow that says it opens elsewhere).
- One size holds for the case (`usePageSize` in `src/renderer/stage.ts`): picked under either stage, it changes both.

### The cards under the stage

An `OutputCard` holds what to fix on an output (`Verdicts`, [data.md](data.md#verdicts)) and nothing else: no head, no files, no transcript. The output is on the stage, and its name is in the band.

- Read one at a time, the card of the output on the stage shows, at the column's width. A flip swaps the list with the output.
- With both outputs in view, one card holds the later output's list, and a row names A only where A stands otherwise ([data.md](data.md#verdicts)).
- An output with no list to join, not graded or waiting on a regrade, keeps a card of its own beside the other's, A under A's head and B under B's.
- A card with no list says why in the list's place, in one `Hint inset`: "Not graded yet.", "Graded when it is done.", or why the output was cut short.
- An output graded before rules and checks were marked on its kind says so where the list would start, with **Regrade** (`outline`, `xs`) beside the line.

## Rows of actions

- A header or a trailing row puts the primary action last.
- A left-aligned footer (`FormActions`) puts the primary first and a destructive action last, after `Spacer`.
- Workbench chrome uses `size="sm"` controls. A `Screen` form uses the default size.

## Lists

| Need | Use |
| --- | --- |
| Items to open in a list column | `NavButton` rows inside `PlainList gap="xs"`. See [A row in a list column](#a-row-in-a-list-column). |
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
- An output a run is still writing is `OutputWriting` (`components/OutputCard.tsx`) in its frame on the stage, which takes the size of the page beside it so nothing moves when it lands. It fades in when it lands (`useLanded` in `motion.ts`). Its head offers no Grade and its card says "Graded when it is done.": the run grades it then.
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
| `help` | what a screen is for, and what stands behind a number: the note behind the count of cases, the lift's note |
| `note` | one word and what it means |
| `field` | the list under a `ComboBox`: as wide as its field |
| `selection` | the row of actions over a selection in the editor: as wide as its buttons, no focus of its own |

A `compose` or `compose-wide` popover is never taller than the room on its side of what it opened from: past that it scrolls, or its `scroll` section does, so it never runs off a small window.

A menu of actions is not a popover: it is `MenuContent` (`components/ui/menu.tsx`), drawn by `RowActions`, `MoreActions` and `ContextActions` ([buttons.md](buttons.md#menus-and-right-click)). It shares the popover's sheet, motion and row look (`ui/floating.ts`).

Inside one: `PopoverSection` with `pad="rows"` (rows to pick from, the default) or `pad="text"`, and `scroll` for a list that may outgrow 320px; `PopoverAction` is a row that does something (an icon, what it does, its shortcut); `PopoverLabel` names a section. A `HoverCardContent` (`ui/hover-card.tsx`) is `default` (360px) or `note` (one word and what it means, `xs`), with `HoverCardSection part="head" | "body" | "foot"`.

### The selection popout

The selection popout (`SelectionTools.tsx`) works on SKILL.md. The editor decides when it opens (`editor/graded.ts` and `MarkdownEditor.tsx`).

- It opens over four or more selected words, 150ms after the selection settles, anchored to the selection. It always works on whole lines: `sceneOf` widens any selection to its lines.
- Its size is `selection` while it is a row of buttons, and `compose` when the writing checks found something in the selected rule (the findings in a `PopoverSection` over the row). It is `compose` or `compose-wide` once a result is in it.
- Its buttons are `ghost` `sm`, in one fixed order: Auto refine, Suggest changes, Help me improve. Nothing in it is yellow.
- It takes no focus as it opens, and Tab indents in the editor. So F6 moves the focus from the text into it (the key that moves to the next part of a window, bound in `MarkdownEditor.tsx`), and Escape goes back to the text.

It also opens over a word the writing checks underlined:

- It opens once the pointer has rested on the word for 150ms, and goes 120ms after the pointer leaves both: the same beats as `HoverCard`. With one open, the next word's opens at once.
- It shows what that word set off, over the three actions. They work on the word's whole rule, as a click on the rule's number does. It does not move the cursor or the selection.
- Once an action is picked, or the focus moves into it, it stays wherever the pointer goes. Until then it closes on typing, scrolling, Escape or a press elsewhere.
- A popout a selection opened stays, and the pointer on a word does not replace it.
- While it is open, the words take the warning tint, 10% (20% in the dark), fading in and out over 150ms.

Auto refine (`Refine.tsx`) is in one of three states once the checks have answered, and only these:

| State | When | What it shows |
| --- | --- | --- |
| nothing to fix | the checks found nothing they are sure of | one line that says so, what is "Worth a look", and Help me improve (`outline`) |
| not the wording | every sure finding is one new words cannot fix: a line that changes nothing, a rule for another skill, a long file | the findings under "What drifts", "New words will not fix this." and Help me improve (`outline`) |
| a revision | new words can fix a finding | the findings, then the revision as a diff, with Discard and Replace |

- A revision is read by the checks before it is shown. When it still leaves one open, a `Hint` under the diff says what it needs ("Still needs a reason. Help me improve asks you for it."), and Help me improve (`ghost`) joins Discard and Replace.

Suggest changes (`Rewrites.tsx`):

- Its three cards show from the first frame, each with its label, what it does and its number key, and "Writing…" in place of the text, so the popout does not jump when the rewrites land.
- The first two are always Best practice and More direct. The third is Shorter, or Split up for one rule that asks for several things (`kindsFor`), known from the selection before anything is asked.
- A card offers only what its label holds. One with nothing to pick says why in place of its text, `muted`, at 70%: "Nothing to cut. Every word here does work.", "Nothing to split. Its parts only hold together.", "Same as the selection."
- Under an offered rewrite, each on a line of its own in `xs`: what code counted (`muted`, tabular: "24 words, 14 fewer", "3 rules"), "May drop a fact. Read it before you replace." (`warning`), and what Best practice could not supply ("Still needs a reason. Help me improve asks you for it.", `muted`). None is a lock.
- A footer says what is happening on the left, and holds Stop, or Try again, on the right. Help me improve (`ghost`) stands before Try again while a rewrite still needs something.
- Once the rewrites are in, the first pickable card takes focus: 1 to 3 pick, the arrows walk the cards.
- Closing the popout stops a run still writing.

A picked rewrite closes the popout, tints the new text in the editor for 1.4s (`editor/landed.ts`), and reports "Replaced the selection." with Undo on the status line. Auto refine's Replace and Help me improve's Apply take the same path. Apply leaves the focus in the panel and reports "Applied the draft to rule 03." (or "Applied the draft." when the text is not one whole rule). When one rule became several, by any of the three, the line says so in their place: "Split rule 04 into 3 rules." Each new rule takes its own number at once.

## Spacing

Spacing comes from Tailwind's 4px scale. `Screen` sets 40px between sections, `Section` 12px inside one, `FormSection` 28px between its rule and its heading. The first `FormSection` has no rule, and neither has one right after an `Alert`: the alert's edge already divides. A `FormSection`'s hint keeps to 48ch beside the fields (`split`) and 72ch over them (`stacked`). Use `Stack` for a vertical group and `Toolbar` for a horizontal one rather than a bare `flex gap-*` when one fits. Related things sit closer than unrelated ones: if two gaps are equal, the grouping is not showing.

The groups in `layout.tsx`, with every variant they have:

| Group | Variants |
| --- | --- |
| `Section`, `SectionHead` | a titled part of a `Screen` or of a main column. `Section rule` is a part of a main column's body that is a region of its own: a hairline across the column over it |
| `Columns` | `count` 1 or 2 side by side |
| `Fieldset` | fields under one legend |
| `FieldHead` | a field's `Label` with one quiet `action` at the row's end ([forms.md](forms.md)) |
| `Toolbar` | `gap` `xs` 4px, `sm` 8px, `md` 12px; `justify` `start`, `end`; `wrap`; `grow`; `line` keeps a text baseline when it holds only an icon |
| `Stack` | `gap` `xs` 4px, `sm` 6px, `md` 10px, `lg` 20px |
| `PlainList` | `gap` `none`, `xs`, `sm`, `md`; `bleed` pulls it 8px past the column's inset |
| `List` | `variant` `bullet`, or `number` with the "01" mono counter; `size` `inherit`, `xs`; `font` `sans`, `mono`; `gap` `none`, `sm` |
| `FormActions` | the actions under the fields of a split form |
| `RefreshButton` | the round arrow, one `animate-turn` per press |
