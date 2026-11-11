# Release plan: next release

The plan for the next release: what is in it, what is still to do, and the checks before the tag. [CHANGELOG.md](../CHANGELOG.md) says what changed for people who use the app; this file tracks the work.

| | |
| --- | --- |
| Version | 0.5.4 |
| Status | Tagged 2026-11-10 |
| Previous release | [v0.5.3](https://github.com/milesroxas/skill-studio/releases/tag/v0.5.3), 2026-11-10 |
| Target date | 2026-11-10 |
| Owner | Miles Roxas |

The version follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html): a minor bump when the release adds a feature, a patch when it only fixes. Before 1.0, a change that breaks a skill or run file is a minor bump too.

## How to use this file

- One line per change. `[x]` means merged to `main`, with its commit. `[ ]` means planned.
- A change people will notice also needs its line under `## [Unreleased]` in the changelog. The release fails without one.
- A planned item that misses this release moves to "Later", with the reason.
- After the release, move "Later" into a new plan for the next version and clear the rest.

## Shipped to main

Everything merged since v0.5.3.

- [x] Library: Mark done takes a skill out of In progress until it is worked on again, and replaces the Mine and Not mine buttons and the Yours, Installed and All switch; the Skill screen names a lock file's source; a narrow table folds a row's actions into a More actions menu (`RowActions`) (f1c4508).

0.5.4 adds a feature, which the rule above makes a minor bump. It is a patch at Miles's call (2026-11-10).

## Planned

Nothing is planned and not shipped. Add an item here before work on it starts.

## Later

- [ ] Bring `fallow health` to zero and add the full `fallow` run to `pnpm check`. [complexity-plan.md](complexity-plan.md) holds the phases and tracks them. It changes nothing the app does, so it does not hold a release.
- [ ] The open lines of [hardening.md](hardening.md), R3 and S2 first.

## Before the release

Checks that are not covered by `pnpm check`.

- [ ] Package the app for macOS and start it: only the runtime packages ship, the windows render under the production CSP, and the backend starts.
- [ ] Run the assistant live on each provider that has only been typechecked: the Anthropic API, OpenAI and Codex. Claude Code has been run live; the other three have not.
- [ ] Send a picture to the assistant on the Anthropic API, OpenAI and Codex paths. Jev and Claude Code have been run live with a picture.
- [ ] Go through the welcome at 110% zoom. Its window grows with the zoom, so the page keeps its 760 x 600; this has not been seen at a real 110%.
- [ ] Once the release is out, open each `releases/latest/download/` link in [releasing.md](releasing.md#updates) and check it fetches the new file.
- [ ] Update an installed 0.5.3 to this release and see **Restart to update**.

## Release checklist

The steps in [releasing.md](releasing.md), in order.

1. [x] Every item under "Planned" is shipped or moved to "Later".
2. [ ] Every item under "Before the release" is done. Not for 0.5.4: the unchecked items carry to the next release. The built app was started on Electron 45.3.0 from `out/` with a scratch home, and the Library was driven at 720 and 1120 px in both themes.
3. [x] `pnpm check` and `pnpm build` pass on `main`. Biome and `fallow dead-code` are clean; `fallow health` reports 233 above threshold, the known debt in [complexity-plan.md](complexity-plan.md).
4. [ ] `gh workflow run release` builds every platform. Not run for 0.5.4; the tag's own run builds every platform.
5. [x] In the changelog, rename `## [Unreleased]` to `## [0.5.4] - 2026-11-10`, start a new `## [Unreleased]` above it, and commit.
6. [ ] `pnpm version patch -m "Release %s"`, then `git push --follow-tags`.
7. [ ] The release workflow publishes v0.5.4, with the changelog entry as its notes.
8. [ ] A running 0.5.3 finds the update and shows **Restart to update**.
9. [ ] Start the plan for the next version.
