# Release plan: next release

The plan for the next release: what is in it, what is still to do, and the checks before the tag. [CHANGELOG.md](../CHANGELOG.md) says what changed for people who use the app; this file tracks the work.

| | |
| --- | --- |
| Version | 0.15.0 |
| Status | Tagging 2026-11-15 |
| Previous release | [v0.14.0](https://github.com/milesroxas/skill-studio/releases/tag/v0.14.0), 2026-11-14 |
| Target date | 2026-11-15 |
| Owner | Miles Roxas |

The version follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html): a minor bump when the release adds a feature, a patch when it only fixes. Before 1.0, a change that breaks a skill or run file is a minor bump too.

## How to use this file

- One line per change. `[x]` means merged to `main`, with its commit. `[ ]` means planned.
- A change people will notice also needs its line under `## [Unreleased]` in the changelog. The release fails without one.
- A planned item that misses this release moves to "Later", with the reason.
- After the release, move "Later" into a new plan for the next version and clear the rest.

## Shipped to main

Everything merged since v0.14.0.

- [x] **Recently deleted** under the versions on the Skill screen, each delete with **Undo** for 30 days (a760a4c, 7ea8781), and **Delete version** always asks first (e2ffd14).
- [x] The editor counts how often each rule is followed and broken, draws a rule most answers break in red (b1ed892, 34616c6), and says when a rule asks for more than one answer can mark (deda5bf).
- [x] **Lift** and an opened case say how many attempts a score is over and how far they were apart (e0cf6a6).
- [x] A change in score is read over the rules and checks both runs counted (a0eef5b, 09fba4b, b311521, 2916c97).
- [x] Every attempt runs in a folder of its own, away from the skill's repository (8e135cc), and a failed, stopped or cut-off attempt counts in no average (8623ba2, 11484ad).
- [x] Grading: any file under `outputs/` is an output, the file the prompt names is graded, rules that do not come up are set aside, cut reads are flagged, Jev's answers are kept by question and asked again only when they could change, and a grading takes a lock (721492e, d251c27, 5d8e552, 0fca55c, 8442cbe, b2e2531, 0e8925d, f75f462, 012409c).
- [x] `st report`, `st compare` and `st self-test` score as Results does (43b32eb, 2916c97, 9887b15).
- [x] Hardening: the 2026-11-15 review, 44 lines fixed (ba58815 to 3f8eaa1).
- [x] Docs updated in the same commit as the change.

0.15.0 adds Recently deleted, rule counts in the editor and attempt counts on the lift, and changes what a run and its grading cache store, so it is a minor release.

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
- [ ] Once the release is out, open each `releases/latest/download/` link in [releasing.md](releasing.md#updates) and check it fetches the new file, and `latest-mac.yml` names 0.15.0.
- [ ] Update an installed 0.14.0 to this release and see **Restart to update**.
- [ ] Open Results on a stopped run, a run cut off by quitting the app and an output whose grading failed, and see the case open on its last finished answers, **Stopped** and **Not finished** on All cases, and **Grade**: these are covered by tests and have not been looked at in the app.

## Release checklist

The steps in [releasing.md](releasing.md), in order.

1. [x] Every item under "Planned" is shipped or moved to "Later".
2. [ ] Every item under "Before the release" is done. Not for 0.15.0: the unchecked items carry to the next release.
3. [x] `pnpm check` and `pnpm build` pass on `main`, 1,648 tests, and main's own run passes on Windows and macOS before the tag.
4. [ ] `gh workflow run release` builds every platform. Not run for 0.15.0; the tag's own run builds every platform.
5. [x] In the changelog, add `## [0.15.0] - 2026-11-15` under a new `## [Unreleased]`, and commit.
6. [ ] `pnpm version minor -m "Release %s"`, then push `main` and the tag.
7. [ ] The release workflow publishes v0.15.0, with the changelog entry as its notes.
