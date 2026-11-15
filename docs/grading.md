# Grading

Grading runs a skill's judge packs over each sample of a run and writes `report.json`. It follows each run, in the app and from `st run` (`--no-grade` skips it), and runs again on Regrade in the app or with `st grade`.

This page uses the words of the files. A **pack** is a set of judge questions for one kind of work, and a **layer** is one part of a score. In the app, a pack is the kind of work a skill is "graded as", and a layer is a part of the score: Rules, Checks and so on.

## Which packs run

- Every skill is graded by the `generic` pack: the rules the skill states and the checks its cases state, on any kind of output. A skill is graded on what it and its cases say, and on nothing it did not ask for.
- The other packs add parts of their own. None of them marks a rule or a check.
- A `packs` list that leaves `generic` out still has it (`BASE_PACK` in `src/domain/config.ts`).
- The generic and workflow packs run on every sample. The code pack runs on every sample that has a folder of its own, whichever file is judged, and says something only where the case names a check command. The design pack runs when the sample's primary artifact is a page or a picture (`applies` in `src/application/grade.ts`).
- The primary artifact (`primaryArtifact` in `src/domain/primary.ts`) is the first match of:
  1. an output of the case's `bench.artifact` kind, which **File to grade** on Cases sets to `html` or `image` for a case whose answers came as both a page and a picture;
  2. a page, a picture or code, in that order, when one of the skill's packs judges that kind;
  3. Markdown;
  4. a page, a picture or code, in that order;
  5. the first output of any kind, a file Jev cannot read (`other`) among them.
- The order the skill lists its packs in does not matter.
- Among files of one kind, `index.html` or `preview.html` comes first, then `outputs/output.*`, the file the run's prompt names for the piece, then the rest by name, and a `.txt` file and a `README` last. So a page beside its script is judged as the page, and a post beside its notes as the post.
- Results opens the same file on an output not graded yet.

## Answers and scores

- Jev's raw answers are stored, unrounded. Points per layer, the two thresholds and pack settings are applied in code (`src/domain/scoring.ts` and each pack's `score.ts`). So a change to `bench.json`, or to Graded as on Results, rescores without new judge calls.
- A question that was asked and came back with no answer fails that pack's reading (`<pack> pack failed: Jev gave no ...`). It is never read as a no, and never skipped.
- Three questions are asked of some outputs only: whether the page fits a phone (design), whether the transcript shows the task being done (workflow, for an output whose case is still there), and whether the agent changed course after an error (workflow). One that was not asked, and the phone or the error question when Jev left it out, is stored as no answer and left out of its layer. The pack's other layers stand (`optionalAnswer` in `src/judges/shared/questions.ts`).
- A null layer, or one given 0 points, is left out of the total, and the rest rescale.
- A sample folder is `<case>-s<n>`, and its case is read from that name whole. A case whose id starts another's (`email`, `email-reply`) is never taken for it.
- An output whose case is gone, in a run that kept no copy of its cases, has no case. It is graded on the skill's rules alone, and `report.json` keeps the name its folder gives, so it counts under no other case.
- A check command runs in the background, so the app keeps answering while it runs.
- A case's word range counts prose and list text, not headings or code in either kind of fence. A paragraph right under its heading, with no blank line, is counted. An output outside the range is flagged `length: N words, case asks a to b`.
  - Markdown with headings or code and nothing else counts 0 words.
  - On a page the range counts the text a reader sees: no tag, no comment, and nothing of its `<head>`, scripts, styles or templates (`pageText` in `src/domain/text.ts`).
  - Front matter is not part of the copy: a block of `key: value` lines between two `---` lines at the top. A piece that opens with a `---` rule keeps the section under it.

### The case a run is graded on

A run keeps its cases as it starts, in `_cases.json`, each with a fingerprint of what the agents were asked: the prompt, each input file by name and bytes, the tools the case allows (`allowed_tools`, in any order) and its time limit (`timeout_seconds`) (`askOf` in `src/infrastructure/run-cases.ts`). Grading reads the case through `takenCase` there:

- While the skill's case asks what the run was asked, the output is graded on the skill's case, so its checks and settings are read as they are now. A check added since the run is marked on the next grading.
- Once the case's prompt or files have changed, or the case is gone, the output is graded on the run's own copy, whole: the prompt its agent got and the checks of then. An output is never held to a request its agent did not get, and an id used again for another case is another case.
- A run made before runs kept their cases is graded on the cases as they are now.
- `bench.json` is how every run is scored, so it is read as it is now for every run.

Each graded output keeps a fingerprint of what it was held to, `yardstick` in `report.json`: its case's checks, each by its words, its weight and the bytes of its picture, the case's `bench` settings, and the turns and the time the workflow pack holds a run to (`max_turns`, `timeout_seconds`) (`yardstickOf`). The names of the check files and their order are no part of it.

Each fingerprint is two parts with a colon between them, the run settings second. One written by Skill Studio 0.14.0 or earlier holds the first part alone, and is compared with the first part only (`sameFingerprint` in `src/domain/fingerprint.ts`): for such a run or grading, a change to the settings is not seen.

It also keeps what graded it, `graded` in `report.json`: the Jev model asked (null without Jev), the version of the questions of each pack that judged it (`packs`), and, for an output with a page or a picture for Jev to look at, whether the host drew it (`drawn`: the desktop app does, `st grade` and `st serve` do not).

### When a total does not stand

A total counted from other parts than the totals beside it would be compared with them as if it were not. So `scoreResult` gives an output no total, with its layers and verdicts as they are, until its run is graded again, when:

- one of the skill's packs failed on it (below);
- the skill is graded as a pack its grading never ran, which is one ticked since: `packs` has no entry for it, where a pack that ran and had nothing to say left `null`. The flag is `<pack> pack not graded`;
- its case's checks or settings changed after it was graded: its `yardstick` is no longer the case's (`behindOf` in `src/domain/scoring.ts`). A report with no `yardstick` stands;
- a pack the skill is graded as judged it on questions since changed: its version in `graded.packs` is not the pack's now. The flag is `Graded by an older version of Skill Studio`;
- in the app, it was graded by another Jev model than the one a grading asks now (`Graded by another version of Jev`), or it had a page or a picture to look at and the host that graded it drew nothing, where the desktop app draws (`Graded without looking at the page`). `st report` and `st compare` let both stand: `--jev-model` names a model by hand, and the command line draws nothing;
- in the app, it was graded without Jev and a TypeSafe key is now set. `st report` and `st compare` let such a grading stand, since `--no-jev` asks for it by name.

A report with no `graded` on an output was written before gradings kept it, and is read as if nothing changed.

An output with nothing in it scores 0 however it was graded. Results says which of these holds beside the score, and offers to grade the run. On All cases **Grade N runs** grades every run that has such an output, a case whose newest run waits on it says "Needs grading" and grades that run when opened, and the band grades the runs it waits on once no case is left to run.

### Without Jev

- Without a TypeSafe key, or with `--no-jev`, only code checks run and every judged layer is null.
- A run Jev scored is not graded again without a key: the grading would write Jev's scores out of `report.json`. Regrade and `st grade` refuse it with `Jev scored this run, and no TypeSafe key is set to grade it again.` (`jevForRun` in `src/application/grade.ts`).
- `st grade --no-jev` asks for exactly that, so it is done: the report then holds code checks only. The cache keeps Jev's answers, and the next grading with a key finds them.
- A case with `bench.judge: false` is graded the same way, in every pack: Jev is asked nothing about its outputs (`asksJev` in `src/judges/shared/questions.ts`).

### Failures and empty outputs

- A pack that throws leaves every one of its layers null and adds the flag `<pack> pack failed: ...`.
- An output with that flag has no total: one counted from the layers that were left would read as a score of the whole. Its other layers stand, and Results offers to grade it again. The rule is `scoreResult`'s (`src/domain/scoring.ts`), so `report.json` and the app agree. Once the pack is no longer one the skill is graded as, its failure takes nothing away.
- A grading with that flag on every output writes no `report.json`, so the last report stands. In the app the job fails, with the first reason in its log. A grading with the flag on some outputs says how many and goes on.
- An output whose primary artifact is a file Jev cannot read, such as a PDF (`other`), is judged by no pack and has no score, not 0. It is flagged `a kind of file Jev cannot read, so it has no score`, no grading again is owed it, and it is no part of a mean (`unreadOutput` in `src/renderer/model.ts`).
- An output with nothing in it scores 0: a sample whose agent ran to its end with no output file, or one whose file holds only whitespace, which `report.json` marks `blank`. A file with no word in it, such as `{}`, is an output, and so is a picture. A report with no `blank` mark reads only a missing file as no output.
- Such an output is flagged `no output to judge`. Its total and every layer a pack scored are 0, the workflow pack's included (`noOutput` in `src/domain/pack.ts`). So such a sample counts as a failure wherever scores are averaged. That flag is its one verdict: what a pack counted about the run is listed under no part of the score.
- A sample whose agent was ended before it finished (by Stop, quitting the app or Ctrl-C) says nothing of the skill, whether it had written nothing or half a file. `run.json` marks it `stopped`, and grading leaves it out.
- A sample whose agent did not run to its end, and no stop ended it, is no whole answer either, whether it left a file or not. That is a session the time limit ended, one that never began (the CLI is missing or refused the model), and one the CLI ended with an error (signed out, a usage limit, a refusal): the engine's exit and its closing event say which. `run.json` marks it `failed` with the reason, grading leaves it out as a stopped one, and Results says "It ran out of time, so it has no score." or the like beside the CLI's own words. `st run` names each one and exits 1.
- A sample folder `run.json` does not list was made for an agent that was cut off before the run recorded it, as when the app is killed. Grading leaves it out too. A run whose `run.json` has no `samples` list is graded whole.
- A run with no `finishedAt` is still being written, by this copy of the app or another, or was cut off with the app. Grading such a run, from the app or `st grade`, grades the samples it has recorded and says in its log that the run has not finished. On All cases a run with no end that no job is writing says "not finished" (`cutOff` in `src/renderer/model.ts`).
- A sample's outputs are the files it held under `outputs/` when its agent ended, which `run.json` lists. A file put there later, such as one a check command builds, is not graded and is never the primary artifact. A check command should leave the files the agent wrote as they are: one it rewrites is judged as rewritten.

### Regrade and the cache

- Regrade asks only about what changed. Each pack's raw answer is kept in `judge-cache.json` beside `report.json`, under a hash of:
  - the model, the pack and the version of its questions;
  - the output text, the other files and the notes beside it, and the transcript;
  - the case, the rules, the `SKILL.md` they were read from and the settings;
  - the bytes of the case's pictures as the run kept them in `_inputs/`, of its checks' pictures, of the page as drawn and of a picture drawn again to fit.
- Points per layer, `yes` and `no` are not in the hash, since they apply in scoring. Nor is a setting that belongs to another pack alone, nor the list of packs: ticking a pack on Graded as has no other pack asked again.
- An output whose hash matches keeps its answer, and the log says `N of M outputs unchanged: kept their verdicts.`
- A check command's result is never kept (`JudgePack.live`). It rests on tools and files no hash of the output covers, and costs nothing to read again, so every grading runs the command. An output whose other answers were all kept still counts as unchanged.
- The cache keeps this grading's answers and, before them, earlier ones not asked again, up to four gradings' worth. So a grading without a TypeSafe key, or with a setting changed and put back, does not lose answers Jev already gave.
- The cache is written when a grading is stopped or fails too, with what had been answered by then.
- A report Jev wrote before rules and checks were marked on every kind of output has none on a page, a picture or code. The line under its run on All cases, and each such output on its case's page, say so and point to Regrade (`rulesUnmarked`, `outputRulesUnmarked` in `src/renderer/model.ts`).

## `bench.json`

`evals/bench.json` is optional.

- Graded as, at the foot of All cases on Results, writes its `packs`. Every other setting in the file stays as it was.
- `st new` writes it for a template whose packs go beyond `generic` (`{ "packs": [...] }`). `blank` and `writing` write none: writing is graded on its rules and checks, as any skill is.
- `--packs a,b` and `--bench <file>` override the file for one grading, so a skill in another repository can be graded without writing config into it. A name `--packs` gives that is no pack stops the command with `No judge pack named ...`.

| Key | Default | Does |
| --- | --- | --- |
| `packs` | `["generic"]` | The judge packs that apply. `generic` always does, first, whether the list names it or not |
| `rules` | `null` | The rules adherence is judged on; `null` or an empty list reads the bullets of `SKILL.md`, below. A blank rule is left out, and one written twice counts once |
| `weights` | `{}` | Points per layer, over each pack's defaults. Each is held at 0 or more |
| `yes` | `0.7` | A judge answer at or above this counts as yes: the rule is followed, the check is met. Held to 0 to 1 |
| `no` | `0.3` | A judge answer at or below this counts as no: the rule is broken, the check is missed. Held to 0 to `yes`. A file that names `yes` and no `no` gets a `no` equal to it, so every answer is a yes or a no |

The file is read through `benchOf` (`src/domain/config.ts`), so one written by hand cannot break a score:

- A value of the wrong kind falls back to its default.
- `packs` names each pack once, and a pack the app does not have is left out.
- A number inside a pack's own setting (`codeCheck`, `workflow`) is held at 0 or more, and `codeCheck.timeoutSeconds` to six hours. A `codeCheck.timeoutSeconds` of 0 or less is no time limit a check could meet, so the default of 120 stands.
- Each layer is held to 0 to 100, so no total passes 100.

Each pack adds its own keys, [below](#packs).

### Rules

With no `rules`, the rules are the top-level `-` and `*` bullets of `SKILL.md`, outside code blocks, HTML comments and the front matter.

A run is graded on the rules of the skill it ran: the bullets are read from the copy the run kept, `_skill/SKILL.md`, so an edit to the skill during the run or since changes nothing an old run is judged on. A run that kept no copy, and an anchor, are read from `SKILL.md` as it is now. A `rules` list in `bench.json` is the same for every run.

- A bullet is top-level at the margin or up to three spaces in, as Markdown reads it.
- Lines indented by a tab, or by two spaces or more past the bullet above, join it as a clause of the same rule.
- A thematic break (`* * *`, `- - -`) is not a bullet.
- A comment opens on a line that starts with `<!--` and runs to the line that holds `-->`. Nothing in it is read.
- A bullet under four words, made only of a link, or the same as a rule above it is not a rule, and the editor says so. A rule written twice counts once.
- Numbered lists are never rules, and neither is a bullet indented under a numbered step.

## Packs

| Pack | Judges | Layers (default points) | Keys in `bench.json` |
| --- | --- | --- | --- |
| `generic` | any output | adherence 50 (one question per skill rule), rubric 50 (one per check, over the whole output) | `rules` |
| `code` | a sample's folder | check 60 (the exit code of the case's `bench.check`) | `codeCheck.timeoutSeconds` |
| `workflow` | the transcript | efficiency 40, scope 20, process 40 | `workflow.maxRetries`, `workflow.summaryLines` |
| `design` | HTML or an image | visual 30 (Jev, looking at the output as a picture) | |

Within a layer, an answer at or above `yes` counts as met and one at or below `no` as missed (`readingOf` in `src/domain/verdict.ts`). An answer between the two is **not sure**: Jev holds a yes about as likely as a no, so it is set aside and counts in no layer until the reader answers it. Adherence is the share met of the rules that count. Rubric is the share met of the checks that count, each by its weight. A layer whose every fact was set aside has no score, and is left out of the total like any null layer.

- The two defaults are where TypeSafe's docs say to start, and the editor reads Jev by the same two (`HOLDS`, `DRIFTS` in `src/domain/improve.ts`).
- A fact set aside leaves a flag, so `st grade` and `st report` print it: `rule not counted, Jev was not sure (<section>): ...` or `grader <id> not counted, Jev was not sure: ...`.

- A check marked ×2 on Cases is `weight: 2` in the grader file's front matter. A file written by hand, or by the Assistant, may say up to 5, and the screen shows that number.
- An unmet check's flag carries the mark: `(×2)`.
- The count Results shows counts the same way. A ×2 check is two of the total and, when met, two of the met, so "3 of 4" and a bar at 75 agree. Facts Jev was not sure of are in neither number, and follow it: "3 of 4, 2 not sure".
- Check weights are not points per layer: those are `weights` in `bench.json`.

### Generic

The pack asks one question per rule and one per check, about the work as a whole, in one request: they are independent questions over one state, so the output and its pictures are sent once. It asks one more per heading the rules stand under, in a request of their own (see below). Jev is given every part of the work there is:

- `output`: the text of the primary artifact, its first 24,000 characters. A page is its HTML and code is its source. A picture has no text.
- `picture`: the output as a picture. A page is the page as the desktop app drew it (see Design, below, for how and at what size); an output that is a PNG or JPEG is that picture; anything else, and a page nothing drew, is the first PNG or JPEG the agent left in `outputs/`. So a rule about how a page looks is judged on how it looks.
- `layout`: for a page the desktop app drew, the elements it drew as the window measured them; for a picture made from a page, that page's (see Measuring a page, below).
- `other_files`: the start of every other text file the agent wrote, 6,000 characters of each and 18,000 in all, by its path. A test beside the code, or a script beside a page, is part of the work. A file that says what the primary one says, such as a preview that is the page, is left out.
- `notes`: what the agent told the user (`notes.md` in the sample, which the run's prompt has it write in place of a reply), its first 6,000 characters. A rule or check that asks for something to be said, named, listed or reported is met when the notes say it. Nothing else is judged on the notes: a rule about the piece's length or wording is not failed for how the notes read.
- `request` and `request_images`: the case's prompt and the pictures it came with.
- `skill` and `headings`: the `SKILL.md` the rules were read from, its first 12,000 characters, and the headings they stand under. Both are left out when `bench.json` lists the rules.

A rule is asked where it stands. The question names its heading, and the skill beside it says what the rule's words mean. Each heading is also asked once: are its rules for the kind of work the request asks for?

A heading is asked of the request's words and the skill alone: `request`, `skill` and `headings`, with nothing of the output and none of the request's pictures, which cost more than the rest of that request together and change no answer. What was asked for settles which rules count. With the output in view, Jev answers for the kind of work that was made, so an output of the wrong kind has the rules it broke set aside. A sample with no request has its headings asked with its rules, of the output.

- A heading that names no one kind of work ("Rules", "Tone") is for all of it. One that names another kind, mode or situation ("Rules for a screen mockup", when a focus mockup was asked for) is not.
- A rule under a heading answered at or below `no` **does not apply**: it is set aside and counts in no layer, whatever was answered of the rule itself. The flag says how many: `2 rules not counted: for another kind of work than this`.
- A rule above every heading, and one `bench.json` lists, is asked of no heading.
- The reader's own answer on a rule set aside, met or missed, makes it count.

A rule or a check is quoted without Markdown's marks. TypeSafe reads a backticked word in a question as a path into the state, and a word a writer put in backticks names none.

The question says what `picture` is, so nothing is read off it that it does not hold: the window a page was drawn in, that a page drawn in a window past 1568 pixels a side is scaled down, so a length measured on the picture is not its length in the page, and that anything of the page below the window is not in it. Jev looks and reads. It does not measure: a rule or check that states pixels is often answered between the thresholds, and comes back as not sure.

A picture the agent made with a side outside the 280 to 1568 pixels Jev reads is drawn again by the desktop app inside them, in a window of the picture's own shape, and Jev looks at that copy (`fitPicture` in `src/application/grade.ts`). It is kept in the sample's `renders/` folder, named by the picture and the size. The size a case holds a picture to is still the file's own. `st run`, `st grade` and `st serve` draw nothing, so there such a picture is left out.

A picture Jev cannot read is left out with the flag `picture not judged: ...`, and the text is still judged. An output with neither text nor a picture Jev can read gets no adherence or rubric.

A check about a picture (`image:` in its front matter) that Jev cannot read is not asked: without the picture its answer would be a guess. It is left out of the rubric, which is counted from the case's other checks, with the flag `grader <id> not judged, its picture is not shown to Jev (<why>): <the check>`.

### Measuring a page

Jev looks at a picture and reads source, and does neither a sum nor a ruler's work well. So a size, a distance or a position is measured where the page is drawn, and the sums are done in code.

- **What is measured.** When the desktop app draws a page, a script in the page's window reads each element it shows (`MEASURE_PAGE` in `src/interfaces/electron/main/measure.ts`): its box in CSS px from the top left of the page, the scale its transform gives it, its background and text colour as sRGB and HSL, its font size, corner radius, padding, border, gap and how many shadows it casts. The 300 largest elements are kept.
- **Where it runs.** In a world of its own in that window, so the page's scripts cannot change what the browser answers. What comes back is read as an untrusted file is (`readLayout` in `src/domain/layout.ts`): every number finite, every string one short line, or it is no layout.
- **Where it is kept.** Beside the page's picture in the sample's `renders/` folder, under the same name with `.json`. A picture with no layout beside it is drawn once more. The layout is part of what an answer is kept by, so a page measured since is asked about again.
- **What Jev reads.** `layoutText` writes one line an element, largest first when the page has more than 14,000 characters of them. Under each region (3% of the window or more) and each scaled or shadowed element, it writes where the element sits inside the two nearest elements that hold it: how far each edge is from the holder's, in px and as a share of the holder's width, its size as a share of the holder's, how far its centre is from the holder's centre, and how its background's lightness, saturation and hue differ from the holder's. The question says a size, a distance or a position is read from `layout` and not judged by eye on `picture`.
- **When it is sent.** Only for an output with a rule or a check about what a layout holds (`aboutLayout`): one that states a measure, such as `24px`, `4%`, `20°`, `1536×864` or a hex colour, or uses a word for a size, a place or a colour, such as centre, width, margin, gap, radius, shadow, colour or font. A layout is the largest part of a request, about 7,000 tokens for a full one, so a page whose rules are all about what it says is asked without it.
- **What it settles.** A check that states one measure. On the run this was built on, 21 of 22 single measures, true and false, came back right and sure with the layout, and 14 without. A rule that packs several measures into one sentence is still often Not sure: one answer cannot be yes to three parts and no to a fourth.
- **A picture made from a page.** An agent often writes a page to make a picture, and the picture is what is used. When the picture is the file graded and a page is beside it, the app draws that page in the window the picture's size points to (the case's `bench.size`, else the picture's own size, then a half and a third of it for an export at 2x or 3x) and compares the two, pixel by pixel (`sourcePage` in `src/application/grade.ts`, `differing` in `src/domain/picture-match.ts`). A pixel differs when a channel is more than 16 off, and the two are one picture when under 1% of pixels differ: on real outputs a picture and its own page differ in under 0.01%, and a picture and another version of its page in 3% to 40%. Then the page's layout is the picture's, and the question says so, with how many times larger the picture is. The verdict is kept beside the drawing as `.match.json`.
- **A picture the page does not draw.** A page changed after the export, or one another browser draws with its letters shaded another way, does not match. Nothing is measured for that picture, the log says `<picture> is not what <page> draws`, and a measure is judged by eye. Only a PNG with 8 bits a channel and no interlacing is compared.
- **What it does not cover.** A picture with no page beside it has no elements to measure, and neither the CLI nor `st serve` has a browser to draw with: there, a measure is still judged by eye.

### Code

The check command runs in the sample directory, so it executes code the agent wrote. Run untrusted skills in a container or VM. A case that names no `bench.check` gets nothing from this pack.

- A case that names one has it run on every sample, whichever file is judged: a page beside its script, or a note where the code should have been. An output with no file scores 0 whatever the command says.
- It runs at every grading, Regrade included, and its result is never kept from one to the next.
- A legacy flat file and an anchor have no folder of their own, so no command runs for them.

Whether the code follows the skill's rules and meets the case's checks is the generic pack's to mark, over the primary code file and the other files beside it, not a diff against the case's input files.

Ticking Code also says the code is the work: among an output's files the code is judged, not a Markdown note beside it.

### Workflow

The pack needs a transcript; a run whose outputs sit flat at the run root (`RunMeta.legacy`) and an anchor have none and get no workflow layers.

- Code counts tool calls, errors, repeated calls, time against the case's `timeout_seconds`, tool calls against `max_turns`, and paths outside the sample directory. A path is read where a tool names a place: the file a read, write or edit names, what a glob or a listing names, and each word of a shell command that is absolute, starts with `~` or reaches up with `..`. A path that resolves inside the sample is never counted. A system folder named by an absolute path is not counted either: `/dev`, `/tmp`, `/private/tmp`, `/usr`, `/bin`, `/opt` and `/etc`. A path that climbs out of the sample with `..` counts wherever it lands, a system folder included.
- A path that names the sample at another address is inside it too: one that runs through the run's folder and the sample's own, one inside the other (`<run>/<sample>`). A transcript keeps the paths the agent used where the run was made, so a skill moved, copied, cloned or reached through a link since then is graded as it was there.
- A repeated call is the same tool given the same input as a call before it, with nothing written in between. Three different edits to one file are not repeats, and neither is a test run again after an edit. The transcript keeps a short hash of each call's whole input (`call`), without the `description` an agent words anew each time. A transcript with no hashes counts a repeat only for a shell command kept whole on its line: an edit's text and a read's offset are not on the line, so two calls that read the same there are never taken for one.
- A shell's relative path is resolved against the folder the shell is in. The transcript's commands run in order from the sample directory, and a `cd` or `pushd` moves the folder for what follows, in the same command and the next ones; a subshell's `cd` ends with the subshell. After a `cd` code cannot follow, such as `cd "$DIR"`, a relative path is not read until the next `cd` it can.
- What a pattern program is given to look for (`grep`, `rg`, `sed`, `awk`, `perl`, `jq`) is not a path: the first word that is not an option, quoted or not, or the value of `-e`. The words after it are, and so is a `-f` file. No word given to `tr`, `echo` or `printf` is a path, since they open no file, and neither is the message `git`, `gh`, `hg`, `svn` or `jj` is given after `-m`, `-am` or `--message`, nor the count a search program is given after `-m`, `-A`, `-B` or `-C`; a redirection's file always is. A command inside backticks or `$( )` is read as a command of its own, whatever program it is given to.
- A heredoc's text is not read: nothing between `<<EOF` and its closing word is a path or a write, and the file the heredoc is sent to (`cat > outputs/page.html <<'EOF'`) is. The transcript keeps a command on one line, so a command piped on after the heredoc's word (`<<EOF | tee x`) is left out with the text. The word after `<<<` is text. A stream sent to another (`2>&1`, `>&2`) names no file.
- A search tool (`Grep`) is kept in the transcript as the folder the call names, or as its pattern when it names none, so its argument counts only when it names a file or folder that is on disk. A web tool's argument is never a path.
- Efficiency is the share of checks passed: repeated calls within `workflow.maxRetries` (1), tool calls within `max_turns` and seconds within `timeout_seconds`, the last two only when the case sets them. An error takes nothing off: a test that fails before the fix is the work going right, and what the agent did after an error is asked in process. Scope is 0 when any path lands outside the sample, else 1.
- A run that wrote nothing scores 0 on every workflow layer: a tidy transcript with no output is a failed sample.
- Code checks that `SKILL.md` was read before the first write. A write is a tool that writes or edits, or a shell command that runs `tee`, `cp`, `mv`, `mkdir` or `touch` or sends output to a file. Output sent to another stream or to a device (`2>&1`, `> /dev/null`) is not one, and neither is a `>` inside quotes. A `without_skill` sample skips that check.
- Jev reads a one-line-per-step summary, `workflow.summaryLines` lines of it (80, and never fewer than 2), and answers whether the task was done and, after an error, whether the agent changed course. Whether the task was done is asked only of an output whose case is still there: without the case there is no task to hold the transcript to. Process is the share of those answers at or above `yes`, with the read-first check counted beside them. Without Jev, or with neither question to ask, there is no process layer.

### Design

The pack runs only when the primary artifact is HTML or an image (`.png`, `.jpg`, `.jpeg`, `.webp`, `.gif` or `.svg`). A page or a picture beside Markdown is the primary artifact already; set `bench.artifact: markdown` on a case whose Markdown is the piece to judge.

- Jev is given the picture, the case's prompt and the pictures it came with. The prompt and its pictures say what the picture is meant to show: without them Jev is not sure of its main point.
- It asks only what any visual must be, of the output as a picture: whether it has one clear main point (the verdict "The output has one clear main point") and whether anything in it is broken ("Nothing in the output looks broken": text that overlaps or cannot be read, something cut off at a side or run out of its box, a missing picture, a blank or unstyled page). Plain blocks standing in for content are not broken, so a wireframe or a mockup is not failed for being one. The picture of a page is its first window, and the question says so: content that goes on past the bottom edge is not cut off. Each counts once.
- It checks nothing about the HTML. What a page must have, such as a `lang`, a viewport or a `<main>`, is for the skill to state as a rule or the case as a check, which the generic pack marks: a page is not always a web page, and a mockup or a slide owes the web none of it.
- The picture is the page as the desktop app draws it, its scripts run: in a window the case's size (`bench.size: [width, height]`), else 1280 by 960 pixels, scaled down whole when a side is past 1568. That is what Results shows the reader. Where nothing was drawn, it is the first PNG or JPEG the agent left in `outputs/`: an agent's own screenshot may show something else, or the page before its last change, so a drawn page comes first. An image in another format is not read. With no picture the pack says nothing.
- For a case with `bench.phone: true` ("Check that a page works on a phone too, 390 px wide" on Cases), the desktop app also draws the page 390 by 1200 pixels, and Jev is asked whether it works on a phone: nothing cut off at the side, running past the edge or overlapping (the verdict "The page fits a phone screen"). Off by default: most pages are made for a desktop window. The pictures are kept in the sample's `renders/` folder, named by their size, and drawn again only when the page changes. `st run`, `st grade` and `st serve` draw nothing, so there a page is looked at only through a screenshot the agent left. A page that does not load in 20 seconds, or is not drawn in 30, or whose page stops, is logged and judged without its picture.
- A picture the agent made outside the sizes Jev reads (280 to 1568 px a side) is drawn again to fit by the desktop app, as for the generic pack. One nothing could draw is left out with the flag `screenshot not judged: ...` or `phone screenshot not judged: ...`.

Ticking Design also says the page or picture is the work: among an output's files it is judged, not a Markdown note beside it.

### Size

A case may name a size in pixels, `bench.size: [width, height]` in its `case.yaml` ("Check the size of the picture or page in pixels", under Length and size on Cases). Every pack holds a picture to it the way it holds an output to the word range: grading reads the picture's own size (PNG, JPEG, GIF, WebP, or an SVG's `width` and `height` or `viewBox`) into the report as `pixels`, and a picture of any other size is flagged `size: 1200 × 630 px, case asks 1600 × 900 px`, which counts in no layer and shows under Missed. A page is not held to it: it is drawn at that size for Jev to look at instead.

## Pictures

Jev's image input is a preview. A request that holds a picture is sent with the `TypeSafe-Danger-Zone-Images: true` header, and no other request is.

- A case's pictures (the PNG and JPEG files in its `files/`) go to Jev as `request_images`, beside the prompt: once with the rules and checks, and once with the design pack's questions. They are not sent with the headings.
- A check with `image: references/<file>` in its front matter is asked with that picture.
- Each picture is checked against Jev's limits first, because Jev fails the whole request for one it refuses. A case's picture that fails is left out of the request; a check whose picture fails is not asked ([Generic](#generic)).

## Verdicts

A score is counted from facts, and the scorers report each one (`Verdict` in `src/domain/pack.ts`): a rule of the skill followed or broken, a check of the case met or missed, or another thing a pack measured. Results lists them under each output, missed first.

A fact Jev answered stands one of four ways:

| Stands | When | Counts |
| --- | --- | --- |
| met | the answer is `yes` or more | in its layer |
| missed | the answer is `no` or less | in its layer |
| not sure (`aside: 'unsure'`) | the answer is between the two | in no layer |
| does not apply (`aside: 'inapplicable'`) | a rule whose heading is for another kind of work | in no layer |

Results shows the two set aside as groups of their own, **Not sure** open and **Does not apply** folded.

- A fact is named by its kind and its words, such as `rule:Keep the note under 120 words.` or `check:The note names Priya.`, so a rule or check that is edited is a new fact. The fixed questions of a pack have names of their own (`other:hierarchy`, `other:finished`, `other:followed task`).
- Two checks of one case that say the same thing are two facts: each after the first also carries its own id, as in `check:The note names Priya. #03-names-priya` (`checkIds` in `src/domain/verdict.ts`).
- A fact Jev answered is open to the reader's own answer. A fact code measured is not: the exit code of a check command, a count of tool calls, a word range.

## Corrections

`evals/reviews.json` holds what the reader said, written by Results.

- **A correction** is the reader's own answer on one fact of one output: `reviews["<run>/<sample>"].corrections["<fact>"]` is `true` when the output meets it and `false` when it does not, whatever Jev said. It stands over Jev's answer wherever the app scores that output: the fact moves between Missed and Met, and the layer and the total follow. On a fact set aside the reader may give either answer, and it then counts. It stays the reader's answer when a `yes` threshold changed in `bench.json` brings Jev's answer round to it; the row then says "your answer, agrees with Jev", and "Take back" still removes it. `report.json` keeps Jev's own answers, so `st report` and `st compare` print the scores without corrections. They count them as the app does, from the stored answers under `bench.json` as it is now (`scoredReport` in `src/application/grade.ts`).
- Deleting a version, or one run, moves the corrections on the runs' outputs to the trash with it, and Undo brings them back. So do the entries of `preferences` that name one of its outputs: votes between two outputs, which the app neither writes nor reads. A delete that cannot move everything moves nothing. Each delete keeps its own way back, a skill's newest 10 for 30 days, so a later delete does not end the Undo of an earlier one. Undo is refused once the skill holds a version of that number again, so two different texts never share one: a run's Undo too, once a later delete took its version and the number was given out again.

Any other field in `reviews.json`, such as a rating, a note or a vote, is kept as it is when the file is written, and nothing reads it.

## Version scores, where a case stands and the lift

A version's score is the mean of its cases, each case the mean of its outputs, so a case run three times counts once. `versionScore` in `src/renderer/model.ts` computes it. Every mean the app shows is counted this way (`scoreOver`), a run's Mean on All cases included.

- A mean is shown only when every output it is over has a total. With one that has none, such as an output a pack failed on, there is no mean until its run is graded again: a mean over the rest would read as a score of them all. An output whose agent was stopped or failed is no part of a mean.
- Nor is any answer of a run to a case it did not finish: one of its attempts was stopped or failed, or the run asked for more attempts than it began (`RunMeta.samplesPerCase`), as when it is stopped. A mean over the attempts that happened to end would read as one over all of them (`shortOf` in `src/renderer/model.ts`). The run has no score on that case, and All cases says "Stopped" or "Failed" for it.
- A case counts as it was asked. Outputs written for a case before its prompt or files changed are another case to every mean, and stand in a row of their own on All cases, under "Answered before the case changed" or "No longer in Cases".
- Two outputs are set against each other only when they answer the same request and were both graded with Jev, or both without (`comparable`). Results shows no change in score between two that are not.

- A version's outputs are those written with the skill as it stood and those written on the copy kept of it (`old_skill`), never one written without the skill (`testedVersion` in `src/domain/lift.ts`). The score, a case's standing and the comparison all read it so.
- Where one writer (an engine and model) ran two versions, every version's score counts that writer's outputs only, so one version reads against the next. A version that writer never ran has no score, in the sidebar, the versions list and its own page alike, and its line says `Not run with` and the writer (`versionReading` in `src/renderer/model.ts`). Before any writer ran two versions, a version's score counts all its outputs.
- When several writers did, the writer whose newest run is newest is read.
- A writer ran two versions when its run on its latest version shares a case with a run of its own on an earlier one: the same case, asked the same way, graded the same way, with a total on every output (`versionWriter` in `src/domain/lift.ts`). A run on an earlier version that shares none is passed over, and does not stand in the way of one that does.

A case is run when its writer chooses, on whatever version and model, so All cases on Results reads each case against its own runs (`standingOf` in `src/domain/standing.ts`, `standingsOf` in `src/renderer/model.ts`).

- A standing holds answers to one request. Outputs written for a case before its prompt or files changed, or for a case since deleted, are a standing of their own (`CaseStand.earlier`), which no run can check again.
- A case's runs are ordered by version, then by when they ran, so a run on the copy kept of v1 stands with v1 whenever it was made.
- A case stands on its newest score on the version a run would test now (`versions.current`), else on its newest score on the latest version it ran. It is checked when that score is on the version a run would test now. Saving an edit to the skill makes that a new version, which no case has run on yet.
- A run has a score on a case only when it began every attempt it was asked for, each ran to its end, and every output has a total.
- Its change is read against the scored run before by the same writer, so the move is the skill's and not the model's; with none, against the scored run before by anyone. Only runs graded as the latest was count: with Jev, or without (`Try.graded`). With a scored run before and none graded so, there is no change, and the case does not say "first run" (`apart`).
- A run with no score, such as one that was stopped, is no standing. The newest such run after the score a case stands on, when it ran to its end, is the one a grading would give a score (`toGrade` in `model.ts`).

The lift (`caseLift`) is the mean of the cases' first scores against the mean of their latest, over the cases with two scored runs graded the same way. Each case counts once: answers to a case before it changed are no part of it.

- The floor is the mean of those cases' newest scores without the skill, graded as their latest was, over the ones that have one (`floorCases`).
- `mixed` is set when a case's first and latest runs had different writers, and the page says "on more than one model".
- A run made against an older version's snapshot (`old_skill`) counts as that version's run, as on the comparison.
- The ribbon is drawn only when the latest mean is higher in the whole points shown (`rises`): 66.7 to 67.0 reads 67 and 67, and is no rise.

## Anchors

An anchor is an output labelled good or bad, written by hand in `evals/anchors/` ([files.md](files.md#a-skill) has the front matter). Trust a pack on a skill only once its anchors pass.

- `st self-test` grades every anchor and writes `evals/anchors/report.json`.
- It checks that each bad anchor scores below the good anchor of its case, on each layer named in its `tests` front matter, else on `total`.
- An anchor with no score on a layer it is checked on fails that check: a layer no pack scored says nothing of either anchor.
- A case has one good anchor: a later one replaces an earlier one. A bad anchor whose case has no good anchor is not checked.
- With no bad anchor to check, `st self-test` says nothing was checked and exits 1.
