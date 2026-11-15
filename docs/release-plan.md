# Release plan: next release

The plan for the next release: what is in it, what is still to do, and the checks before the tag. [CHANGELOG.md](../CHANGELOG.md) says what changed for people who use the app; this file tracks the work.

| | |
| --- | --- |
| Version | 0.14.0 |
| Status | Released 2026-11-14 |
| Previous release | [v0.13.4](https://github.com/milesroxas/skill-studio/releases/tag/v0.13.4), 2026-11-14 |
| Target date | 2026-11-14 |
| Owner | Miles Roxas |

The version follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html): a minor bump when the release adds a feature, a patch when it only fixes. Before 1.0, a change that breaks a skill or run file is a minor bump too.

## How to use this file

- One line per change. `[x]` means merged to `main`, with its commit. `[ ]` means planned.
- A change people will notice also needs its line under `## [Unreleased]` in the changelog. The release fails without one.
- A planned item that misses this release moves to "Later", with the reason.
- After the release, move "Later" into a new plan for the next version and clear the rest.

## Shipped to main

Everything merged since v0.13.4.

- [x] Keyboard shortcuts a reader can change, in Settings (51b2582).
- [x] The Skill screen folds older versions under one line (444e7e5).
- [x] All cases on Results is read by case, not by run: one row per case, lift from first to latest score, the band that runs the cases not yet run on the current version, and **Grade N runs** (08b3da4).
- [x] Scores are compared only when they measure the same thing: an answer to an edited prompt or an out-of-date grading is shown apart and has no score until it is graded again (94dc712).
- [x] Hardening: J4 ticked and its rest moved to J19 (5fc9d5c); R3, R4, C1, C2 and C3 ticked (5d8458f).
- [x] Docs updated in the same commit as the change.

0.14.0 adds keyboard shortcuts and Grade N runs and changes how All cases reads a skill's runs, so it is a minor release.

## Planned

Nothing is planned and not shipped. Add an item here before work on it starts.

## Later

- [ ] Bring `fallow health` to zero and add the full `fallow` run to `pnpm check`. [complexity-plan.md](complexity-plan.md) holds the phases and tracks them. It changes nothing the app does, so it does not hold a release.
- [ ] The open lines of [hardening.md](hardening.md), S2 and the rest of R3 first.

## Before the release

Checks that are not covered by `pnpm check`.

- [ ] Package the app for macOS and start it: only the runtime packages ship, the windows render under the production CSP, and the backend starts.
- [ ] Run the assistant live on each provider that has only been typechecked: the Anthropic API, OpenAI and Codex. Claude Code has been run live; the other three have not.
- [ ] Send a picture to the assistant on the Anthropic API, OpenAI and Codex paths. Jev and Claude Code have been run live with a picture.
- [ ] Go through the welcome at 110% zoom. Its window grows with the zoom, so the page keeps its 760 x 600; this has not been seen at a real 110%.
- [ ] Once the release is out, open each `releases/latest/download/` link in [releasing.md](releasing.md#updates) and check it fetches the new file, and `latest-mac.yml` names 0.14.0.
- [ ] Update an installed 0.13.4 to this release and see **Restart to update**.
- [ ] Open Results on a stopped run, a run cut off by quitting the app and an output whose grading failed, and see the case open on its last finished answers, **Stopped** and **Not finished** on All cases, and **Grade**: these are covered by tests and have not been looked at in the app.

## Release checklist

The steps in [releasing.md](releasing.md), in order.

1. [x] Every item under "Planned" is shipped or moved to "Later".
2. [ ] Every item under "Before the release" is done. Not for 0.14.0: the unchecked items carry to the next release.
3. [x] `pnpm check` and `pnpm build` pass on `main`, 1,480 tests, and main's own run passes on Windows and macOS before the tag.
4. [ ] `gh workflow run release` builds every platform. Not run for 0.14.0; the tag's own run builds every platform.
5. [x] In the changelog, add `## [0.14.0] - 2026-11-14` under a new `## [Unreleased]`, and commit.
6. [x] `pnpm version minor -m "Release %s"`, then push `main` and the tag.
7. [x] The release workflow publishes v0.14.0, with the changelog entry as its notes.
