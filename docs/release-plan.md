# Release plan: next release

The plan for the next release: what is in it, what is still to do, and the checks before the tag. [CHANGELOG.md](../CHANGELOG.md) says what changed for people who use the app; this file tracks the work.

| | |
| --- | --- |
| Version | 0.18.0 |
| Status | Tagging 2026-11-20 |
| Previous release | [v0.17.0](https://github.com/milesroxas/skill-studio/releases/tag/v0.17.0), 2026-11-16 |
| Target date | 2026-11-20 |
| Owner | Miles Roxas |

The version follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html): a minor bump when the release adds a feature, a patch when it only fixes. Before 1.0, a change that breaks a skill or run file is a minor bump too.

## How to use this file

- One line per change. `[x]` means merged to `main`, with its commit. `[ ]` means planned.
- A change people will notice also needs its line under `## [Unreleased]` in the changelog. The release fails without one.
- A planned item that misses this release moves to "Later", with the reason.
- After the release, move "Later" into a new plan for the next version and clear the rest.

## Shipped to main

Everything merged since v0.17.0.

- [x] The Assistant shows what it thought over each reply: **Thinking…** while it thinks, **Thought for 12s** once it answers, on Claude Code, Codex and an Anthropic key on Claude 5 models (550aca7).
- [x] The sidebar, the list beside a screen and the Assistant resize by their divider and fold to a 48px strip, with a shortcut each; the Assistant stays as a strip on the right when closed.
- [x] Docs and the guide's screenshots updated in the same commits as the changes.

0.18.0 adds resizable, foldable panels and the Assistant's thinking, so it is a minor release.

## Planned

Nothing is planned and not shipped. Add an item here before work on it starts.

## Later

- [ ] Bring `fallow health` to zero and add the full `fallow` run to `pnpm check`. [complexity-plan.md](complexity-plan.md) holds the phases and tracks them. It changes nothing the app does, so it does not hold a release.
- [ ] The open lines of [hardening.md](hardening.md), S2 and the rest of R3 first.
- [ ] **Edited since v3** names the newest version even after an older one was restored and edited, so Changes then shows the restore as the writer's edit. It needs the version the files were last equal to. Found in the review before 0.17.0.
- [ ] A draft in **Help me improve** still counts "earns its place" and "one skill" as missed when Jev is sure, though no rewrite can fix them. Found in the same review.

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
2. [ ] Every item under "Before the release" is done. Not for 0.18.0: the unchecked items carry to the next release.
3. [x] `pnpm check` and `pnpm build` pass on `main`, 1,743 tests, and main's own run passes on Windows and macOS before the tag.
4. [ ] `gh workflow run release` builds every platform. Not run for 0.18.0; the tag's own run builds every platform.
5. [x] In the changelog, add `## [0.18.0] - 2026-11-20` under a new `## [Unreleased]`, and commit.
6. [ ] `pnpm version minor -m "Release %s"`, then push `main` and the tag.
7. [ ] The release workflow publishes v0.18.0, with the changelog entry as its notes.
