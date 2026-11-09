# Release plan: 0.3.0

The plan for the next release: what is in it, what is still to do, and the checks before the tag. [CHANGELOG.md](../CHANGELOG.md) says what changed for people who use the app; this file tracks the work.

| | |
| --- | --- |
| Version | 0.3.0 |
| Status | Released 2026-11-09, [v0.3.0](https://github.com/milesroxas/skill-studio/releases/tag/v0.3.0) |
| Previous release | [v0.2.0](https://github.com/milesroxas/skill-studio/releases/tag/v0.2.0), 2026-11-08 |
| Target date | Not set |
| Owner | Miles Roxas |

The version is a minor bump: the changes since 0.2.0 add features, and [Semantic Versioning](https://semver.org/spec/v2.0.0.html) gives new features a minor version. Before 1.0, a change that breaks a skill or run file is a minor bump too.

## How to use this file

- One line per change. `[x]` means merged to `main`, with its commit. `[ ]` means planned.
- A change people will notice also needs its line under `## [Unreleased]` in the changelog. The release fails without one.
- A planned item that misses this release moves to "Later", with the reason.
- After the release, move "Later" into a new plan for the next version and clear the rest.

## Shipped to main

Everything merged since v0.2.0.

### Features

- [x] Settings and the welcome say how Claude Code and Codex stand: not installed, not signed in, or signed in, with the account and what pays. When one needs installing or signing in, the app shows its maker's command to copy, and never installs or signs in itself. `944db6d`
- [x] Claude Code and Codex are the main way to connect a model: first in Settings, the welcome and every model list, and the default when both a CLI and an API key are set up. The API key sits under "Use an API key". `944db6d`
- [x] The welcome's setup says each thing once, with nothing between Back and the way forward. `3ab1c87`

- [x] The loop is write, run, compare. A skill has three screens (Skill, Cases, Results) and a Run button; Results sets two outputs side by side with what each missed, a pick, and a correction for any verdict; a run saves the version; the welcome tells the loop in three steps and the walkthrough takes it in seven. The changelog entry has every change. `6dc08fe`

### Fixes

- [x] The app opened from the Finder or the Dock finds Claude Code, Codex and Cursor installed in the home folder or with Homebrew. `944db6d`
- [x] A short window keeps the sidebar's places in view, "Saved" reads whole in a narrow column, and a long menu label ends in an ellipsis.

## Planned

Nothing is planned and not shipped. Add an item here before work on it starts.

## Later

- [ ] Bring `fallow health` to zero and add the full `fallow` run to `pnpm check`. [complexity-plan.md](complexity-plan.md) holds the phases and tracks them. Moved from Planned: it changes nothing the app does, so it does not hold a release.

## Before the release

Checks that are not covered by `pnpm check`.

- [x] Take a skill round the new loop with a real agent and a real Jev key: run, read what each output missed, mark one verdict wrong, pick, add a check, regrade. Done on the walkthrough's skill with Claude Sonnet, 2026-11-09.
- [x] Take the walkthrough to its end with a real run: all seven steps, two runs.
- [x] Open a skill whose `reviews.json` an earlier version wrote, make a pick, and see that the older ratings and notes are still in the file.
- [x] Every screen at the window's real size, 1280 x 860 and 720 x 480, and the welcome at 760 x 600: nothing past an edge, no sideways scroll.
- [x] `docs/guide.md`, `README.md` and the pictures still describe what the app shows. The pictures were retaken.
- [ ] Run the assistant live on each provider that has only been typechecked: the Anthropic API, OpenAI and Codex. Claude Code was run live again for this release; the other three have not been.
- [ ] Send a picture to the assistant on the Anthropic API, OpenAI and Codex paths. Jev and Claude Code have been run live with a picture.
- [ ] Go through the welcome at 110% zoom. Its window grows with the zoom, so the page keeps its 760 x 600; this has not been seen at a real 110%.
- [ ] Update an installed 0.2.0 to this release. It can only be seen once the release is out.

## Release checklist

The steps in [releasing.md](releasing.md), in order.

1. [x] Every item under "Planned" is shipped or moved to "Later".
2. [ ] Every item under "Before the release" is done.
3. [x] `pnpm check` and `pnpm build` pass on `main`.
4. [x] `gh workflow run release` builds every platform.
5. [x] In the changelog, rename `## [Unreleased]` to `## [0.3.0] - <date>`, start a new `## [Unreleased]` above it, and commit.
6. [x] `pnpm version minor -m "Release %s"`, then `git push --follow-tags`.
7. [x] The release workflow publishes v0.3.0, with the changelog entry as its notes.
8. [ ] A running 0.2.0 finds the update and shows **Restart to update**.
9. [ ] Start the plan for the next version.
