# Complexity plan: fallow health to zero

The plan for the one `fallow` gate that fails: `fallow health`, 195 functions above its complexity thresholds at `ee7ae14` (2026-11-08). None of them is a bug. They are functions that grew with the app, plus fallow's coverage estimate. This file orders the work so each step lands on its own, keeps `pnpm check` and `pnpm build` green throughout, and changes nothing the app does. [release-plan.md](release-plan.md) tracks the release; this file tracks the refactor.

| | |
| --- | --- |
| Status | Planned |
| Baseline | 195 above threshold, 3971 functions analyzed, maintainability 89.3 |
| Gate | The full `fallow` run passes, then joins `pnpm check` |
| Owner | Miles Roxas |

## What the numbers mean

The gate has four rules, each `error` by default. A finding exists when a function or file crosses the rule's ceiling, and the rule decides whether it fails the run:

- `complexity-cyclomatic`: **cyclomatic** above 20, paths through the function.
- `complexity-cognitive`: **cognitive** above 15, nesting and interruptions a reader has to hold at once.
- `complexity-crap`: **CRAP** at or above 30, complexity squared, weighted by how untested the function is.
- `complexity-file-lines`: a whole file over `health.maxFileLines`. That ceiling is 0 (off) by default and `.fallowrc.json` sets none, so this rule reports nothing here; it is in the gate all the same.

fallow also lists functions over 60 lines (`maxUnitSize`, the summary's `max_unit_size_threshold`) as large functions. That list informs the health score and does not fail the gate.

fallow has no coverage data for this repo, so it estimates: every function in a file without a `.test.ts` beside it counts as untested, and any React component with five or more branches is reported. That is why 144 of the 195 sit in `src/renderer` components and screens that are simple to read. The other 51 are 47 in the rest of `src/` and 4 in `scripts/guide-shots/`, the script that takes the guide's pictures.

So the plan has two kinds of work. Phase 1 gives fallow real coverage and removes the estimated findings that are not real. Phases 2 to 4 split the 51 functions that are too complex by any measure.

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

Removes up to 142 findings without touching app code, the ones reported on the coverage estimate alone (114 in `src/renderer`, 25 in the rest of `src/`, 3 in `scripts/guide-shots/`), and makes every later number honest.

- [ ] Add `@vitest/coverage-v8` as a dev dependency and a `test:coverage` script that writes `coverage/coverage-final.json` (Istanbul format).
- [ ] Set `health.coverage` in `.fallowrc.json` to that file. Run `pnpm test:coverage` before `fallow health` in CI, so the gate reads real numbers.
- [ ] Re-read the list. What remains in `src/renderer` is real: components whose branching belongs in a `.ts` module with tests.
- [ ] `scripts/guide-shots/seed.ts` has one arrow function at cyclomatic 18, cognitive 17, which coverage does not clear. Split it here: nothing in the app depends on it, and it sits in no later phase.
- [ ] Use `health.ignore` only for generated files. Do not raise `maxCyclomatic`, `maxCognitive` or `maxCrap`: the defaults are the limits this plan is for.

## Phase 2: pure logic first

`domain/`, `judges/` and `infrastructure/` have tests already, so a split is checked by running them. They are also where correctness matters most, and their splits set the pattern the screens copy.

| Function | cyc | cog | Split |
| --- | ---: | ---: | --- |
| `judges/writing/score.ts scoreWriting` | 30 | 55 | One scorer per measure (shape, clarity, flags), each returning its part; `scoreWriting` only sums. |
| `domain/bradley-terry.ts bradleyTerry` | 24 | 49 | The iteration step, convergence and the pair table as three functions. |
| `domain/update.ts nextUpdateState` | 32 | 36 | A table of event kind to handler, one small function each; the reducer dispatches. |
| `infrastructure/cases.ts saveCase` | 30 | 33 | Pictures, graders and front matter each written by their own function; `saveCase` orders them. |
| `engines/cursor.ts handle`, `engines/claude.ts handle` | 26 / 24 | 33 / 29 | One function per event type, chosen by a map. `readInit` in `stream.ts` is the pattern. |
| `judges/workflow/index.ts metricsOf`, `score.ts scoreWorkflow` | 24 / 22 | 26 / 27 | One metric per function; a list of them drives the loop. |
| `judges/design/index.ts judge`, `score.ts scoreDesign` | 21 / 18 | 21 / 31 | Same shape as writing: measure, then sum. |
| `ai/claude-code.ts run`, the event callback it hands `runJsonLines` | 27 | 20 | Event parsing out of the stream loop, mirroring the engines. |
| `domain/config.ts mergeConfig`, `queue.ts reviewQueue`, `lint.ts rulesIn` | 16 / 12 / 12 | 22 / 18 / 16 | Each has one nested loop to lift into a named helper. |
| `application/ai.ts sendImprove` | 13 | 20 | The judge's reading of an answer and the step chooser as two functions. |
| `http/server.ts server`, `guard.ts refusal`, `judges/code/score.ts`, `judges/generic/score.ts`, `writing/shape.ts paragraphsOf` | ≤ 18 | 16–21 | Small: one early return or one helper each. |

- [ ] Phase 2 merged. Count after: _

## Phase 3: the CLI and the editor's live preview

Two functions carry most of the project's cognitive load. Both are in files nobody edits often, so the change is safe to make once and leave.

- [ ] `interfaces/cli/st.ts main` (cyclomatic 79, cognitive 139): nine `if (command === …)` blocks in one function. One function per command in a `commands/` folder, and a table `{ new, serve, cases, … }` that `main` looks up. Argument parsing moves to a shared helper. Behaviour and output stay identical; `st self-test` is the check.
- [ ] `renderer/editor/live-preview.ts enter` (cyclomatic 48, cognitive 63): one callback that handles every Markdown node kind. One decorator per node name (`heading`, `emphasis`, `link`, `list`, …) in a map keyed by the syntax tree's node name; `enter` looks up and calls. Add `live-preview.test.ts` on a few documents, which the folder lacks today.
- [ ] Phase 3 merged. Count after: _

## Phase 4: the shell and the screens

Highest churn in the repo (`App.tsx` 23 commits, `Library.tsx` 20, `Editor.tsx` 19, `Cases.tsx` 19), so every split here pays back on the next feature. Also the riskiest, since there are no component tests: one pull request per file, and the built app clicked through on a scratch home after each. `App.tsx` first: the hooks it gives up are the ones the screens need.

| Function | cyc | cog | Split |
| --- | ---: | ---: | --- |
| `App.tsx App` | 87 | 121 | Three hooks out of the 30 it holds: `useOpenSkill` (path, state, config, reload, drafts), `useJobs` (the polling effect), `useGuide` (home, practice steps, first-visit hints). Then `Shell` as its own component holding the frame, so `App` wires and routes only. |
| `screens/Editor.tsx Editor` | 56 | 63 | `useFileDraft` (text, stale, save, discard) and `useReferenceFiles` (naming, create, delete); the files column and the guide column as components. |
| `screens/Cases.tsx Cases` | 54 | 61 | `useCaseDraft` (base, stored, dirty, set) and the save and delete actions; the pictures column and the checks list as components. `caseKey` in `route.ts` already holds the selection rule. |
| `screens/Generate.tsx`, `Blind.tsx`, `Compare.tsx`, `Transcript.tsx`, `Library.tsx`, `Insights.tsx` | 23–42 | 41–63 | Each is one function that both loads and renders; `Generate` is the largest at 42 / 63. The queue, vote and pairing logic in Blind and Compare moves to `domain/queue.ts` and `bradley-terry.ts`, which are tested; the rest become a data hook plus a view. |
| `components/Chat.tsx ChatPanel`, `Refine.tsx`, `Setup.tsx`, `SkillSwitcher.tsx`, `Composer.tsx`, `Improve.tsx ImprovePanel`, `Assist.tsx`, `Connections.tsx KeyField`, `Update.tsx`, `MarkdownEditor.tsx` | 10–29 | 26–56 | Same pattern at smaller scale. `ChatPanel` (29 / 39) and `ImprovePanel` (20 / 27) already share `PanelFrame.tsx`; the send flow can share a `useSend` hook next. `Assist` (19 / 56) and `MarkdownEditor` (10 / 38) are cognitive findings: deep nesting, not many paths. |

- [ ] Phase 4 merged. Count after: _

## Checks after each pull request

```sh
pnpm check                  # typecheck, lint, dead code, tests
pnpm build
pnpm exec fallow health     # the count goes down, never up
pnpm exec fallow dupes      # stays at zero
```

When the full `fallow` run passes, add it to `pnpm check` so it stays that way.

## Not in this plan

- fallow's refactoring targets (split `api.ts`, `model.ts`, `library.ts` by fan-in) and its hidden-coupling notes. They are advice about file shape, not findings, and they do not fail the gate.
- Raising the thresholds.
- Any change to what the app does.
