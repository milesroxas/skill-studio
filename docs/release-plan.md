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
- [x] A default case: picked under the cases on New run, it is ticked first on every new run, the Cases list names it, and `bench.json` keeps it as `defaultCase`. `d250195`
- [x] Select four or more words in SKILL.md for Auto refine, Suggest changes and Help me improve. The lint checks the selection, Jev reads it for the six principles, and a model writes prose only when something drifts. `180f9b8`
- [x] The Assistant takes commands: `/` opens a menu of its own (clear, settings, guide) and of every skill the Claude Code CLI can invoke, with Tab for the top match. The send button is Stop while a reply is written. `534ca22`
- [x] The Assistant proposes changes to the open skill (SKILL.md, a reference file, a case, a version to save first), each a row with one button under its reply and Undo in the status line. It reads the skill as the writer has it, unsaved edits and drafts included. `959667f`
- [x] New run leads with the version under test in large type, Write with is a row of three choices, the model is a ComboBox, and a summary bar states the run's size with Start a run at its end. `bc1a73f`
- [x] New skill asks for the name first. An empty SKILL.md offers to write the first rule, take a template's rules or draft rules with AI; Graded rules and Version appear once there is something to show. `e114ec4`
- [x] A check's picture button sits in the statement's corner and the picture inside the field. The Assistant's case block takes a check as a string or `{statement, weight}` and reads the weights a case has. `64e629b`
- [x] Rules read as rules in the Editor: each graded bullet shows its number in place of its bullet, the number turns amber when the writing checks find something, and a click on it selects the rule. `02be818`
- [x] The writing checks' findings list in the selection popout over its three actions, not inside the document. `b72c441`
- [x] A check counts once or double: one ×2 mark per row in place of a 1 to 5 weight, Scoring's "Points per layer", and a Cases screen that names the packs that mark checks when the skill's judges read none. `ee7ae14`

### Redesign: the Flow brand

Each commit's message has the detail of its phase. [docs/design/](design/README.md) describes the system as it is now.

- [x] Phase 1: the Flow color tokens, and first-paint colors held to the CSS by a test. `b9b68fd`
- [x] Phase 2: the ink sidebar, in both themes. `8d9d90d`
- [x] Phase 3: components: the yellow next step, mono numbers, square chips, filled fields and pressed choices. `dc60f9d`
- [x] Phase 4: the Flow mark, the welcome's ink cover and the new app icon. `43dd765`
- [x] Phase 5: every screen checked in both themes at 1280 x 860 and 720 x 480, and every guide picture retaken. `4067090`
- [x] Phase 6: the version lift, run progress and numbered rules (the features above). `515c89a`
- [x] Highlighter yellow (`#F0F059`) and blue-black ink (`#0A1020`). Small parts have 4px corners. `55cdcd5`
- [x] Chin corners: cards, menus, dialogs and panels are 10px on top and 12.5px below, held in the two `--radius-chin` tokens. `a11b794`
- [x] Every button that awaits something is busy until it lands, saying what it does at the same width; a button that starts a job stays busy until the job ends. An icon trims 2px on its own side only. `7d37e6b`
- [x] The status line: what just happened reads in a 48px strip at the foot of the window, with Undo as a button in it, and nothing floats over the work. `ctx.report` feeds it. `77f7bbc`
- [x] Focus: one 2px line clear of the control, from the keyboard only; a text field's edge turns ink on any focus. Four utilities in `styles.css` carry it. `5c0c860`
- [x] Green, amber and red are as light as 4.9:1 allows and equally vivid. A line diff colors only its + or - and mutes unchanged lines; a word diff underlines an added word and strikes through a removed one. `f899f12`

### Fixes

- [x] Results fits a 720px window: the "×2" beside a score folds away below 1024px. `4067090`
- [x] A failing message on Agreement colors only its heading, like the other verdicts. `4067090`
- [x] The welcome's first screen opens with no focus ring on its button. `48c0af2`
- [x] Starting the walkthrough stays on the Editor. `1ec4ee2`
- [x] The window opens when its bounds file is damaged, instead of failing. `959667f`
- [x] A check's weight is held to 1 to 5 wherever it enters (the Assistant, the API, a grader file written by hand), from one `checkWeight`. A file saying 10 scored at 10 while the form showed 5. `5511850`

### Docs and project

- [x] [PRIVACY.md](../PRIVACY.md): each time data leaves the computer, where it goes and what it carries. The README says the MIT license is the terms of use. `99a8ed7`
- [x] The Flow design system in [docs/design/](design/README.md), and [AGENTS.md](../AGENTS.md) for agents working in the repository. `5110a76`
- [x] A hardening checklist from the QA review: [docs/hardening.md](hardening.md). `7864c3f`
- [x] The guide, rewritten for people who use the app. `34380f4`
- [x] `pnpm dev` opens a window in every worktree: a development copy keeps its data under `Skill Studio Dev/<checkout>`, Electron's binary is fetched on install, and `pnpm bootstrap` sets up a fresh checkout. `ef69328`
- [x] [docs/complexity-plan.md](complexity-plan.md): four phases that bring `fallow health` to zero. `138efcf`

## Planned

- [ ] Bring `fallow health` to zero and add the full `fallow` run to `pnpm check`. [complexity-plan.md](complexity-plan.md) holds the phases and tracks them; it changes nothing the app does, so it needs no changelog line.

Add an item here before work on it starts.

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
