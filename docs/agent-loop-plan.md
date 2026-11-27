# Agent loop plan: write, run and compare skills from a chat

The plan for letting a coding agent (Claude Code, in T3 Code or a terminal) do the whole Skill Studio loop through `st`, then hand the result to a person on the right screen. It also moves work that a large model does today to plain code or to Jev wherever either can do it as well, so the loop costs less and finishes sooner. [release-plan.md](release-plan.md) tracks releases; this file tracks this work.

| | |
| --- | --- |
| Status | Stage 2 under way: 0.1, 0.2 and 1.2 to 1.7 built; the walkthrough of 1.7 is next, then 1.8 and 1.1. Planned 2026-11-25, every item checked against the code at `61db117` and the [shapes items share](#shapes-the-items-share) at `9efce2a` |
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
- **Check once.** While working, run only the item's own test file (`pnpm vitest run <file>`). Run `pnpm check` and `pnpm build` once, before the commit; both pass on every commit. Send what each prints to a file and read the file only when the command fails: a check that passed is nothing an agent needs to read. A change under `src/renderer` follows [design/README.md](design/README.md) and [design/copy.md](design/copy.md).
- **Read little.** Read the item, these rules, the [shapes](#shapes-the-items-share) the item builds on and the files the item names. Search a doc for the section you need; do not read [cli.md](cli.md), [grading.md](grading.md) or [files.md](files.md) whole.
- The docs that describe the change change with it: [cli.md](cli.md), [architecture.md](architecture.md), [grading.md](grading.md) or [files.md](files.md). Each user-visible change gets a line in `CHANGELOG.md`.
- **Two files are the lead's.** An item's agent writes neither `CHANGELOG.md` nor this file. It reports its changelog line and its measured numbers, and the lead writes both when it takes the item ([one item](#one-item)). Every item would change those two files, so two chains would meet in them at every merge.
- A prompt that changes bumps its version (`SORT_PROMPT_VERSION`, `PROPOSE_PROMPT_VERSION` and the others), so no stored reading made under the old words is reused. A bump makes every user's stored readings be asked for again, so change a prompt only where the item says to.
- A pack question keeps its words unless the item says otherwise: new words void every stored total graded on the old ones ([when a total does not stand](grading.md#when-a-total-does-not-stand)).
- **Never run a command on a fixture in place.** Copy it to a scratch folder first: the stored runs and readings under `fixtures/` are what the tests are pinned to.
- **A move from Claude to Jev or code is measured, once.** Item 0.3 records each operation's tokens, seconds and agreement with the answer key on a copy of `fixtures/launch-note` ([reading bench](../scripts/reading-bench/README.md)), and keeps Claude's replies. An item that sends Claude the same words is measured by replaying those replies, which asks neither Claude nor Jev and needs no key ([decision 6](#decisions)). An item that changes what Claude is sent runs live once, on the one operation it touches. Agreement with the key may not drop. A gate that fails means tuning the state, the question or the threshold, not giving up the item. Thresholds are read off this data, never copied from a cookbook.
- **Nothing to save, nothing to build.** Where the baseline shows an item would save nothing, close it with the number that shows it.
- Every number in this file is replaced by the measured one when its item lands.
- In the app, the assistant still runs only on a press or a visible setting. A cascade runs inside the action that was pressed.
- An agent that finds its item needs a decision this file does not settle stops and asks. It does not guess.

## How to build it

A lead agent runs the build, one fresh agent builds each item, and another fresh agent checks it. The lead is Fable 5.2 at high effort, and it is spent only where a judgment is made ([decision 8](#decisions)). It writes no item's code and reads no diff whole, except the three foundations'. Every agent it starts is Opus 5.5 at high effort and never above it, since the item already says what to build.

| Work | Who |
| --- | --- |
| Hand an item to a builder, word for word | Lead |
| Build the item | A builder: Opus 5.5 |
| Run the checks and list the departures | A checker: Opus 5.5, fresh, never the item's builder |
| Decide what to do about a departure | Lead |
| Tick the box, write the numbers and the changelog line | Lead |
| Walk Miles through 0.1, 0.2 and 1.7 | Lead, from the code itself |
| Walk Miles through a chain or the acceptance run | Drafted by an Opus 5.5 agent; the lead reads the draft and the lines it quotes |

What an agent sends back to the lead is short: a report or a list, never a diff or what a command printed. That keeps the lead's own reading small through thirty items.

### One item

1. **The brief.** The lead gives a fresh agent the item's text, the test it names, the [rules](#rules-for-every-change) and the [shapes](#shapes-the-items-share) the item builds on. It gives nothing else: no account of the build so far, and no other item.
2. **The report.** The agent reports the commit, the test file, the measured numbers, its line for `CHANGELOG.md`, each number a person or a gate reads that the commit changes, each place it departed from the item's text and why, and each file it changed that the item does not name.
3. **The check.** A checker gets the item's text, the shapes it builds on, the commit and the builder's report, and nothing the builder said beyond it. It checks what can be checked without judging, and sends back one line a check and a list of departures:
   - The item's test passes on the commit. On the commit before it, with only the item's test files brought over, the test fails.
   - `pnpm check` and `pnpm build` pass.
   - The commit changes nothing under `fixtures/`, no prompt's version and no pack question's words, unless the item says to.
   - The diff, read beside the item's text and its shapes, departs from them nowhere the builder did not report.
4. **The answer.** With no departure left open, the lead takes the commit. Otherwise it sends the list back to the same builder, once. When the second try fails the check too, a fresh builder gets the item and the list: an agent that has failed twice tends to fail the same way a third time. A departure that needs a decision this file does not settle goes to Miles.
5. **The record.** The lead ticks the item's box here, writes its measured numbers here, and writes its line in `CHANGELOG.md`.

The checker is never asked whether the code is good. A model asked that finds something to change every time. It is asked only where the code departs from the item, and what the checks above say. It is the same model as the builder, so it catches less than a second reader would: what stands behind it is the checks that run as code, and the walkthroughs.

### What Miles is shown

Miles reads no diff cold ([decision 5](#decisions)). At each point below the lead walks him through the code in the chat, in plain words, written for a reader who has not seen that part of the codebase:

- what the change is for, in one sentence;
- the path one call takes through it, file by file, each step linked to its lines and shown as the real code, never as a retelling;
- each shape that later items build on, as it was written;
- each departure from this file, and what the lead did about it;
- what no test covers, and what the lead is least sure of.

A walkthrough is one agent's reading of the code, and it can be wrong as the code can. So it quotes the code it explains, and Miles can stop on any line and ask. Before he sees a drafted one, the lead holds each quote to the file and lines it names, and reads those lines. Nothing merges at these points until he has had the walkthrough and said to go on.

| When | What is walked through |
| --- | --- |
| After 0.1 and 0.2 | The command module and the cost meter: every later item builds on both |
| After 1.7 | The drawing host: a second process, and the one new way the command line starts Electron |
| Before a chain's pull request merges | The chain, item by item |
| After 4.1 | The acceptance run: what it cost, and what the agent had to work around |

### Order

Chain A and the acceptance run come first ([decision 4](#decisions)): the acceptance run needs nothing from chains B to E, and what it shows can change them.

| Stage | Built | Then |
| --- | --- | --- |
| 1 | 0.1, then 0.2 | Walkthrough |
| 2 | Chain A. 0.3 runs beside it: it adds the replies, one test, two lines of configuration and this file's numbers, and touches nothing chain A does | Walkthrough after 1.7; chain A's pull request |
| 3 | 4.1, the acceptance run | Walkthrough. The baseline from 0.3 now closes each later item it shows would save nothing |
| 4 | Chains B and E, each in its own worktree | A pull request each |
| 5 | Chains C and D, each in its own worktree | A pull request each |
| 6 | 4.2 | The release |

Items that touch the same files are a chain, built one after another on one branch from `main`. A chain goes back to `main` as one pull request, so the checks run on Linux, macOS and Windows before it merges. Items 0.1 and 0.2 are one pull request, merged before chain A branches from `main`, and 0.3 is one of its own.

| Chain | Items, in this order | Files they share |
| --- | --- | --- |
| A | 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.1 | `src/interfaces/cli/`, the drawing host |
| B | 2.1, 2.2, 3.1 (3.4 and 3.3 are closed by the baseline) | `proposing.ts`, `domain/proposal.ts`, `domain/reading.ts`, `reading.ts` |
| C | 2.3 | `sorting.ts`, `domain/sorting.ts` |
| D | 2.4, 2.5, 3.6 | `src/judges/` |
| E | 2.6, 2.8, 2.10, 2.9, 3.5 | `ai.ts`, `domain/improve.ts`, `domain/fix.ts`, `domain/changes.ts` |

Items 2.1 and 3.6 also print a line from a command's module. Chain A is merged before either starts, so they build on the modules 0.1 made.

Two chains at once save time, not usage: one after another costs the same and needs no merge. Never more than two, because each one ends in a walkthrough.

The lead starts fresh at each stage. This file is what it remembers: the boxes, the numbers and the stage table say where the build stands, so a new lead reads this file and goes on.

A worktree needs `pnpm install` before its first command, and chain A needs the Electron binary that install fetches.

## Shapes the items share

The types more than one item builds on, written before any item so that no two agents invent two. An item's agent builds to them as written. Where the code shows a shape cannot work as written, the agent stops and says so; it does not change the shape on its own.

### A command (0.1, and every item of chain A)

```ts
// src/interfaces/cli/commands/command.ts
export interface Flag {
  type: 'string' | 'boolean'
  short?: string
  /** Given once for each value, as `--check` and `--file` are. Its value is a list. */
  multiple?: true
}

export interface Command {
  /** As typed after `st`: 'run', 'compare', 'case add'. */
  name: string
  /** Its lines under "Commands" in `st --help`, its flags' lines among them, as printed. */
  help: readonly string[]
  /** The flags it reads. One that two commands read is imported from `flags.ts`, never written twice. */
  flags: Readonly<Record<string, Flag>>
  /** True when it starts agents, so `st.ts` gives it a lifecycle. */
  agents: boolean
  /** Resolves to the exit code. */
  run(context: Context): Promise<number>
}

export interface Context {
  /** What followed the command's name. */
  args: readonly string[]
  /** What `parseArgs` read, over every command's flags. */
  values: Values
  lifecycle: Lifecycle | null
}
```

- `commands/index.ts` lists the commands in the order the help prints them. `st.ts` picks the longest name the arguments start with, so `case add` is found before `case`.
- A flag's type is declared once. Its help line is not: `--model` says something different under `run`, `read` and `sort`, and each command keeps its own line.
- `Context` grows only where two commands need the same thing, such as the Jev options `run` and `grade` both read.

### One model call (0.2, then 0.3, 4.1 and every gate)

```ts
// src/domain/cost.ts
/** The work a call was made for, named by whoever asked. */
export type Operation = 'run' | 'grade' | 'sort' | 'propose' | 'read' | AiRunKind

export interface CallRecord {
  operation: Operation
  provider: AiProviderId | 'jev' | 'engine'
  /** The model that answered, as the provider names it. */
  model: string
  input: number
  /** 0 for Jev, whose output is not counted. */
  output: number
  seconds: number
  /** `replayed` came from a file under `ST_AI_REPLAY` and cost nothing. */
  source: 'asked' | 'replayed'
}

/** The calls of one operation, to one model, asked or replayed, added up. */
export interface CallTotal extends Omit<CallRecord, 'seconds'> {
  calls: number
  seconds: number
}
```

- **What a command prints.** With `--json`, a command's result carries `cost`: a `CallTotal` for each operation, provider, model and source, sorted by those four, so two runs of the same calls print the same list. This is the form 0.3, 4.1 and every gate read.
- **What a replay counts.** A replayed record's `seconds` is 0. A replayed provider record carries the tokens saved with its reply. A replayed Jev record carries 0 tokens and the model that was asked, since Jev's tokens belong to a whole request and a replay may group the questions anew. So no gate compares Jev's tokens from a replay: Jev's tokens are measured live only.
- **A replay asks nobody.** Under `ST_AI_REPLAY`, a `--deep` session and the answer under test stop the command with code 2, as a missing reply does: neither is ever saved. `st sort` does not ask which assistant is connected: it needs `--model`, and takes the provider from Settings when one is set, else `claude-code`. A test that replays sets `SKILL_STUDIO_HOME` to a scratch folder, so no one's Settings change a key.

- **Who names the operation.** `AiRequest` and `AiFolderRequest` gain `operation`, set at each place a provider is called (`sortCall`, `proposeChecks`, `readingOfRun`, and the two calls in `ai.ts`). `Jev`'s constructor takes one after the model, at each `new Jev(` (`grade.ts`, `ai.ts`, `operations.ts`, the `propose` command).
- **Where it is counted.** `aiProvider()` returns each provider wrapped, and `Jev.ask` counts its own. The answer under test is not written through either: `generateRun` asks an engine and keeps each attempt's tokens in `timing.json`, so it adds one record an attempt, with `provider: 'engine'`.
- **Kept is not a source.** An answer a caller kept from before (`Asking`, `judge-cache.json`) never reaches a provider, so it has no record. Its caller counts it as today (`JevSpent.kept`).
- **The key of a saved reply** is the SHA-256 of what was sent, written the same way every time: a provider's id, the model, the effort, `system`, `turn`, each message's role and text with its pictures by their bytes, and the schema. Nothing in a key names a folder on this machine, so a reply saved from one scratch copy answers another.
- **Jev is keyed by question, not by request.** Jev answers each question apart from the others, as `judge-cache.ts` relies on. So a saved answer's key is the model, the state and that one question's words, pictures by their bytes. A replay answers a request when it holds every question in it, however the questions were grouped when they were saved. Item 3.4 groups them anew and still replays; item 2.1 asks live only for the questions it adds.
- **The files.** A provider's reply is `<dir>/<provider>/<key>.json`: the operation and the reply (`text`, `usage`, `model`), or, for a request that was billed and then refused, the `ProviderError`'s message, usage and model, which a replay throws again. Jev's answers are `<dir>/jev/<key of the model and state>.json`: each answer by its question's key.

### A page to draw (1.7, 1.8)

```ts
// src/domain/drawing-host.ts
/** One line the command writes to the host. */
export type HostRequest =
  | { id: string; page: ArtifactAddress; width: number; height: number }
  /** 1.8: a page of the command's own, by its `file:` address. */
  | { id: string; file: string; width: number; height: number }

/** One line the host writes back. */
export type HostReply =
  | { id: string; png: string; layout: PageLayout | null }
  | { id: string; error: string }
```

- `png` is base64. `page.skill` is the skill folder's real path, never the empty string that means "the first one served".
- The host serves a sample's file only from a skill it has open (`skill.artifact` in `operations.ts`). It opens `page.skill` the first time a line names it. The line comes from the command, which is trusted; a page cannot write one.
- `serveArtifacts` in `protocol.ts` is not exported and takes a `Backend`. Export it and narrow what it takes to the `call` it uses, so the host hands it its own.

### The server `st open` starts (1.5)

```ts
// src/interfaces/cli/open-server.ts
export interface OpenServer {
  pid: number
  port: number
  token: string
  /** The checkout it serves from, by its real path. */
  checkout: string
}
```

- One file a checkout, `open-<first 8 of the SHA-256 of checkout>.json` in `STUDIO_DIR` (`src/infrastructure/library.ts`), mode `0600`. Two worktrees each have their own build of the app, so each has its own server and neither stops the other's.
- The token stays in that file. `st open` uses it to ask the server for a ticket and prints the ticket's address ([decision 7](#decisions)).

## Phase 0: ground to build on

- [x] **0.1 Split `st.ts` into a module per command.** `src/interfaces/cli/st.ts` is 1,049 lines and runs a command the moment it is loaded, so nothing in it is tested. Move each command to `src/interfaces/cli/commands/<name>.ts`, which exports its name, its help lines, its flags and its `run`. `st.ts` keeps only the start: read the flags, pick the command, exit with its code. The help text is put together from the modules and can be imported without running anything. A flag two commands share (`--model`, `--cases`, `--run`, `--name`, `--json`) is declared once. No behaviour changes. Test: before the split, save what `pnpm st --help` prints; a new test holds the help to it byte for byte, and the tests there are pass. Measured (`6025f68`): `st.ts` is 60 lines; 12 command modules; 14 shared flags declared once in `commands/flags.ts`; 32 offline commands print the same and exit the same before and after.
- [x] **0.2 A cost meter for every model call, and saved replies.** One [record](#one-model-call-02-then-03-41-and-every-gate) per call, summed at the end of a command and written with `--json`. `st read`, `st propose` and `st sort` count some of this already (`spent`); make it one shape for Claude, Jev and the answer under test, taken where the shape says each is counted. At the first two, `ST_AI_RECORD=<dir>` writes each one-message reply and each Jev answer to a file named by its key, and `ST_AI_REPLAY=<dir>` answers from those files and stops with the call's operation and key when one is missing ([decision 6](#decisions)). A `--deep` session and the answer under test are counted, never recorded. Test: a unit test with a fake provider, a fake Jev and a fake engine for the totals; a recorded call replayed against a provider and a Jev that throw gives the same reply; and one request built from two copies of a skill in two folders has one key. Measured (`f1bbd5e`, `d9d1526`, `a568ea1`): 7 places that ask a provider and 6 that build a `Jev` name an operation; calls are counted in 3 places; 5 commands print `cost` with `--json` (`run`, `grade`, `read`, `sort`, `propose`); 10 tests in `src/application/cost.test.ts` and 1 in `src/interfaces/cli/replay.test.ts`, which starts the real `st`.
- [x] **0.3 The baseline.** On a scratch copy of `fixtures/launch-note`, with `ST_AI_RECORD` on, run `st sort` on both versions as the [reading bench](../scripts/reading-bench/README.md#counting-what-st-sort-read) says, `st propose`, and `st read --answers key.json` on the two runs the bench names, blind and not. Write each one's tokens, seconds, Jev questions, replies refused once and twice, and agreement with the key in a table here. Commit the replies under `scripts/reading-bench/replies/`, kept byte for byte (`-text` in `.gitattributes`) and left out of Biome (`files.includes` in `biome.json`), as the stored runs are. This is the one time the plan pays for these operations whole: about 700,000 input tokens. It needs a signed-in Claude Code and `TYPESAFE_API_KEY`; a worktree has no `.env`, so stop and ask where either is missing. Test, in `pnpm check`: with `ST_AI_REPLAY` on that folder, on a new scratch copy in another folder and with no key set, the same three commands give the same counts and ask Claude and Jev nothing.
  - Run live once on 2026-11-27 (`550a59e`), each of the seven operations one time, none failed. The replies are 43 files (36 of Claude's, 7 of Jev's, 176 answers, 95,561 bytes) under `scripts/reading-bench/replies/`, and `src/interfaces/cli/baseline.test.ts` replays them in about 4 seconds.
  - Seconds are wall-clock with the process start; summed call seconds are in brackets. Only `propose` asks Jev. `read` has no retry, so no refused count.

    | Operation | Tokens in | Out | Seconds | Refused once / twice | Agreement with the key |
    | --- | --- | --- | --- | --- | --- |
    | sort, version one | 97,690 | 8,013 | 35.2 (71.5) | 0 / 0 | counted with version two |
    | sort, version two | 101,448 | 7,274 | 28.4 (62.2) | 0 / 0 | 184 agree, 0 differ on stored outputs; 1,131 agree, 0 differ when changed to miss |
    | propose | 118,758, and Jev 36,400 | 8,192 | 39.0 (64.2, Jev 0.99) | 0 / 0 | no key exists |
    | read `v0-claude-sonnet`, blind | 62,159 | 10,101 | 33.4 (63.0) | | 60 of 62 |
    | read `v0-claude-sonnet` | 86,592 | 2,409 | 11.8 (17.7) | | 4 of 4 |
    | read without the skill, blind | 91,550 | 17,615 | 52.1 (101.2) | | 62 of 63 |
    | read without the skill | 78,893 | 1,157 | 8.2 (7.8) | | 3 of 3 |

  - In all: 637,090 input tokens of Claude's and 36,400 of Jev's, 54,761 of Claude's out. `propose` asked Jev 176 questions in 10 requests, and joining compared 69 pairs in 4 requests in 0.34 seconds.
  - The sort deletes `evals/rule-readings.json` first, as the reading gate does: with it kept, the sort asks nothing. The bench's README says so now.
  - What it shows for later items: 3.3 and 3.4 are closed below. No quote went unfound over 140 answers, so 2.2 would have changed nothing here; it stays open for Miles's word, since one fixture is one sample. The two plain reads spent 165,485 tokens on 8 facts, 156,037 of them on the one long page, which is what 3.1 is for.
  - Unproven: one sample of each; Jev's tokens are counted only live, a replay counts 0.

## Phase 1: the agent's surface

- [x] **1.2 `st case add` and `st case check`.** `add` writes a case from flags (`--title`, `--prompt` or `--prompt-file`, `--check` once for each check, `--file` once for each file to copy into the case, `--artifact html|image`, `--size WxH`) through the same check the Cases screen's save goes through, as `generateInputOf` does for a run. Each check gets weight 1, as an accepted proposal does. `check` reads every case and grader file of one skill and lists what will not load or will be skipped (missing front matter, a bad id, a weight out of range, a title used twice), exiting 1 when it finds any. Test: unit tests over a scratch skill, and `st case check` passes on each of the four skills under `fixtures/`. Measured (`b6fb32b`): 2 command modules, 13 tests (4 for `add`, 9 for `check`), 10 help lines; `check` also lists a case folder with no `prompt.md`, a folder under `evals/` that one under `evals/cases/` hides, an `evals.json` entry a case folder hides, and an `evals.json` that cannot be read; it takes `--json`, and `--file` takes a folder.
- [x] **1.3 Run a draft without swapping files.** `st run --from <dir>` runs the skill files in that folder as the version, under the skill's own cases and `bench.json`, and keeps that version as any run keeps one. So two drafts run at once, each named.
  - The folder holds a `SKILL.md` and is outside the skill's folder. One inside it is refused: the skill's own files would be kept as part of each version.
  - The folder's files are held against the skill's versions as the working tree is (`skillVersions` in `src/infrastructure/skill.ts`). The same files as a kept version are that version. New files take the next number and need `--name`, as a changed tree does.
  - Two runs started together must not take one number. `stampSkill` to the write of `run.json` in `generateRun` happen under a lock file in `evals/runs/`, made as `takeGradingLock` makes its own (`src/infrastructure/grading-lock.ts`).
  - `--from` is for `with_skill` only, and is refused with any other `--configuration`.
  - Test: a run with `--from` keeps the folder's files in `_skill/` and its version, and the working tree's `SKILL.md` is untouched; two stamps taken together get two numbers.
  - Measured (`95556b0`): 4 tests in `src/application/generate.test.ts`, one of which starts two processes together and gets v0 and v1 (without the lock, v0 twice, 5 times in 5). The lock is `evals/runs/.stamp.lock`, held for every configuration since the run folder's name is picked under it. A second run waits for it, up to 60 seconds, where a second grading is refused. A folder that holds the skill is refused as one inside it is. A refused run takes no lock, so `evals/runs/` and its modified time stay as they were.
- [x] **1.4 The Results address.** One function in `src/domain/` builds `?skill=<path>#/results?case=&a=&b=`. `a` and `b` are outputs, each `<run>/<sample>`: given a run, it names that run's first attempt at the case, and with no case named, the first case both runs answered. `st run` and `st compare` have no server to give an address for, so each prints the command that opens it: `Open: pnpm st open <skill> --a <run> [--b <run>]`. Move the lines of `Results.tsx` that read `case`, `a` and `b` into a function beside `outputByKey` (`src/renderer/model.ts`), unchanged. Test, under `src/renderer` since it reads `placeOf` (`route.ts`) and the domain imports nothing from the renderer: an address the function builds, read back by `placeOf` and that function, names the same case and the same two outputs. Measured (`c770eb0`): `resultsAddress` in `src/domain/results-address.ts`, 11 tests (7 on the address, 4 on the `Open:` line). "First" is the order Results and `st cases` list cases in (`casesInOrder`), and a sample's case is the one its grading names, then its folder's (`sampleOf` in `src/domain/run-name.ts`); the renderer calls both. Whoever builds an address hands it the cases in that order, and `graded` as null for a sample grading leaves out (`sampleCut`). The line is not printed with `--json`. Since `5001dda` an address names a run's first attempt that has an output to show, as Results does (`firstAttempt` in `src/domain/pairs.ts`, which both call).
- [x] **1.5 `st open`.** `st open <skill> [--case id] [--a run] [--b run]` prints the address from 1.4 on a running server. The agent opens it in T3 Code's preview panel; a person opens it anywhere.
  - **The address carries a ticket, never the token** ([decision 7](#decisions)). A chat is kept and is sent to the model's maker, so it is not the terminal [SECURITY.md](../SECURITY.md#the-web-server) calls yours. `st open` asks the server for a ticket, in a new request the server answers only to the token, made by the `tickets.issue()` that `ticketUrl()` uses (`src/interfaces/http/server.ts`). The first load within a minute trades it for the cookie. An address opened a second time, or after a minute, is refused: run `st open` again.
  - With no server of this checkout running, it starts one as a detached copy of itself (`process.execPath`, `process.execArgv`, `process.argv[1]`, `serve`) on a free port the system picks, and waits up to 30 seconds for it (10 at first: a Windows runner took longer once).
  - That server writes [its file](#the-server-st-open-starts-15), never in the checkout, readable by the user alone (`0600`). It removes the file when it stops. A file whose process is gone is removed and a new server started.
  - A server started this way stops itself after 60 minutes with no request. `st open --stop` stops it now.
  - Where the app is not built, it says `Run pnpm build first.` and exits 2.
  - [SECURITY.md](../SECURITY.md#the-web-server) says the token is now also in that file, who can read it, and that `st open` prints a ticket.
  - Test: two calls start one server and the second prints the same origin with another ticket; no line `st open` prints holds the token; a second checkout's call starts a second server and leaves the first running; `--stop` ends this checkout's and removes its file; the file's mode is `0600` (skipped on Windows).
  - Measured (`318bcb6`): 12 tests in `src/interfaces/cli/open-server.test.ts`, 7 of which start the real `st` from two scratch checkouts. The ticket is asked for with `POST /api/ticket`, which answers only to the token in the `x-skill-studio-token` header, never to the cookie or `?token=` (`src/interfaces/http/guard.ts`). The token is in the file and in that one header, nowhere else. The copy knows `st open` started it by `ST_OPEN_SERVER=1`, which it removes at once. Once a minute the server looks: it stops after 60 minutes with no request, or when its file is gone or names another process, and never while a job runs. `--stop` ends a process only after it has answered to the token.
- [x] **1.6 Short output.** `--brief` on `report`, `compare` and `run` prints, for each case, the version that did better and the words of each rule or check an output missed, nothing else. `run --quiet` prints one line per finished attempt. Test: output tests on the stored runs under `fixtures/`, and a size test that fails when `--brief` prints more than 200 bytes a case beyond the words of what was missed. Measured (`32ef04d`): 11 tests in `src/interfaces/cli/commands/brief.test.ts`. One stored `launch-note` run prints 7,545 bytes as a report and 357 with `--brief`. The most a case prints beyond its missed words is 118 bytes, and the size test holds each case alone. `compare` names the runs A and B, since two runs can share a version; `report` and `run` read one run and name no winner. "Nothing missed" is said only of an output read whole: one that wrote nothing, could not be read, was not scored or was read in part says so, and every case is printed. `--brief` with `--json` is refused. `--quiet` silences progress only: 13 kinds of warning go through a `warn` channel beside `log` in `generate.ts`, `grade.ts` and the judge context, and still print. Plain output is the same byte for byte over 40 printings.
- [x] **1.7 Draw pages from the command line.** `st run`, `st grade` and `st serve` draw a page as the desktop app does: they start Electron with no window as a drawing host ([decision 2](#decisions)), so the grading says `drawn: true` and writes `renders/`, the same pictures and measures the desktop app makes.
  - **Prove it first.** Before the item's own code, a script of a few lines starts Electron from Node with no window, draws one stored page of a scratch copy of `fixtures/design-skill` through the `artifact:` scheme, and prints the PNG's size and how many elements the layout holds. Nothing in the repository has started Electron this way. Where it cannot be made to draw, stop and say what it did: the item is built on it.
  - **The host** is a new start file, `src/interfaces/electron/draw/index.ts`, built by `pnpm build` to `out/main/draw.js` (a pass of its own in `electron.vite.config.ts`; `out/main/index.js` keeps its name). It registers the `artifact:` scheme before `ready`, serves it with `serveArtifacts` (`protocol.ts`) over its own `createOperations`, and draws with `pageRenderer()` unchanged. It takes a temporary profile folder of its own, no single-instance lock and no keychain, hides its Dock icon, and stops when its input closes. It reads one JSON line for each page and writes one back ([the lines](#a-page-to-draw-17-18)). A line it cannot read as JSON is passed over.
  - **The command's side** is `src/interfaces/cli/drawing.ts`: a `PageRenderer` that starts the host at the first page asked for, finding Electron as `launch` does in `scripts/guide-shots/index.ts`, keeps it for the command's life, and is ended by the command's lifecycle (`src/interfaces/lifecycle.ts`) as agents are. It is passed as `render` to `gradeRun`, and through `startServer` to `createOperations`.
  - A grading draws only when Jev grades, as in the app, so `--no-jev` never starts the host. `--no-draw` grades as before this item; `pnpm reading-gate` passes it, so its pinned numbers stand.
  - Where the host cannot start, the command says why once (`Run pnpm build to draw pages.`, Electron not installed, no display) and grades undrawn.
  - Test, in `pnpm check`: the command's side against a stand-in host, a plain script that speaks the same lines: one start for many pages, replies matched by `id`, and a host that fails grades undrawn with the reason. Test, as `pnpm test:draw`: build, start the real host, draw the stored page of a scratch copy of `fixtures/design-skill`, and hold the PNG to the size asked and the layout to at least one element. CI runs `pnpm test:draw` in one new job on Linux under `xvfb-run`, with the Electron binary fetched (the other jobs skip it).
  - Measured (`c90ea1c`, on a Mac): the proof drew the stored page at 1280×960 with 20 elements in 1.18 s. `pnpm test:draw` draws the desktop size (1280×960, 20 elements, 1.4 s) and the phone size (390×1200, 20 elements, 0.9 s) through one host, which takes about 0.45 s to start. 18 tests in `src/interfaces/cli/drawing.test.ts` against the stand-in.
  - As built: the host is built in a pass of its own (`electron-vite build --mode draw`), not as a second input, since a second input moved the app's main process into a shared chunk three times its size. The app's `out/main/index.js` gains only `refusePermissions`, which the app and the host both call; the packaged app leaves the host out (`electron-builder.yml`). The start file only hides the Dock icon and then loads `draw/host.ts`, so the host is never a foreground app. The checks that it can start run at the first page asked for, so a server that never draws starts nothing. A host that cannot start or that dies says why once and is not asked again (`RendererGone`): the output it was drawing and each one after are graded as with no renderer, and keep no picture that grading wrote. `--no-draw` is read by `run` and `grade`. `pnpm reading-gate` calls `gradeRun` with no renderer and never ran `st`, so nothing there changed. A release now waits on the `draw` job, since `release.yml` runs `ci.yml`.
  - After the chain's first CI run (`33aadc7`, `5001dda`): on Linux the host turns hardware acceleration off, since `capturePage` fails under `xvfb-run` with no GPU (`UnknownVizError`); macOS and Windows keep the GPU, because drawing in software changed about 0.7% of a stored page's pixels on a Mac. A page that uses WebGL is pictured without it on Linux. The profile folder is made by the start file (`draw/profile.ts`), removed on every way the host ends, and the host then ends with `process.reallyExit`, since Electron's own exit wrote the folder back. On Linux the network service outlived the host and wrote the folder again within 100 ms (seen in a container), so as it ends the host kills its own browser processes and starts a detached remover that waits for them, and the command removes the folder of the pid it started once that host has exited (`93a0569`).
  - Not yet run: the host on Windows.
- [x] **1.8 A contact sheet.** After 1.7, `st sheet <skill> --run A --run B [--case id] [--out <dir>]` puts each case's drawn pages side by side, labelled by run and attempt, in one PNG at most 1568 pixels a side, and prints each file's path. The agent looks at one picture a case instead of reading each page, and a person can look at it in the chat.
  - It reads the desktop-size pictures already in each sample's `renders/`. An output with none is left out, with a line that says to grade its run first.
  - It writes a small page and copies of those pictures to a temporary folder, and the host draws that page from its `file:` address: the second kind of [line](#a-page-to-draw-17-18) the host takes. Labels are written as text, never as markup.
  - One row a run, one column an attempt, 12 panels at most. Attempts that do not fit are left out, and a line says how many.
  - Without `--out`, the sheets go to a temporary folder.
  - Test, in `pnpm test:draw`: one PNG a case, inside the size, with as many panels as attempts.
  - Measured (`44c1812`, on a Mac): a sheet of two runs with three and two attempts is 1568×960 and 63,109 bytes, and `st sheet` takes 1.32 s, the host's start included. 17 unit tests (9 in `src/domain/contact-sheet.test.ts`, 6 in `src/interfaces/cli/commands/sheet.test.ts`, 2 in `drawing.test.ts`), and three checks in `pnpm test:draw`.
  - As built: `--run` takes a list for every command, and `report`, `read` and `grade` read the last one given, as before. A column is an attempt, in number order over every attempt any run has a picture of; a run with no picture of one leaves that place empty, and an empty place is not a panel. A run named twice is one row. An output that is not a page or did not finish gets no line, since a grading would never draw it. For a page of the command's own, the host itself allows no script and no request but the `.html` and `.png` files in the page's folder, whatever the page says: each file it serves carries that policy, and every request that is not `file:` is cancelled, WebSockets included. A host lost while sheets are drawn names the sheets not made and the command exits 1. `pageRenderer()` now sits on `pageDrawer()`, which draws any address.
  - With it (`ece7f70`, a follow-up to 1.7): the host's start file reads its input before the host's code loads and ends on a closed input, SIGTERM, SIGINT or SIGHUP at any moment of its start; the command sends its host SIGTERM as it exits; and `st sheet` removes its page folder when it is stopped. The orphaned host a check saw after an early Ctrl-C could not be made to happen again, so only the command's side is shown to fail without its fix.
- [x] **1.1 A project skill for the loop.** Last in its chain: it names the commands the items above add. `.claude/skills/skill-studio-loop/SKILL.md`, about 40 lines: make a skill, add cases, run two versions, compare, look at the sheet, open the link, with the habits that save usage (below). `AGENTS.md` points to it. Test: a test reads every `st` command and flag the skill names and fails when the help from 0.1 does not list it, so the skill cannot drift from the CLI. Measured (`befe0fb`): the skill is 30 lines, and 839 words since `bee6d52`; 8 tests in `src/interfaces/cli/commands/loop-skill.test.ts` read 17 commands and 22 different flags from it. A command is `st` with a word after it in a code span or fence, with or without `pnpm`; a flag in a command must be one that command's module declares, and every `--flag` in the file, prose included, must be one the help lists. A word too many after a command still passes. The skill also says what 4.1 needs and the item did not list: `TYPESAFE_API_KEY` must be set or no page is drawn, one case is run and its sheet looked at first, a run with no skill, and where an attempt's seconds and tokens are kept. With it (`38076bd`): `st cases` prints every id whole; it cut one at 33 characters, and an id runs to 40.
- **After the chain's walkthrough was drafted** (`2d6e466` to `2b08023`), the points its reader and a check raised were closed, a commit each:
  - `st run` refuses a new version under a name another version has, compared under NFKC with invisible characters removed, white space read as one space, and case folded (`takenBy` in `generate.ts`). Only `st run` asks for it (`ownName`): the app's own default names repeat by design ("My edit", "Edits of <date>"), and a run refused there shows only as a failed job.
  - Each `--brief` case line starts `[<id>]`, is one line whatever its title holds, and is the only line that starts so. A miss says `missed in 1 of 3` where a case has more than one attempt; an attempt the rule was not marked on counts in neither number.
  - A request that starts with a `---` block is written after a block that sets nothing, so it reads back as the request (`promptFileText` in `cases.ts`). The reader did not change, and every stored `prompt.md` reads as before.
  - The server `st open` starts sends its stderr to `open-<hash>.log`, `0600`, new at each start, kept under 1 MiB. Its stdout, which holds the token, goes nowhere.
  - `st open` prints its address under `127.0.0.1`, so a server a person opens as `localhost` is never sent its cookie. `st serve` prints `localhost` as before.
  - The host falls back to `process.exit` where `process.reallyExit` is absent. One rule names a profile folder (`profilePid`, `goneProfiles`), and no folder of a live process is removed. Every process started without a window passes `windowsHide`.
  - WebGL on Linux was tried and taken back out: `enable-unsafe-swiftshader` gives it, and Chromium says that switch "is not intended for running untrusted content". A test holds the start file to no such switch.
  - A refused case save writes nothing; a later line of a missed rule is four spaces in, so it cannot read as a miss; the loop skill gives each version name to one run.
- **Before the merge** (`164d6ca` to `a6ab9e7`), the gaps still open were closed:
  - The stamp lock covers taking the version and name, making the run's folder and the skill's copy, and writing `run.json`. Input files and cases are copied after it is given back (`takeRun`, then `stageRun`), so a second run never waits on the first run's copying. A run whose copy fails is removed whole.
  - A title is one line everywhere (`oneLineTitle` in `src/domain/case-draft.ts`), and `st case check` lists a stored one written with a line break.
  - Each of the 13 kinds of warning, at 15 call sites, is tested to go to `warn` under `--quiet` and to `log` where no `warn` is given.
  - A page of the command's own is served its own page and the `.png` files of its own folder for that drawing alone, whatever earlier lines named, and cannot navigate away (`Drawing` in `draw/host.ts`). A `data:` picture is not shown.
  - Results opens an all-failed run on its first attempt and says why it failed, so `st run` keeps its `Open:` line there.
  - `SECURITY.md` says the cookie goes to every server on `127.0.0.1` the same browser opens, and that on Windows the server file and log are as private as the profile folder.

## Phase 2: compute what is known

- [ ] **2.1 `meets` from grading.** For each proposal and each answer read, `st propose` asks Jev what a grading will ask once the check is accepted, through the code the generic pack answers a check with (`statementQuestion` in `src/judges/generic/index.ts`, parts and joins included: export it, do not copy it), in one request a case, kept by `Asking` like its other questions. Where Jev is sure, its word is the proposal's `meets`, since that is what a grading will say; where it is not, Claude's word stays. A proposal whose faulty answer Jev is sure meets it says so in one line. What Claude is sent does not change, so no stored proposal is read again. With no key or `--no-jev`, as today. Test: a unit test with a fake Jev (a sure word replaces Claude's, an unsure one does not, the line shows); and replayed on the baseline, the count of answers where a sure Jev differs from Claude is written here.
- [ ] **2.2 Find quotes instead of refusing them.** `quoteHolds` (`src/domain/reading.ts`) already reads curly and straight quotes, spacing and line breaks alike, and takes a quote wherever it stands. Add a second reading, tried only when that one fails: hyphens and dashes alike, and three dots and `…` alike. It holds only when it finds exactly one place, and the stored quote is then the file's own words. Build it only if the baseline counts a refused quote it would have found; else close it with the count. Test: unit tests over each kind of mismatch, one that two places under the second reading still refuse, and one that every quote that holds today still holds.
- [ ] **2.3 Conflicts and sizes in code.** Where both readings are exact, code decides two rules conflict (two tests at `start` that ask for different fixed values) and works out whether a check's count can hold beside a rule's bound. Claude's answer is checked against it, and code wins where both readings are exact. Also: a new exact reading is held against the stored Jev answers and corrections for the same rule, and one that disagrees with a sure answer is flagged in the sort's last lines. Test: unit tests over readings from `fixtures/launch-note`, and `st sort` replayed on the baseline gives the baseline's kinds.
- [ ] **2.4 The phone question from the layout.** When the phone page was drawn and measured wider than its window, code answers the phone question no, and its answer stands. Jev is still asked, in the same words ([decision 1](#decisions)), and code's answer is kept beside Jev's as `PartAnswers.code` keeps one for a rule. A page that fits, or has no layout, is Jev's to answer as today. Test: a unit test with a layout wider than its window, and one that fits.
- [ ] **2.5 Recovery from the transcript.** The workflow pack answers "changed course after an error" in code where `metricsOf` settles it (no error, or the same call again after it), and that answer stands. Jev is still asked, in the same words, and its answer stands for the rest. Test: unit tests over three transcripts.
- [x] **2.6 Help me improve asks its own question.** The first time a step's question is put, it goes to the writer as `IMPROVE_STEPS` writes it (`ask` in `src/domain/improve.ts`), with no model call. A question put a second time is still the model's, since it says what the reply lacked. Those seven questions become words the app shows: hold each to [design/copy.md](design/copy.md) and list them in the report. Test: a fake provider counts no call on a step's first question, and one on its second.
  - Built (`8171433`): `firstAsk` in `src/domain/improve.ts` puts a question the first time with no model call. Measured by the test's fake provider: a question's first time costs 0 calls where it cost 1; a question put again and the draft still cost 1 each. A walk of seven questions answered at the first try costs 1 call where it cost 8.
  - Departures. The question is now shown as written, so five of the seven `ask` texts were reworded to [copy.md](design/copy.md): a bare "this" became "this rule", `complexity` asks "what follows from each outcome", and `file` names "the selected text", which is all its draft replaces. The same words go to Jev when it reads the reply and to the model when a question is put again; neither was measured live. A question that arrives whole is announced once to a screen reader (`nextHeard` in `src/renderer/motion.ts`), since it no longer streams inside the live item.
  - Unproven: no screen reader was run, and the panel was not looked at in the app.
- [x] **2.8 Fix with AI starts from the evidence.** The sheet (`FixSheet` in `src/domain/fix.ts`) holds the verdict, and for a fact code read, what code saw, so the model revises instead of searching. The revision is checked after with `openIn` and `keptQuestion`, and retried once when it still breaks the rule, as Auto refine is. Test: unit tests with a fake provider.
  - Built (`980416e`). The sheet's `<verdict>` says who marked the answer and, for a rule code read, each test and what code saw as JSON, capped at 8,000 characters with `<`, `>` and `&` escaped. The revision is checked with `openIn` and, with a key, `keptQuestion` through `verifyRewrites`, and written once more when a check finds something; the second is kept only when the checks find less in it, and never when Jev read the first and could not read the second.
  - Run live once on the six broken rules of a copy of `fixtures/launch-note` (4 marked by Jev, 2 by code): 9 model calls, 33,048 tokens in and 2,813 out, and 9 Jev requests at 10,860 tokens. Three revisions were sent back, each for "keep each rule walkable", and two of the three second tries were kept; the three retries took 13,398 of the input tokens. What the model is first sent grew from 28,979 to 31,907 characters over the six.
  - What it showed: both rules code marked were fixed at what code found (the word count, the line before the headline). The four Jev marked give the model no evidence, so its revision is still a guess; all four are the one quote rule. `keptQuestion` read a stricter word count as dropping part of the rule (0.26), a false alarm.
  - Departures. A fix is refused before any call when the answer now counts as meeting the rule or the rule is set aside: "This answer no longer counts as breaking this rule, so there is nothing to fix." The verdict is read on the server, so `ai.fix` takes what it took. The retry message leaves out the answer's files. What is still open after the retry is not shown. Stop now ends Jev's check of a reply at once in Fix with AI, Suggest changes and Auto refine.
  - Unproven: the refusal was not looked at in the app; one live try of each.
- [x] **2.10 Write with AI counts in code.** It counts the 50-word description in code and drops a proposed check a case has already (`sameWords`, then Jev's same-question check). Test: unit tests with a fake provider for each.
  - Built (`c38a063`), 35 tests with a fake provider and a fake Jev; nothing ran live. A description over 50 words, counted split on white space by the one `wordCount` the Improve panel shows (`src/domain/text.ts`), is sent back once and the shorter is kept: 2 model calls where there was 1, and 1 as before at 50 or fewer. A suggested check that matches one the case has by `sameWords`, or that Jev is sure asks the same question at the skill's own yes, is left out, and so is one the reply wrote twice; Jev is asked at most 40 questions a request (`QUESTIONS_PER_REQUEST`, shared with `st propose`).
  - Departures. The reply says how many checks were left out and why, in the muted text under those kept. Add leaves out a check the case has gained since the request. Stop after the first reply has arrived ends the run done with what stands, so the description or the checks can still be used. A description with no white space is never sent back on the count. Only the Write checks with AI list is covered, not the single check field. A Jev failure leaves nothing out.
  - Unproven: Jev's same-question answers for checks sent without the request's words were not measured, and the popover was not looked at in the app.
- [ ] **2.9 Edits as search and replace.** The chat may write an `edit` block: `~~~~ edit <path>`, the text to find, a line `~~~~ with`, the text to put in its place, and `~~~~` ([decision 3](#decisions)). When the reply ends, code applies each one to the file as it stands, only where the text is found exactly once, and hands the panel a `file` change with the whole new text, so the panel shows and applies it as it does today and nothing under `src/renderer` changes. Where the text is not found once, the same press asks the model once more for that file whole, with why, so no change fails quietly. Whole files still work. Test: parser and apply tests in `domain/changes.ts`, one with a code fence in the text to find, and a fake provider that sends a block whose text is not found gets one more request and its whole file is applied.

## Phase 3: Jev before Claude

- [ ] **3.1 `st read` asks Jev again first.** A fact Jev was not sure of is asked again with a narrower state: the part its join picks, the measured layout, what code saw. Only what is still between the thresholds goes to Claude, and a case with nothing left asks Claude nothing. Gate: live, once, on the baseline's two runs: agreement with the key over the facts Jev left does not drop, and Claude is sent fewer tokens.
- [x] **3.4 Parallel Jev requests.** Proposal questions go in parallel requests sized to the 64k context, not 40 at a time in series (`Asking.ask`). Same for any other caller that sends in series. Test: a fake Jev sees the requests overlap, and the answers come back in order.
  - Closed, not built: on the baseline all of `propose`'s Jev requests took 0.99 seconds of a 39-second `propose`, so sending them together would save under one second.
- [x] **3.3 Join proposals with fewer questions.** After 3.4, and only if joining still takes more than 5 seconds on the baseline; else close it with the number. Code first ranks pairs of proposals by shared words, and Jev is asked only about pairs code cannot settle. Gate: the same groups on the baseline, with fewer Jev questions.
  - Closed, not built: joining took 0.34 seconds on the baseline (4 requests, 138 questions), under the 5-second line.
- [ ] **3.5 A lasting cache for the rule judge.** `judgeRule`, `verifyRewrites` and `judgeAnswer` keep answers by a hash of state, question and model, as `src/application/judge-cache.ts` does for grading. Test: a second call with the same rule asks Jev nothing.
- [ ] **3.6 Show where code and a sure Jev disagree.** Jev is still asked every fact code answered ([decision 1](#decisions)). Where code's answer stands and Jev was sure of the other answer, the report and `--brief` say so, by rule or check, since that is where a code reading may be wrong. Test: a grading with a planted code reading that a sure Jev contradicts lists it, and one where they agree lists nothing.

## Phase 4: the acceptance run

- [x] **4.1 The React card experiment, from a chat.** Run as soon as chain A is merged ([order](#order)). An agent follows only the loop skill.
  - It makes `react-card` with three cases that each ask for one HTML page. An output's page loads nothing from the network (`artifactPolicy` in `src/application/api/artifact-page.ts`), so a page that takes React from a CDN draws blank. Each case gives React's browser files in its own files (React 18.3.1: `react.production.min.js` and `react-dom.production.min.js`, added with `st case add --file`). A case's files are staged under `files/` where the answer is written, and a kept attempt holds its `outputs/`. So each prompt asks for the two files to be copied into `outputs/`, beside the page, and loaded from there by name. The policy lets a page run a script file of its own (`script-src` names the page's own files).
  - It runs one case once on the smaller model and looks at the drawn page before anything else. A blank page means the files do not reach it: stop and fix the case. This is the one part of the run nobody has seen work.
  - It has two fresh agents write `SKILL.md` from the same brief, each in a folder of its own outside the skill, one after loading `emil-writing-skills`; runs both with `--from` and once without the skill; compares; makes the sheet; opens the pair with `st open`.
  - Record its tokens, its seconds and Claude usage for each step in this file. The run is not done the old way first: that would pay for the slow way once more only to have its number.
  - Run on 2026-11-26, on `main` at `aefd45e`, by one Opus 5.5 agent that read only the loop skill and `st --help`. It took about 7.5 minutes, every command worked on its first try, and React reached the page on the first try.

    | Step | Seconds | Tokens |
    | --- | --- | --- |
    | Build, key check, `st new`, React's two files | 4 | none |
    | Three cases with three checks and two files each, `case check` | 2 | none |
    | One case once, no skill, `haiku`, and its sheet | 23 | 198,047 answering, 16,312 grading |
    | Two writers, one after `emil-writing-skills` | 29 and 45 | 70,883 and 73,592 |
    | Draft a on three cases | 48 | 785,405 answering, 85,600 grading |
    | Draft b on three cases | 43 | 686,019 answering, 97,410 grading |
    | No skill on three cases | 72 | 1,103,386 answering, 49,333 grading |
    | Three compares, the sheet, `st open`, `--stop` | 3 or less each | none |

    The ten attempts cost $0.0985: answering read 2,772,857 tokens, nearly all from cache, and grading 248,655. The agent's own context ended near 70,000 tokens.
  - What it showed. All three runs met all nine checks, so no case told the versions apart: checks a person can see at a glance are too easy for `haiku` with or without a skill. Draft a had 4 or 5 of its 16 rules marked not sure on each case, and draft b 1 or 2 of its 20.
  - What the agent had to guess, now said in the skill: try a case with no skill when no draft is written yet; give each draft `--name` on whichever run is its first; a run's name holds the version's number and `st versions` maps it; leave the skill's own `SKILL.md` alone when drafts run with `--from`; `compare` takes two runs and `sheet` any number; `--out` keeps the sheets; `timing.json` holds the answer's cost alone.
  - What it showed that words in a skill do not fix, and what was built for the first three (`902fa2f` to `4e85e43`, built by one Opus 5.5 agent and checked by a fresh one):
    - A sheet's rows and a run's name said `v0`, `v1`, not the name the version was given. Each run is now named with its version wherever a reader sees it, `2026-11-20-skill-v1-claude-haiku (v1 · Second draft)`: the `Run:` line, the top of `report` and `compare`, above each report of `st grade`, and each row of a sheet. A run without the skill says `(without the skill)`. With `--json`, `run`, or `a` and `b`. A name prints as one line with no escape sequence, control character or direction override, and a name that is not text is no name.
    - `--brief` said "nothing missed" while rules were not sure. It now says `nothing missed, 1 of 16 rules and checks not sure`, and for `compare`, `rules and checks not sure: A 1 of 11, B 1 of 16`. It counts each rule or check once, where plain `report` counts by weight, and agrees with plain `report` on every stored run. A count that would take a case past 200 bytes is left out, and the line then does not say "nothing missed".
    - No command added up a run's tokens and cost. `report`, `compare` and `run` end with `Spent: 6 attempts, 111 s between them, 592,830 tokens in, 23,760 out, $0.0374; grading cost not kept`, and `spent` with `--json`. A grading keeps its calls in the run's `grading-cost.json` as each is made, so one that is stopped or writes no report is still counted. A run graded before this says its grading cost was not kept, never a zero.
    - Still open, for Miles to weigh: Jev read only the start of each of React's two files, on every attempt, and nothing says whether that changes a grading.
    - Measured: 2,383 tests. The largest `--brief` case is held to 200 bytes in the code as well as the test; a head line to 30 bytes beyond its names and a Spent line to 100 beyond its figures.
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
4. **Chain A and the acceptance run come first.** Chains B to E start after the React card experiment has run, two at a time. The thing the plan is for is reached first, and the baseline can close a later item before anyone builds it.
5. **Miles is walked through the code; he does not read diffs cold.** He does not know this part of the codebase yet, so at each point in [what Miles is shown](#what-miles-is-shown) the lead explains the code plainly, with the real lines beside the explanation. The lead's check alone approves nothing for merging.
6. **A replay holds Jev's answers as well as Claude's.** A replay then needs no key and no network, so the gates that replay the baseline run in `pnpm check` and on all three systems. The cost is a larger folder of replies in the repository.
7. **`st open` prints a one-use ticket, never the token.** A chat is kept and sent on, unlike a terminal. The cost is one new request on the server.
8. **Fable is spent only on judgment.** Opus 5.5 agents build, check and draft, which is where the tokens go. The lead hands out items, decides on departures, keeps this file, and reads the code itself only for the three foundations. The cost is a check made by the builder's own model, which the walkthroughs stand behind.

## Not in this plan

- An MCP server for `st`. The command line with `--json` and `--brief` gives an agent everything, and a server is one more thing to keep in step with the app.
- A desktop link scheme (`skill-studio://`). `st open` covers a chat; a link into the desktop app needs the main process to take a URL and a signed release, and can follow later.
- A comparison page drawn in chat in place of Results. Results is where corrections are made, and corrections are the ground truth.
- Asking Jev a rule's kind before `st sort` asks Claude. A sort sends about 200,000 tokens and gets back 14,000. Claude still needs every rule and case to find conflicts and write the tests, so settling a kind with Jev saves a few of the 14,000 and puts the kinds, which every score stands on, at risk.
- Taking "return it unchanged when nothing can go" out of Suggest changes. `withheld` only hides a rewrite that came back unchanged. Without the instruction the model changes a rule that needed no change, and nothing is hidden.
- Answering the rule judge's `strict` question from lint. It rides in one request with the judge's other questions, so leaving it out saves nothing, as in decision 1.
