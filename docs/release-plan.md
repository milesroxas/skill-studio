# Release plan: next release

The plan for the next release: what is in it, what is still to do, and the checks before the tag. [CHANGELOG.md](../CHANGELOG.md) says what changed for people who use the app; this file tracks the work.

| | |
| --- | --- |
| Version | 0.12.0 |
| Status | In release |
| Previous release | [v0.11.1](https://github.com/milesroxas/skill-studio/releases/tag/v0.11.1), 2026-11-13 |
| Target date | 2026-11-13 |
| Owner | Miles Roxas |

The version follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html): a minor bump when the release adds a feature, a patch when it only fixes. Before 1.0, a change that breaks a skill or run file is a minor bump too.

## How to use this file

- One line per change. `[x]` means merged to `main`, with its commit. `[ ]` means planned.
- A change people will notice also needs its line under `## [Unreleased]` in the changelog. The release fails without one.
- A planned item that misses this release moves to "Later", with the reason.
- After the release, move "Later" into a new plan for the next version and clear the rest.

## Shipped to main

Everything merged since v0.11.1.

- [x] A rule or check is marked missed only when Jev saw it broken: Not sure between `yes` and `no`, Does not apply by heading, rules asked under their heading with the skill beside them, one request for rules and checks (cc365ac).
- [x] Which rules apply is asked of the request, not of what was made (c5ab391).
- [x] A page is measured where it is drawn, and Jev reads the measures with the sums done (ca89404).
- [x] A layout or a picture goes to Jev only where a question reads it, and no page is drawn that nothing is asked about (ef30d9e).
- [x] Docs updated in the same commit as each change. [hardening.md](hardening.md) holds the Jev review, J1 to J18, and what is still open.

0.12.0 adds two outcomes to a score, a `no` key to `bench.json` and a layout file beside each drawn page, and scores of past runs move, so it is a minor release.

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
- [ ] Once the release is out, open each `releases/latest/download/` link in [releasing.md](releasing.md#updates) and check it fetches the new file, and `latest-mac.yml` names 0.12.0.
- [ ] Update an installed 0.11.1 to this release and see **Restart to update**.
- [ ] Open Results on a stopped run, a run cut off by quitting the app and an output whose grading failed, and see **Stopped**, **Not finished** and **Grade**: these are covered by tests and have not been looked at in the app.
- [x] Regrade a past run of a page skill with a Jev key and see its Rules and Checks parts appear. Done in the built app on a scratch home: both pages were drawn and measured, and Results showed Missed, Not sure, Met and Does not apply in the dark theme.

## Release checklist

The steps in [releasing.md](releasing.md), in order.

1. [x] Every item under "Planned" is shipped or moved to "Later".
2. [ ] Every item under "Before the release" is done. Not for 0.12.0: the unchecked items carry to the next release.
3. [x] `pnpm check` and `pnpm build` pass on `main`, 1,361 tests, and main's own run passes on Windows and macOS before the tag.
4. [ ] `gh workflow run release` builds every platform. Not run for 0.12.0; the tag's own run builds every platform.
5. [x] In the changelog, add `## [0.12.0] - 2026-11-13` under a new `## [Unreleased]`, and commit.
6. [ ] `pnpm version minor -m "Release %s"`, then push `main` and the tag.
7. [ ] The release workflow publishes v0.12.0, with the changelog entry as its notes.
