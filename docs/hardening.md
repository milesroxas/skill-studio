# Hardening checklist

Known issues in the product's logic and workflow, from a QA review on 2026-11-06, checked against the code on 2026-11-11. Each line is one issue: its id, its severity, what is wrong, and where. Paths with line numbers are as of `ee7ae14`; a path with none names a file as it is now.

## How to use this file

- `[ ]` is open. `[x]` is fixed on `main`: add the commit after the line.
- An issue that turns out not to hold: tick it and add "not a bug" with the reason.
- A fix people will notice also needs a line in [CHANGELOG.md](../CHANGELOG.md).
- When every line is ticked, delete this file.

Severity: **high** gives wrong scores or loses data. **med** misleads or breaks a step. **low** is an edge case or friction.

## Fix order

1. R1, R2, R3: scores graded against the right case, skill and rules.
2. R4, R5, R6: a failed sample counts as a failure.
3. C1, C2, C3: runs compared only when they are like for like.

## Results integrity

- [x] **R1** high. A sample is graded against the wrong case when one case id starts with another plus `-` (`intro`, `intro-long`): `findCase` falls back to a prefix match. `src/infrastructure/cases.ts:184,189`, `src/application/grade.ts` Fixed: the sample folder is read whole (`parseSampleDir`), and an older name takes the longest case id that matches. `d9a79bc`
- [x] **R2** high. One run can mix two skill texts. Each sample copies the live skill folder when it starts, the version label is taken once, and Save and Restore are not blocked during a run. `src/application/generate.ts:149,199`, `src/application/api/operations.ts:666,720` Fixed: a run copies the skill to `_skill/` and each case's input files to `_inputs/` once, at the start, and every sample is built from those copies. `d9a79bc`
- [ ] **R3** high. Grading reads the live `SKILL.md`, cases and `bench.json`, never the run's `_skill/` snapshot. A regrade judges v0 by v1's rules, and an `old_skill` run is graded by the current rules. `src/application/grade.ts:158-159`
- [ ] **R4** high. A sample with no score is left out of the mean, so a version that fails often looks no worse. `src/renderer/model.ts` (`caseMeans`), `src/renderer/components/ResultsSummary.tsx` (`totalsOf`) In part (`d9a79bc`): an empty output now scores 0 and counts. A sample whose pack failed, or graded with no key, still has a null total and is left out.
- [x] **R5** high. With the workflow pack on, an empty output can score 100. "nothing written to outputs/" is only a flag. `src/judges/workflow/score.ts:67`, `src/judges/workflow/index.ts:138` Fixed: an output with no file, or only whitespace, is flagged and scores 0 on every layer, the workflow pack's included. `d9a79bc`
- [ ] **R6** med. A timed-out sample with partial output counts as complete. `src/application/generate.ts:239`
- [ ] **R7** med. "Regrade without Jev" overwrites `report.json` and throws away stored Jev answers. `src/application/grade.ts`, `src/renderer/components/ResultsSummary.tsx` In part (`d9a79bc`): a stopped or failed grading keeps the last report and every Jev answer, `judge-cache.json` keeps Jev's answers through a grading without Jev, and a regrade reuses answers for outputs that did not change. A regrade with code checks still writes a new `report.json`, which shows no Jev verdict until the next grading with a key.

- [ ] **R8** low. A correction names a fact by its kind and its words, so two rules of one skill that read the same share one answer. `src/domain/verdict.ts` (`verdictId`) In part (`d9a79bc`): duplicate rules in `bench.json` are dropped. Two identical bullets in SKILL.md still share one answer.
- [ ] **R9** low. A report keeps what its grading asked. An output graded before rules and checks were marked on every kind of file shows no Rules or Checks part until its run is regraded. In part: the line under a run on All cases says so and points to Regrade; a case's own page does not. `src/renderer/model.ts` (`rulesUnmarked`), `src/renderer/components/Comparison.tsx`
- [ ] **R10** low. A case's check command runs only when the output judged is code. A case that names one whose agent wrote no code file gets no Check command part, not a failed one. `src/application/grade.ts` (`gradeSubject`), `src/judges/code/score.ts`
- [ ] **R11** low. Jev reads the first 24,000 characters of an output and 6,000 of each file beside it. A rule broken past that is marked followed, and nothing says the file was cut. `src/judges/generic/index.ts`, `src/application/grade.ts` (`othersOf`)

## Comparability

- [ ] **C1** high. Cases are not versioned: `run.json` holds case ids only. An edited prompt or check, or an id reused after a delete, changes what old results mean. Results shows the current prompt and checks beside old outputs. `src/application/generate.ts:128`, `src/renderer/components/Comparison.tsx`
- [ ] **C2** high. The version lift compares the cases both versions ran, but does not check sample counts or say when the baseline answered fewer of those cases. The baseline is the writer's newest without-skill run, of any age. `src/domain/lift.ts` In part (`d9a79bc`): the floor is the newest without-skill run that answered every shared case, and the lift says how many cases it answered when that is fewer. Sample counts and the floor's age are not checked.
- [ ] **C3** high. Totals built from different layer sets are compared: a missing key, a failed pack or a pack added later each drop layers and rescale the rest. `src/domain/scoring.ts:43-53`, `src/application/grade.ts:113-119`
- [ ] **C4** med. No spread is shown anywhere, so noise reads as lift. `stddev` has no caller outside its test. All cases shows each run's sample count; nothing else does. `src/domain/stats.ts`, `src/domain/lift.ts`
- [ ] **C5** med. The lift ribbon draws a full rise for a change that rounds to zero. `src/renderer/components/Lift.tsx:76-77,136,151`
- [ ] **C6** med. A version's score counts only the lift's writer, but a version that writer never ran averages every writer together. The sidebar, the versions list and a version's detail all show it. `src/renderer/model.ts` (`versionScore`)
- [x] **C7** med. The version hash covers `SKILL.md` and `references/` only. Edits to `scripts/`, `assets/` or other top-level files keep the same version. `src/infrastructure/skill.ts:21,203-209` Fixed: the hash covers everything an agent's copy holds: every file but `evals/`, hidden files, links that leave the skill, and `node_modules`, `venv` and `__pycache__`. `d9a79bc`
- [ ] **C8** med. An `old_skill` run gets no scripts, and the UI does not say so. `src/application/generate.ts:94` In part (`d9a79bc`): a run copies the whole skill, scripts included, so an `old_skill` run of a new run gets them. A run made before that holds SKILL.md and `references/` only, and the UI does not say so.
- [x] **C9** med. Undo of a version delete after its number was reused leaves two different v3s, averaged together. `src/infrastructure/trash.ts:97-101`, `src/infrastructure/skill.ts:141-157` Fixed: Undo is refused once any version of that number exists again. `d9a79bc`
- [ ] **C10** low. Baseline runs are stamped with the skill version and are deleted with it. `src/application/generate.ts:100`
- [ ] **C11** low. The without-skill baseline skips the "read SKILL.md first" check, so process is harder for the skill to score on. `src/judges/workflow/score.ts:72-79`
- [ ] **C12** med. Rule extraction grades non-rules: bullets under a "Bad example" heading, and pointers such as "Read references/x.md before you start". Only link-only bullets and bullets under four words are skipped. Rules in reference files are never graded. `src/domain/rules.ts`, `src/infrastructure/cases.ts` (`loadRules`)
- [ ] **C13** low. The primary artifact is the first file in name order, and `.txt` counts as Markdown, so `notes.md` can beat `post.md`. `src/infrastructure/artifacts.ts:7-19,82` In part: one chooser for grading and Results (`src/domain/primary.ts`), and among files of one kind a `README` or a `.txt` file comes last. Two `.md` files with neither name, such as `notes.md` and `post.md`, still go by name order.
- [ ] **C14** low. Unsaved Scoring changes rescore every screen. Grade-time-only settings (`workflow.summaryLines`, `codeCheck.*`) look live but change nothing. The CLI reads stored scores, so it disagrees with the app after Save, and it never applies a correction. `src/renderer/App.tsx`, `src/interfaces/cli/st.ts:138` In part: the app scores by `bench.json` as saved, and its one scoring control, Graded as, rescores only once saved. The CLI still reads stored scores and applies no correction.

## Picks and corrections

- [x] **V1** med. A pick is made with both scores, their difference and what each output missed on screen, so Jev's reading can sway the pick it is then set against. `src/renderer/components/Comparison.tsx` Fixed: Results asks for no pick. What the reader says is a correction to one verdict, or a check or rule they write. `03af4fc`
- [x] **V2** low. A case counts as compared once the pair it opens with has a pick. With two samples per version, the other samples are never asked about. `src/domain/pairs.ts` (`defaultPair`), `src/renderer/model.ts` (`casePair`), `src/renderer/App.tsx` Fixed with V1: no case waits on a pick. `03af4fc`
- [ ] **V3** low. `skill.correct` takes any text up to 4,000 characters as a verdict's name: an answer on a fact the output does not have is stored and never read. `src/application/api/operations.ts`, `src/infrastructure/reviews.ts` (`saveCorrection`)

## Anchors

- [ ] **A1** med. `st self-test` can pass while checking nothing. It keeps one good anchor per case, skips cases with only bad anchors, and counts a null layer as -1. `src/application/grade.ts:222-231`, `src/interfaces/cli/st.ts:342`

## Data loss

- [x] **D1** high. Restore corrupts binary files under `references/`: files are read and written as UTF-8. `src/infrastructure/fs.ts:65`, `src/infrastructure/skill.ts:185` Fixed: Restore copies bytes, checks every path first, and puts every file back if any step fails. `d9a79bc`
- [x] **D2** med. Saving a case deletes check files and pictures the draft does not list, with no check that the case changed on disk. `src/infrastructure/cases.ts:270-271,318-320` Fixed: `skill.state` carries each case's `savedAt`, the form sends the one its draft began on, stored with the drafts, and a save over a case changed since is refused. `d9a79bc`
- [ ] **D3** med. Restore does not warn about unsaved drafts. "Keep my draft" afterwards undoes the restore. `src/renderer/components/VersionDetail.tsx`
- [ ] **D4** med. Undo of a version or run delete lives only in the status line notice (`Notice.undo`). A restart, another notice or the notice timing out loses it. `src/renderer/hooks.ts:64-65,77-78,85`
- [x] **D5** low. `reviews.json` is not written atomically. A crash or a merge conflict in it stops the skill from opening. `src/infrastructure/fs.ts:13-19` Fixed: every JSON file is written to a temporary file and renamed, and a damaged one is named in the error. `3ec6d8a`
- [ ] **D6** low. The drafts file is rewritten whole, so the desktop app and `st serve` overwrite each other's drafts. `src/infrastructure/drafts.ts:43`
- [x] **D7** low. A draft of a reference file that was deleted on disk can never be saved. `src/renderer/screens/Editor.tsx:138`, `src/infrastructure/skill.ts:67-71` Fixed: the Editor says the file was deleted on disk, and Keep my draft saves it as a new file. `d9a79bc`

## Run pipeline

- [x] **P1** med. One sample that throws fails the job, while the other workers keep starting paid sessions. `src/application/generate.ts:141-159` Fixed: the sample is recorded as failed and the others finish. `3ec6d8a`
- [ ] **P2** med. A run cut off by quitting the app or a crash never gets its `finishedAt`, so it shows like any other run and the app refuses to grade it, for good. `st grade` grades a run still writing, and writes "no output" for samples in progress. The renderer reads `finishedAt` only to tell whether Results has a run not yet read (`newestRun` in `src/renderer/results-seen.ts`). `src/interfaces/electron/backend/index.ts`, `src/application/generate.ts`, `src/interfaces/cli/st.ts` In part (`d9a79bc`): a cut-off run can be graded, and a sample stopped before it wrote is marked `stopped` and left out of grading. The run still looks like any other.
- [x] **P3** low. Samples per case are capped at 10 on the server, but not checked to be whole numbers. `st run --samples` is neither capped nor checked, and a non-number writes no samples. `src/application/api/operations.ts`, `src/application/generate.ts` (`samplesPerCase`), `src/interfaces/cli/st.ts` Fixed: samples per case are a whole number from 1 to 10 on the server and in `st run`, and `st` refuses a bad `--samples` with a line naming the flag. `d9a79bc`
- [x] **P4** low. The run's note is replaced by the version's note. `src/application/generate.ts:57,99` Not a bug: a run has no note of its own, and carries its version's.
- [ ] **P5** low. Jev cost covers input tokens only. A failed question empties the whole pack for that output. `src/judges/jev.ts`, `src/application/grade.ts`

## Security and isolation

- [x] **S1** high. A Cursor agent gets the whole environment, including `TYPESAFE_API_KEY` and the stored Anthropic and OpenAI keys. `src/infrastructure/engines/cursor.ts`, `src/infrastructure/engines/claude.ts` Fixed: every agent, the `code` pack's check command and the assistant's CLIs run with `agentEnv` (`src/infrastructure/env.ts`, rules in `src/domain/env.ts`), which drops the keys. Bash stays allowed for Claude Code agents, so a skill can still run commands.
- [ ] **S2** med. Isolation relies on the prompt. The sample sits inside `evals/runs/`, so `../..` reaches the graders, and its folder name says whether the skill is installed. Relative paths outside the sample are not flagged. The run's `_skill/` copy sits at `../_skill` from each sample, so a without-skill sample can read the skill. Cursor ignores `allowed_tools`. `src/judges/workflow/index.ts:43`, `src/infrastructure/engines/cursor.ts:93-101`, `src/application/generate.ts` In part (`d9a79bc`): the workflow pack resolves `..`, `~` and the shell's `cd` before it judges a path, so a path outside the sample is flagged. The sample still sits inside `evals/runs/`, and Cursor still ignores `allowed_tools`.

## Refinement loop

- [ ] **U1** low. The Skill screen shows no pass rate per rule: a rule most outputs break looks like any other. `src/renderer/editor/graded.ts`
- [ ] **U2** low. The next step ignores unsaved drafts: with an edit to SKILL.md not saved, it does not suggest a run. The Run panel says when files hold unsaved edits. `src/renderer/App.tsx`, `src/renderer/components/Run.tsx`
- [x] **U3** low. The Editor does not reload when the window regains focus, so an outside edit only shows as a refused save. `src/renderer/screens/Editor.tsx:111-114` Fixed: the skill is read again when the window regains focus, so an outside edit shows at once. `d9a79bc`
- [ ] **U4** low. Front matter that is not valid YAML reads as "needs name and description". Name and description are not checked against length or the folder name. `src/domain/text.ts:27-31`
- [ ] **U5** low. A link whose name differs from its target folder shows as installed but cannot be uninstalled. `src/infrastructure/library.ts:252,331,351`
