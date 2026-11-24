# Release plan: next release

The plan for the next release: what is in it, what is still to do, and the checks before the tag. [CHANGELOG.md](../CHANGELOG.md) says what changed for people who use the app; this file tracks the work.

| | |
| --- | --- |
| Version | 0.19.0 |
| Status | Released 2026-11-24 |
| Previous release | [v0.18.1](https://github.com/milesroxas/skill-studio/releases/tag/v0.18.1), 2026-11-20 |
| Target date | 2026-11-24 |
| Owner | Miles Roxas |

The version follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html): a minor bump when the release adds a feature, a patch when it only fixes. Before 1.0, a change that breaks a skill or run file is a minor bump too.

## How to use this file

- One line per change. `[x]` means merged to `main`, with its commit. `[ ]` means planned.
- A change people will notice also needs its line under `## [Unreleased]` in the changelog. The release fails without one.
- A planned item that misses this release moves to "Later", with the reason.
- After the release, move "Later" into a new plan for the next version and clear the rest.

## Shipped to main

Everything merged since v0.18.1.

- [x] Results read by checks: All cases counts the cases that got better, the same and worse on their checks, and a case lists what to fix first, grouped by why it was missed. `st sort`, `st propose` and `st read`; rules and checks answered by code once sorted; Cannot be marked; checks for every case as files (0eae323).
- [x] Suggested checks on Cases, under the case's checks, with the turning ribbon; Add to the unsaved case, Turn down with Undo (fbb2fa2).
- [x] Test fixtures kept byte for byte on Windows, which fixed 47 tests that failed there (e568d25).
- [x] `st propose` and `st read` in one message a case, about 10 times fewer tokens; Write checks with AI reads a case's latest runs once it has some; the call-out always open, with its motion in one flow; the previous case's check list no longer stays on screen after switching cases (367884a).
- [x] Docs and the guide updated in the same commits as the changes.

## Planned

The assistant helps change the skill, cheaply. Each step reads a short sheet of evidence in one message, never a folder.

- [x] **The improving loop, for a broken rule.** **Fix with AI** on a broken rule's row drafts a change to the rule in a popover, from the rule, the request the agent got and what it wrote, in one message. Apply and run saves the rule and runs the case once with the model that wrote the answer, as a new version named after the fix. Picked from five places in a prototype round on 2026-11-24. Run live on miles-implement on 2026-11-24: the draft saw that the app asked for the preview page the rule counted as extra, said so in the rule, and the case ran again on Opus as v1; Jev's answer on the rule moved from missed to not sure.
- [x] **Stop a reading.** Write checks with AI is a job, as a run is: Stop beside the button, and in the list of jobs, ends it. Every other way the assistant is asked already had Stop.
- [x] **How often the answer without the skill follows each rule anyway.** A rule's number in the editor says it in a second sentence, where a case ran without the skill: "Followed by 2 of 2 answers written without the skill." It costs nothing: those answers are marked on every rule already.
- [x] **A size before a large reading.** Write checks with AI measures what it would send before it asks. Past about four usual readings it asks first: "Read these long answers?", with how many usual readings it counts as. miles-mockup's latest run read at about 19.
- [x] **Reading after a run.** Decided 2026-11-24: the assistant never runs by itself. A reading starts only from a press, or a setting the writer turns on and can see, and says while it runs. Nothing in the app shows a reading's marks yet, so no such setting is built now.

## Later

- [ ] **A home for checks for every case.** They are graded and `st propose` suggests them, but Cases cannot show, add or edit them, so a suggestion of that kind is hidden there. Moved here on 2026-11-24: it is a new place on Cases, so it needs a design round of its own.
- [ ] **Measure `st read` against the writer's own answers**, once the app shows the assistant's marks on Results: they count in a score on their own only at 90% agreement with the writer (decided 2026-11-20). Moved here on 2026-11-24, since nothing in the app uses those marks yet. The writer's everyday marks in Results build the count: `st read --recount <file>` counts a saved reading against them, asking nothing. On 2026-11-24 a reading of miles-mockup and miles-implement answered 31 rows Jev was not sure of, for about 482,000 input tokens (452,000 of them miles-mockup's pages).
- [ ] **Fix with AI on a check missed with no rule broken.** Its fix is a new rule, not a change to one, so it needs its own draft.
- [ ] **Say on the new answer whether the fix worked.** After Apply and run, Results shows the case's newest answer; a line saying the rule is now met, and that nothing else the case was marked on got worse, is not built.
- [ ] Bring `fallow health` to zero and add the full `fallow` run to `pnpm check`. [complexity-plan.md](complexity-plan.md) holds the phases and tracks them. It changes nothing the app does, so it does not hold a release.
- [ ] The open lines of [hardening.md](hardening.md), S2 and the rest of R3 first.
- [ ] **Edited since v3** names the newest version even after an older one was restored and edited, so Changes then shows the restore as the writer's edit. It needs the version the files were last equal to. Found in the review before 0.17.0.
- [ ] A draft in **Help me improve** still counts "earns its place" and "one skill" as missed when Jev is sure, though no rewrite can fix them. Found in the same review.
- [ ] Twice in testing, the Cases form scrolled up about 128px once when a reading landed or a row was added. It did not happen again in three tries with every scroll and focus change logged, and both times a test script had just scrolled the page. Watch for it.

## Before the release

Checks that are not covered by `pnpm check`.

- [ ] Package the app for macOS and start it: only the runtime packages ship, the windows render under the production CSP, and the backend starts. For 0.20.0 the built app was started unpackaged (`electron .` on `out/`): Library, Results and the Skill screen rendered under the production CSP with no violation, and the backend answered.
- [ ] Run the assistant live on each provider that has only been typechecked: the Anthropic API, OpenAI and Codex. Claude Code has been run live; the other three have not.
- [ ] Send a picture to the assistant on the Anthropic API, OpenAI and Codex paths. Jev and Claude Code have been run live with a picture.
- [ ] Go through the welcome at 110% zoom. Its window grows with the zoom, so the page keeps its 760 x 600; this has not been seen at a real 110%.
- [ ] Open Results on a stopped run, a run cut off by quitting the app and an output whose grading failed, and see the case open on its last finished answers, **Stopped** and **Not finished** on All cases, and **Grade**: these are covered by tests and have not been looked at in the app.

## Release checklist

The steps in [releasing.md](releasing.md), in order.

1. [x] Every item under "Planned" is shipped or moved to "Later".
2. [ ] Every item under "Before the release" is done. Not for 0.20.0: shipped as soon as it could be, at the writer's word; the unchecked items carry to the next release.
3. [x] `pnpm check` and `pnpm build` pass on `main`, and main's own run passes on Windows, macOS and Linux before the tag.
4. [x] The grading gate: nothing it covers changed since it ran on 2026-11-21. Fix with AI's prompt is new and asks no Jev question; no scoring, sorting prompt or exact test changed.
5. [ ] `gh workflow run release` builds every platform. Not run for 0.20.0; the tag's own run builds every platform.
6. [x] In the changelog, add `## [0.20.0] - 2026-11-24` under a new `## [Unreleased]`, and commit.
7. [x] `pnpm version minor -m "Release %s"`, then push `main` and the tag.
8. [x] The release workflow publishes v0.20.0, with the changelog entry as its notes.
