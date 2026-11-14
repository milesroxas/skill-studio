# Release plan: next release

The plan for the next release: what is in it, what is still to do, and the checks before the tag. [CHANGELOG.md](../CHANGELOG.md) says what changed for people who use the app; this file tracks the work.

| | |
| --- | --- |
| Version | 0.13.2 |
| Status | Released 2026-11-14 |
| Previous release | [v0.13.1](https://github.com/milesroxas/skill-studio/releases/tag/v0.13.1), 2026-11-13 |
| Target date | 2026-11-14 |
| Owner | Miles Roxas |

The version follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html): a minor bump when the release adds a feature, a patch when it only fixes. Before 1.0, a change that breaks a skill or run file is a minor bump too.

## How to use this file

- One line per change. `[x]` means merged to `main`, with its commit. `[ ]` means planned.
- A change people will notice also needs its line under `## [Unreleased]` in the changelog. The release fails without one.
- A planned item that misses this release moves to "Later", with the reason.
- After the release, move "Later" into a new plan for the next version and clear the rest.

## Shipped to main

Everything merged since v0.13.1.

- [x] A case shows its cost to run as it is written, and on a wide window Cases shows the last answer to a case beside its form (0b9c0ed). The weight's points are set against the cost of 27 recorded attempts.
- [x] Docs updated in the same commit as the change.

0.13.2 adds to the Cases screen and changes no skill or run file. It is released as a patch at the owner's call.

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
- [x] Once the release is out, open each `releases/latest/download/` link in [releasing.md](releasing.md#updates) and check it fetches the new file, and `latest-mac.yml` names 0.13.2.
- [ ] Update an installed 0.13.1 to this release and see **Restart to update**.
- [ ] Open Results on a stopped run, a run cut off by quitting the app and an output whose grading failed, and see **Stopped**, **Not finished** and **Grade**: these are covered by tests and have not been looked at in the app.
- [x] Open Cases in the built app and see the cost to run. Done on a scratch home through `pnpm guide:shots`: the meter drew under the production CSP. Each layout was looked at in the dev app at 2400, 1700, 1440, 1280 and 720 px wide, light and dark, on a heavy case and a new one.

## Release checklist

The steps in [releasing.md](releasing.md), in order.

1. [x] Every item under "Planned" is shipped or moved to "Later".
2. [ ] Every item under "Before the release" is done. Not for 0.13.2: the unchecked items carry to the next release.
3. [x] `pnpm check` and `pnpm build` pass on `main`, 1,387 tests, and main's own run passes on Windows and macOS before the tag.
4. [ ] `gh workflow run release` builds every platform. Not run for 0.13.2; the tag's own run builds every platform.
5. [x] In the changelog, add `## [0.13.2] - 2026-11-14` under a new `## [Unreleased]`, and commit.
6. [x] `pnpm version patch -m "Release %s"`, then push `main` and the tag.
7. [x] The release workflow publishes v0.13.2, with the changelog entry as its notes.
