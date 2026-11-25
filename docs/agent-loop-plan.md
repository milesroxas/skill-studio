# Agent loop plan: write, run and compare skills from a chat

The plan for letting a coding agent (Claude Code, in T3 Code or a terminal) do the whole Skill Studio loop through `st`, then hand the result to a person on the right screen. It also moves work that a large model does today to plain code or to Jev wherever either can do it as well, so the loop costs less and finishes sooner. [release-plan.md](release-plan.md) tracks releases; this file tracks this work.

| | |
| --- | --- |
| Status | Planned (2026-11-25), decisions made, every item checked against the code at `61db117`, nothing started |
| Base | `main` at `7d83dc3`, Skill Studio 0.20.2 |
| Acceptance test | The React card experiment in [Phase 4](#phase-4-the-acceptance-run) runs from a chat, end to end |
| Owner | Miles Roxas |

## Why

The first real use is an experiment like this one: write a skill for a modern React card component twice, once by an agent that loaded `emil-writing-skills` and once by one that did not, run both on the same cases, and say which is better. `st` can already do most of it. What it costs today, and where it falls short:

- **The agent reads too much.** It reads [cli.md](cli.md) and [files.md](files.md) each session, several thousand tokens, and then every output's HTML (a few thousand tokens each, 18 to 27 outputs for that experiment).
- **The command line draws no page.** `st run`, `st grade` and `st serve` grade a page without drawing it (`drawn: false`, [grading.md](grading.md#answers-and-scores)), so a design skill graded from a chat gets no pictures, no measured layout and no `renders/`. The desktop app draws with `pageRenderer` in `src/interfaces/electron/main/render.ts`.
- **No command writes a case.** The agent writes `prompt.md`, `case.yaml` and grader files by hand, and a slip costs a failed run.
- **Two versions run one after the other.** Comparing two drafts means run, overwrite `SKILL.md`, run again.
- **Nothing hands the result to a person.** Results already opens on a pair from its address (`#/results?case=&a=&b=`, where `a` and `b` each name an output as `<run>/<sample>`), but no command prints that address.
- **Claude is asked what code or Jev knows.** The call map below lists each place.

What each kind of work costs, from the docs and the TypeSafe reference (read 2026-11-25):

| Work | Cost |
| --- | --- |
| `st propose`, 6 cases, one message | about 119,000 input tokens, 39 s |
| `st propose --deep`, same cases | about 1.2 million input tokens, 6.5 min |
| `st read`, 6 cases | about 62,000 input tokens, 33 s |
| `st sort`, one version of `launch-note` | about 200,000 to 220,000 input and 14,000 output tokens, about a minute |
| A Jev request | about 100 ms; 13 questions in one request were 12x cheaper and faster than 13 requests |
| Jev price | $0.042 per million input tokens, output free; 64k tokens per request, 32k per question |

So Jev is cheap enough that cost is not the reason to tune it; speed is. Every Claude call it or code replaces saves real usage. A Claude call costs mostly what it is sent, so a change that only shortens its reply saves little.

## Where a large model is called today

Grading uses only Jev and code. A large model is called in eleven places, and each is listed here with what can move. "Stays" means the work is writing, which Jev does not do. Code is named by function, not by line: lines move as items land.

| Where | What it writes | What can move |
| --- | --- | --- |
| `st run` (`generateRun` in `src/application/generate.ts`) | The output under test | Stays: it is what is tested |
| `st sort`, rules (`sortCall` in `src/application/sorting.ts`) | A reading per rule: exact tests, judged with a join, or not markable with a fix | Code can find conflicts between exact readings; the rest stays ([not in this plan](#not-in-this-plan)) |
| `st sort`, checks | A reading per check, and rules it cannot hold beside | Code can work out sizes ("Work the sizes out" in `SORT_BRIEF`, `src/domain/sorting.ts`) where both readings are exact |
| `st propose`, Write checks with AI (`proposeChecks` in `src/application/proposing.ts`) | Up to six checks a case, with quotes and which answers meet each | Jev answers `meets` (it is the grading question); code finds quotes; check wording stays |
| `st read` (`readingOfRun` in `src/application/reading.ts`) | Met, missed or cannot tell for what Jev left, with quotes | Jev on a narrower state first, Claude only for what is still open; code finds quotes |
| Fix with AI (`startFix` in `src/application/ai.ts`) | Why, and a revised answer | Send the verdict and code's evidence (`saw` on an exact answer, `src/domain/exact.ts`) instead of asking it to find the fault; check the revision after |
| Auto refine (`startRefine`) | A revised rule | Stays; already gated by lint and Jev |
| Suggest changes (`startRewrites`) | Three rewrites | Stays ([not in this plan](#not-in-this-plan)) |
| Help me improve (`improveReply`) | A question, or a draft | Send the step's question as written: no model call for it |
| Chat change blocks (`sendChatNow`) | Prose and whole files | Edits as search and replace, applied by code |
| Write with AI (`startAssist`) | A field's text | Code counts the 50-word description and drops checks a case has already |

Facts code can answer that only Jev answers today. Jev is still asked each ([decision 1](#decisions)); the items below make code's answer the one that stands:

- The design pack's phone question covers a page that scrolls sideways, which the measured layout says (`page` wider than `window` in `MEASURE_PAGE`, `src/interfaces/electron/main/measure.ts`).
- The workflow pack's "changed course after an error" is partly in `metricsOf` (`src/judges/workflow/index.ts`).

Speed: proposal questions go to Jev 40 at a time, one request after another (`Asking.ask` in `proposing.ts`), and joining proposals across cases asks every pair (`joinEveryCase`). The rule judge keeps no answer beyond its last rule (`assessed` in `ai.ts`).

## Rules for every change

- **One item, one commit, one test.** Each item below names the test that proves it. It fails before the change and passes after. An item with no test that fits is split until it has one.
- **Check once.** While working, run only the item's own test file (`pnpm vitest run <file>`). Run `pnpm check` and `pnpm build` once, before the commit; both pass on every commit. A change under `src/renderer` follows [design/README.md](design/README.md) and [design/copy.md](design/copy.md).
- **Read little.** Read the item, these rules and the files the item names. Search a doc for the section you need; do not read [cli.md](cli.md), [grading.md](grading.md) or [files.md](files.md) whole.
- The docs that describe the change change with it: [cli.md](cli.md), [architecture.md](architecture.md), [grading.md](grading.md) or [files.md](files.md). Each user-visible change gets a line in `CHANGELOG.md`.
- A prompt that changes bumps its version (`SORT_PROMPT_VERSION`, `PROPOSE_PROMPT_VERSION` and the others), so no stored reading made under the old words is reused. A bump makes every user's stored readings be asked for again, so change a prompt only where the item says to.
- A pack question keeps its words unless the item says otherwise: new words void every stored total graded on the old ones ([when a total does not stand](grading.md#when-a-total-does-not-stand)).
- **Never run a command on a fixture in place.** Copy it to a scratch folder first: the stored runs and readings under `fixtures/` are what the tests are pinned to.
- **A move from Claude to Jev or code is measured, once.** Item 0.3 records each operation's tokens, seconds and agreement with the answer key on a copy of `fixtures/launch-note` ([reading bench](../scripts/reading-bench/README.md)), and keeps Claude's replies. An item that sends Claude the same words is measured by replaying those replies, which uses no Claude. An item that changes what Claude is sent runs live once, on the one operation it touches. Agreement with the key may not drop. A gate that fails means tuning the state, the question or the threshold, not giving up the item. Thresholds are read off this data, never copied from a cookbook.
- **Nothing to save, nothing to build.** Where the baseline shows an item would save nothing, close it with the number that shows it.
- Every number in this file is replaced by the measured one when its item lands.
- In the app, the assistant still runs only on a press or a visible setting. A cascade runs inside the action that was pressed.
- An agent that finds its item needs a decision this file does not settle stops and asks. It does not guess.

## How to build it

One fresh agent builds one item. Its brief is the item's text, the test it names and the rules above, so it starts with little to read. It reports the commit, the test and the measured numbers.

Items that touch the same files are a chain, built one after another on one branch. Chains touch different files, so they can run at once, each in its own worktree. Running them at once saves time, not usage: on one branch, one after another, costs the same and needs no merge. The lead agent merges each chain, runs `pnpm check` and `pnpm build` on the merge, and writes nothing else.

| Order | Items, in this order | Files they share |
| --- | --- | --- |
| First, alone | 0.1, 0.2, 0.3 | They set up the rest |
| Chain A | 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.1 | `src/interfaces/cli/`, the drawing host |
| Chain B | 2.1, 2.2, 3.4, 3.3, 3.1 | `proposing.ts`, `domain/proposal.ts`, `domain/reading.ts`, `reading.ts` |
| Chain C | 2.3 | `sorting.ts`, `domain/sorting.ts` |
| Chain D | 2.4, 2.5, then 3.6 once 1.6 is merged | `src/judges/` |
| Chain E | 2.6, 2.8, 2.10, 2.9, 3.5 | `ai.ts`, `domain/improve.ts`, `domain/fix.ts`, `domain/changes.ts` |
| Last, alone | 4.1, 4.2 | |

A worktree needs `pnpm install` before its first command, and chain A needs the Electron binary that install fetches.

## Phase 0: ground to build on

- [ ] **0.1 Split `st.ts` into a module per command.** `src/interfaces/cli/st.ts` is 1,049 lines and runs a command the moment it is loaded, so nothing in it is tested. Move each command to `src/interfaces/cli/commands/<name>.ts`, which exports its name, its help lines, its flags and its `run`. `st.ts` keeps only the start: read the flags, pick the command, exit with its code. The help text is put together from the modules and can be imported without running anything. A flag two commands share (`--model`, `--cases`, `--run`, `--name`, `--json`) is declared once. No behaviour changes. Test: before the split, save what `pnpm st --help` prints; a new test holds the help to it byte for byte, and the tests there are pass.
- [ ] **0.2 A cost meter for every model call, and saved replies.** One record per call (operation, model, input and output tokens, seconds, cached or asked), summed at the end of a command and written with `--json`. `st read`, `st propose` and `st sort` count some of this already (`spent`); make it one shape for Claude and Jev, taken where every call passes: `aiProvider` in `src/infrastructure/ai/index.ts` and `Jev` in `src/judges/jev.ts`. At the same place, `ST_AI_RECORD=<dir>` writes each one-message reply to a file named by a hash of the model and everything sent, and `ST_AI_REPLAY=<dir>` answers from those files and stops with the call's name when one is missing. A `--deep` session is not recorded. Test: a unit test with a fake provider and a fake Jev for the totals; and a recorded call replayed against a provider that throws gives the same reply.
- [ ] **0.3 The baseline.** On a scratch copy of `fixtures/launch-note`, with `ST_AI_RECORD` on, run `st sort` on both versions as the [reading bench](../scripts/reading-bench/README.md#counting-what-st-sort-read) says, `st propose`, and `st read --answers key.json` on the two runs the bench names, blind and not. Write each one's tokens, seconds, Jev questions, replies refused once and twice, and agreement with the key in a table here. Commit the replies under `scripts/reading-bench/replies/`. This is the one time the plan pays for these operations whole: about 700,000 input tokens. It needs a signed-in Claude Code and `TYPESAFE_API_KEY`; a worktree has no `.env`, so stop and ask where either is missing. Test: with `ST_AI_REPLAY` on that folder, the same three commands give the same counts and ask Claude nothing.

## Phase 1: the agent's surface

- [ ] **1.2 `st case add` and `st case check`.** `add` writes a case from flags (`--title`, `--prompt` or `--prompt-file`, `--check` once for each check, `--file` once for each file to copy into the case, `--artifact html|image`, `--size WxH`) through the same check the Cases screen's save goes through, as `generateInputOf` does for a run. Each check gets weight 1, as an accepted proposal does. `check` reads every case and grader file of one skill and lists what will not load or will be skipped (missing front matter, a bad id, a weight out of range, a title used twice), exiting 1 when it finds any. Test: unit tests over a scratch skill, and `st case check` passes on each of the four skills under `fixtures/`.
- [ ] **1.3 Run a draft without swapping files.** `st run --from <dir>` runs the skill files in that folder as the version, under the skill's own cases and `bench.json`, and keeps that version as any run keeps one. So two drafts run at once, each named.
  - The folder holds a `SKILL.md` and is outside the skill's folder. One inside it is refused: the skill's own files would be kept as part of each version.
  - The folder's files are held against the skill's versions as the working tree is (`skillVersions` in `src/infrastructure/skill.ts`). The same files as a kept version are that version. New files take the next number and need `--name`, as a changed tree does.
  - Two runs started together must not take one number. `stampSkill` to the write of `run.json` in `generateRun` happen under a lock file in `evals/runs/`, made as `takeGradingLock` makes its own (`src/infrastructure/grading-lock.ts`).
  - `--from` is for `with_skill` only, and is refused with any other `--configuration`.
  - Test: a run with `--from` keeps the folder's files in `_skill/` and its version, and the working tree's `SKILL.md` is untouched; two stamps taken together get two numbers.
- [ ] **1.4 The Results address.** One function in `src/domain/` builds `?skill=<path>#/results?case=&a=&b=`. `a` and `b` are outputs, each `<run>/<sample>`: given a run, it names that run's first attempt at the case, and with no case named, the first case both runs answered. `st run` and `st compare` have no server to give an address for, so each prints the command that opens it: `Open: pnpm st open <skill> --a <run> [--b <run>]`. Move the lines of `Results.tsx` that read `case`, `a` and `b` into a function beside `outputByKey` (`src/renderer/model.ts`), unchanged. Test: an address the function builds, read back by `placeOf` and that function, names the same case and the same two outputs.
- [ ] **1.5 `st open`.** `st open <skill> [--case id] [--a run] [--b run]` prints the address from 1.4 on a running server, with its token. The agent opens it in T3 Code's preview panel; a person opens it anywhere.
  - With no server of this checkout running, it starts one as a detached copy of itself (`process.execPath`, `process.execArgv`, `process.argv[1]`, `serve`) on a free port the system picks, and waits up to 10 seconds for it.
  - That server writes its process id, port and token to one file in Skill Studio's own folder in the user's home (where `src/infrastructure/preferences.ts` keeps its file), never in the checkout, readable by the user alone (`0600`). It removes the file when it stops. A file whose process is gone is removed and a new server started.
  - A server started this way stops itself after 60 minutes with no request. `st open --stop` stops it now.
  - Where the app is not built, it says `Run pnpm build first.` and exits 2.
  - [SECURITY.md](../SECURITY.md#the-web-server) says the token is now also in that file, and who can read it.
  - Test: two calls start one server and the second prints the same origin; `--stop` ends it and removes the file; the file's mode is `0600` (skipped on Windows).
- [ ] **1.6 Short output.** `--brief` on `report`, `compare` and `run` prints, for each case, the version that did better and the words of each rule or check an output missed, nothing else. `run --quiet` prints one line per finished attempt. Test: output tests on the stored runs under `fixtures/`, and a size test that fails when `--brief` prints more than 200 bytes a case beyond the words of what was missed.
- [ ] **1.7 Draw pages from the command line.** `st run`, `st grade` and `st serve` draw a page as the desktop app does: they start Electron with no window as a drawing host ([decision 2](#decisions)), so the grading says `drawn: true` and writes `renders/`, the same pictures and measures the desktop app makes.
  - **The host** is a new start file, `src/interfaces/electron/draw/index.ts`, built by `pnpm build` to `out/main/draw.js` (a second input beside the app's in `electron.vite.config.ts`; `out/main/index.js` keeps its name). It registers the `artifact:` scheme before `ready`, serves it with `serveArtifacts` (`protocol.ts`) over its own `createOperations`, and draws with `pageRenderer()` unchanged. It takes a temporary profile folder of its own, no single-instance lock and no keychain, hides its Dock icon, and stops when its input closes. It reads one JSON line for each page (`id`, `page`, `width`, `height`) and writes one back (`id`, then `png` as base64 and `layout`, or `error`). A line it cannot read as JSON is passed over.
  - **The command's side** is `src/interfaces/cli/drawing.ts`: a `PageRenderer` that starts the host at the first page asked for, finding Electron as `launch` does in `scripts/guide-shots/index.ts`, keeps it for the command's life, and is ended by the command's lifecycle (`src/interfaces/lifecycle.ts`) as agents are. It is passed as `render` to `gradeRun`, and through `startServer` to `createOperations`.
  - A grading draws only when Jev grades, as in the app, so `--no-jev` never starts the host. `--no-draw` grades as before this item; `pnpm reading-gate` passes it, so its pinned numbers stand.
  - Where the host cannot start, the command says why once (`Run pnpm build to draw pages.`, Electron not installed, no display) and grades undrawn.
  - Test, in `pnpm check`: the command's side against a stand-in host, a plain script that speaks the same lines: one start for many pages, replies matched by `id`, and a host that fails grades undrawn with the reason. Test, as `pnpm test:draw`: build, start the real host, draw the stored page of a scratch copy of `fixtures/design-skill`, and hold the PNG to the size asked and the layout to at least one element. CI runs `pnpm test:draw` in one new job on Linux under `xvfb-run`, with the Electron binary fetched (the other jobs skip it).
- [ ] **1.8 A contact sheet.** After 1.7, `st sheet <skill> --run A --run B [--case id] [--out <dir>]` puts each case's drawn pages side by side, labelled by run and attempt, in one PNG at most 1568 pixels a side, and prints each file's path. The agent looks at one picture a case instead of reading each page, and a person can look at it in the chat.
  - It reads the desktop-size pictures already in each sample's `renders/`. An output with none is left out, with a line that says to grade its run first.
  - It writes a small page and copies of those pictures to a temporary folder, and the host draws that page from its `file:` address: a second kind of line the host takes (`id`, `file`, `width`, `height`). Labels are written as text, never as markup.
  - One row a run, one column an attempt, 12 panels at most. Attempts that do not fit are left out, and a line says how many.
  - Without `--out`, the sheets go to a temporary folder.
  - Test, in `pnpm test:draw`: one PNG a case, inside the size, with as many panels as attempts.
- [ ] **1.1 A project skill for the loop.** Last in its chain: it names the commands the items above add. `.claude/skills/skill-studio-loop/SKILL.md`, about 40 lines: make a skill, add cases, run two versions, compare, look at the sheet, open the link, with the habits that save usage (below). `AGENTS.md` points to it. Test: a test reads every `st` command and flag the skill names and fails when the help from 0.1 does not list it, so the skill cannot drift from the CLI.

## Phase 2: compute what is known

- [ ] **2.1 `meets` from grading.** For each proposal and each answer read, `st propose` asks Jev what a grading will ask once the check is accepted, through the code the generic pack answers a check with (`statementQuestion` in `src/judges/generic/index.ts`, parts and joins included: export it, do not copy it), in one request a case, kept by `Asking` like its other questions. Where Jev is sure, its word is the proposal's `meets`, since that is what a grading will say; where it is not, Claude's word stays. A proposal whose faulty answer Jev is sure meets it says so in one line. What Claude is sent does not change, so no stored proposal is read again. With no key or `--no-jev`, as today. Test: a unit test with a fake Jev (a sure word replaces Claude's, an unsure one does not, the line shows); and replayed on the baseline, the count of answers where a sure Jev differs from Claude is written here.
- [ ] **2.2 Find quotes instead of refusing them.** `quoteHolds` (`src/domain/reading.ts`) already reads curly and straight quotes, spacing and line breaks alike, and takes a quote wherever it stands. Add a second reading, tried only when that one fails: hyphens and dashes alike, and three dots and `…` alike. It holds only when it finds exactly one place, and the stored quote is then the file's own words. Build it only if the baseline counts a refused quote it would have found; else close it with the count. Test: unit tests over each kind of mismatch, one that two places under the second reading still refuse, and one that every quote that holds today still holds.
- [ ] **2.3 Conflicts and sizes in code.** Where both readings are exact, code decides two rules conflict (two tests at `start` that ask for different fixed values) and works out whether a check's count can hold beside a rule's bound. Claude's answer is checked against it, and code wins where both readings are exact. Also: a new exact reading is held against the stored Jev answers and corrections for the same rule, and one that disagrees with a sure answer is flagged in the sort's last lines. Test: unit tests over readings from `fixtures/launch-note`, and `st sort` replayed on the baseline gives the baseline's kinds.
- [ ] **2.4 The phone question from the layout.** When the phone page was drawn and measured wider than its window, code answers the phone question no, and its answer stands. Jev is still asked, in the same words ([decision 1](#decisions)), and code's answer is kept beside Jev's as `PartAnswers.code` keeps one for a rule. A page that fits, or has no layout, is Jev's to answer as today. Test: a unit test with a layout wider than its window, and one that fits.
- [ ] **2.5 Recovery from the transcript.** The workflow pack answers "changed course after an error" in code where `metricsOf` settles it (no error, or the same call again after it), and that answer stands. Jev is still asked, in the same words, and its answer stands for the rest. Test: unit tests over three transcripts.
- [ ] **2.6 Help me improve asks its own question.** The first time a step's question is put, it goes to the writer as `IMPROVE_STEPS` writes it (`ask` in `src/domain/improve.ts`), with no model call. A question put a second time is still the model's, since it says what the reply lacked. Those seven questions become words the app shows: hold each to [design/copy.md](design/copy.md) and list them in the report. Test: a fake provider counts no call on a step's first question, and one on its second.
- [ ] **2.8 Fix with AI starts from the evidence.** The sheet (`FixSheet` in `src/domain/fix.ts`) holds the verdict, and for a fact code read, what code saw, so the model revises instead of searching. The revision is checked after with `openIn` and `keptQuestion`, and retried once when it still breaks the rule, as Auto refine is. Test: unit tests with a fake provider.
- [ ] **2.10 Write with AI counts in code.** It counts the 50-word description in code and drops a proposed check a case has already (`sameWords`, then Jev's same-question check). Test: unit tests with a fake provider for each.
- [ ] **2.9 Edits as search and replace.** The chat may write an `edit` block: `~~~~ edit <path>`, the text to find, a line `~~~~ with`, the text to put in its place, and `~~~~` ([decision 3](#decisions)). When the reply ends, code applies each one to the file as it stands, only where the text is found exactly once, and hands the panel a `file` change with the whole new text, so the panel shows and applies it as it does today and nothing under `src/renderer` changes. Where the text is not found once, the same press asks the model once more for that file whole, with why, so no change fails quietly. Whole files still work. Test: parser and apply tests in `domain/changes.ts`, one with a code fence in the text to find, and a fake provider that sends a block whose text is not found gets one more request and its whole file is applied.

## Phase 3: Jev before Claude

- [ ] **3.1 `st read` asks Jev again first.** A fact Jev was not sure of is asked again with a narrower state: the part its join picks, the measured layout, what code saw. Only what is still between the thresholds goes to Claude, and a case with nothing left asks Claude nothing. Gate: live, once, on the baseline's two runs: agreement with the key over the facts Jev left does not drop, and Claude is sent fewer tokens.
- [ ] **3.4 Parallel Jev requests.** Proposal questions go in parallel requests sized to the 64k context, not 40 at a time in series (`Asking.ask`). Same for any other caller that sends in series. Test: a fake Jev sees the requests overlap, and the answers come back in order.
- [ ] **3.3 Join proposals with fewer questions.** After 3.4, and only if joining still takes more than 5 seconds on the baseline; else close it with the number. Code first ranks pairs of proposals by shared words, and Jev is asked only about pairs code cannot settle. Gate: the same groups on the baseline, with fewer Jev questions.
- [ ] **3.5 A lasting cache for the rule judge.** `judgeRule`, `verifyRewrites` and `judgeAnswer` keep answers by a hash of state, question and model, as `src/application/judge-cache.ts` does for grading. Test: a second call with the same rule asks Jev nothing.
- [ ] **3.6 Show where code and a sure Jev disagree.** Jev is still asked every fact code answered ([decision 1](#decisions)). Where code's answer stands and Jev was sure of the other answer, the report and `--brief` say so, by rule or check, since that is where a code reading may be wrong. Test: a grading with a planted code reading that a sure Jev contradicts lists it, and one where they agree lists nothing.

## Phase 4: the acceptance run

- [ ] **4.1 The React card experiment, from a chat.** An agent follows only the loop skill.
  - It makes `react-card` with three cases that each ask for one HTML page. An output's page loads nothing from the network (`artifactPolicy` in `src/application/api/artifact-page.ts`), so a page that takes React from a CDN draws blank. Each case gives React's browser files in its own files (React 18.3.1: `react.production.min.js` and `react-dom.production.min.js`, added with `st case add --file`) and asks the page to load them from beside it.
  - It runs one case once on the smaller model and looks at the drawn page before anything else. A blank page means the files do not reach it: stop and fix the case.
  - It has two fresh agents write `SKILL.md` from the same brief, each in a folder of its own outside the skill, one after loading `emil-writing-skills`; runs both with `--from` and once without the skill; compares; makes the sheet; opens the pair with `st open`.
  - Record its tokens, its seconds and Claude usage for each step in this file. The run is not done the old way first: that would pay for the slow way once more only to have its number.
- [ ] **4.2 Release.** `pnpm reading-gate`, live, once ([releasing.md](releasing.md#check-grading-against-the-key)). `CHANGELOG.md` entry, docs checked against the code, release by [releasing.md](releasing.md).

## Habits for the agent

These go in the loop skill (1.1). They need no code.

- Never read `transcript.jsonl`. `notes.md`, the report and the sheet say what is needed.
- Start with `--samples 1` and a smaller model (`--model haiku`) to find the cases that tell two versions apart, then run more attempts on those cases only. `st run` uses `sonnet` when none is named.
- Run long commands in the background and read only the end of what they print.
- Look at the sheet before opening any page. Read a page's source only to quote it.
- A page loads nothing from the network. Give a case every file its page needs.
- Keep each draft of a skill in a folder of its own, outside the skill's folder.

## Decisions

Made by Miles on 2026-11-25.

1. **Jev is still asked a fact code answered.** Its questions ride in the same request, so they cost almost nothing, and its answer is the second opinion that shows where a code reading is wrong. Items 2.3, 2.4 and 2.5 need those answers. Item 3.6 shows the disagreements instead of skipping Jev.
2. **The command line draws with Electron.** It is the engine the desktop app draws with, so a grading from a chat sees the same picture and measures as one from the app. A headless browser library would be a large second download and a second way of drawing that can differ in fonts and sizes. The cost is a virtual display on Linux CI.
3. **The chat may send search and replace edits, with whole files as the fallback.** A one-line change no longer sends the whole file back, which is slower, costs more and can change lines nobody asked about. A block whose text is not found is asked for once more as the whole file, inside the same press.

## Not in this plan

- An MCP server for `st`. The command line with `--json` and `--brief` gives an agent everything, and a server is one more thing to keep in step with the app.
- A desktop link scheme (`skill-studio://`). `st open` covers a chat; a link into the desktop app needs the main process to take a URL and a signed release, and can follow later.
- A comparison page drawn in chat in place of Results. Results is where corrections are made, and corrections are the ground truth.
- Asking Jev a rule's kind before `st sort` asks Claude. A sort sends about 200,000 tokens and gets back 14,000. Claude still needs every rule and case to find conflicts and write the tests, so settling a kind with Jev saves a few of the 14,000 and puts the kinds, which every score stands on, at risk.
- Taking "return it unchanged when nothing can go" out of Suggest changes. `withheld` only hides a rewrite that came back unchanged. Without the instruction the model changes a rule that needed no change, and nothing is hidden.
- Answering the rule judge's `strict` question from lint. It rides in one request with the judge's other questions, so leaving it out saves nothing, as in decision 1.
