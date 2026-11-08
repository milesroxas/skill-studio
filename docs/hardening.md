# Hardening checklist

Known issues in the product's logic and workflow, from a QA review on 2026-11-06. Each line is one issue: its id, its severity, what is wrong, and where. Paths and line numbers are as of `ee7ae14`.

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
5. V1 to V4: blind ratings stay blind and stay put.

## Results integrity

- [ ] **R1** high. A sample is graded against the wrong case when one case id starts with another plus `-` (`intro`, `intro-long`): `findCase` falls back to a prefix match. Pairwise votes have the same problem. `src/infrastructure/cases.ts:184,189`, `src/application/grade.ts:97`, `src/application/api/operations.ts:544`
- [ ] **R2** high. One run can mix two skill texts. Each sample copies the live skill folder when it starts, the version label is taken once, and Save and Restore are not blocked during a run. `src/application/generate.ts:149,199`, `src/application/api/operations.ts:666,720`
- [ ] **R3** high. Grading reads the live `SKILL.md`, cases and `bench.json`, never the run's `_skill/` snapshot. A regrade judges v0 by v1's rules, and an `old_skill` run is graded by the current rules. `src/application/grade.ts:158-159`
- [ ] **R4** high. A sample with no score is left out of the mean, so a version that fails often looks no worse. `src/renderer/screens/Overview.tsx:64`, `src/renderer/model.ts:83`
- [ ] **R5** high. With the workflow pack on, an empty output can score 100. "nothing written to outputs/" is only a flag. `src/judges/workflow/score.ts:67`, `src/judges/workflow/index.ts:138`
- [ ] **R6** med. A timed-out sample with partial output counts as complete. `src/application/generate.ts:239`
- [ ] **R7** med. "Regrade with code checks" overwrites `report.json` and throws away stored Jev answers. `src/application/grade.ts:196`, `src/renderer/screens/Overview.tsx:293`

## Comparability

- [ ] **C1** high. Cases are not versioned: `run.json` holds case ids only. An edited prompt or check, or an id reused after a delete, changes what old results mean. Rate blind shows the current prompt beside old outputs. `src/application/generate.ts:128`, `src/renderer/screens/Blind.tsx:245-256`
- [ ] **C2** high. The version lift does not check that the first, latest and baseline runs share cases or sample counts. The baseline is the newest without-skill run of any age. `src/domain/lift.ts:59-70`
- [ ] **C3** high. Totals built from different layer sets are compared: a missing key, a failed pack, a pack added later or a crashed lint each drop layers and rescale the rest. `src/domain/scoring.ts:43-53`, `src/application/grade.ts:113-119`
- [ ] **C4** med. No spread or sample count is shown anywhere, so noise reads as lift. `stddev` has no caller outside its test, and `spread` only orders the queue. `src/domain/stats.ts:6-13`, `src/domain/queue.ts:31,35`, `src/domain/lift.ts:71`
- [ ] **C5** med. The lift ribbon draws a full rise for a change that rounds to zero. `src/renderer/components/Lift.tsx:76-77,136,151`
- [ ] **C6** med. Versions and the sidebar score average every writer together. `src/renderer/model.ts:73-85`, `src/renderer/screens/Versions.tsx:184`
- [ ] **C7** med. The version hash covers `SKILL.md` and `references/` only. Edits to `scripts/`, `assets/` or other top-level files keep the same version. `src/infrastructure/skill.ts:21,203-209`
- [ ] **C8** med. An `old_skill` run gets no scripts, and the UI does not say so. `src/application/generate.ts:94`
- [ ] **C9** med. Undo of a version delete after its number was reused leaves two different v3s, averaged together. `src/infrastructure/trash.ts:97-101`, `src/infrastructure/skill.ts:141-157`
- [ ] **C10** low. Baseline runs are stamped with the skill version and are deleted with it. `src/application/generate.ts:100`
- [ ] **C11** low. The without-skill baseline skips the "read SKILL.md first" check, so process is harder for the skill to score on. `src/judges/workflow/score.ts:72-79`
- [ ] **C12** med. Rule extraction grades non-rules: bullets in `~~~` fences (only backtick fences are recognised), bullets under a "Bad example" heading, and pointers such as "Read references/x.md before you start". Only link-only bullets and bullets under four words are skipped. Rules in reference files are never graded. `src/domain/rules.ts:71-72,78,90`
- [ ] **C13** low. The primary artifact is the first file in name order, and `.txt` counts as Markdown, so `notes.md` can beat `post.md`. `src/infrastructure/artifacts.ts:7-19,82`
- [ ] **C14** low. Unsaved Scoring changes rescore every screen. Grade-time-only settings (`workflow.summaryLines`, `codeCheck.*`, `design.maxChars`) look live but change nothing. The CLI reads stored scores, so it disagrees with the app after Save. `src/renderer/App.tsx:137`, `src/interfaces/cli/st.ts:138`

## Human review

- [ ] **V1** high. A finished background job resets an unsaved blind rating, and can swap the output on screen, so the next click rates the wrong one. `src/renderer/screens/Blind.tsx:66,80,84-92`, `src/renderer/App.tsx:192`
- [ ] **V2** high. Agreement pools baseline, old-skill and past-version outputs. Baseline answers break rules they never saw and produce "change the skill". `src/renderer/screens/Insights.tsx:52-66`
- [ ] **V3** high. Compare votes are cast with totals, the delta and "The scores favor A" on screen, then used to test the judge. `src/renderer/screens/Compare.tsx:247-249,310,348-352,439-442`
- [ ] **V4** med. Ratings made after a reveal are stored like blind ones: the review has no blind flag. `src/domain/schemas.ts:269`, `src/renderer/screens/Blind.tsx:343-368`
- [ ] **V5** med. The verdict rule has no minimum count, ignores "Both good", and shows one verdict per layer. `src/renderer/screens/Insights.tsx:173-206`
- [ ] **V6** med. Pairs compares a vote on any criterion with the overall total, and counts votes on deleted runs. `src/renderer/screens/Insights.tsx:77-84,231`
- [ ] **V7** med. Leaderboards rank every case on one board. Separate groups are ranked as comparable, and scores print to two decimals from one vote. `src/domain/bradley-terry.ts:64-107`
- [ ] **V8** med. The queue puts the least certain answers first, so Agreement and the correlation run on a skewed sample. `src/domain/queue.ts:42`
- [ ] **V9** low. When all ratings are equal, the correlation screen says "needs 3 or more". A correlation from 3 ratings reads as settled. `src/domain/stats.ts:53`, `src/renderer/screens/Insights.tsx:217-219`
- [ ] **V10** low. The queue list shows "judge N% sure · spread N" before rating. `src/renderer/screens/Blind.tsx:434-435`
- [ ] **V11** low. Criteria are case-sensitive: "Warmth" and "warmth" are two boards. `src/renderer/screens/Compare.tsx:99`
- [ ] **V12** low. `skill.review` accepts any rating number and any layer mark. `src/application/api/operations.ts:424-435`

## Anchors

- [ ] **A1** med. `st self-test` can pass while checking nothing. It keeps one good anchor per case, skips cases with only bad anchors, and counts a null layer as -1. `src/application/grade.ts:222-231`, `src/interfaces/cli/st.ts:342`
- [ ] **A2** low. A bad anchor tests workflow layers by default, which are always null on anchors, so that check always fails. `src/renderer/components/AnchorForm.tsx:29`
- [ ] **A3** low. An anchor made from an image output writes binary into a `.md` file. `src/infrastructure/reviews.ts:55-56`

## Data loss

- [ ] **D1** high. Restore corrupts binary files under `references/`: files are read and written as UTF-8. `src/infrastructure/fs.ts:65`, `src/infrastructure/skill.ts:185`
- [ ] **D2** med. Saving a case deletes check files and pictures the draft does not list, with no check that the case changed on disk. `src/infrastructure/cases.ts:270-271,318-320`
- [ ] **D3** med. Restore does not warn about unsaved drafts. "Keep my draft" afterwards undoes the restore. `src/renderer/screens/Versions.tsx:71`
- [ ] **D4** med. Undo of a version delete lives only in the status line notice (`Notice.undo`). A restart, another notice or the notice timing out loses it. `src/renderer/hooks.ts:64-65,77-78,85`
- [ ] **D5** low. `reviews.json` is not written atomically. A crash or a merge conflict in it stops the skill from opening. `src/infrastructure/fs.ts:13-19`
- [ ] **D6** low. The drafts file is rewritten whole, so the desktop app and `st serve` overwrite each other's drafts. `src/infrastructure/drafts.ts:43`
- [ ] **D7** low. A draft of a reference file that was deleted on disk can never be saved. `src/renderer/screens/Editor.tsx:138`, `src/infrastructure/skill.ts:67-71`

## Run pipeline

- [ ] **P1** med. One sample that throws fails the job, while the other workers keep starting paid sessions. `src/application/generate.ts:141-159`
- [ ] **P2** med. There is no cancel. An interrupted run later looks finished. A regrade during a run writes "no output" for samples still in progress. The renderer never reads `finishedAt`.
- [ ] **P3** low. Samples per case are not bounded or checked to be whole numbers on the server. `src/application/api/operations.ts:165,257`
- [ ] **P4** low. The run's note is replaced by the version's note. `src/application/generate.ts:57,99`
- [ ] **P5** low. Jev cost covers input tokens only. A failed question empties the whole pack. `src/judges/jev.ts:49`

## Security and isolation

- [ ] **S1** high. Agents get the whole environment, including `TYPESAFE_API_KEY` and the stored Anthropic and OpenAI keys. Bash is allowed by default. `src/infrastructure/env.ts:6-10`, `src/interfaces/electron/backend/index.ts:30-33`
- [ ] **S2** med. Isolation relies on the prompt. The sample sits inside `evals/runs/`, so `../..` reaches the graders, and its folder name says whether the skill is installed. Relative paths outside the sample are not flagged. Cursor ignores `allowed_tools`. `src/judges/workflow/index.ts:43`, `src/infrastructure/engines/cursor.ts:93-101`

## Refinement loop

- [ ] **U1** med. No link from Results, Agreement, Rate blind or Compare to the rule or case in question. Graded rules shows no pass rate per rule. The guide's arrow back to the Editor has no UI.
- [ ] **U2** med. New run and the Next button ignore unsaved drafts and run the saved text as "unchanged". `src/renderer/App.tsx:312`, `src/renderer/screens/Generate.tsx`
- [ ] **U3** low. The Editor does not reload when the window regains focus, so an outside edit only shows as a refused save. `src/renderer/screens/Editor.tsx:111-114`
- [ ] **U4** low. The walkthrough gets stuck on "Rate" when the first run's grading failed. `src/domain/practice.ts:162`, `src/renderer/practice.ts:56`
- [ ] **U5** low. Front matter that is not valid YAML reads as "needs name and description". Name and description are not checked against length or the folder name. `src/domain/text.ts:27-31`
- [ ] **U6** low. A link whose name differs from its target folder shows as installed but cannot be uninstalled. `src/infrastructure/library.ts:252,331,351`
