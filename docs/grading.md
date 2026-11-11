# Grading

Grading runs a skill's judge packs over each sample of a run and writes `report.json`. It follows each run, in the app and from `st run` (`--no-grade` skips it), and runs again on Regrade in the app or with `st grade`.

This page uses the words of the files: a **pack** is a set of judge questions for one kind of work, and a **layer** is one part of a score. The app calls a pack the kind of work a skill is "graded as", and a layer a part of the score: Rules, Checks and so on.

- A pack runs on a sample when it judges the kind of the sample's primary artifact (`primaryArtifact` in `src/domain/primary.ts`): an output of the case's `bench.artifact` kind; else a page, a picture or code, in that order, when one of the skill's packs judges that kind; else Markdown; else the first output of any kind. The order the skill lists its packs in does not matter. Among files of one kind, `index.html` or `preview.html` comes first, and a `README` or a `.txt` file last, so a page and the script beside it are judged as the page, and a post beside its notes as the post. Results opens the same file on an output not graded yet. The workflow pack runs on every sample.
- Jev's raw answers are stored. Points per layer, the threshold and pack settings are applied in code (`src/domain/scoring.ts` and each pack's `score.ts`), so a change to `bench.json`, or to Graded as on Results, rescores without new judge calls.
- Without a TypeSafe key, or with `--no-jev`, only code checks run and every judged layer is null. A case with `bench.judge: false` is graded the same way, in every pack: Jev is asked nothing about its outputs (`asksJev` in `src/judges/shared/questions.ts`). A null layer, or one given 0 points, is left out of the total and the rest rescale. A pack that throws leaves every one of its layers null and adds the flag `<pack> pack failed: ...`. A grading with that flag on every output writes no `report.json`, so the last report stands; in the app the job fails, with the first reason in its log. One with the flag on some outputs says how many and goes on.
- Regrade asks only about what changed. Each pack's raw answer is kept in `judge-cache.json` beside `report.json`, under a hash of the model, the pack and the version of its questions, the output text and transcript, the case, the bytes of the case's pictures as the run kept them in `_inputs/` and of its checks' pictures, the rules, the evidence and the settings. Points per layer and `yes` are not in the hash, since they apply in scoring, and neither is a setting that is another pack's alone. On the next grading an output whose hash matches keeps its answer, and the log says `N of M outputs unchanged: kept their verdicts.`
- The file keeps this grading's answers and, before them, the earlier ones it did not ask about again, up to four gradings' worth. So a grading without a TypeSafe key, or with a setting changed and then put back, does not cost the answers Jev already gave. It is written when a grading is stopped or fails too, with what had been answered by then.
- A sample folder is `<case>-s<n>`, and its case is read from that name whole. A case whose id starts another's (`email`, `email-reply`) is never taken for it.
- A check or lint command runs in the background, so the app keeps answering while it runs.
- A case's word range counts prose and list text, not headings or code, in either kind of fence. A paragraph that follows its heading with no blank line between is counted. An output outside the range is flagged `length: N words, case asks a to b`.
- An output with nothing in it scores 0: a sample with no output file, or one whose file holds nothing but whitespace, which `report.json` marks `blank`. A file with no word in it, such as `{}`, is an output, and so is a picture. A report with no `blank` mark reads only a missing file as no output. Such an output is flagged `no output to judge`, its total is 0 and so is every layer a pack scored, so a failed sample counts as a failure wherever scores are averaged. The workflow pack scores it 0 too, however the transcript reads (`noOutput` in `src/domain/pack.ts`). A sample that was stopped, by Stop, by quitting the app or by Ctrl-C, before it wrote anything is different: it says nothing of the skill, so `run.json` marks it `stopped` and grading leaves it out.
- Jev's answers are stored as Jev gave them, unrounded, so the threshold is applied to what Jev said. A question that was asked and came back with no answer fails that pack's reading (`<pack> pack failed: Jev gave no ...`); it is never read as a no, and never skipped.
- A question asked of some outputs only is the exception: the kind of title, what the paragraph before the ending does, and whether an AI did part of the work and whose part was whose (writing), whether the screenshot looks finished (design), and whether the agent changed course after an error (workflow). One of those Jev left out is stored as no answer and left out of its layer, and the pack's other layers stand (`optionalAnswer` in `src/judges/shared/questions.ts`).

## `bench.json`

`evals/bench.json` is optional. Graded as, at the foot of All cases on Results, writes its `packs`, and every other setting the file holds stays as it was. `st new` writes it for a template whose packs go beyond `generic` (`{ "packs": [...] }`); `blank` writes none.

| Key | Default | Does |
| --- | --- | --- |
| `packs` | `["generic"]` | The judge packs that apply, in order |
| `rules` | `null` | The rules adherence is judged on; `null` or an empty list reads the bullets of `SKILL.md`, below. A blank rule is left out, and one written twice counts once |
| `weights` | `{}` | Points per layer, over each pack's defaults. Each is held at 0 or more |
| `yes` | `0.5` | A judge answer at or above this counts as yes: the rule is followed, the check is met. Held to 0 to 1 |

The file is read through `benchOf` (`src/domain/config.ts`), so one written by hand cannot break a score: a value of the wrong kind falls back to its default, `packs` names each pack once, `warningCost` is held at 0 or more, and `groundingPrior` and `contradictionCap` to 0 to 1. A number inside a pack's own setting (`structure`, `substance`, `lint`, `codeCheck`, `workflow`, `design`) is held at 0 or more, and `structure.pointerCredit` to 0 to 1. Whatever the settings, each layer is held to 0 to 100, so no total passes 100. Each pack adds its own keys, below. `--packs a,b` and `--bench <file>` override the file for one grading, so a skill in another repository can be graded without writing config into it.

With no `rules`, the rules are the top-level `-` and `*` bullets of `SKILL.md`, outside code blocks and the front matter. Lines under a bullet indented by a tab or two spaces join it as a clause of the same rule. A thematic break (`* * *`, `- - -`) is not a bullet. A bullet under four words, or made only of a link, is not a rule, and the editor says so. Numbered lists are never rules.

## Packs

A check marked ×2 on the Cases screen counts double inside the layer that marks the case's checks: `rubric` (generic), `review` (code) and `visual` (design), named by each pack's `checks`. The writing and workflow packs read no checks, and the Cases screen says so in their place. Results offers "Add a check" only where a pack reads them. The mark is `weight: 2` in the grader file's front matter; a file written by hand, or the Assistant, may say up to 5, and the screen shows that number. An unmet check's flag carries the mark: `(×2)`. Points per layer in `bench.json` are a different thing.

Within a layer, an answer at or above `yes` counts as met. Adherence is the share of rules met; rubric, review and visual are the share of checks met, each check counted by its weight. The count Results shows beside the bar counts the same way: a ×2 check is two of the total and, when met, two of the met, so "3 of 4" and a bar at 75 say one thing.

| Pack | Judges | Layers (default points) | Keys in `bench.json` |
| --- | --- | --- | --- |
| `generic` | Markdown | adherence 50 (one question per skill rule), rubric 50 (one per check, over the whole output) | `rules` |
| `writing` | Markdown | lint 15, shape 15, structure 20, substance 25, tone 10, grounding 15 | `lint`, `writingKind`, `warningCost`, `structure`, `substance`, `bands`, `groundingPrior`, `contradictionCap`, `writer`, `borrowed` |
| `code` | code | check 60 (the exit code of the case's `bench.check`), review 40 (the case's checks over the file) | `codeCheck.timeoutSeconds`, `codeCheck.maxChars` |
| `workflow` | the transcript | efficiency 40, scope 20, process 40 | `workflow.maxRetries`, `workflow.summaryLines` |
| `design` | HTML or an image | markup 40 (code checks), visual 60 (Jev) | `design.maxChars` |

### Writing

A case's `bench.kind` (`article`, `linkedinPost`, `coverLetter`, `youtubeScript`) picks the layers; shape applies to articles only. A case with no `bench.kind` takes `writingKind` (default `article`). A kind outside that list scores lint, substance, tone and grounding only.

- Grounding asks one question per factual claim against the nearest chunks of the case's `bench.evidence` files. A contradiction counts only when a second, literal question agrees.
- Grounding is (supported claims + `groundingPrior`) / (factual claims + 1), with a prior of 0.9. One supported claim of one reads 95, two of two 97, and no count reaches 100: the prior stands for one more claim nobody checked, taken as nearly sure, so a piece with a single claim that held does not read as fully grounded. Any contradiction caps the layer at `contradictionCap` (0.5).
- Shape measures prose only: fenced code is left out, as it is from the word count.
- `writer` names who "I" is in the copy.
- `borrowed` lists case-insensitive patterns for lines the copy must not lift from a source. Each match is a flag.

`lint.command` runs from the skill directory with the copy on stdin; `{kind}` in the command becomes the case's kind:

```json
{ "packs": ["writing"], "lint": { "command": "node scripts/lint.mjs --kind {kind}" }, "writer": "Ada Lovelace" }
```

The command prints `{ "findings": [...] }` or a bare array of `{ severity: "error" | "warning" | "info", rule, message, excerpt? }`. Its exit code is ignored. Any error scores lint 0, and each warning costs `warningCost` (0.2). A command that prints no findings JSON, or runs past `lint.timeoutSeconds` (60), leaves the layer null with a flag.

With no command, a fallback lint treats an em dash as an error (`em-dash`), and warns on exclamation marks (`exclamation`), emoji (`emoji`) and a word count outside the case's range (`length`). Its word count includes headings.

### Code

The check command runs in the sample directory, so it executes code the agent wrote. Run untrusted skills in a container or VM. Review reads the primary code file only, not a diff against the case's input files.

### Workflow

The pack needs a transcript; a run whose outputs sit flat at the run root (`RunMeta.legacy`) and an anchor have none and get no workflow layers.

- Code counts tool calls, errors, identical repeated calls, time against the case's `timeout_seconds`, tool calls against `max_turns`, and paths outside the sample directory. A path is read where a tool names a place: the file a read, write or edit names, what a glob or a listing names, and each word of a shell command that is absolute, starts with `~` or reaches up with `..`. A path that resolves inside the sample is never counted. A system folder named by an absolute path is not counted either: `/dev`, `/tmp`, `/private/tmp`, `/usr`, `/bin`, `/opt` and `/etc`. A path that climbs out of the sample with `..` counts wherever it lands, a system folder included.
- A shell's relative path is resolved against the folder the shell is in. The transcript's commands run in order from the sample directory, and a `cd` or `pushd` moves the folder for what follows, in the same command and the next ones; a subshell's `cd` ends with the subshell. After a `cd` code cannot follow, such as `cd "$DIR"`, a relative path is not read until the next `cd` it can.
- What a pattern program is given to look for (`grep`, `rg`, `sed`, `awk`, `perl`, `jq`) is not a path: the first word that is not an option, quoted or not, or the value of `-e`. The words after it are, and so is a `-f` file. No word given to `tr` is a path, since it reads stdin only; a redirection's file always is. A search tool (`Grep`) is kept in the transcript as the folder the call names, or as its pattern when it names none, so its argument counts only when it names a file or folder that is on disk. A web tool's argument is never a path.
- Efficiency is the share of checks passed: no errors, repeated calls within `workflow.maxRetries` (1), tool calls within `max_turns` and seconds within `timeout_seconds`, the last two only when the case sets them. Scope is 0 when any path lands outside the sample, else 1.
- A run that wrote nothing scores 0 on every workflow layer: a tidy transcript with no output is a failed sample.
- Code checks that `SKILL.md` was read before the first write. A `without_skill` sample skips that check.
- Jev reads a one-line-per-step summary, `workflow.summaryLines` lines of it (80, and never fewer than 2), and answers whether the task was done and, after an error, whether the agent changed course. Process is the share of those answers at or above `yes`, with the read-first check counted beside them. Without Jev there is no process layer.

### Design

The pack runs only when the primary artifact is HTML or an image (`.png`, `.jpg`, `.jpeg`, `.webp`, `.gif` or `.svg`). A page or a picture beside Markdown is the primary artifact already; set `bench.artifact: markdown` on a case whose Markdown is the piece to judge.

- Markup checks the document shell, landmarks, heading order, alt text and inline handlers: eight checks of equal worth, `doctype`, `lang`, `title`, `viewport`, `main`, `headings`, `alt` and `handlers`. A handler is an attribute named `on` and an event (`onclick`, `onload`, `onunhandledrejection`): every event handler attribute of the HTML standard and of the specs that add events to it, the ones browsers still run, and any `onwebkit…`. `one`, `only` and `online` are not.
- Visual asks Jev about hierarchy and the case's checks, over the HTML text. Hierarchy counts once, the finished question once when there is a screenshot, the phone question once when the page was drawn at phone width, and each check by its weight.
- The screenshot is the page as the desktop app draws it, its scripts run: in a window the case's size (`bench.size: [width, height]`), else 1280 by 960 pixels, scaled down whole when a side is past 1568. That is what Results shows the reader. Where nothing was drawn, it is the first PNG or JPEG the agent left in `outputs/`: an agent's own screenshot may show something else, or the page before its last change, so a drawn page comes first. Jev is asked whether it looks finished with nothing broken, and a check that has its own picture is asked of it. An image in another format is not read.
- For a case with `bench.phone: true` ("Check that a page works on a phone too" on Cases), the desktop app also draws the page 390 by 1200 pixels, and Jev is asked whether it works on a phone: nothing cut off at the side, running past the edge or overlapping (the verdict "The page fits a phone screen"). Off by default: most pages are made for a desktop window. The pictures are kept in the sample's `renders/` folder, named by their size, and drawn again only when the page changes. `st grade` and `st serve` draw nothing, so there the page is judged by its markup and any screenshot the agent left. A page that does not load in 20 seconds, or is not drawn in 30, or whose page stops, is logged and judged without its picture.
- A picture outside the sizes Jev reads (280 to 1568 px a side) is left out with the flag `screenshot not judged: ...` or `phone screenshot not judged: ...`. The HTML is still judged.

### Size

A case may name a size in pixels, `bench.size: [width, height]` in its `case.yaml` ("Size" on Cases). Every pack holds a picture to it the way it holds an output to the word range: grading reads the picture's own size (PNG, JPEG, GIF, WebP, or an SVG's `width` and `height` or `viewBox`) into the report as `pixels`, and a picture of any other size is flagged `size: 1200 × 630 px, case asks 1600 × 900 px`, which counts in no layer and shows under Missed. A page is not held to it: it is drawn at that size for the design pack instead.

## Pictures

Jev's image input is a preview. A request that holds a picture is sent with the `TypeSafe-Danger-Zone-Images: true` header, and no other request is.

- A case's pictures (the PNG and JPEG files in its `files/`) go to Jev once as `request_images`, beside the prompt.
- A check with `image: references/<file>` in its front matter is asked with that picture.
- Each picture is checked against Jev's limits first, because Jev fails the whole request for one it refuses.

## Verdicts

A score is counted from facts, and the scorers report each one (`Verdict` in `src/domain/pack.ts`): a rule of the skill followed or broken, a check of the case met or missed, or another thing a pack measured. Results lists them under each output, missed first.

- A fact is named by its kind and its words, such as `rule:Keep the note under 120 words.` or `check:The note names Priya.`, so a rule or check that is edited is a new fact. The fixed questions of a pack have names of their own (`other:hierarchy`, `other:followed task`).
- A fact Jev answered is open to the reader's own answer. A fact code measured is not: the exit code of a check command, a markup check, a count of tool calls, a word range.
- The writing pack's layers are measures, not counts of facts. It reports what it found wrong, and none of it is open to an answer.

## Corrections

`evals/reviews.json` holds what the reader said, written by Results.

- **A correction** is the reader's own answer on one fact of one output: `reviews["<run>/<sample>"].corrections["<fact>"]` is `true` when the output meets it and `false` when it does not, whatever Jev said. It stands over Jev's answer wherever the app scores that output: the fact moves between Missed and Met, and the layer and the total follow. It stays the reader's answer when a `yes` threshold changed in `bench.json` brings Jev's answer round to it; the row then says "your answer, agrees with Jev", and "Take back" still removes it. `report.json` keeps Jev's own answers, so `st report` prints the scores without corrections.
- Deleting a version moves the corrections on its runs' outputs to the trash with it, and Undo brings them back. So do the entries of `preferences` that name one of its outputs: votes between two outputs, which the app neither writes nor reads. A delete that cannot move everything moves nothing. Undo is refused once the skill holds a version of that number again, so two different texts never share one.

Any other field in `reviews.json`, such as a rating, a note or a vote, is kept as it is when the file is written, and nothing reads it.

## Version scores and the lift

A version's score is the mean of its cases, each case the mean of its graded outputs, so a case run three times counts once. Where one writer (an engine and model) ran two versions, a version's score counts that writer's outputs only, so one version reads against the next. When several writers did, the one whose newest run is newest is read. The version lift on Results compares that writer's oldest run on the first version it ran with its newest run on the latest it ran, over the cases both runs answered (`sharedCases`); when either run answered cases the other did not, `casesDiffer` is set and the page says over how many cases the means are read. The floor is the same writer's newest run without the skill that answered every one of those cases, read over them. When no such run answered them all, the floor is the one that answered the most of them, the newest of those, read over the ones it answered: `baselineCases` says how many, and `casesDiffer` is set. A run without the skill that answered none of them is no floor. In the lift, a run made against an older version's snapshot (`old_skill`) is that version's run, as on the comparison. `src/domain/lift.ts` holds the lift, and `versionScore` in `src/renderer/model.ts` a version's score.

## Anchors

An anchor is an output labelled good or bad, written by hand in `evals/anchors/`. `st self-test` grades every anchor, writes `evals/anchors/report.json`, and checks that each bad anchor scores below the good anchor of its case, on each layer named in its `tests` front matter, else on `total`. A case has one good anchor: a later one replaces an earlier one, and a bad anchor whose case has no good anchor is not checked. Trust a pack on a skill only once its anchors pass.
