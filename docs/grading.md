# Grading

Grading runs a skill's judge packs over each sample of a run and writes `report.json`. It follows a run unless you turn it off, and runs again on Regrade in the app or with `st grade`.

- A pack runs on a sample when it judges the kind of the sample's primary artifact: the first output of the case's `bench.artifact` kind, else the first Markdown file, else the first output of any kind.
- Jev's raw answers are stored. Points per layer, thresholds and pack settings are applied in code (`src/domain/scoring.ts` and each pack's `score.ts`), so the Scoring screen rescores without new judge calls.
- Without a TypeSafe key, or with `--no-jev`, only code checks run and every judged layer is null. A null layer is left out of the total and the rest rescale.
- A case's word range counts prose and list text, not headings or code.

## `bench.json`

`evals/bench.json` is optional. The Scoring screen writes it, and so does a skill created from a template.

| Key | Default | Does |
| --- | --- | --- |
| `packs` | `["generic"]` | The judge packs that apply, in order |
| `rules` | `null` | The rules adherence is judged on; `null` reads the top-level bullets of `SKILL.md` |
| `weights` | `{}` | Points per layer, over each pack's defaults |
| `yes` | `0.5` | A judge answer at or above this counts as yes |
| `sure` | `0.6` | A verdict below this confidence is listed as unsure, and a Jev pairwise vote below it is not counted |
| `agreeAt` | `70` | The layer score the Agreement screen counts as good |
| `defaultCase` | `null` | The case ticked on every new run; `null` ticks the first. "Default case" on New run writes it |

Each pack adds its own keys, below. `--packs a,b` and `--bench <file>` override the file for one grading, so a skill in another repository can be graded without writing config into it.

## Packs

A check marked ×2 on the Cases screen counts double inside the layer that marks the case's checks: `rubric` (generic), `review` (code) and `visual` (design), named by each pack's `checks`. The writing and workflow packs read no checks, and the Cases screen says so in their place. The mark is `weight: 2` in the grader file's front matter; a file written by hand, or the Assistant, may say up to 5, and the screen shows that number. An unmet check's flag carries the mark: `(×2)`. Points per layer in `bench.json` are a different thing.

| Pack | Judges | Layers (default points) | Keys in `bench.json` |
| --- | --- | --- | --- |
| `generic` | Markdown | adherence 50 (one question per skill rule), rubric 50 (one per check) | `rules` |
| `writing` | Markdown | lint 15, shape 15, structure 20, substance 25, tone 10, grounding 15 | `lint`, `writingKind`, `warningCost`, `structure`, `substance`, `bands`, `groundingPrior`, `contradictionCap`, `writer`, `borrowed` |
| `code` | code | check 60 (the exit code of the case's `bench.check`), review 40 (the case's checks over the file) | `codeCheck.timeoutSeconds`, `codeCheck.maxChars` |
| `workflow` | the transcript | efficiency 40, scope 20, process 40 | `workflow.maxRetries`, `workflow.summaryLines` |
| `design` | HTML, PNG or JPEG | markup 40 (code checks), visual 60 (Jev) | `design.maxChars` |

### Writing

A case's `bench.kind` (`article`, `linkedinPost`, `coverLetter`, `youtubeScript`) picks the layers; shape applies to articles only.

- Grounding asks one question per factual claim against the nearest chunks of the case's `bench.evidence` files. A contradiction counts only when a second, literal question agrees.
- `writer` names who "I" is in the copy.
- `borrowed` lists case-insensitive patterns for lines the copy must not lift from a source. Each match is a flag.

`lint.command` runs from the skill directory with the copy on stdin; `{kind}` in the command becomes the case's kind:

```json
{ "packs": ["writing"], "lint": { "command": "node scripts/lint.mjs --kind {kind}" }, "writer": "Ada Lovelace" }
```

The command prints `{ "findings": [...] }` or a bare array of `{ severity: "error" | "warning" | "info", rule, message, excerpt? }`. Its exit code is ignored. Any error scores lint 0, and each warning costs `warningCost`. A command that prints no findings, or runs past `lint.timeoutSeconds` (60), leaves the layer null with a flag.

With no command, a fallback lint treats an em dash as an error, and warns on exclamation marks, emoji and a word count outside the case's range. Its word count includes headings.

### Code

The check command runs in the sample directory, so it executes code the agent wrote. Run untrusted skills in a container or VM. Review reads the primary code file only, not a diff against the case's input files.

### Workflow

The pack needs a transcript; legacy runs and anchors have none and get no workflow layers.

- Code counts tool calls, errors, identical repeated calls, time against the case's `timeout_seconds`, tool calls against `max_turns`, and absolute paths outside the sample directory. System folders such as `/tmp` and `/usr` are not counted.
- Code checks that `SKILL.md` was read before the first write. A `without_skill` sample skips that check.
- Jev reads a one-line-per-step summary and answers whether the task was done and, after an error, whether the agent changed course.

### Design

The pack does not render the page, and runs only when the primary artifact is HTML or an image. When the agent also writes Markdown, set `bench.artifact: html` on the case.

- Markup checks the document shell, landmarks, heading order, alt text and inline handlers.
- Visual asks Jev about hierarchy and the case's checks, over the HTML text.
- When the agent left a PNG or JPEG screenshot in `outputs/`, Jev is also asked whether the page looks finished with nothing broken, and a check that has its own picture is asked of the screenshot.
- A screenshot outside the sizes Jev reads (280 to 1568 px a side) is left out and flagged. The HTML is still judged.

## Pictures

Jev's image input is a preview. A request that holds a picture is sent with the `TypeSafe-Danger-Zone-Images: true` header, and no other request is.

- A case's pictures (the PNG and JPEG files in its `files/`) go to Jev once as `request_images`, beside the prompt.
- A check with `image: references/<file>` in its front matter is asked with that picture.
- Each picture is checked against Jev's limits first, because Jev fails the whole request for one it refuses.

## Pairwise votes

"Ask Jev" on Compare sends both outputs with the skill's current rules. The case's prompt goes too when both outputs have a case, and the case's checks when both come from the same case and the criterion is "overall".

The first active pack that judges the first output's kind casts the vote, and it compares text. The design pack also compares screenshots when both outputs have one Jev can read.

A vote with confidence under `sure` is kept in `reviews.json` but left off the leaderboard and the agreement count.

## Anchors

An anchor is an output labelled good or bad, promoted from Rate blind or written by hand in `evals/anchors/`. `st self-test` grades every anchor and checks that each bad one scores below the good ones. Trust a pack on a skill only once its anchors pass.
