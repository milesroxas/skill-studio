# Release plan: next release

The plan for the next release: what is in it, what is still to do, and the checks before the tag. [CHANGELOG.md](../CHANGELOG.md) says what changed for people who use the app; this file tracks the work.

| | |
| --- | --- |
| Version | 0.19.0 |
| Status | Releasing 2026-11-24 |
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

- [ ] **The improving loop.** From a miss on Results, the assistant drafts a change to the rule behind it, the writer clicks Apply and Run, and that case alone runs again on a cheap model to show whether the miss is fixed and nothing else got worse. A prototype round first: where the loop starts on Results, and where the draft shows.
- [ ] **Stop a reading.** Write checks with AI cannot be stopped once it starts; it should be a job that stops like a run.
- [ ] **A home for checks for every case.** They are graded and `st propose` suggests them, but Cases cannot show, add or edit them, so a suggestion of that kind is hidden there.
- [ ] **How often the answer without the skill follows each rule anyway.** The runs are graded already, so it costs nothing to count, and it finds a rule the agent follows without being told.
- [ ] **A size before a large reading.** A case whose answers are long pages took about 87,000 of 119,000 tokens on the test skill. Say a case is large before it is read, or read fewer of its answers; decide once real skills show how common such pages are.
- [ ] **Reading after a run.** The plan of 2026-11-20 had it off by default, with a switch in the Run popover and in Settings, because a reading cost about 200,000 tokens a case. A case now costs about 6,000: decide again whether it should run after every run.
- [ ] Measure `st read` against the writer's own answers, not only the answer key: it agreed with the key on 61 of 62 answers, and only 3 of the writer's corrections exist.

## Later

- [ ] Bring `fallow health` to zero and add the full `fallow` run to `pnpm check`. [complexity-plan.md](complexity-plan.md) holds the phases and tracks them. It changes nothing the app does, so it does not hold a release.
- [ ] The open lines of [hardening.md](hardening.md), S2 and the rest of R3 first.
- [ ] **Edited since v3** names the newest version even after an older one was restored and edited, so Changes then shows the restore as the writer's edit. It needs the version the files were last equal to. Found in the review before 0.17.0.
- [ ] A draft in **Help me improve** still counts "earns its place" and "one skill" as missed when Jev is sure, though no rewrite can fix them. Found in the same review.
- [ ] Twice in testing, the Cases form scrolled up about 128px once when a reading landed or a row was added. It did not happen again in three tries with every scroll and focus change logged, and both times a test script had just scrolled the page. Watch for it.

## Before the release

Checks that are not covered by `pnpm check`.

- [ ] Package the app for macOS and start it: only the runtime packages ship, the windows render under the production CSP, and the backend starts.
- [ ] Run the assistant live on each provider that has only been typechecked: the Anthropic API, OpenAI and Codex. Claude Code has been run live; the other three have not.
- [ ] Send a picture to the assistant on the Anthropic API, OpenAI and Codex paths. Jev and Claude Code have been run live with a picture.
- [ ] Go through the welcome at 110% zoom. Its window grows with the zoom, so the page keeps its 760 x 600; this has not been seen at a real 110%.
- [ ] Open Results on a stopped run, a run cut off by quitting the app and an output whose grading failed, and see the case open on its last finished answers, **Stopped** and **Not finished** on All cases, and **Grade**: these are covered by tests and have not been looked at in the app.

## Release checklist

The steps in [releasing.md](releasing.md), in order.

1. [x] Every item under "Planned" is shipped or moved to "Later". For 0.19.0 the planned items are the next release's work.
2. [ ] Every item under "Before the release" is done. Not for 0.19.0: the unchecked items carry to the next release.
3. [x] `pnpm check` and `pnpm build` pass on `main`, 2,136 tests, and main's own run passes on Windows and macOS before the tag.
4. [x] The grading gate: `pnpm reading-gate` ran live on 2026-11-21 for the sorting and exact tests of 0eae323, and its counts are pinned in `scripts/reading-bench/pinned.ts`. Nothing it covers changed since: no Jev question, scoring, sorting prompt or exact test.
5. [ ] `gh workflow run release` builds every platform. Not run for 0.19.0; the tag's own run builds every platform.
6. [x] In the changelog, add `## [0.19.0] - 2026-11-24` under a new `## [Unreleased]`, and commit.
7. [ ] `pnpm version minor -m "Release %s"`, then push `main` and the tag.
8. [ ] The release workflow publishes v0.19.0, with the changelog entry as its notes.
