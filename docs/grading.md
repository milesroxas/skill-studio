# Grading

Grading runs a skill's judge packs over each sample of a run and writes `report.json`. It follows a run started in the app (`st run --no-grade` skips it), and runs again on Regrade in the app or with `st grade`.

This page uses the words of the files: a **pack** is a set of judge questions for one kind of work, and a **layer** is one part of a score. The app calls a pack the kind of work a skill is "graded as", and a layer a part of the score: Rules, Checks and so on.

- A pack runs on a sample when it judges the kind of the sample's primary artifact: the first output of the case's `bench.artifact` kind, else the first Markdown file, else the first output of any kind.
- Jev's raw answers are stored. Points per layer, the threshold and pack settings are applied in code (`src/domain/scoring.ts` and each pack's `score.ts`), so Scoring, on Results, rescores without new judge calls.
- Without a TypeSafe key, or with `--no-jev`, only code checks run and every judged layer is null. A null layer, or one given 0 points, is left out of the total and the rest rescale. A pack that throws leaves every one of its layers null and adds the flag `<pack> pack failed: ...`.
- A case's word range counts prose and list text, not headings or code. An output outside it is flagged `length: N words, case asks a to b`; a sample with no output is flagged `no output to judge`.

## `bench.json`

`evals/bench.json` is optional. Scoring, at the foot of All cases on Results, writes it, and so does `st new` for a template whose packs go beyond `generic` (`{ "packs": [...] }`); `blank` writes none.

| Key | Default | Does |
| --- | --- | --- |
| `packs` | `["generic"]` | The judge packs that apply, in order |
| `rules` | `null` | The rules adherence is judged on; `null` or an empty list reads the bullets of `SKILL.md`, below |
| `weights` | `{}` | Points per layer, over each pack's defaults |
| `yes` | `0.5` | A judge answer at or above this counts as yes: the rule is followed, the check is met |

Each pack adds its own keys, below. `--packs a,b` and `--bench <file>` override the file for one grading, so a skill in another repository can be graded without writing config into it.

With no `rules`, the rules are the top-level `-` and `*` bullets of `SKILL.md`, outside code blocks and the front matter. Indented lines under a bullet join it as a clause of the same rule. A bullet under four words, or made only of a link, is not a rule, and the editor says so. Numbered lists are never rules.

## Packs

A check marked ×2 on the Cases screen counts double inside the layer that marks the case's checks: `rubric` (generic), `review` (code) and `visual` (design), named by each pack's `checks`. The writing and workflow packs read no checks, and the Cases screen says so in their place. Results offers "Add a check" only where a pack reads them. The mark is `weight: 2` in the grader file's front matter; a file written by hand, or the Assistant, may say up to 5, and the screen shows that number. An unmet check's flag carries the mark: `(×2)`. Points per layer in `bench.json` are a different thing.

Within a layer, an answer at or above `yes` counts as met. Adherence is the share of rules met; rubric, review and visual are the share of checks met, each check counted by its weight.

| Pack | Judges | Layers (default points) | Keys in `bench.json` |
| --- | --- | --- | --- |
| `generic` | Markdown | adherence 50 (one question per skill rule), rubric 50 (one per check) | `rules` |
| `writing` | Markdown | lint 15, shape 15, structure 20, substance 25, tone 10, grounding 15 | `lint`, `writingKind`, `warningCost`, `structure`, `substance`, `bands`, `groundingPrior`, `contradictionCap`, `writer`, `borrowed` |
| `code` | code | check 60 (the exit code of the case's `bench.check`), review 40 (the case's checks over the file) | `codeCheck.timeoutSeconds`, `codeCheck.maxChars` |
| `workflow` | the transcript | efficiency 40, scope 20, process 40 | `workflow.maxRetries`, `workflow.summaryLines` |
| `design` | HTML or an image | markup 40 (code checks), visual 60 (Jev) | `design.maxChars` |

### Writing

A case's `bench.kind` (`article`, `linkedinPost`, `coverLetter`, `youtubeScript`) picks the layers; shape applies to articles only. A case with no `bench.kind` takes `writingKind` (default `article`). A kind outside that list scores lint, substance, tone and grounding only.

- Grounding asks one question per factual claim against the nearest chunks of the case's `bench.evidence` files. A contradiction counts only when a second, literal question agrees.
- `writer` names who "I" is in the copy.
- `borrowed` lists case-insensitive patterns for lines the copy must not lift from a source. Each match is a flag.

`lint.command` runs from the skill directory with the copy on stdin; `{kind}` in the command becomes the case's kind:

```json
{ "packs": ["writing"], "lint": { "command": "node scripts/lint.mjs --kind {kind}" }, "writer": "Ada Lovelace" }
```

The command prints `{ "findings": [...] }` or a bare array of `{ severity: "error" | "warning" | "info", rule, message, excerpt? }`. Its exit code is ignored. Any error scores lint 0, and each warning costs `warningCost` (0.2). A command that prints no findings, or runs past `lint.timeoutSeconds` (60), leaves the layer null with a flag.

With no command, a fallback lint treats an em dash as an error (`em-dash`), and warns on exclamation marks (`exclamation`), emoji (`emoji`) and a word count outside the case's range (`length`). Its word count includes headings.

### Code

The check command runs in the sample directory, so it executes code the agent wrote. Run untrusted skills in a container or VM. Review reads the primary code file only, not a diff against the case's input files.

### Workflow

The pack needs a transcript; a run whose outputs sit flat at the run root (`RunMeta.legacy`) and an anchor have none and get no workflow layers.

- Code counts tool calls, errors, identical repeated calls, time against the case's `timeout_seconds`, tool calls against `max_turns`, and absolute paths outside the sample directory. System folders are not counted: `/dev`, `/tmp`, `/private/tmp`, `/usr`, `/bin`, `/opt` and `/etc`.
- Efficiency is the share of checks passed: no errors, repeated calls within `workflow.maxRetries` (1), tool calls within `max_turns` and seconds within `timeout_seconds`, the last two only when the case sets them. Scope is 0 when any path lands outside the sample, else 1.
- Code checks that `SKILL.md` was read before the first write. A `without_skill` sample skips that check.
- Jev reads a one-line-per-step summary and answers whether the task was done and, after an error, whether the agent changed course. Process is the share of those answers at or above `yes`.

### Design

The pack does not render the page, and runs only when the primary artifact is HTML or an image (`.png`, `.jpg`, `.jpeg`, `.webp`, `.gif` or `.svg`). When the agent also writes Markdown, set `bench.artifact: html` on the case.

- Markup checks the document shell, landmarks, heading order, alt text and inline handlers: eight checks of equal worth, `doctype`, `lang`, `title`, `viewport`, `main`, `headings`, `alt` and `handlers`.
- Visual asks Jev about hierarchy and the case's checks, over the HTML text. Hierarchy counts once, the finished question once when there is a screenshot, and each check by its weight.
- When the agent left a PNG or JPEG screenshot in `outputs/`, Jev is also asked whether the page looks finished with nothing broken, and a check that has its own picture is asked of the screenshot. Only the first PNG or JPEG is read; an image in another format is not.
- A screenshot outside the sizes Jev reads (280 to 1568 px a side) is left out with the flag `screenshot not judged: ...`. The HTML is still judged.

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

## Corrections and picks

`evals/reviews.json` holds what the reader said. Both are written by Results.

- **A correction** is the reader's own answer on one fact of one output: `reviews["<run>/<sample>"].corrections["<fact>"]` is `true` when the output meets it and `false` when it does not, whatever Jev said. It stands over Jev's answer wherever the app scores that output: the fact moves between Missed and Met, and the layer and the total follow. "Take back" removes it. `report.json` keeps Jev's own answers, so `st report` prints the scores without corrections.
- **A pick** is the reader's choice of the better of two outputs: an entry of `preferences` with the two output keys, `vote` (`a`, `b` or `tie`), `criterion: "overall"` and `by: "human"`. One pick is kept per pair. It changes no score. Results sets it beside the two totals, and says so when the output not picked scores higher.
- Deleting a version moves the corrections and picks on its runs' outputs to the trash with it, and Undo brings them back.

A `reviews.json` from an earlier version of the app may hold more: ratings, notes, votes by Jev. They are kept as they are when the file is written, and nothing reads them.

## Anchors

An anchor is an output labelled good or bad, written by hand in `evals/anchors/`. `st self-test` grades every anchor, writes `evals/anchors/report.json`, and checks that each bad anchor scores below the good anchor of its case, on each layer named in its `tests` front matter, else on `total`. A case has one good anchor: a later one replaces an earlier one, and a bad anchor whose case has no good anchor is not checked. Trust a pack on a skill only once its anchors pass.
