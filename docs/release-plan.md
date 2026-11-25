# Release plan: next release

The plan for the next release: what is in it, what is still to do, and the checks before the tag. [CHANGELOG.md](../CHANGELOG.md) says what changed for people who use the app; this file tracks the work.

| | |
| --- | --- |
| Version | 0.20.2 |
| Status | Releasing 2026-11-25 |
| Previous release | [v0.20.1](https://github.com/milesroxas/skill-studio/releases/tag/v0.20.1), 2026-11-24 |
| Target date | 2026-11-25 |
| Owner | Miles Roxas |

The version follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html): a minor bump when the release adds a feature, a patch when it only fixes. Before 1.0, a change that breaks a skill or run file is a minor bump too.

## How to use this file

- One line per change. `[x]` means merged to `main`, with its commit. `[ ]` means planned.
- A change people will notice also needs its line under `## [Unreleased]` in the changelog. The release fails without one.
- A planned item that misses this release moves to "Later", with the reason.
- After the release, move "Later" into a new plan for the next version and clear the rest.

## Shipped to main

Everything merged since v0.20.1. A patch, at the writer's word: "cut new patch for all work waiting to be released on main".

- [x] Spring motion for what the assistant hands over: Fix with AI springs open from its button with its ribbon; when the fix lands the band sinks away and the fix settles in top to bottom, its two buttons as one part. The suggested checks call-out, its list, rows and Why, and a check added from outside unfold on the same spring. `Unfold` clips with `overflow: clip`, so a fix no longer shows from its last line and then jumps to the top (1236558).

## Planned

Nothing more for this patch.

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
2. [ ] Every item under "Before the release" is done. Not for 0.20.2: a patch at the writer's word; the unchecked items carry to the next release.
3. [x] `pnpm check` and `pnpm build` pass on `main`, and main's own run passes on Windows, macOS and Linux before the tag.
4. [x] The grading gate: nothing it covers changed since it ran on 2026-11-21. This change is motion in the app's look only.
5. [ ] `gh workflow run release` builds every platform. Not run for 0.20.2; the tag's own run builds every platform.
6. [x] In the changelog, add `## [0.20.2] - 2026-11-25` under a new `## [Unreleased]`, and commit.
7. [ ] `pnpm version patch -m "Release %s"`, then push `main` and the tag.
8. [ ] The release workflow publishes v0.20.2, with the changelog entry as its notes.
