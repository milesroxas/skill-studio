# Data: tables, scores, status

The app's content is measurements. They are set in mono, aligned in columns, and colored only when the color is a verdict.

## Table

`src/renderer/components/ui/table.tsx`. Use a `Table` for records with three or more fields a reader compares down a column. Records of one or two lines are `Rows` ([layout.md](layout.md)). A list of things to open is `NavButton`s.

A table sits directly on the page. Never put it in a card or give it an outer border: its head rule and row hairlines are its edges.

| Prop | On | Values | Use |
| --- | --- | --- | --- |
| `layout` | `Table` | `auto` (default), `fixed` | `fixed` when the list is filtered or two tables must line up |
| `bleed` | `Table` | `false` (default), `true` | `true` when rows fill on hover, open a detail or mark a failure |
| `stick` | `Table` | `false` (default), `true` | a long list in a workbench column: the head stays in view under the column's header. The table no longer scrolls sideways in its own box, so its columns must fit at 720px |
| `interactive` | `TableRow` | `false` (default), `true` | the row opens something |
| `align` | `TableRow` | `middle` (default), `baseline` | `baseline` when one cell wraps to several lines |
| `variant` | `TableRow` | `default`, `destructive` | a failed sample |
| `motion` | `TableRow` | `none` (default), `leaving`, `arrived` | a row moving to another list at the reader's word: `leaving` while the change is saved, `arrived` where it lands (Mark done in `Library.tsx`). Never on a list's first draw |
| `numeric` | head, cell | boolean | a number: right-aligned and tabular. The cell is mono; the head stays a word in sans |
| `trailing` | head, cell | boolean | not a number, at the row's end: actions, a date, a note. Right-aligned, narrow and tabular, in sans |
| `wide`, `wrap`, `filler` | head, cell | boolean | the column that takes spare width; text that may wrap |
| `clip` | head, cell | boolean | the column the row is named in, on one line: it takes the spare width and cuts a name that does not fit. For a long list of names, where a wrapped one breaks the rows' rhythm. Its `TableRowToggle` takes `clip` too, and the whole name is its `title` |
| `col` | head | `auto`, `xs`, `sm`, `md`, `lg`, `xl` | a fixed column's width |
| `fold` | head, cell | `never`, `last`, `second`, `first`, `narrowest`, `menu` | the order columns drop out as the table narrows: under 64rem, 50rem, 42rem and 32rem of the table's own width. `narrowest` is for a figure the row is read by, which goes only when the name beside it would have no room (All cases' newest answer's checks met). `menu` is a row's actions: the column stays, one icon wide, where `first` goes, and `RowActions` folds them into a menu |

A row that opens a detail uses `TableRowToggle` and `TableDetail`. Do not build a disclosure row by hand: the toggle carries `aria-expanded`, and the open row's `bg-muted` fill comes from it.

Rows in groups, such as the cases checked on a version and the ones that are not, are one `TableBody` per group, each opened by a `TableGroupHead`: the group's name in `ui` medium and its count in `muted`, across the table. A table with one group that needs no name has no head.

```tsx
// Correct: components/ResultsSummary.tsx
<TableHead wide>Run</TableHead>
<TableHead numeric>Mean</TableHead>

// Incorrect: widths and alignment by hand, and a column that overflows at 720px
<TableHead className="w-[300px]">Run</TableHead>
<TableHead className="text-right">Mean</TableHead>
```

Rules:

- Text columns align left. Number columns align right. Never center a column.
- A head cell is a noun of one or two words in sentence case. No caps, no bold.
- An action in a cell is `Button size="cell-inline" variant="link-muted"` for navigation and `variant="ghost-muted"` or `destructive-muted` for a mutation. It is visible at rest. See [buttons.md](buttons.md).
- A row's actions at its end are `RowActions` (`components/RowActions.tsx`), one `RowAction` each, in a column with `fold="menu"`. While the table has room they are `ghost-muted` buttons (`show="icon"` for one drawn as its icon alone); when it is narrow they fold into one "More actions" button whose menu holds each as an icon and its label. Never let a row's actions fold away: a narrow window must still reach them (`Library.tsx`). A `RowAction` with `tone="destructive"` is `destructive-muted` in the row and red under a hairline in the menu; put it last. A right-click on the row offers the same actions (`ContextActions`, [buttons.md](buttons.md#menus-and-right-click)).
- No zebra stripes. Hairlines separate rows, and a fill means hovered, open or failed.
- An empty cell says why it is empty in one or two words in `tone="faint"`, such as "Not run" or "Writing…": never a blank, a bare dash or "N/A". Only a cell that opens something looks like it does: a score not graded yet is "Not graded" as a `link-muted` `cell-inline` button that opens the output, never a dash in a chip beside a dash that opens nothing. An output the run's stop cut short is never graded, so the same button says "Stopped". One its run never recorded, in a run with no end of its own, says "Not finished": it is still being written, or the run was cut off with the app.
- A stop is the reader's own doing, never a failure. A stopped output says so once, in plain words in `muted`: "Stopped before it finished, so it has no score." under its card's head, "Stopped before it finished." in its row of an opened run. It is never red, and what its agent said as it was ended is not shown as an error (`failureOf` in `model.ts`).
- A stopped output is not offered where an output is picked to compare (`outputsToPick` in `model.ts`): it has no score to set against another. It is read from its run, under Runs.
- All cases (`ResultsSummary.tsx`) is read by case, never by run: a case is run when its writer chooses, so a grid of runs by cases is mostly empty. Its table (`CaseStandings.tsx`) has one row per case and four columns however many runs there are.
- Where any case can be read on its checks, against the answer without the skill or the answer before (`readCase` in `case-checks.ts`), the four are: the case on one line (`clip`), how many checks the answer it is read against met, how many its newest answer met ([Checks met](#checks-met)), and its change. The table is `layout="fixed"`, the two columns of counts `col="lg"` and the change `col="sm"`, so the case takes the rest; the older folds first (`fold="first"`), then the newer (`fold="narrowest"`), so both show in a 1280px window and at 720px the case and its change stay. A case with nothing to compare says why once, in `faint`, across the columns a comparison would fill: the table's word for a run with no score ("Writing…", "Not graded", "Stopped"), "Not run with the skill yet", "Not run without the skill", "First run", "The case has no checks", "Jev was not sure of its checks", "Its checks were not read", "Its checks cannot be marked", "No check was marked on both answers".
- A column of counts is headed by what it holds. The newer is headed by the version every compared case's newest answer is on, else "With the skill". The other is "Without the skill", or the one version every answer before is on ("The run before" when that is the newer one's too), else "The version before". Under a head that names no version, a row says its version in `faint` after its count.
- Where no case can be read on its checks, on either side, the four are the case, its last run as version and model (`modelShort`), its score, and its change from the run before. A case before its first run with the skill stands on its score without it. A case with no score says why once, across the three columns a score would fill. One quiet line under the table's hint says cases are compared on their checks, with **Open Cases** (`link-muted`, `inline-sm`).
- Its rows are in groups (`TableGroupHead`): "Checked on v3", then "Not checked on v3 yet", then "Answered before the case changed", then "No longer in Cases" for a case deleted since it ran. A row holds answers to one request (`standingsOf` in `model.ts`): outputs written for a case before its prompt or files changed stand in a row of their own in the third group, under the name the case had then. Within a group what needs a look comes first: the biggest drop, then the lowest score. With every case checked there is one group and no head.
- A long list stays short: a group shows its first 8 rows and "Show 6 more cases" (`ghost-muted` at `xs`), and past 8 cases a "Find a case" field stands over the table. The open case shows even when it lies past the first rows.
- A change is read over the rules and checks both runs counted, with the reader's answers only where both runs hold one on the same fact (`moveBetween` in `model.ts`, `changeReading` in `domain/change.ts`), so it may not be the difference of the scores shown. Where it is not, the opened case's sentence ends with one line that says why (`changeLine`): "The change counts only what was marked on both runs, so 19 rules and checks are left out of it.", "The change counts your answers only where you gave one on both runs.", or both in one sentence. An output card set against another says the same of outputs in a `Hint inset` under its head.
- When nothing is left to count on one of the two runs, the change column is empty, and the opened case says "Nothing was marked on both this run and the one before, so there is no change to read."
- Read on checks, the change is a signed count of checks (`Delta`), one each whatever its weight: the checks its newest answer met less the ones the answer it is read against met, over the checks both were marked on. A case that did not move says "Same" in `faint`. A case that is better or worse while that count is nought (a check that counts double moved one way, one that counts once the other) says "Up" or "Down" in the `Delta`'s colors. Where each side is one attempt and one check moved, the change has the dotted underline of a word that explains itself and opens "May be chance" (`ChecksChange` in `components/CaseChecks.tsx`).
- Read on scores, the change column says "First run" or "Same" in `faint` where there is no move. Either way it names a newer run that has no score yet: "Grading v3…", "v3 not graded", and "v3 needs grading" for one whose grading no longer holds. A run has a score on a case only when every output it made for it has a total, never a mean over the rest. A stopped run waits on nothing, so it is left to the case's list of runs.
- An opened case reads in this order: one sentence on where it stands, then, where Jev was not sure of some of what that score counts, how many in `ui` `muted` ("Jev was not sure of 8 of the 17 rules, left out of the score until you mark them.", `asideLine` in `model.ts`), then, where that score or the one it moved from is over more than one attempt, how many and how far apart in the same tone ("Its score is the mean of 3 attempts, from 62 to 88. Its run before had one.", `attemptsLine`), the first three things its answer missed (a red cross each, then "and 2 more, in the output"), and its actions, the next step first: **Run it on v3** (`outline`) while the case is behind, else **Read the output**, then **Compare with v2** (`ghost`). Where its newest run only waits to be graded, **Grade its v3 run** is offered, and stands first in place of the run when that run is on the version a run would test now. Answers to an earlier request, and to a deleted case, offer no run: the sentence says "Its prompt or files have changed since." or "It is no longer in Cases." Its other runs stand beside it, the newest four, each ending in its score as a `cell` button that opens that output. Never a table of every part of every run: what is not the next thing to read is one press away.
- An opened run says under its grading line how many of its outputs' rules and checks Jev was not sure of, when he was not sure of some (`asideLine`). Facts Jev could not read the whole output for are said in the same line: "Jev could not read the whole output for 3 of the 17 rules, …".
- The runs, with what they answered, their time, cost and average, are a second table under it, the newest first and the runs without the skill last, whose rows open the run. It shows the newest 5 and "Show all 30 runs".

A table written in a skill's Markdown is not a `Table`: it is the writer's own text. The formatted editor draws it (`editor/tables.ts`, styled in `editor/theme.ts`) with the lines of a table in an output (`.doc table` in `styles.css`): `text-ui`, a 1px `--input` line around every cell, 4px by 8px inside, the head at weight 600. It keeps the side the Markdown names for a column, centered included. With the cursor in it, it shows as its Markdown rows in mono. A code block's ``` lines fold into the 6px edge of its `--muted` band the same way, until the cursor is in the block. A language named on the opening line stays as the block's label: the name as written, mono at the `xs` step in `--muted-foreground`, on a line of its own over the code, at the text's left edge.

Code a run wrote is colored the same way where Results shows a file of it (`CodeFile` in `components/Artifact.tsx`, `highlight.ts`), by the language its name ends in: JavaScript and TypeScript with JSX, JSON, CSS, HTML, Python, YAML, shell, Go, Rust, Java, Kotlin, Ruby, TOML, SQL and Swift. A language not among them, and a file over 200,000 characters, shows plain. The grammars are loaded with the first code file shown, and the file shows plain until then: its lines do not move when the colors come.

Code in a block is colored, in both views: keywords and tag names in `--code-keyword`, strings, numbers and other values in `--code-value`, the names of functions, types and classes in `--code-name`, comments in `--muted-foreground`, everything else in text color: a variable, a property, punctuation (`tok-keyword`, `tok-value` and `tok-name` in `code-tokens.ts`, which the editor and a file on Results share, and `tok-mark`). Code is the one surface with hues of its own: it holds the writer's code, not the app's words. They are violet, blue and teal only, and stay off green, amber, red and yellow, which say how something stands. Three hues is the set: a fourth would have to sit beside one that says how something stands. Never use the three tokens outside code. The languages read are the ones named in `CODE` in `editor/language.ts`; a block in any other is plain text.

## Scores

A score is out of 100 and always shows through one of these, from `components/Scores.tsx`:

| Component | Shows |
| --- | --- |
| `TotalChip` | a score as a chip whose color is its band. Every chip is 40px wide (`Badge numeric`), so a column keeps one edge. `stale` is a score from an earlier version than the skill as it is now: the chip stands open, a hairline edge and no fill (`Badge variant="outline"`), until the case runs again. Its number is `muted-foreground`, and stays amber or red when the score is weak, so a low one still stands out. A screen reader hears "from an earlier version". |
| `TotalDetailSection` | one part of a `help` popover behind a number, a heading and what it holds: the note behind the count of cases on All cases, and the lift's note |
| `SampleCount` | how many outputs a mean stands for, which are the ones with a score: "×2", beside a score in All cases' table read on scores. Its slot keeps its width when empty. Hidden below `lg`, so a table of cases fits 720px. |
| `Delta` | a change between two scores: "+15" in `success`, "−4" in `destructive`. It brings its own space after the score it follows; `lead={false}` where it opens a line or stands alone in a cell |
| `ListScore` | a `TotalChip` at the end of a row that lists a case: a `NavButton`'s `end` in a list column, a row of All cases, where the cases are read on scores. Read on checks, the case list and All cases' table show none: the score stays in an opened case, under Runs and in the note under the counts. The latest score alone, `stale` when the case has not run on the skill as it is now. On a list column's open row it takes a hairline edge. A score that changes in view comes up a few pixels (`animate-tick`). |
| `ScoreChange` | how a score moved, in words, read as a change is (`changeBetween` in `model.ts`), for the line under a row's title: "Up 11 from v0", "Down 4 from v0", "Same as v0", or "Up 20 with the skill" or "Same as without the skill" against the run without it. A case with one output says "Only v0 so far": with nothing to move from, a bare version would explain nothing. Where one of the two outputs has no score the line names it, "v2 has no score yet", or "v2 was stopped before it finished" for a case whose every output was stopped, and the chip beside it shows the later output's score or none, never the earlier one's. Only "Down" is colored, `destructive`: a rise is the resting state, and the eye lands on what got worse. |
| `CheckWeight` | a check's ×2 mark after its statement, only when it counts more than 1 |

`Explained` (`components/Help.tsx`) is a word a reader may ask about, where it stands.

- It is a dotted underline. A click, never a hover, opens a `note` popover with its name, what it means in one or two sentences, and at most one `outline` `sm` action that goes where it is changed.
- Opened by a pointer, the action does not take the focus. Opened from the keyboard, it does.
- `Term` is `Explained` for a glossary word, such as **Missed**, and has no action.
- The same underline (`EXPLAINED`) marks the count of cases under the lift and under the counts of cases on checks, each of which opens what stands behind the numbers in a `help` popover ([brand.md](brand.md#the-ribbon-as-a-figure), [layout.md](layout.md#the-head-of-all-cases)), and a case's change that may be chance. A dotted underline always means the same thing: a click here explains this.
- A score part that a kind of work adds opens what grades it and **Change what is graded**. That opens All cases with **Graded as** unfolded and in view (`graded=1` in the address).
- A setting is met where its effect shows, once per card: never as an action on every row it touches.
- A fact such as "The output has one clear main point" names its part ("Look") in the line under it, so it reads back to that heading.

### Verdicts

What an output missed, and the rest of what its score is counted from, shows as `Verdicts` (`components/Verdicts.tsx`), on an `OutputCard` under the stage. It is read in the order the fixes are made in:

1. **What to fix**, open, grouped by why it was missed (`placeMisses` in `src/domain/fix-order.ts`). The reason is the group's name, said once over its rows and never on a row:
   - "The skill was never opened": the output's transcript shows no read of a SKILL.md and no call of the Skill tool (`openedSkill`). Every rule and check it missed stands here: none of them says anything about the skill's words.
   - "No rule was broken, and a check was still missed" ("…and checks were still missed" for more than one): the rules ask for the wrong thing, or leave out what the check needs.
   - "A rule was broken on this answer too": checks missed beside a broken rule. The rule may be why, so it is fixed first.
   - "A rule was broken", or "Rules were broken".

   The first two are fixed in the skill as a whole: their name is followed by **Open skill** at the group's end, and their rows have no action of their own.
2. **Missed**, open: what no reason places. An output written without the skill was held to no rule, so its missed checks stand here, and so does a part a kind of work adds. The heading is a `Term`.
3. **Not sure**, open: one row per fact Jev could not tell, which is in no score until the reader answers it. The heading is a `Term`.
4. **Not read**, open: one row per fact of an output too long to read at once that the parts Jev read do not settle, which is in no score until the reader answers it. The heading is a `Term`.
5. **Cannot be marked**, open: one row per rule or check whose reading says nobody can mark it as written, and per rule that cannot hold beside one of the case's checks, on that case's outputs alone. It is in no score until the reader answers it, as under Not sure, and once answered the fact moves to What to fix or Marked as met by you. The heading is a `Term`. The line under each says why and the fix (`unmarkedNote` in `src/renderer/verdict-notes.ts`): "Two careful readers would mark it differently. Try: …", or "It cannot hold beside “The page lists all 180 changes”. Try: …", and it stays there beside "your answer" once the reader answers it.

   Where 1 to 5 are all empty, the list says "Nothing to fix." in `muted`.
6. **Marked as met by you**, open, so the reader's own answers stay in view.
7. **Met**, folded under its count.
8. **Does not apply**, folded under its count: a rule under a heading for another kind of work than this output, or a rule for a situation its request is not.

An output written without the skill never saw the rules, so its list holds no rule. An open group's name has no count: its first rows are in view, and a long group says how many more it folds.

With both outputs in view the list is the later output's, on one card (`other` on `Verdicts`):

- A row names the other output only where it stands otherwise, in the line under the fact: "A met this", "A missed this", "Not sure on A". On a rule it does so only where A was held to the rules: written with the skill, and the skill opened.
- A row's answers are the later output's. A is marked with A alone on the stage.
- An output with no list to join keeps a card of its own ([layout.md](layout.md#the-cards-under-the-stage)).

A rule carries its reason and runs to 400 characters and more, so a list is kept short two ways:

- **A row shows two lines.** A longer fact ends in an ellipsis, never a fade: an ellipsis says "more text", a fade says "more to scroll". The chevron at the row's end opens it in place, and a press on the cut text does the same. Open, the text is only text, so it can be selected and copied. Whether a fact is cut is read from the text as it is laid out, so a short check has no chevron.
- **An open group shows three rows.** The rest fold under one line that names what it holds, "9 more not sure", "2 more to fix", since Met and Does not apply stand right under it. A line that hid one row would save nothing, so a group of four shows all four.

A row is three columns:

- A mark: a 20px chip, the verdict's tint under a red cross or a green tick (`badgeVariants` `danger` and `success`), which repeat the words "Missed" and "Met". A fact in Not sure, Not read, Cannot be marked or Does not apply is no verdict, so its chip is `secondary` with a dash and never a verdict color. Where the reader can answer the fact, the chip is the button that opens the answers (`PartActions`): pointed at or open it takes a 2px ring in `border`, as a score's chip does, and it is 24px to press. A fact code measured has a chip that is not a button.
- The rule or check, at the row's whole width. Under it, a line shows only when it has something to say: in `faint`, the kind when the fact counts more than once ("Check ×2"), what the app found where it answered the fact itself ("Checked by the app: 7,524 words, more than 120.", or "The app could not settle it: …" under Not sure, `codeNote`), why a fact cannot be marked and its fix, the reader's own answer, how the other output stands where it stands otherwise, and "Saving…" while it is saved; then the row's action. Each of those words is built from what grading kept, never from a model's sentence, except the fix.
- At the end, top-aligned so they line up from row to row: the chevron, on a row that is cut, then the menu.

The actions are `ghost-muted` at `xs`:

- **The row's one action**, in the line under the text, named by what it does. A row under Not sure or Not read waits for the reader's mark, so it offers the mark: **Mark as met** and **Mark as missed**. A broken rule SKILL.md still holds, on an answer written with the skill whose case still stands, offers **Fix with AI**, a popover that drafts a change to the rule ([brand.md](brand.md#motion)). Any other row offers where its fix is: **Open rule** on a rule SKILL.md still holds, **Edit case** on a check of a case that still stands. A row in a group that ends in **Open skill** has none. Never beside the text: there it takes a third of the row's width from the rule.
- The chevron, `icon-xs`: "Show all", "Show less".
- Then `MoreActions` at `size="xs"`, holding everything the row can do: where its fix is, then the answer, "Mark as met" or "Mark as missed" for a fact Jev answered, both for one set aside, "Take back" for one the reader answered. A right-click on the row offers the same. The chip opens the answers alone.
- Never make the whole row the button: its text is copied.
- A fact code measured, such as a word count, has no answer to give.
- A fact the reader answered says "your answer", or "your answer, agrees with Jev" when the skill's threshold gives Jev the same answer ("agrees with the app" where the app answered it). Its menu holds "Take back" either way.
- A fact the app answered itself is open to the reader's answer, as one Jev answered is. A fact nobody can mark has a chip that is not a button and no answer to give.

### Bands

Bands come from `scoreBand()` in `model.ts`. Never compare a score to a number in a component: the bands are tuned in one place.

| Band | Chip |
| --- | --- |
| `hi` | `success` |
| `mid`, `na` | `secondary` (neutral) |
| `lo` | `warning` |
| `vlo` | `danger` |

```tsx
// Correct
<TotalChip total={mean} />

// Incorrect: a verdict color picked at the call site
<Badge variant={mean > 90 ? 'success' : 'warning'}>{mean}</Badge>
```

Only weak things are colored. If every score is green, the eye has nowhere to land: the plain color is the resting state and color is the exception.

## Badge

`components/ui/badge.tsx`. A badge is a short state on a thing: one or two words or a number. Its corners are `rounded-sm`, a printed label and not a pill.

Variants that exist: `default`, `secondary`, `destructive`, `outline`, `ghost`, `link`, `success`, `warning`, `danger`. Nothing else. One boolean beside them, `numeric`: a number a reader compares down a column, as wide as "100" (40px) and centred, in mono with tabular figures. `TotalChip` is the one that sets it: a score is a `TotalChip`, never a `Badge numeric` of its own.

```
Does it state how good something is?
 ├── Yes → success / warning / danger
 └── No
      ├── A neutral count or state → secondary
      ├── A state that needs an edge on a filled row → outline
      └── A state that must be acted on now → not a badge: a button that opens where it is fixed.
            In the top bar that is `TopBarWarning` (layout.md).
```

`default` (ink fill) and `destructive` (solid red) are not used by any screen. A solid badge outweighs the row it labels. Do not start.

## Status or Alert?

```
Is it the standing of one thing (connected, installed, allowed, set)?
 ├── Yes → Status, inside the section that thing belongs to
 └── No
      ├── Must the reader act before the whole screen works? → Alert, above the content
      ├── Is it about one field? → Hint under that field
      └── Did an action just finish or fail? → report it: `ctx.report`, read on the status line
```

## Status

`components/Status.tsx`: a dot, a state in a word or two, then detail. `RunningChip` is the running dot and a word or two on an ink chip, where yellow would sit on paper: `RunningTag` in the Library, `OutputWriting` on Results. `tone`: `success`, `warning`, `destructive`, `muted` (the default), `signal` for a job that is running. `size`: `default` in a section's text, `ui` at the end of a row whose title is `text-ui`, such as a change in the Assistant panel. Pick the tone from the table in [color.md](color.md): works is `success`, needs the reader's action is `warning`, broken is `destructive`, not set and fine is `muted`. The detail says what to do when the tone is not `success`.

```tsx
// Correct: screens/Settings.tsx
<Status tone="warning" detail="Set up Claude Code or Codex below to choose a model.">
  Not connected
</Status>

// Incorrect: color alone carries the state
<Text tone="warning">Not connected</Text>
```

The words carry the state and the dot repeats it, so the line still reads without color.

## Status line

`components/StatusLine.tsx`, fed by `ctx.report`. One line at the foot of the window's frame, in a strip the frame keeps for it, so it never lies over the work: under the pane in the app and in the changelog window (`place="foot"`), in the first cell of the welcome's title strip (`place="head"`). While it speaks the foot's strip is ink, drawn in from the left on `ease-stroke` in 300ms, and the words rise in after it; then it goes quiet and the strip is paper again. The head keeps the title strip's own surface and draws no stroke. Its Undo is an `outline` button, so the offer is seen. It is the only place a finished or failed step is announced. Nothing floats over the screen to say so, and a question that must be answered first is `ctx.confirm` ([forms.md](forms.md)), not a notice.

```tsx
// Correct: components/VersionDetail.tsx
report(`Restored ${found.version}`)
report(e as Error)
report(`Deleted ${v.version}`, { undo })

// Incorrect: a failure in the plain tone, or a message of its own over the screen
report(e.message)
<div className="fixed bottom-4 …">Saved</div>
```

- A string alone is a fact, with the plain dot: "Saved 1.2.0", "Run started: 3 cases".
- An `Error`, or a string with `{ tone: 'destructive' }` when the caller words it ("Not saved: …"), is a step that failed. Red dot.
- `{ tone: 'warning' }` is a step the reader must change something before taking ("1.2.0 already exists."). Amber dot.
- `{ undo }` offers Undo, and the Undo shortcut takes it while the line stands. `{ action }` offers the one step that follows. One offer at most: a notice is one line, and the line truncates past the strip.
- Never `success`. A notice that something worked is the fact itself.
- A fact leaves on its own once it can be read: 2.6s at least, about 200 words a minute past that, 7s with an offer. It waits while the pointer or the keyboard is on the line. A failure or a warning stays until the reader presses its Dismiss (`ghost` at `icon-sm`, after any offer) or the next notice takes its place.
- `{ stays: true }` keeps a fact on the line the same way, with the plain dot and Dismiss. It is for news that ends on its own time and is easy to miss: the one use is an update ready to install (`updates.ts`).
- A long message truncates; its whole text is the line's `title`.

The dot is `Dot` from `components/Status.tsx`, the one dot in the app. `Status`, an `Alert` that states a verdict, the jobs line, and the unsaved mark of a `NavItem` and a `NavButtonTitle` use it too, so a color means the same thing wherever it is read: `signal` runs, `success` works, `warning` needs the reader, `destructive` failed, `muted` is a fact. Its `size` is `sm` beside 12px text in the chrome and `default` beside body text.

## Alert

`components/ui/alert.tsx`. A message about the whole screen or section, above its content. Variants: `default`, `destructive`, `success`, `warning`, `muted`. A verdict (`destructive`, `success`, `warning`) is said by the `Dot` of its tone before the heading, on the heading's first line, as `Status` says one. The words stay ink: the heading in `card-foreground` at medium weight, the body in `muted-foreground`. Never color the heading: in the dark theme an amber heading reads quieter than the body under it. A remark that is not a verdict is `muted`. A message about one field is a `Hint` under it, not an alert.

What the reader can do about it goes in `AlertAction`, after `AlertDescription`, never inside it: one `outline` `sm` button, or an `outline` and a `ghost` one. When the alert is 36rem wide or more (`@xl/alert`), the actions stand at its right edge, centred on the words; narrower, they go under them. The heading wraps rather than truncate.

## Rule numbers

In SKILL.md, each graded rule gets a number, `01`, `02`, in the order the rules stand in the file (`RuleNumber` in `editor/graded.ts`, styled in `editor/theme.ts`). In the formatted view it stands in the bullet's place; in the Markdown view it hangs in the margin before the source mark, so the text keeps its edge. It is mono at 0.8em with tabular figures. A click selects the whole rule, which opens the selection popout on it. A bullet Jev does not grade keeps its dot, and says why to the pointer that rests on it. A skill whose `bench.json` lists its own rules gets no numbers.

A number is in one of three states, and only these:

| State | Color | When | Its tooltip |
| --- | --- | --- | --- |
| plain | `muted-foreground` | nothing below holds | "Rule 04. Click to select it." |
| `flagged` | `warning` | the writing checks found something in the rule; the words that set a check off are underlined, dotted, in `warning` | "Rule 04: the writing checks found something. Click to select it." |
| `broken` | `destructive` | more graded outputs broke the rule than followed it, on the newest version that ran it (`mostlyBroken` over `ruleRatesOf` in `model.ts`) | "Rule 04: broken by 5 of 7 answers. Click to select it." |

- `broken` wins over `flagged` (`numberTone`): the outputs show the rule failing, where a writing check only says it might. The underlined words stay, and the tooltip says both: "Rule 04: broken by 5 of 7 answers. The writing checks found something. Click to select it."
- Every rule that graded outputs counted says how many broke it, red or not: "Rule 01: broken by 0 of 4 answers." A rule is counted by its words, so a rule edited since its last run has no count until it runs again.
- Where answers written without the skill were marked on the rule, a second sentence says how many followed it: "Rule 04: broken by 5 of 7 answers. Followed by 2 of 2 answers written without the skill." (`without` on `RuleRate`). It never colors the number.
- The count is of the newest version that ran the rule, never of every run there has been. A rule that v2's answers broke and v3's follow is no longer red: the change that fixed it may be anywhere in the skill, and the next run is what shows it.
- `flagged` goes as soon as the words are fixed: every writing check names words or a shape the writer can change, and none counts the rule's words.
- Color is never the only signal. The tooltip carries the words, and the number reads them to a screen reader too: it is `role="img"`, named by its tooltip, so a screen reader hears "Rule 06: broken by 11 of 11 answers. Click to select it." once.

## File size

`components/TextSize.tsx`: `TextSizeIndicator`, at the far end of the editor's toolbar. It is five segments in a row (`LevelBars` in `components/Meter.tsx`), 14 by 6px with 2px corners (`rounded-xs`) and 2px between, filled up to the file's level from `textSize()` in `domain/size.ts`. The color comes from `sizeBand()` there. Never set a level or a band by hand: the steps are tuned in one place.

| Band | Levels | Filled bars |
| --- | --- | --- |
| `fine` | 1 to 3 | `bg-current`: the toolbar's muted text, darker with the button on hover |
| `long` | 4 | `bg-warning` |
| `over` | 5 | `bg-destructive` |

- Empty bars are `bg-input`. They are never yellow.
- `long` and `over` also say so in words, in the hover card and the button's label, so color is never the only sign. The counts take the same tone.
- Pointing at it opens `HoverCardContent size="note"` with the lines and tokens. Clicking puts the counts in place of the bars, in mono `xs`, and the button is `aria-pressed`. The choice holds across files until the window closes.

## Run size

`components/RunSize.tsx`. How big a run of a case is, shown on Cases while the case is written: the same five bars (`LevelBars`), a word for the level, and what adds to it. The level and its parts come from `caseWeight()` in `domain/case-weight.ts`, which weighs the prompt, the pictures, the files and an answer that is a page or a picture. Never set a level by hand: the points are set against recorded runs in that one file. Checks, a good answer and the model are not in it: grading is about a hundredth of the writing, and the model is picked when a run starts.

It is a size and never a price. A larger run takes longer and costs more, and how much of each turns on the model, so the bars promise neither. What a run really cost is said under **Last run**, from a run that happened.

| Level | Word | Bars and word |
| --- | --- | --- |
| 1, 2 | Small | `bg-current`, the muted text |
| 3 | Medium | the same |
| 4 | Large | `warning` |
| 5 | Very large | `warning` |

- A large run is worth a look, never broken, so the top of the scale is amber where the file size meter's is red.
- It shows in one of three places, by the room the case's column has ([layout.md](layout.md#a-split-column)): `RunSizeMeter` in the header, `RunSizeRail` beside the form, `RunSizeStrip` over the last answer. Never two at once.
- `RunSizeMeter` is the file size meter's control: a `ghost-muted` `sm` button of bars alone. Pointing at it opens a `HoverCardContent` with the level, what adds to it and the last run. Clicking puts the words in place of the bars ("Large run"), and the button is `aria-pressed`. The choice holds across cases until the window closes.
- From Medium up one line names the two things the writer added that count most: "Mostly 2 pictures and a folder of 14 files."
- **What adds to it** (a `Disclosure` in the rail and the strip, the body of the meter's card) lists every part, the largest first, each with a 64px bar for its share of the largest. Why a part adds is its `title`, and is read out with its name. Under the list one line says what a size means: "A larger run takes longer and costs more. Checks and a good answer add almost nothing."
- **Last run** is what an attempt at the case cost in the run its last answer came from, with the time and the model (`attemptCost` in `model.ts`). It shows only once the case has run.

## Checks met

Where the cases on Results are read on their checks (`case-checks.ts`), a case says how it did in words and counts, never in a figure of its own:

- In the case list, a case's line under its title is how its newest answer did against the one it is read against (`moveLine`, drawn by `CaseChecksLine` in `components/CaseChecks.tsx`): "Better than without the skill", "Same as v1", "Worse than the run before". "Worse than…" is `destructive`; the rest keep the line's color. A case with nothing to compare keeps its few words. The All cases row's line is the counts: "1 better · 4 same", and "· 1 worse" when there is one.
- In All cases' table, each side's column says how many checks that answer met (`sideCount`): "1 of 2 checks", `tabular`, the answer it is read against in `muted`. A check met on some attempts and missed on others is not met.
- **Change** is one word (`ChecksChange`): "Better" and "Worse" in `semibold`, "Worse" in `destructive`, "Same" in `faint`. A move of one check where each side ran once may be chance: the word has the dotted underline and opens why.

## Figures

A chart or a diagram labels its values directly, in mono `2xs`. It uses `foreground` for the thing measured and `muted-foreground` for references, with axes in `input`. It never uses yellow, and it uses a verdict color only for a verdict. Every figure is a component. The app has one, on Results: the lift, the one figure that uses the ribbon ([brand.md](brand.md)).
