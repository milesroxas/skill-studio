# Release plan: 0.2.0

The plan for the next release: what is in it, what is still to do, and the checks before the tag. [CHANGELOG.md](../CHANGELOG.md) says what changed for people who use the app; this file tracks the work.

| | |
| --- | --- |
| Version | 0.2.0 (proposed) |
| Status | In progress |
| Previous release | [v0.1.0](https://github.com/milesroxas/skill-studio/releases/tag/v0.1.0), 2026-11-05 |
| Target date | Not set |
| Owner | Miles Roxas |

The version is a minor bump: the changes since 0.1.0 add features, and [Semantic Versioning](https://semver.org/spec/v2.0.0.html) gives new features a minor version. Before 1.0, a change that breaks a skill or run file is a minor bump too.

## How to use this file

- One line per change. `[x]` means merged to `main`, with its commit. `[ ]` means planned.
- A change people will notice also needs its line under `## [Unreleased]` in the changelog. The release fails without one.
- A planned item that misses this release moves to "Later", with the reason.
- After the release, move "Later" into a new plan for the next version and clear the rest.

## Shipped to main

Everything merged since v0.1.0.

### Features

- [x] Results opens with the version lift: the latest version's mean, its gain since the first version, and a ribbon over the score without the skill. `515c89a`
- [x] A run counts its outputs as they are written ("3/6"), under its line at the foot of the sidebar. `515c89a`
- [x] A skill being run says so on its row in the Library. `515c89a`
- [x] Graded rules on the Editor and Scoring are numbered "01", "02" in mono. `515c89a`
- [x] Welcome setup after the tour: the skill folders, a model for the assistant and the Jev key. Each step checks what the app can already reach and can be left for later. `622ffe1`
- [x] Getting a Jev key: a TypeSafe sign-up link and "Show me" for the three steps, in the welcome and in Settings. `622ffe1`
- [x] The desktop app picks a Library folder in the system's own dialog. `622ffe1`
- [x] The Editor: Write is called Editor, a skill always opens on it, and its toolbar shows the file's size. `2baacd3`
- [x] The walkthrough: practice takes Thank-you note through the whole workflow in 12 steps, names its skill on the first screen, and can be restarted from the skill menu. `1ec4ee2`

### Redesign: the Flow brand

Each commit's message has the detail of its phase. [docs/design/](design/README.md) describes the system as it is now.

- [x] Phase 1: the Flow color tokens, and first-paint colors held to the CSS by a test. `b9b68fd`
- [x] Phase 2: the ink sidebar, in both themes. `8d9d90d`
- [x] Phase 3: components: the yellow next step, mono numbers, square chips, filled fields and pressed choices. `dc60f9d`
- [x] Phase 4: the Flow mark, the welcome's ink cover and the new app icon. `43dd765`
- [x] Phase 5: every screen checked in both themes at 1280 x 860 and 720 x 480, and every guide picture retaken. `4067090`
- [x] Phase 6: the version lift, run progress and numbered rules (the features above). `515c89a`
- [x] Highlighter yellow (`#F0F059`) and blue-black ink (`#0A1020`). Small parts have 4px corners; cards, menus, dialogs and panels are 10px on top and 12.5px below. `55cdcd5`

### Fixes

- [x] Results fits a 720px window: the "×2" beside a score folds away below 1024px. `4067090`
- [x] A failing message on Agreement colors only its heading, like the other verdicts. `4067090`
- [x] The welcome's first screen opens with no focus ring on its button. `48c0af2`
- [x] Starting the walkthrough stays on the Editor. `1ec4ee2`

### Docs and project

- [x] [PRIVACY.md](../PRIVACY.md): each time data leaves the computer, where it goes and what it carries. The README says the MIT license is the terms of use. `99a8ed7`
- [x] The Flow design system in [docs/design/](design/README.md), and [AGENTS.md](../AGENTS.md) for agents working in the repository. `5110a76`
- [x] A hardening checklist from the QA review: [docs/hardening.md](hardening.md). `7864c3f`
- [x] The guide, rewritten for people who use the app. `34380f4`

## Planned

Nothing else is planned yet. Add an item here before work on it starts.

## Later

Nothing yet.

## Before the release

Checks that are not covered by `pnpm check`.

- [ ] Run the assistant live on each provider that has only been typechecked: the Anthropic API, OpenAI and Codex. Only Claude Code has been run live.
- [ ] Send a picture to the assistant on the Anthropic API, OpenAI and Codex paths. Jev and Claude Code have been run live with a picture.
- [ ] Go through the welcome and its setup steps on a clean home (Settings, Start over), at 100% and 110% zoom.
- [ ] Check the new icon in Finder, the Dock and at 16px in a packaged build.
- [ ] Update an installed 0.1.0 to this release. It is the first update from one stable version to the next.
- [ ] `docs/guide.md`, `README.md` and the pictures still describe what the app shows.

## Release checklist

The steps in [releasing.md](releasing.md), in order.

1. [ ] Every item under "Planned" is shipped or moved to "Later".
2. [ ] Every item under "Before the release" is done.
3. [ ] `pnpm check` and `pnpm build` pass on `main`.
4. [ ] `gh workflow run release` builds every platform.
5. [ ] In the changelog, rename `## [Unreleased]` to `## [0.2.0] - <date>`, start a new `## [Unreleased]` above it, and commit.
6. [ ] `pnpm version minor -m "Release %s"`, then `git push --follow-tags`.
7. [ ] The release workflow publishes v0.2.0, with the changelog entry as its notes.
8. [ ] A running 0.1.0 finds the update and shows **Restart to update**.
9. [ ] Start the plan for the next version.
