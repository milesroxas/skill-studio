# Complexity plan: fallow health to zero

The plan for the one `fallow` gate that fails: `fallow health`, 199 functions above its complexity thresholds at `000e95c` (2026-11-09). None of them is a bug. They are functions that grew with the app, plus fallow's coverage estimate. This file orders the work so each step lands on its own, keeps `pnpm check` and `pnpm build` green throughout, and changes nothing the app does. [release-plan.md](release-plan.md) tracks the release; this file tracks the refactor.

| | |
| --- | --- |
| Status | Phase 1 done; phases 2 to 4 planned |
| Baseline | 239 above threshold with real coverage at `f53950b`, the commit before the 2026-11-09 audit (199 under fallow's estimate at `000e95c`) |
| Now | 229 above threshold with real coverage (2026-11-10): 164 in `src/renderer`, 60 in the rest of `src/`, 5 in `scripts/guide-shots/` |
| Duplication | `pnpm exec fallow dupes` reports "No code duplication found" |
| Gate | The full `fallow` run passes, then joins `pnpm check` |
| Owner | Miles Roxas |

## What the numbers mean

The gate has four rules, each `error` by default. A finding exists when a function or file crosses the rule's ceiling, and the rule decides whether it fails the run:

- `complexity-cyclomatic`: **cyclomatic** above 20, paths through the function.
- `complexity-cognitive`: **cognitive** above 15, nesting and interruptions a reader has to hold at once.
- `complexity-crap`: **CRAP** at or above 30, complexity squared, weighted by how untested the function is.
- `complexity-file-lines`: a whole file over `health.maxFileLines`. That ceiling is 0 (off) by default and `.fallowrc.json` sets none, so this rule reports nothing here; it is in the gate all the same.

fallow also lists functions over 60 lines (`maxUnitSize`, the summary's `max_unit_size_threshold`) as large functions. That list informs the health score and does not fail the gate.

`pnpm health` runs the tests with coverage (`pnpm test:coverage`, which writes `coverage/coverage-final.json`) and then `fallow health`, which reads that file (`health.coverage` in `.fallowrc.json`). A function the tests run is scored on its real coverage. A function the tests never run counts as untested, so any function with cyclomatic 5 or more there reaches CRAP 30: that is most React components, the Electron main process and the assistant's provider adapters, none of which have tests. `scripts/` is outside the test run, so fallow estimates it. Run `pnpm exec fallow health` alone only right after `pnpm test:coverage`: it reads whatever coverage file is on disk.

The counts in the phases below, and each function's cyclomatic and cognitive numbers, are from fallow's estimate at `000e95c`. Read the current ones from `pnpm health` before starting a phase.

So the plan has two kinds of work. Phase 1 gave fallow real coverage, so the count measures the code and the tests as they are. Phases 2 to 4 split the functions that are too complex by any measure; a test added for a function lowers its CRAP as well.

## Rules for every phase

- One pull request per phase, or per file within a phase. Each must leave `pnpm check`, `pnpm build` and `pnpm exec fallow dupes` green, and `pnpm exec fallow health` lower than before.
- Splitting relocates branching; it does not remove it. A split counts only when each piece has one job and a name a reader would look for.
- Pure logic moves to a tested module: `domain/`, or a sibling `.ts` beside the component. `src/renderer/changes.ts`, the tested logic beside `components/Change.tsx`, is the pattern.
- No call-site styling, no new variants, no behaviour change. A phase that needs one is a feature and goes in its own change with a `CHANGELOG.md` entry.
- The docs in `docs/` stay true in the same change.

## How to use this file

- `[ ]` is planned, `[x]` is merged to `main` with its commit.
- After each merge, write the new `fallow health` count beside the phase.

## Phase 1: real coverage for fallow

Makes every later number honest without touching app code. It did not lower the count: the estimate had taken tested files as covered throughout, and real coverage shows the functions in them the tests never reach. At `f53950b` the count with coverage is 239, against 199 estimated.

- [x] `@vitest/coverage-v8` is a dev dependency, and `pnpm test:coverage` writes `coverage/coverage-final.json` (Istanbul format).
- [x] `health.coverage` in `.fallowrc.json` points at that file, and `pnpm health` runs the two in order. CI runs it once the gate joins `pnpm check`.
- [x] Re-read the list. What remains in `src/renderer` is real: components whose branching belongs in a `.ts` module with tests.
- [x] `scripts/guide-shots/seed.ts`: the arrow at cyclomatic 18, cognitive 17 is split into `eventsOf` and `packsOf`, and the seed writes the same runs. `packsOf` stays a CRAP finding on the estimate, since `scripts/` has no tests.

Use `health.ignore` only for generated files. Do not raise `maxCyclomatic`, `maxCognitive` or `maxCrap`: the defaults are the limits this plan is for.

## Phase 2: pure logic first

`domain/`, `judges/` and `infrastructure/` have tests already, so a split is checked by running them. They are also where correctness matters most, and their splits set the pattern the screens copy.

| Function | cyc | cog | Split |
| --- | ---: | ---: | --- |
| `judges/writing/score.ts scoreWriting` | 30 | 55 | One scorer per measure (shape, clarity, flags), each returning its part; `scoreWriting` only sums. |
| `domain/update.ts nextUpdateState` | 32 | 36 | A table of event kind to handler, one small function each; the reducer dispatches. |
| `infrastructure/cases.ts saveCase` | 35 | 40 | Pictures, graders and front matter each written by their own function; `saveCase` orders them. |
| `engines/cursor.ts handle`, `engines/claude.ts handle` | 26 / 24 | 33 / 29 | One function per event type, chosen by a map. `readInit` in `stream.ts` is the pattern. |
| `judges/workflow/index.ts metricsOf`, `score.ts scoreWorkflow` | 24 / 24 | 26 / 31 | One metric per function; a list of them drives the loop. |
| `judges/design/index.ts judge`, `score.ts scoreDesign` | 21 / 14 | 21 / 21 | Same shape as writing: measure, then sum. |
| `ai/claude-code.ts run`, the event callback it hands `runJsonLines` | 27 | 20 | Event parsing out of the stream loop, mirroring the engines. |
| `domain/config.ts mergeConfig` | 17 | 22 | One nested loop to lift into a named helper. |
| `application/ai.ts sendImprove` | 13 | 20 | The judge's reading of an answer and the step chooser as two functions. |
| `http/server.ts server`, `guard.ts refusal`, `ai/anthropic.ts run`, a callback in `infrastructure/cases.ts`, `writing/shape.ts paragraphsOf` | ≤ 19 | 16–22 | Small: one early return or one helper each. |

- [ ] Phase 2 merged. Count after: _

## Phase 3: the CLI and the editor's live preview

Two functions carry most of the project's cognitive load. Both are in files nobody edits often, so the change is safe to make once and leave.

- [ ] `interfaces/cli/st.ts main` (cyclomatic 79, cognitive 139): nine `if (command === …)` blocks in one function. One function per command in a `commands/` folder, and a table `{ new, serve, cases, … }` that `main` looks up. Argument parsing moves to a shared helper. Behaviour and output stay identical; `st self-test` is the check.
- [ ] `renderer/editor/live-preview.ts enter` (cyclomatic 48, cognitive 63): one callback that handles every Markdown node kind. One decorator per node name (`heading`, `emphasis`, `link`, `list`, …) in a map keyed by the syntax tree's node name; `enter` looks up and calls. Add `live-preview.test.ts` on a few documents, which the folder lacks today.
- [ ] Phase 3 merged. Count after: _

## Phase 4: the shell and the screens

Highest churn in the repo (`App.tsx` 26 commits, `Editor.tsx` 22, `Library.tsx` 21, `Cases.tsx` 20), so every split here pays back on the next feature. Also the riskiest, since there are no component tests: one pull request per file, and the built app clicked through on a scratch home after each. `App.tsx` first: the hooks it gives up are the ones the screens need.

| Function | cyc | cog | Split |
| --- | ---: | ---: | --- |
| `App.tsx App` | 92 | 132 | Three hooks out of the 37 it holds: `useOpenSkill` (path, state, config, reload, drafts), `useJobs` (the polling effect), `useGuide` (home, practice steps, first-visit hints). Then `Shell` as its own component holding the frame, so `App` wires and routes only. |
| `screens/Editor.tsx Editor` | 64 | 85 | `useFileDraft` (text, stale, save, discard) and `useReferenceFiles` (naming, create, delete); the files column and the guide column as components. |
| `screens/Cases.tsx Cases` | 42 | 49 | `useCaseDraft` (base, stored, dirty, set) and the save and delete actions; the pictures column and the checks list as components. `caseKey` in `route.ts` already holds the selection rule. |
| `components/Run.tsx RunButton`, `Comparison.tsx Comparison`, `VersionDetail.tsx`, `screens/Library.tsx` (`LibraryScreen`, `NewSkill`), `screens/Results.tsx` | 17–54 | 20–65 | Each is one function that both loads and renders; `RunButton` is the largest at 54 / 65. Each becomes a data hook plus a view. |
| `components/Chat.tsx ChatPanel`, `Refine.tsx RefineBody`, `Setup.tsx`, `SkillSwitcher.tsx`, `Composer.tsx`, `Improve.tsx ImprovePanel`, `Assist.tsx`, `Connections.tsx KeyField`, `Update.tsx UpdateControl`, `MarkdownEditor.tsx`, `Rewrites.tsx`, and eleven at cognitive 16 to 20: `Comparison.tsx Side`, `TranscriptList.tsx`, `TextArea.tsx`, `Verdicts.tsx Row`, `SelectionTools.tsx`, `Jobs.tsx`, `ComboBox.tsx`, `Composer.tsx useCommandMenu`, `drafts.ts useDrafts`, `screens/Welcome.tsx`, `screens/Settings.tsx` | 1–32 | 16–60 | Same pattern at smaller scale. `ChatPanel` (32 / 42) and `ImprovePanel` (20 / 27) already share `PanelFrame.tsx`; the send flow can share a `useSend` hook next. `Assist` (20 / 60) and `MarkdownEditor` (11 / 40) are cognitive findings: deep nesting, not many paths. |

- [ ] Phase 4 merged. Count after: _

## Checks after each pull request

```sh
pnpm check                  # typecheck, lint, dead code, tests
pnpm build
pnpm health                 # tests with coverage, then fallow health: the count goes down, never up
pnpm exec fallow dupes      # reports no duplication: it stays that way
```

When the full `fallow` run passes, add it to `pnpm check` so it stays that way.

## Not in this plan

- fallow's refactoring targets (split `api.ts`, `model.ts`, `library.ts` by fan-in) and its hidden-coupling notes. They are advice about file shape, not findings, and they do not fail the gate.
- Raising the thresholds.
- Any change to what the app does.
