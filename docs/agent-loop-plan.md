# Agent loop plan: write, run and compare skills from a chat

The plan for letting a coding agent (Claude Code, in T3 Code or a terminal) do the whole Skill Studio loop through `st`, then hand the result to a person on the right screen. It also moves work that a large model does today to plain code or to Jev wherever either can do it as well, so the loop costs less and finishes sooner. [release-plan.md](release-plan.md) tracks releases; this file tracks this work.

| | |
| --- | --- |
| Status | Planned (2026-11-25), nothing started |
| Base | `main` at `7d83dc3`, Skill Studio 0.20.2 |
| Acceptance test | The React card experiment in [Phase 4](#phase-4-the-acceptance-run) runs from a chat, end to end |
| Owner | Miles Roxas |

## Why

The first real use is an experiment like this one: write a skill for a modern React card component twice, once by an agent that loaded `emil-writing-skills` and once by one that did not, run both on the same cases, and say which is better. `st` can already do most of it. What it costs today, and where it falls short:

- **The agent reads too much.** It reads [cli.md](cli.md) and [files.md](files.md) each session, several thousand tokens, and then every output's HTML (a few thousand tokens each, 18 to 27 outputs for that experiment).
- **The command line draws no page.** `st run`, `st grade` and `st serve` grade a page without drawing it (`drawn: false`, [grading.md](grading.md#answers-and-scores)), so a design skill graded from a chat gets no pictures, no measured layout and no `renders/`. The desktop app draws in `src/interfaces/electron/main/render.ts`.
- **No command writes a case.** The agent writes `prompt.md`, `case.yaml` and grader files by hand, and a slip costs a failed run.
- **Two versions run one after the other.** Comparing two drafts means run, overwrite `SKILL.md`, run again.
- **Nothing hands the result to a person.** Results already opens on a pair from its address (`#/results?case=&a=&b=`, `src/renderer/screens/Results.tsx:160`), but no command prints that address.
- **Claude is asked what code or Jev knows.** The call map below lists each place.

What each kind of work costs, from the docs and the TypeSafe reference (read 2026-11-25):

| Work | Cost |
| --- | --- |
| `st propose`, 6 cases, one message | about 119,000 input tokens, 39 s |
| `st propose --deep`, same cases | about 1.2 million input tokens, 6.5 min |
| `st read`, 6 cases | about 62,000 input tokens, 33 s |
| A Jev request | about 100 ms; 13 questions in one request were 12x cheaper and faster than 13 requests |
| Jev price | $0.042 per million input tokens, output free; 64k tokens per request, 32k per question |

So Jev is cheap enough that cost is not the reason to tune it; speed is. Every Claude call it or code replaces saves real usage.

## Where a large model is called today

Grading uses only Jev and code. A large model is called in eleven places, and each is listed here with what can move. "Stays" means the work is writing, which Jev does not do.

| Where | What it writes | What can move |
| --- | --- | --- |
| `st run` (`src/application/generate.ts:493`) | The output under test | Stays: it is what is tested |
| `st sort`, rules (`src/application/sorting.ts:202`) | A reading per rule: exact tests, judged with a join, or not markable with a fix | Jev can pick the kind and the join; code can find conflicts between exact readings; tests and fixes stay |
| `st sort`, checks | A reading per check, and rules it cannot hold beside | Code can work out sizes ("Work the sizes out", `src/domain/sorting.ts:63`) where both readings are exact |
| `st propose`, Write checks with AI (`src/application/proposing.ts:595`) | Up to six checks a case, with quotes and which answers meet each | Jev answers `meets` (it is the grading question); code finds quotes; check wording stays |
| `st read` (`src/application/reading.ts:194`) | Met, missed or cannot tell for what Jev left, with quotes | Jev on a narrower state first, Claude only for what is still open; code finds quotes |
| Fix with AI (`src/application/ai.ts:587`) | Why, and a revised answer | Send the verdict and code's evidence (`ExactAnswer.saw`) instead of asking it to find the fault; check the revision after |
| Auto refine (`ai.ts:540`) | A revised rule | Stays; already gated by lint and Jev |
| Suggest changes (`ai.ts:634`) | Three rewrites | Drop the "return it unchanged" instruction: `withheld` decides that in code |
| Help me improve (`ai.ts:688`) | A question, or a draft | Send the step's fixed question as written: no model call for it |
| Chat change blocks (`ai.ts:415`) | Prose and whole files | Edits as search and replace, applied by code |
| Write with AI (`ai.ts:339`) | A field's text | Code counts the 50-word description and drops checks a case has already |

And where Jev is asked what code knows:

- A rule or check code answered is still asked of Jev, whose answer stands only where code's does not (`src/judges/shared/score.ts:27`).
- The design pack's phone question asks whether the page scrolls sideways, which the measured layout says (`src/interfaces/electron/main/measure.ts:110`).
- The workflow pack's "changed course after an error" is partly in `metricsOf` (`src/judges/workflow/index.ts:425`).
- The rule judge's `strict` question is what lint's `MEASURE` and `ABSOLUTE` already find (`src/domain/lint.ts:134`).

Speed: proposal questions go to Jev 40 at a time, one request after another (`proposing.ts:405`), and joining proposals across cases asks every pair (`proposing.ts:945`). The rule judge keeps no cache beyond its last rule (`ai.ts:473`).

## Rules for every change

- **One item, one commit, one test.** Each item below names the test that proves it. It fails before the change and passes after. An item with no test that fits is split until it has one.
- `pnpm check` and `pnpm build` pass on every commit. A change under `src/renderer` follows [design/README.md](design/README.md) and [design/copy.md](design/copy.md).
- The docs that describe the change change with it: [cli.md](cli.md), [architecture.md](architecture.md), [grading.md](grading.md) or [files.md](files.md). Each user-visible change gets a line in `CHANGELOG.md`.
- A prompt that changes bumps its version (`SORT_PROMPT_VERSION` and the others), so no stored reading made under the old words is reused.
- **A move from Claude to Jev or code ships behind a measured gate.** Before the change, record the operation's tokens, seconds and agreement with the answer key on `fixtures/launch-note` ([reading bench](../scripts/reading-bench/README.md)). After it, agreement may not drop. A gate that fails means tuning the state, the question or the threshold, not giving up the item. Thresholds are read off this data, never copied from a cookbook.
- Every number in this file is replaced by the measured one when its item lands.
- In the app, the assistant still runs only on a press or a visible setting. A cascade runs inside the action that was pressed.

## How to build it

The work runs in waves. Items in a wave touch different files and run at once, each in its own worktree, by one agent per item. The lead agent merges a wave, runs `pnpm check` and `pnpm build` on the merge, and starts the next wave. An agent that finds its item needs a decision this file does not settle stops and asks; it does not guess.

Each agent's brief is its item text here, the test it names, and the rules above. It reports the commit, the test and the measured numbers.

| Wave | Items | At once |
| --- | --- | --- |
| 0 | 0.1, 0.2 | No: they set up the rest |
| 1 | 1.1 to 1.8 | Yes; 1.5 after 1.4, and 1.8 after 1.7 |
| 2 | 2.1 to 2.9 | Yes, grouped by file below |
| 3 | 3.1 to 3.6 | Yes, each behind its own gate |
| 4 | 4.1, 4.2 | No |

## Phase 0: ground to build on

- [ ] **0.1 Split `st.ts` into a module per command.** `src/interfaces/cli/st.ts` is 1,049 lines, and most of Phase 1 adds to it; split first so agents do not collide. No behaviour changes. Test: the existing CLI tests and `pnpm st --help` output, byte for byte against before.
- [ ] **0.2 A cost meter for every model call.** One record per call (operation, model, input and output tokens, seconds, cached or asked), summed at the end of a command and written with `--json`. `st read` and `st propose` count some of this already; make it one shape for Claude and Jev. Test: a unit test with a fake provider and a fake Jev, and the totals printed by `st read` on `fixtures/launch-note` from a saved reading.

## Phase 1: the agent's surface

- [ ] **1.1 A project skill for the loop.** `.claude/skills/skill-studio-loop/SKILL.md`, about 40 lines: make a skill, add cases, run two versions, compare, look at the sheet, open the link, with the habits that save usage (below). `AGENTS.md` points to it. Test: a test reads every `st` command and flag the skill names and fails when `st --help` does not list it, so the skill cannot drift from the CLI.
- [ ] **1.2 `st case add` and `st case check`.** `add` writes a case from flags (`--title`, `--prompt` or `--prompt-file`, `--check` repeated, `--weight`, `--file`, `--artifact html|image`, `--size WxH`) the way the Cases screen saves one. `check` reads every case and grader file and lists what will not load or will be skipped (missing front matter, a bad id, a weight out of range, a title used twice), exiting 1 when it finds any. Test: unit tests over a scratch skill, and `st case check fixtures/*` passes.
- [ ] **1.3 Run a draft without swapping files.** `st run --from <dir>` runs the skill files in that folder as the version, under the skill's own cases and `bench.json`, and keeps that version as any run keeps one. So two drafts run at once, each named. Test: a run with `--from` keeps the folder's files in `_skill/` and its version, and the working tree's `SKILL.md` is untouched.
- [ ] **1.4 Print the Results address.** One helper builds `?skill=<path>#/results?case=&a=&b=` (`src/renderer/route.ts` writes the hash today). `st run` prints it for the run it made and `st compare` for the pair. Test: the helper's unit test, and a server test that the address opens the pair (`src/interfaces/http/server.test.ts`).
- [ ] **1.5 `st open`.** `st open <skill> [--case id] [--a run] [--b run]` starts `st serve` or reuses one this checkout started, and prints the address with its token. The agent opens it in T3 Code's preview panel; a person opens it anywhere. Test: two calls start one server, and the second prints the same origin.
- [ ] **1.6 Short output.** `--brief` on `report`, `compare` and `run` prints, for each case, the version that did better and the words of each rule or check an output missed, nothing else. `run --quiet` prints one line per finished attempt. Test: output tests on the stored runs under `fixtures/`, and a size test that fails when `--brief` grows past a set number of bytes per case.
- [ ] **1.7 Draw pages from the command line.** `st run`, `st grade` and `st serve` draw a page as the desktop app does: they start Electron with no window as a drawing host and reuse `render.ts` and `measure.ts`, so the grading says `drawn: true` and writes `renders/`. Without a display (Linux CI), it draws under `xvfb-run` or says why it cannot and grades undrawn as today. Test: `st grade fixtures/design-skill` writes a PNG under `renders/` and `graded.drawn` is true; the test skips with a reason where no display can be had.
- [ ] **1.8 A contact sheet.** After 1.7, `st sheet <skill> --run A --run B [--case id]` puts each case's drawn pages side by side, labelled by run and attempt, in one PNG at most 1568 pixels a side, drawn by the same host from a small page of its own. The agent looks at one picture a case instead of reading each page, and a person can look at it in the chat. Test: one PNG per case, inside the size, with as many panels as attempts.

## Phase 2: compute what is known

Grouped by the files they touch: 2.1 and 2.2 are `domain/proposal.ts` and `domain/reading.ts`, 2.3 is `sorting`, 2.4 and 2.5 are `judges/`, 2.6 to 2.8 are `ai.ts` and `domain/improve.ts`, 2.9 is `domain/changes.ts`.

- [ ] **2.1 `meets` from grading, not from Claude.** `st propose` stops asking Claude which answers meet each proposal. Each proposal is asked of Jev per answer as the generic pack asks a check (`statementQuestion`), in one request per case, and `tellsOf` does the rest. The brief drops those lines and its version goes up. Test: on the launch-note bench, `meets` from Jev agrees with the answer key at least as often as Claude's; input tokens per case go down.
- [ ] **2.2 Find quotes instead of refusing them.** Before a quote is refused (`quoteHolds`, `parseProposals`), code looks for it with curly and straight quotes, dashes, spacing and line breaks read alike, and keeps the file's own words when it finds exactly one place. Fewer retries for `propose` and fewer "cannot tell" for `read`. Test: unit tests over each kind of mismatch, and one that two matching places still refuse.
- [ ] **2.3 Conflicts and sizes in code.** Where both readings are exact, code decides two rules conflict (two tests at `start` that ask for different fixed values) and works out whether a check's count can hold beside a rule's bound. Claude's answer is checked against it, and code wins where both readings are exact. Also: a new exact reading is held against the stored Jev answers and corrections for the same rule, and one that disagrees with a sure answer is flagged in the sort's last lines. Test: unit tests over readings from `fixtures/launch-note`, and `st sort` on it gives the same kinds as before.
- [ ] **2.4 The phone question from the layout.** When the page was drawn, "scrolls sideways" is answered from the measured layout, and Jev is asked only whether the rest fits. Test: a unit test with a layout wider than its window.
- [ ] **2.5 Recovery from the transcript.** The workflow pack answers "changed course after an error" in code where `metricsOf` settles it (no error, or the same call again after it), and asks Jev only for the rest. Test: unit tests over three transcripts.
- [ ] **2.6 Help me improve asks its own question.** A step's fixed question goes to the writer as written, with no model call to say it again. Test: a fake provider counts no call on a question step.
- [ ] **2.7 Smaller asks for rewrites.** Suggest changes drops "return it unchanged when nothing can go". The rule judge's `strict` question is answered by lint where `MEASURE` or `ABSOLUTE` finds the word, and Jev is not asked it. Test: unit tests in `improve` and `judges/rule`.
- [ ] **2.8 Fix with AI starts from the evidence.** The request holds the verdict, and for a fact code read, what code saw, so the model revises instead of searching. The revision is checked after with `openIn` and `keptQuestion`, and retried once when it still breaks the rule, as Auto refine is. Write with AI counts the 50-word description in code and drops a proposed check a case has already (`sameWords`, then Jev's same-question check). Test: unit tests with a fake provider for each.
- [ ] **2.9 Edits as search and replace.** The chat's change blocks may name a file and give the text to find and the text to put in its place. Code applies one only when the text is found exactly once, and refuses it otherwise with why. Whole files still work. Test: parser and apply tests in `domain/changes.ts`.

## Phase 3: Jev before Claude

Each item is a cascade: code first, Jev next, Claude only for what is still open. Each ships with its gate on the launch-note bench and the measured savings in this file.

- [ ] **3.1 `st read` asks Jev again first.** A fact Jev was not sure of is asked again with a narrower state: the part its join picks, the measured layout, what code saw. Only what is still between the thresholds goes to Claude. Gate: `pnpm reading-gate` holds, and agreement with the key does not drop.
- [ ] **3.2 `st sort` asks Jev the kind first.** For each rule, a Jev Choice between exact, judged and not markable, and for judged, the join. A rule Jev is sure is judged keeps that reading without Claude. Claude still writes every exact test and every fix. Gate: on launch-note, the kinds match Claude's at least as well as two Claude runs match each other.
- [ ] **3.3 Join proposals with fewer questions.** Code first ranks pairs of proposals by shared words, and Jev is asked only about pairs code cannot settle. Gate: the same groups on the bench, with fewer Jev questions.
- [ ] **3.4 Parallel Jev requests.** Proposal questions go in parallel requests sized to the 64k context, not 40 at a time in series. Same for any other caller that sends in series. Test: a fake Jev sees the requests overlap, and the answers come back in order.
- [ ] **3.5 A lasting cache for the rule judge.** `judgeRule`, `verifyRewrites` and `judgeAnswer` keep answers by a hash of state, question and model, as `judge-cache.json` does for grading. Test: a second call with the same rule asks Jev nothing.
- [ ] **3.6 Skip Jev where code's answer stands.** Needs the decision below. If yes: ask Jev only the facts where code's answer does not stand, and record that code answered. Test: a grading of launch-note asks fewer questions and scores the same.

## Phase 4: the acceptance run

- [ ] **4.1 The React card experiment, from a chat.** An agent follows only the loop skill: makes `react-card` with three cases that each ask for one HTML file that loads React from a CDN; has two fresh agents write `SKILL.md` from the same brief, one after loading `emil-writing-skills`; runs both with `--from` and once without the skill; compares; makes the sheet; opens the pair with `st open`. Record its tokens, its seconds and Claude usage for each step in this file, against the same run done before Phase 1.
- [ ] **4.2 Release.** `CHANGELOG.md` entry, docs checked against the code, release by [releasing.md](releasing.md).

## Habits for the agent

These go in the loop skill (1.1). They need no code.

- Never read `transcript.jsonl`. `notes.md`, the report and the sheet say what is needed.
- Start with `--samples 1` and a smaller model (`--model haiku`) to find the cases that tell two versions apart, then run more attempts on those cases only. `st run` passes `--model sonnet` when none is named.
- Run long commands in the background and read only the end of what they print.
- Look at the sheet before opening any page. Read a page's source only to quote it.

## Decisions for Miles

1. **3.6:** should Jev still be asked a fact code answered? It is cheap, and today its answer is kept beside code's. Skipping it makes grading faster, but nothing then shows where Jev and code would have disagreed.
2. **1.7:** the command line would start Electron to draw. It makes `st` heavier and needs a display on Linux. The other choice is a headless browser library, which adds a dependency and may draw unlike the app.
3. **2.9:** search and replace changes what the assistant may send in chat. A block whose text is not found is refused, so a person sees fewer changes applied whole.

## Not in this plan

- An MCP server for `st`. The command line with `--json` and `--brief` gives an agent everything, and a server is one more thing to keep in step with the app.
- A desktop link scheme (`skill-studio://`). `st open` covers a chat; a link into the desktop app needs the main process to take a URL and a signed release, and can follow later.
- A comparison page drawn in chat in place of Results. Results is where corrections are made, and corrections are the ground truth.
