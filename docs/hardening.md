# Hardening checklist

Known issues in the product's logic and workflow, from a QA review on 2026-11-06. Each line is one issue: its id, its severity, what is wrong, and where. Paths with line numbers are as of `ee7ae14`; a path with none names a file as it is now.

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
4. S1: keys kept out of the agent's environment.

## Results integrity

- [ ] **R1** high. A sample is graded against the wrong case when one case id starts with another plus `-` (`intro`, `intro-long`): `findCase` falls back to a prefix match. `src/infrastructure/cases.ts:184,189`, `src/application/grade.ts`
- [ ] **R2** high. One run can mix two skill texts. Each sample copies the live skill folder when it starts, the version label is taken once, and Save and Restore are not blocked during a run. `src/application/generate.ts:149,199`, `src/application/api/operations.ts:666,720`
- [ ] **R3** high. Grading reads the live `SKILL.md`, cases and `bench.json`, never the run's `_skill/` snapshot. A regrade judges v0 by v1's rules, and an `old_skill` run is graded by the current rules. `src/application/grade.ts:158-159`
- [ ] **R4** high. A sample with no score is left out of the mean, so a version that fails often looks no worse. `src/renderer/model.ts` (`meanTotal`), `src/renderer/components/ResultsSummary.tsx`
- [ ] **R5** high. With the workflow pack on, an empty output can score 100. "nothing written to outputs/" is only a flag. `src/judges/workflow/score.ts:67`, `src/judges/workflow/index.ts:138`
- [ ] **R6** med. A timed-out sample with partial output counts as complete. `src/application/generate.ts:239`
- [ ] **R7** med. "Regrade with code checks" overwrites `report.json` and throws away stored Jev answers. `src/application/grade.ts`, `src/renderer/components/ResultsSummary.tsx`

- [ ] **R8** low. A correction names a fact by its kind and its words, so two rules of one skill that read the same share one answer. `src/domain/verdict.ts` (`verdictId`)

## Comparability

- [ ] **C1** high. Cases are not versioned: `run.json` holds case ids only. An edited prompt or check, or an id reused after a delete, changes what old results mean. Results shows the current prompt and checks beside old outputs. `src/application/generate.ts:128`, `src/renderer/components/Comparison.tsx`
- [ ] **C2** high. The version lift does not check that the first, latest and baseline runs share cases or sample counts. The baseline is the newest without-skill run of any age. `src/domain/lift.ts:59-70`
- [ ] **C3** high. Totals built from different layer sets are compared: a missing key, a failed pack, a pack added later or a crashed lint each drop layers and rescale the rest. `src/domain/scoring.ts:43-53`, `src/application/grade.ts:113-119`
- [ ] **C4** med. No spread or sample count is shown anywhere, so noise reads as lift. `stddev` has no caller outside its test. `src/domain/stats.ts`, `src/domain/lift.ts:71`
- [ ] **C5** med. The lift ribbon draws a full rise for a change that rounds to zero. `src/renderer/components/Lift.tsx:76-77,136,151`
- [ ] **C6** med. The versions list and the sidebar's score average every writer together, while the version lift compares one writer with itself. `src/renderer/model.ts` (`versionScore`), `src/renderer/screens/Editor.tsx`
- [ ] **C7** med. The version hash covers `SKILL.md` and `references/` only. Edits to `scripts/`, `assets/` or other top-level files keep the same version. `src/infrastructure/skill.ts:21,203-209`
- [ ] **C8** med. An `old_skill` run gets no scripts, and the UI does not say so. `src/application/generate.ts:94`
- [ ] **C9** med. Undo of a version delete after its number was reused leaves two different v3s, averaged together. `src/infrastructure/trash.ts:97-101`, `src/infrastructure/skill.ts:141-157`
- [ ] **C10** low. Baseline runs are stamped with the skill version and are deleted with it. `src/application/generate.ts:100`
- [ ] **C11** low. The without-skill baseline skips the "read SKILL.md first" check, so process is harder for the skill to score on. `src/judges/workflow/score.ts:72-79`
- [ ] **C12** med. Rule extraction grades non-rules: bullets in `~~~` fences (only backtick fences are recognised), bullets under a "Bad example" heading, and pointers such as "Read references/x.md before you start". Only link-only bullets and bullets under four words are skipped. Rules in reference files are never graded. `src/domain/rules.ts:71-72,78,90`
- [ ] **C13** low. The primary artifact is the first file in name order, and `.txt` counts as Markdown, so `notes.md` can beat `post.md`. `src/infrastructure/artifacts.ts:7-19,82`
- [ ] **C14** low. Unsaved Scoring changes rescore every screen. Grade-time-only settings (`workflow.summaryLines`, `codeCheck.*`, `design.maxChars`) look live but change nothing. The CLI reads stored scores, so it disagrees with the app after Save, and it never applies a correction. `src/renderer/App.tsx`, `src/interfaces/cli/st.ts:138`

## Picks and corrections

- [ ] **V1** med. A pick is made with both scores, their difference and what each output missed on screen, so Jev's reading can sway the pick it is then set against. `src/renderer/components/Comparison.tsx`
- [ ] **V2** low. A case counts as compared once the pair it opens with has a pick. With two samples per version, the other samples are never asked about. `src/renderer/model.ts` (`casePair`), `src/renderer/App.tsx`
- [ ] **V3** low. `skill.correct` takes any text as a verdict's name: an answer on a fact the output does not have is stored and never read. `src/application/api/operations.ts`

## Anchors

- [ ] **A1** med. `st self-test` can pass while checking nothing. It keeps one good anchor per case, skips cases with only bad anchors, and counts a null layer as -1. `src/application/grade.ts:222-231`, `src/interfaces/cli/st.ts:342`

## Data loss

- [ ] **D1** high. Restore corrupts binary files under `references/`: files are read and written as UTF-8. `src/infrastructure/fs.ts:65`, `src/infrastructure/skill.ts:185`
- [ ] **D2** med. Saving a case deletes check files and pictures the draft does not list, with no check that the case changed on disk. `src/infrastructure/cases.ts:270-271,318-320` In part: `saveCase` takes the `caseSavedAt` time the form loaded and refuses a save over a newer one; the form does not pass it yet.
- [ ] **D3** med. Restore does not warn about unsaved drafts. "Keep my draft" afterwards undoes the restore. `src/renderer/components/VersionDetail.tsx`
- [ ] **D4** med. Undo of a version delete lives only in the status line notice (`Notice.undo`). A restart, another notice or the notice timing out loses it. `src/renderer/hooks.ts:64-65,77-78,85`
- [x] **D5** low. `reviews.json` is not written atomically. A crash or a merge conflict in it stops the skill from opening. `src/infrastructure/fs.ts:13-19` Fixed: every JSON file is written to a temporary file and renamed, and a damaged one is named in the error.
- [ ] **D6** low. The drafts file is rewritten whole, so the desktop app and `st serve` overwrite each other's drafts. `src/infrastructure/drafts.ts:43`
- [ ] **D7** low. A draft of a reference file that was deleted on disk can never be saved. `src/renderer/screens/Editor.tsx:138`, `src/infrastructure/skill.ts:67-71`

## Run pipeline

- [ ] **P1** med. One sample that throws fails the job, while the other workers keep starting paid sessions. `src/application/generate.ts:141-159`
- [ ] **P2** med. There is no cancel. An interrupted run later looks finished. A regrade during a run writes "no output" for samples still in progress. The renderer never reads `finishedAt`.
- [ ] **P3** low. Samples per case are not bounded or checked to be whole numbers on the server. `src/application/api/operations.ts:165,257`
- [ ] **P4** low. The run's note is replaced by the version's note. `src/application/generate.ts:57,99`
- [ ] **P5** low. Jev cost covers input tokens only. A failed question empties the whole pack. `src/judges/jev.ts:49`

## Security and isolation

- [ ] **S1** high. Agents get the whole environment, including `TYPESAFE_API_KEY` and the stored Anthropic and OpenAI keys. Bash is allowed by default. `src/infrastructure/env.ts:6-10`, `src/interfaces/electron/backend/index.ts:30-33` In part: agents and the assistant's CLIs no longer get the keys (`agentEnv`). The `code` pack's check command (`src/judges/shared/exec.ts`) still does, and Bash is still the default.
- [ ] **S2** med. Isolation relies on the prompt. The sample sits inside `evals/runs/`, so `../..` reaches the graders, and its folder name says whether the skill is installed. Relative paths outside the sample are not flagged. Cursor ignores `allowed_tools`. `src/judges/workflow/index.ts:43`, `src/infrastructure/engines/cursor.ts:93-101`

## Refinement loop

- [ ] **U1** low. The Skill screen shows no pass rate per rule: a rule most outputs break looks like any other. `src/renderer/editor/graded.ts`
- [ ] **U2** low. The next step ignores unsaved drafts: with an edit to SKILL.md not saved, it does not suggest a run. The Run panel says when files hold unsaved edits. `src/renderer/App.tsx`, `src/renderer/components/Run.tsx`
- [ ] **U3** low. The Editor does not reload when the window regains focus, so an outside edit only shows as a refused save. `src/renderer/screens/Editor.tsx:111-114`
- [ ] **U4** low. Front matter that is not valid YAML reads as "needs name and description". Name and description are not checked against length or the folder name. `src/domain/text.ts:27-31`
- [ ] **U5** low. A link whose name differs from its target folder shows as installed but cannot be uninstalled. `src/infrastructure/library.ts:252,331,351`
