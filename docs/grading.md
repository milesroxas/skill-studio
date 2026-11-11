# Grading

Grading runs a skill's judge packs over each sample of a run and writes `report.json`. It follows each run, in the app and from `st run` (`--no-grade` skips it), and runs again on Regrade in the app or with `st grade`.

This page uses the words of the files: a **pack** is a set of judge questions for one kind of work, and a **layer** is one part of a score. The app calls a pack the kind of work a skill is "graded as", and a layer a part of the score: Rules, Checks and so on.

- Every skill is graded by the `generic` pack: the rules the skill states and the checks its cases state, on whatever kind of file the output is. A skill is graded on what it says and what its cases say, and on nothing it did not ask for. The other packs add parts of their own, and none of them marks a rule or a check. A `packs` list that leaves `generic` out still has it (`BASE_PACK` in `src/domain/config.ts`).
- A pack runs on a sample when it judges the kind of the sample's primary artifact (`primaryArtifact` in `src/domain/primary.ts`): an output of the case's `bench.artifact` kind; else a page, a picture or code, in that order, when one of the skill's packs judges that kind; else Markdown; else a page, a picture or code, in that order; else the first output of any kind. The order the skill lists its packs in does not matter. Among files of one kind, `index.html` or `preview.html` comes first, and a `README` or a `.txt` file last, so a page and the script beside it are judged as the page, and a post beside its notes as the post. Results opens the same file on an output not graded yet. The generic and workflow packs run on every sample.
- Jev's raw answers are stored. Points per layer, the threshold and pack settings are applied in code (`src/domain/scoring.ts` and each pack's `score.ts`), so a change to `bench.json`, or to Graded as on Results, rescores without new judge calls.
- Without a TypeSafe key, or with `--no-jev`, only code checks run and every judged layer is null. A case with `bench.judge: false` is graded the same way, in every pack: Jev is asked nothing about its outputs (`asksJev` in `src/judges/shared/questions.ts`). A null layer, or one given 0 points, is left out of the total and the rest rescale. A pack that throws leaves every one of its layers null and adds the flag `<pack> pack failed: ...`. A grading with that flag on every output writes no `report.json`, so the last report stands; in the app the job fails, with the first reason in its log. One with the flag on some outputs says how many and goes on.
- Regrade asks only about what changed. Each pack's raw answer is kept in `judge-cache.json` beside `report.json`, under a hash of the model, the pack and the version of its questions, the output text, the other files and the notes beside it, the transcript, the case, the bytes of the case's pictures as the run kept them in `_inputs/` and of its checks' pictures, the rules and the settings. Points per layer and `yes` are not in the hash, since they apply in scoring, and neither is a setting that is another pack's alone. On the next grading an output whose hash matches keeps its answer, and the log says `N of M outputs unchanged: kept their verdicts.`
- The file keeps this grading's answers and, before them, the earlier ones it did not ask about again, up to four gradings' worth. So a grading without a TypeSafe key, or with a setting changed and then put back, does not cost the answers Jev already gave. It is written when a grading is stopped or fails too, with what had been answered by then.
- A sample folder is `<case>-s<n>`, and its case is read from that name whole. A case whose id starts another's (`email`, `email-reply`) is never taken for it.
- A check command runs in the background, so the app keeps answering while it runs.
- A case's word range counts prose and list text, not headings or code, in either kind of fence. A paragraph that follows its heading with no blank line between is counted. An output outside the range is flagged `length: N words, case asks a to b`.
- An output with nothing in it scores 0: a sample with no output file, or one whose file holds nothing but whitespace, which `report.json` marks `blank`. A file with no word in it, such as `{}`, is an output, and so is a picture. A report with no `blank` mark reads only a missing file as no output. Such an output is flagged `no output to judge`, its total is 0 and so is every layer a pack scored, so a failed sample counts as a failure wherever scores are averaged. The workflow pack scores it 0 too, however the transcript reads (`noOutput` in `src/domain/pack.ts`). A sample that was stopped, by Stop, by quitting the app or by Ctrl-C, before it wrote anything is different: it says nothing of the skill, so `run.json` marks it `stopped` and grading leaves it out.
- Jev's answers are stored as Jev gave them, unrounded, so the threshold is applied to what Jev said. A question that was asked and came back with no answer fails that pack's reading (`<pack> pack failed: Jev gave no ...`); it is never read as a no, and never skipped.
- A question asked of some outputs only is the exception: whether the page fits a phone (design), and whether the agent changed course after an error (workflow). One of those Jev left out is stored as no answer and left out of its layer, and the pack's other layers stand (`optionalAnswer` in `src/judges/shared/questions.ts`).

## `bench.json`

`evals/bench.json` is optional. Graded as, at the foot of All cases on Results, writes its `packs`, and every other setting the file holds stays as it was. `st new` writes it for a template whose packs go beyond `generic` (`{ "packs": [...] }`); `blank` and `writing` write none: a piece of writing is graded on its rules and checks, as any skill is.

| Key | Default | Does |
| --- | --- | --- |
| `packs` | `["generic"]` | The judge packs that apply. `generic` always does, first, whether the list names it or not |
| `rules` | `null` | The rules adherence is judged on; `null` or an empty list reads the bullets of `SKILL.md`, below. A blank rule is left out, and one written twice counts once |
| `weights` | `{}` | Points per layer, over each pack's defaults. Each is held at 0 or more |
| `yes` | `0.5` | A judge answer at or above this counts as yes: the rule is followed, the check is met. Held to 0 to 1 |

The file is read through `benchOf` (`src/domain/config.ts`), so one written by hand cannot break a score: a value of the wrong kind falls back to its default, `packs` names each pack once, and a pack the app does not have is left out. A number inside a pack's own setting (`codeCheck`, `workflow`) is held at 0 or more, and `codeCheck.timeoutSeconds` to six hours. Whatever the settings, each layer is held to 0 to 100, so no total passes 100. Each pack adds its own keys, below. `--packs a,b` and `--bench <file>` override the file for one grading, so a skill in another repository can be graded without writing config into it.

With no `rules`, the rules are the top-level `-` and `*` bullets of `SKILL.md`, outside code blocks and the front matter. Lines under a bullet indented by a tab or two spaces join it as a clause of the same rule. A thematic break (`* * *`, `- - -`) is not a bullet. A bullet under four words, or made only of a link, is not a rule, and the editor says so. Numbered lists are never rules.

## Packs

A check marked ×2 on the Cases screen counts double inside `rubric`, the layer of the generic pack that marks the case's checks. The mark is `weight: 2` in the grader file's front matter; a file written by hand, or the Assistant, may say up to 5, and the screen shows that number. An unmet check's flag carries the mark: `(×2)`. Points per layer in `bench.json` are a different thing.

Within a layer, an answer at or above `yes` counts as met. Adherence is the share of rules met; rubric is the share of checks met, each check counted by its weight. The count Results shows beside the bar counts the same way: a ×2 check is two of the total and, when met, two of the met, so "3 of 4" and a bar at 75 say one thing.

| Pack | Judges | Layers (default points) | Keys in `bench.json` |
| --- | --- | --- | --- |
| `generic` | any output | adherence 50 (one question per skill rule), rubric 50 (one per check, over the whole output) | `rules` |
| `code` | code | check 60 (the exit code of the case's `bench.check`) | `codeCheck.timeoutSeconds` |
| `workflow` | the transcript | efficiency 40, scope 20, process 40 | `workflow.maxRetries`, `workflow.summaryLines` |
| `design` | HTML or an image | visual 30 (Jev, looking at the output as a picture) | |

### Generic

The pack asks one question per rule and one per check, about the work as a whole. Jev is given every part of it there is:

- `output`: the text of the primary artifact, its first 24,000 characters. A page is its HTML and code is its source. A picture has no text.
- `picture`: the output as a picture. A page is the page as the desktop app drew it (see Design, below, for how and at what size), else the first PNG or JPEG the agent left in `outputs/`; an output that is a picture is that picture. So a rule about how a page looks is judged on how it looks.
- `other_files`: the start of every other text file the agent wrote, 6,000 characters of each and 18,000 in all, by its path. A test beside the code, or a script beside a page, is part of the work. A file that says what the primary one says, such as a preview that is the page, is left out.
- `notes`: what the agent told the user (`notes.md` in the sample, which the run's prompt has it write in place of a reply), its first 6,000 characters. A rule or check that asks for something to be said, named, listed or reported is met when the notes say it. Nothing else is judged on the notes: a rule about the piece's length or wording is not failed for how the notes read.
- `request` and `request_images`: the case's prompt and the pictures it came with.

A picture Jev cannot read is left out with the flag `picture not judged: ...`, and the text is still judged. An output with neither text nor a picture Jev can read gets no adherence or rubric.

### Code

The check command runs in the sample directory, so it executes code the agent wrote. Run untrusted skills in a container or VM. A case that names no `bench.check` gets nothing from this pack. Whether the code follows the skill's rules and meets the case's checks is the generic pack's to mark, over the primary code file and the other files beside it, not a diff against the case's input files.

Ticking Code also says the code is the work: among an output's files the code is judged, not a Markdown note beside it.

### Workflow

The pack needs a transcript; a run whose outputs sit flat at the run root (`RunMeta.legacy`) and an anchor have none and get no workflow layers.

- Code counts tool calls, errors, identical repeated calls, time against the case's `timeout_seconds`, tool calls against `max_turns`, and paths outside the sample directory. A path is read where a tool names a place: the file a read, write or edit names, what a glob or a listing names, and each word of a shell command that is absolute, starts with `~` or reaches up with `..`. A path that resolves inside the sample is never counted. A system folder named by an absolute path is not counted either: `/dev`, `/tmp`, `/private/tmp`, `/usr`, `/bin`, `/opt` and `/etc`. A path that climbs out of the sample with `..` counts wherever it lands, a system folder included.
- A shell's relative path is resolved against the folder the shell is in. The transcript's commands run in order from the sample directory, and a `cd` or `pushd` moves the folder for what follows, in the same command and the next ones; a subshell's `cd` ends with the subshell. After a `cd` code cannot follow, such as `cd "$DIR"`, a relative path is not read until the next `cd` it can.
- What a pattern program is given to look for (`grep`, `rg`, `sed`, `awk`, `perl`, `jq`) is not a path: the first word that is not an option, quoted or not, or the value of `-e`. The words after it are, and so is a `-f` file. No word given to `tr` is a path, since it reads stdin only; a redirection's file always is. A search tool (`Grep`) is kept in the transcript as the folder the call names, or as its pattern when it names none, so its argument counts only when it names a file or folder that is on disk. A web tool's argument is never a path.
- Efficiency is the share of checks passed: repeated calls within `workflow.maxRetries` (1), tool calls within `max_turns` and seconds within `timeout_seconds`, the last two only when the case sets them. An error takes nothing off: a test that fails before the fix is the work going right, and what the agent did after an error is asked in process. Scope is 0 when any path lands outside the sample, else 1.
- A run that wrote nothing scores 0 on every workflow layer: a tidy transcript with no output is a failed sample.
- Code checks that `SKILL.md` was read before the first write. A `without_skill` sample skips that check.
- Jev reads a one-line-per-step summary, `workflow.summaryLines` lines of it (80, and never fewer than 2), and answers whether the task was done and, after an error, whether the agent changed course. Process is the share of those answers at or above `yes`, with the read-first check counted beside them. Without Jev there is no process layer.

### Design

The pack runs only when the primary artifact is HTML or an image (`.png`, `.jpg`, `.jpeg`, `.webp`, `.gif` or `.svg`). A page or a picture beside Markdown is the primary artifact already; set `bench.artifact: markdown` on a case whose Markdown is the piece to judge.

- It asks only what any visual must be, of the output as a picture: whether it has one clear main point (the verdict "The output has one clear main point") and whether anything in it is broken ("Nothing in the output looks broken": text that overlaps or cannot be read, something cut off or run out of its box, a missing picture, a blank or unstyled page). Plain blocks standing in for content are not broken, so a wireframe or a mockup is not failed for being one. Each counts once.
- It checks nothing about the HTML. What a page must have, such as a `lang`, a viewport or a `<main>`, is for the skill to state as a rule or the case as a check, which the generic pack marks: a page is not always a web page, and a mockup or a slide owes the web none of it.
- The picture is the page as the desktop app draws it, its scripts run: in a window the case's size (`bench.size: [width, height]`), else 1280 by 960 pixels, scaled down whole when a side is past 1568. That is what Results shows the reader. Where nothing was drawn, it is the first PNG or JPEG the agent left in `outputs/`: an agent's own screenshot may show something else, or the page before its last change, so a drawn page comes first. An image in another format is not read. With no picture the pack says nothing.
- For a case with `bench.phone: true` ("Check that a page works on a phone too" on Cases), the desktop app also draws the page 390 by 1200 pixels, and Jev is asked whether it works on a phone: nothing cut off at the side, running past the edge or overlapping (the verdict "The page fits a phone screen"). Off by default: most pages are made for a desktop window. The pictures are kept in the sample's `renders/` folder, named by their size, and drawn again only when the page changes. `st run`, `st grade` and `st serve` draw nothing, so there a page is looked at only through a screenshot the agent left. A page that does not load in 20 seconds, or is not drawn in 30, or whose page stops, is logged and judged without its picture.
- A picture outside the sizes Jev reads (280 to 1568 px a side) is left out with the flag `screenshot not judged: ...` or `phone screenshot not judged: ...`.

Ticking Design also says the page or picture is the work: among an output's files it is judged, not a Markdown note beside it.

### Size

A case may name a size in pixels, `bench.size: [width, height]` in its `case.yaml` ("Check the output's size in pixels", under Length and size on Cases). Every pack holds a picture to it the way it holds an output to the word range: grading reads the picture's own size (PNG, JPEG, GIF, WebP, or an SVG's `width` and `height` or `viewBox`) into the report as `pixels`, and a picture of any other size is flagged `size: 1200 × 630 px, case asks 1600 × 900 px`, which counts in no layer and shows under Missed. A page is not held to it: it is drawn at that size for Jev to look at instead.

## Pictures

Jev's image input is a preview. A request that holds a picture is sent with the `TypeSafe-Danger-Zone-Images: true` header, and no other request is.

- A case's pictures (the PNG and JPEG files in its `files/`) go to Jev once as `request_images`, beside the prompt.
- A check with `image: references/<file>` in its front matter is asked with that picture.
- Each picture is checked against Jev's limits first, because Jev fails the whole request for one it refuses.

## Verdicts

A score is counted from facts, and the scorers report each one (`Verdict` in `src/domain/pack.ts`): a rule of the skill followed or broken, a check of the case met or missed, or another thing a pack measured. Results lists them under each output, missed first.

- A fact is named by its kind and its words, such as `rule:Keep the note under 120 words.` or `check:The note names Priya.`, so a rule or check that is edited is a new fact. The fixed questions of a pack have names of their own (`other:hierarchy`, `other:finished`, `other:followed task`).
- A fact Jev answered is open to the reader's own answer. A fact code measured is not: the exit code of a check command, a count of tool calls, a word range.

## Corrections

`evals/reviews.json` holds what the reader said, written by Results.

- **A correction** is the reader's own answer on one fact of one output: `reviews["<run>/<sample>"].corrections["<fact>"]` is `true` when the output meets it and `false` when it does not, whatever Jev said. It stands over Jev's answer wherever the app scores that output: the fact moves between Missed and Met, and the layer and the total follow. It stays the reader's answer when a `yes` threshold changed in `bench.json` brings Jev's answer round to it; the row then says "your answer, agrees with Jev", and "Take back" still removes it. `report.json` keeps Jev's own answers, so `st report` prints the scores without corrections.
- Deleting a version, or one run, moves the corrections on the runs' outputs to the trash with it, and Undo brings them back. So do the entries of `preferences` that name one of its outputs: votes between two outputs, which the app neither writes nor reads. A delete that cannot move everything moves nothing. Undo is refused once the skill holds a version of that number again, so two different texts never share one.

Any other field in `reviews.json`, such as a rating, a note or a vote, is kept as it is when the file is written, and nothing reads it.

## Version scores and the lift

A version's score is the mean of its cases, each case the mean of its graded outputs, so a case run three times counts once. Where one writer (an engine and model) ran two versions, a version's score counts that writer's outputs only, so one version reads against the next. When several writers did, the one whose newest run is newest is read. The version lift on Results compares that writer's oldest run on the first version it ran with its newest run on the latest it ran, over the cases both runs answered (`sharedCases`); when either run answered cases the other did not, `casesDiffer` is set and the page says over how many cases the means are read. The floor is the same writer's newest run without the skill that answered every one of those cases, read over them. When no such run answered them all, the floor is the one that answered the most of them, the newest of those, read over the ones it answered: `baselineCases` says how many, and `casesDiffer` is set. A run without the skill that answered none of them is no floor. In the lift, a run made against an older version's snapshot (`old_skill`) is that version's run, as on the comparison. `src/domain/lift.ts` holds the lift, and `versionScore` in `src/renderer/model.ts` a version's score.

## Anchors

An anchor is an output labelled good or bad, written by hand in `evals/anchors/`. `st self-test` grades every anchor, writes `evals/anchors/report.json`, and checks that each bad anchor scores below the good anchor of its case, on each layer named in its `tests` front matter, else on `total`. A case has one good anchor: a later one replaces an earlier one, and a bad anchor whose case has no good anchor is not checked. Trust a pack on a skill only once its anchors pass.
