# Release plan: next release

The plan for the next release: what is in it, what is still to do, and the checks before the tag. [CHANGELOG.md](../CHANGELOG.md) says what changed for people who use the app; this file tracks the work.

| | |
| --- | --- |
| Version | 0.8.0 |
| Status | Released 2026-11-11 |
| Previous release | [v0.7.2](https://github.com/milesroxas/skill-studio/releases/tag/v0.7.2), 2026-11-11 |
| Target date | 2026-11-11 |
| Owner | Miles Roxas |

The version follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html): a minor bump when the release adds a feature, a patch when it only fixes. Before 1.0, a change that breaks a skill or run file is a minor bump too.

## How to use this file

- One line per change. `[x]` means merged to `main`, with its commit. `[ ]` means planned.
- A change people will notice also needs its line under `## [Unreleased]` in the changelog. The release fails without one.
- A planned item that misses this release moves to "Later", with the reason.
- After the release, move "Later" into a new plan for the next version and clear the rest.

## Shipped to main

Everything merged since v0.7.2.

- [x] Run panel: says what a run tests, and its button names the run (5324afd).
- [x] Cases: one Files list for pictures and files, dropped anywhere on a case (1f2f3d1).
- [x] Plainer, shorter words across the app, rules for them in docs/design/copy.md and a test that holds them (0377403, 2dd6abd).
- [x] Versions says only what the list cannot show (93f09b8).
- [x] Results: fewer controls, page size in the line under the stage, files in one menu, One at a time (f061f51).
- [x] Grading: every skill graded on its own rules and checks on any kind of output; Design is a look at the picture; Code is the check command; the Writing kind is removed (3ed6afb).
- [x] Docs checked against the code for this release.

0.8.0 changes what a score counts: rules and checks are graded on pages, pictures and code, and the Writing kind is gone, so `bench.json` and `case.yaml` keys it read are no longer read. Before 1.0 a change to what a skill or run file means is a minor bump.

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
- [x] Once the release is out, open each `releases/latest/download/` link in [releasing.md](releasing.md#updates) and check it fetches the new file, and `latest-mac.yml` names 0.8.0.
- [ ] Update an installed 0.7.2 to this release and see **Restart to update**.
- [ ] Regrade a past run of a page skill with a Jev key and see its Rules and Checks parts appear.

## Release checklist

The steps in [releasing.md](releasing.md), in order.

1. [x] Every item under "Planned" is shipped or moved to "Later".
2. [ ] Every item under "Before the release" is done. Not for 0.8.0: the unchecked items carry to the next release.
3. [x] `pnpm check` and `pnpm build` pass on `main`, 1,182 tests.
4. [ ] `gh workflow run release` builds every platform. Not run for 0.8.0; the tag's own run builds every platform.
5. [x] In the changelog, rename `## [Unreleased]` to `## [0.8.0] - 2026-11-11`, start a new `## [Unreleased]` above it, and commit.
6. [x] `pnpm version minor -m "Release %s"`, then push `main` and the tag.
7. [x] The release workflow publishes v0.8.0, with the changelog entry as its notes.
