# Release plan: next release

The plan for the next release: what is in it, what is still to do, and the checks before the tag. [CHANGELOG.md](../CHANGELOG.md) says what changed for people who use the app; this file tracks the work.

| | |
| --- | --- |
| Version | 0.5.1 |
| Status | Released 2026-11-10, [v0.5.1](https://github.com/milesroxas/skill-studio/releases/tag/v0.5.1) |
| Previous release | [v0.5.0](https://github.com/milesroxas/skill-studio/releases/tag/v0.5.0), 2026-11-10 |
| Target date | 2026-11-10 |
| Owner | Miles Roxas |

The version follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html): a minor bump when the release adds a feature, a patch when it only fixes. Before 1.0, a change that breaks a skill or run file is a minor bump too.

## How to use this file

- One line per change. `[x]` means merged to `main`, with its commit. `[ ]` means planned.
- A change people will notice also needs its line under `## [Unreleased]` in the changelog. The release fails without one.
- A planned item that misses this release moves to "Later", with the reason.
- After the release, move "Later" into a new plan for the next version and clear the rest.

## Shipped to main

Everything merged since v0.5.0.

- [x] Download names carry no version, so `releases/latest/download/<name>` links stay put (3f7e1be).

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
- [x] Once the release is out, open each `releases/latest/download/` link in [releasing.md](releasing.md#updates) and check it fetches the new file: all four fetch 0.5.1, and each `latest*.yml` names the new files. 2026-11-10.
- [x] Update an installed 0.5.0 to this release: the released 0.5.0, on a scratch home, found 0.5.1, downloaded 7% of it as a differential download, passed Squirrel's check and showed **Restart to update**. 2026-11-10.

## Release checklist

The steps in [releasing.md](releasing.md), in order.

1. [x] Every item under "Planned" is shipped or moved to "Later".
2. [ ] Every item under "Before the release" is done. Not for 0.5.1: a patch that only renames the downloads, so the four unchecked items carry to the next release.
3. [x] `pnpm check` and `pnpm build` pass on `main`.
4. [ ] `gh workflow run release` builds every platform. Not run for 0.5.1; the tag's own run built every platform.
5. [x] In the changelog, rename `## [Unreleased]` to `## [0.5.1] - 2026-11-10`, start a new `## [Unreleased]` above it, and commit.
6. [x] `pnpm version patch -m "Release %s"`, then `git push --follow-tags`.
7. [x] The release workflow publishes v0.5.1, with the changelog entry as its notes.
8. [x] A running 0.5.0 finds the update and shows **Restart to update**.
9. [ ] Start the plan for the next version.
