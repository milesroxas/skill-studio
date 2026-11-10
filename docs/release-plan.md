# Release plan: 0.5.0

The plan for the next release: what is in it, what is still to do, and the checks before the tag. [CHANGELOG.md](../CHANGELOG.md) says what changed for people who use the app; this file tracks the work.

| | |
| --- | --- |
| Version | 0.5.0 |
| Status | Released 2026-11-10, [v0.5.0](https://github.com/milesroxas/skill-studio/releases/tag/v0.5.0) |
| Previous release | [v0.4.0](https://github.com/milesroxas/skill-studio/releases/tag/v0.4.0), 2026-11-09 |
| Target date | 2026-11-10 |
| Owner | Miles Roxas |

The version is a minor bump. The release adds features (the status line's Dismiss, unsaved scoring kept as a draft, F6 into the selection popout), and it changes what files and commands mean: `st serve` needs a token, an empty output scores 0, a run keeps `_inputs/` and marks stopped samples, and a skill's version counts its scripts. Before 1.0, a change that breaks a skill or run file is a minor bump.

## How to use this file

- One line per change. `[x]` means merged to `main`, with its commit. `[ ]` means planned.
- A change people will notice also needs its line under `## [Unreleased]` in the changelog. The release fails without one.
- A planned item that misses this release moves to "Later", with the reason.
- After the release, move "Later" into a new plan for the next version and clear the rest.

## Shipped to main

Everything merged since v0.4.0. The changelog entry has every change.

- [x] A Cursor agent runs without the app's keys, as a Claude Code agent does. `13f7e7c`
- [x] The app ships only the packages its main process, preload and backend load; CI runs the tests on Linux, macOS and Windows. `b2873ff`
- [x] Audit of security, leaks and performance: `st serve` needs a token, every path is checked against its real place, one process runner and one shutdown, a run copies the skill and its inputs once, grading keeps its answers when stopped, Restore and version delete are all or nothing. `d9a79bc`
- [x] A failure or a warning on the status line stays until it is dismissed. `9f7e411`
- [x] Unsaved scoring is kept as a draft, like unsaved text. `fffe6ff`
- [x] `pnpm health` gives fallow real coverage. `dc63bee`
- [x] The hardening list says what the audit fixed and what is left. `e9e411b`
- [x] Tokens for the scrim, the text on red and an agent's page; dark-theme delete buttons are readable. `e6f2f8f`
- [x] The tests pass on Windows. `c6d617a`
- [x] Fourteen functions the audit made hard to read are split. `59d562c`
- [x] The Windows tests gate a merge. `5dfbbe8`

## Planned

Nothing is planned and not shipped.

## Later

- [ ] Bring `fallow health` to zero and add the full `fallow` run to `pnpm check`. [complexity-plan.md](complexity-plan.md) holds the phases and tracks them. It changes nothing the app does, so it does not hold a release.
- [ ] The open lines of [hardening.md](hardening.md), R3 and S2 first.

## Before the release

Checks that are not covered by `pnpm check`.

- [x] Package the app for macOS and start it on a scratch home and profile: only the five runtime packages and what they pull in ship, the welcome renders under the production CSP, and the backend starts. 2026-11-10.
- [x] With a stand-in `claude`: `st run`, Ctrl-C in the middle of a run (no agent left), grading the cut-off run, and `st serve` refusing a request with no token, from another site, and over 32 MB.
- [x] The tests pass on Linux, macOS and Windows in CI.
- [ ] Run the assistant live on each provider that has only been typechecked: the Anthropic API, OpenAI and Codex. Claude Code has been run live; the other three have not. Carried from 0.4.0.
- [ ] Send a picture to the assistant on the Anthropic API, OpenAI and Codex paths. Jev and Claude Code have been run live with a picture. Carried from 0.4.0.
- [ ] Go through the welcome at 110% zoom. Its window grows with the zoom, so the page keeps its 760 x 600; this has not been seen at a real 110%. Carried from 0.4.0.
- [x] Update an installed 0.4.0 to this release: the released 0.4.0, on a scratch home, found 0.5.0, downloaded it, passed Squirrel's signature check and showed **Restart to update**. 2026-11-10.

## Release checklist

The steps in [releasing.md](releasing.md), in order.

1. [x] Every item under "Planned" is shipped or moved to "Later".
2. [ ] Every item under "Before the release" is done. Three are carried from 0.4.0, as above.
3. [x] `pnpm check` and `pnpm build` pass on `main`.
4. [x] `gh workflow run release` builds every platform.
5. [x] In the changelog, rename `## [Unreleased]` to `## [0.5.0] - 2026-11-10`, start a new `## [Unreleased]` above it, and commit.
6. [x] `pnpm version minor -m "Release %s"`, then `git push --follow-tags`.
7. [x] The release workflow publishes v0.5.0, with the changelog entry as its notes. The macOS builds are signed, notarized and stapled.
8. [x] A running 0.4.0 finds the update and shows **Restart to update**.
9. [ ] Start the plan for the next version.
