# Release plan: next release

The plan for the next release: what is in it, what is still to do, and the checks before the tag. [CHANGELOG.md](../CHANGELOG.md) says what changed for people who use the app; this file tracks the work.

| | |
| --- | --- |
| Version | 0.17.0 |
| Status | Tagging 2026-11-16 |
| Previous release | [v0.16.1](https://github.com/milesroxas/skill-studio/releases/tag/v0.16.1), 2026-11-16 |
| Target date | 2026-11-16 |
| Owner | Miles Roxas |

The version follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html): a minor bump when the release adds a feature, a patch when it only fixes. Before 1.0, a change that breaks a skill or run file is a minor bump too.

## How to use this file

- One line per change. `[x]` means merged to `main`, with its commit. `[ ]` means planned.
- A change people will notice also needs its line under `## [Unreleased]` in the changelog. The release fails without one.
- A planned item that misses this release moves to "Later", with the reason.
- After the release, move "Later" into a new plan for the next version and clear the rest.

## Shipped to main

Everything merged since v0.16.1.

- [x] The editor's rewrites: checked and written once more before they show, **Split up** for a rule that asks for several things, no word limit on a rule, spare words underlined, a red number read from the newest run (d65207c).
- [x] **Edited since v1** and **Changes** against the last version; a run keeps a version, **Save** is for a file (d65207c).
- [x] The formatted editor draws a table as a table, folds a code block's ``` lines and keeps its language as a label, and colors code in eight languages with two tokens of its own (1e6843e).
- [x] A review of everything since v0.16.1 before the tag: a rule that says "otherwise" or opens with its reason is counted again, a word a rule only names is not a spare word, and Changes no longer says nothing changed when another file did.
- [x] Docs updated in the same commit as the change.

0.17.0 adds Split up, the spare-word marks, drawn tables and colored code, so it is a minor release.

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
2. [ ] Every item under "Before the release" is done. Not for 0.17.0: the unchecked items carry to the next release.
3. [x] `pnpm check` and `pnpm build` pass on `main`, 1,722 tests, and main's own run passes on Windows and macOS before the tag.
4. [ ] `gh workflow run release` builds every platform. Not run for 0.17.0; the tag's own run builds every platform.
5. [x] In the changelog, add `## [0.17.0] - 2026-11-16` under a new `## [Unreleased]`, and commit.
6. [ ] `pnpm version minor -m "Release %s"`, then push `main` and the tag.
7. [ ] The release workflow publishes v0.17.0, with the changelog entry as its notes.
