# Release plan: next release

The plan for the next release: what is in it, what is still to do, and the checks before the tag. [CHANGELOG.md](../CHANGELOG.md) says what changed for people who use the app; this file tracks the work.

| | |
| --- | --- |
| Version | 0.21.0 |
| Status | Released 2026-11-27 |
| Previous release | [v0.20.3](https://github.com/milesroxas/skill-studio/releases/tag/v0.20.3), 2026-11-25 |
| Target date | 2026-11-27 |
| Owner | Miles Roxas |

The version follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html): a minor bump when the release adds a feature, a patch when it only fixes. Before 1.0, a change that breaks a skill or run file is a minor bump too.

## How to use this file

- One line per change. `[x]` means merged to `main`, with its commit. `[ ]` means planned.
- A change people will notice also needs its line under `## [Unreleased]` in the changelog. The release fails without one.
- A planned item that misses this release moves to "Later", with the reason.
- After the release, move "Later" into a new plan for the next version and clear the rest.

## Shipped to main

Everything merged since v0.20.3: the [agent loop plan](agent-loop-plan.md), which holds each item's numbers. A minor, since it adds commands. Released at the writer's word.

- [x] Chain A, the `st` commands an agent drives the loop with: `st case add` and `case check`, `st run --from`, the Results address and `st open`, `--brief` and `--quiet`, the drawing host, `st sheet`, and the loop skill (aefd45e, PR #9).
- [x] The acceptance run, and what it showed: run names, not-sure counts in `--brief`, and what a run spent (4816ae4 and 3d3baef, PRs #10 and #11).
- [x] The baseline: `st sort`, `st propose` and `st read` measured live once, their replies kept and replayed in `pnpm check` (d5d4f8b, PR #12).
- [x] Chain B: `st propose` asks Jev what a grading will ask, and `st read` asks Jev again before the assistant (aa3bd7d, PR #13).
- [x] Chain E: Help me improve asks its own questions, Fix with AI starts from the verdict, Write with AI counts in code, the Assistant edits part of a file, and Jev's answers about a rule are kept (67766a9, PR #14).
- [x] Chain C: `st sort` checks the assistant where both readings are exact (af6f1ea, PR #15).
- [x] Chain D: reports name where code and a sure Jev disagree (059ff95, PR #16).

## Planned

Nothing more for this release.

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

- [ ] Package the app for macOS and start it: only the runtime packages ship, the windows render under the production CSP, and the backend starts.
- [ ] Run the assistant live on each provider that has only been typechecked: the Anthropic API, OpenAI and Codex. Claude Code has been run live; the other three have not.
- [ ] Send a picture to the assistant on the Anthropic API, OpenAI and Codex paths. Jev and Claude Code have been run live with a picture.
- [ ] Go through the welcome at 110% zoom. Its window grows with the zoom, so the page keeps its 760 x 600; this has not been seen at a real 110%.
- [ ] Open Results on a stopped run, a run cut off by quitting the app and an output whose grading failed, and see the case open on its last finished answers, **Stopped** and **Not finished** on All cases, and **Grade**: these are covered by tests and have not been looked at in the app.

## Release checklist

The steps in [releasing.md](releasing.md), in order.

1. [x] Every item under "Planned" is shipped or moved to "Later".
2. [ ] Every item under "Before the release" is done. Not for 0.21.0: the unchecked items carry to the next release. The five assistant actions this release changes were looked at in the built app on 2026-11-27.
3. [x] `pnpm check` and `pnpm build` pass on `main`, and main's own run passes on Windows, macOS and Linux before the tag.
4. [x] The grading gate, run live on 2026-11-27: it passes, with 0 sure and wrong, and code's 191 exact answers all agree with the key.
5. [ ] `gh workflow run release` builds every platform. Not run for 0.21.0; the tag's own run builds every platform.
6. [x] In the changelog, add `## [0.21.0] - 2026-11-27` under a new `## [Unreleased]`, and commit.
7. [x] `pnpm version minor -m "Release %s"`, then push `main` and the tag.
8. [x] The release workflow publishes v0.21.0, with the changelog entry as its notes.
