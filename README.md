# skill-tester

[![ci](https://github.com/milesroxas/skill-tester/actions/workflows/ci.yml/badge.svg)](https://github.com/milesroxas/skill-tester/actions/workflows/ci.yml)

An eval harness for agent skills. It generates outputs with headless coding agents (Claude Code, Cursor's agent), grades them with code checks and [TypeSafe](https://typesafe.ai) Jev judge packs, and keeps the runs, reports and human reviews beside the skill in its `evals/` folder.

Most skill eval tools stop at pass/fail. skill-tester is built for subjective outputs (writing, HTML, agent process): judge answers are stored so you can reweight without new calls, a blind review queue calibrates the judges against your own ratings, and labelled anchors gate whether a judge pack can be trusted. [docs/landscape.md](docs/landscape.md) compares it with the other tools.

## Setup

Needs:

- Node 24 (the version it is tested on) and pnpm.
- A [TypeSafe](https://typesafe.ai) API key (`TYPESAFE_API_KEY`). Jev is the judge for every pack, so grading needs it. `--no-jev` exists for offline checks, but it leaves every judged layer null.
- The `claude` or `cursor-agent` CLI on your `PATH`, signed in, to generate outputs.

```
pnpm install
cp .env.example .env        # set TYPESAFE_API_KEY
```

## Quick start

```
pnpm start
```

This builds the app, starts it on http://localhost:4400 and opens it in your browser. It opens on the library: every skill in your user skills folders (`~/.agents`, `~/.claude`, `~/.cursor`, `~/.codex`) and in projects under `~/SITES` (change the folders under "Where skills are found"). From there the whole loop runs in the app:

1. **Library**: open a skill, or create one. A new skill is written to `.agents/skills/<name>` and linked into the agents you pick.
2. **Skill**: edit `SKILL.md` and `references/`; the side panel lists the rules a run is graded on.
3. **Cases**: write each task the agent gets, what a good answer does, and the checks the judge holds it to.
4. **Runs**: start a run with one or more agents and models, then read the scores per case and version.
5. **Review**: rate answers blind, compare two side by side, read transcripts.
6. **Bench**: see where your ratings and the judge disagree, and tune the scoring.

The button at the top right always names the next step. Install or uninstall a skill for Claude Code, Cursor or Codex from its row in the library.

### From the command line

For scripts and batch work, the CLI covers scaffolding, runs, grading and reports:

```
pnpm st new <skill-dir>                       # scaffold SKILL.md and evals/cases/
pnpm st cases <skill-dir>
pnpm st run <skill-dir> --engine claude --model sonnet --cases a,b --samples 2 --name "v0 first draft"
pnpm st report <skill-dir> --run <run-name>
pnpm exec vite build --config app/vite.config.ts
pnpm st serve <skill-dir>                     # API and review UI on http://127.0.0.1:4400
```

`pnpm st --help` lists every command and flag. A skill directory is any folder with a `SKILL.md`; the current directory is the default. To try it without writing a skill, point it at `fixtures/demo-skill`.

## What a skill needs

```
<skill>/
  SKILL.md                      rules are its top-level bullets (or `rules` in bench.json)
  references/                   snapshotted with SKILL.md as the skill's version
  evals/
    cases/<case>/prompt.md      front matter: tags, max_turns, timeout_seconds, allowed_tools
    cases/<case>/case.yaml      title, expected_outcome, bench: { artifact, words, evidence, judge, pack, kind }
    cases/<case>/graders/NN-*.md  one statement each, front matter: type, focus, weight
    cases/<case>/files/         input files the prompt names
    evals.json                  legacy skill-creator cases, read when no folder has the same id
    bench.json                  packs, weights, yes, sure, agreeAt, rules (optional; the UI writes it)
    anchors/*.md                labelled outputs for `st self-test`: front matter case, label, tests, about
    reviews.json                human ratings and pairwise votes (the UI writes it)
    runs/                       one directory per run, below
```

Case folders are the `claude plugin eval` layout. `fixtures/` holds three small skills with generated runs: `demo-skill` (generic pack), `code-skill` (code pack) and `design-skill` (design pack). All three also run the workflow pack.

## What a run holds

```
evals/runs/<date>-skill-<vN>-<engine>-<model>[-<effort>][-<configuration>]/
  run.json                      RunMeta: skill version and hash, writer, cases, per-sample cost and tokens
  report.json                   Report: raw pack answers and scores per sample, written by `st grade`
  _skill/                       SKILL.md and references as they were for this run
  <case>-s<n>/                  one sample: the agent's working directory
    prompt.md                   the exact prompt sent
    files/                      the case's input files
    .agents/skills/<name>/      the skill copy the agent saw (`.claude/skills` and `.cursor/skills` link to it)
    outputs/                    everything the agent produced; graded artifacts come from here
    notes.md                    what the agent would have told the user
    transcript.jsonl            TranscriptEvent per line: text, thinking, tool, result, error
    timing.json                 start, end, duration, cost, tokens, model
    agent.json                  exit state, error, the agent's last message
```

Skill versions come from a hash of `SKILL.md` and `references/`. A changed tree needs a name on its first run (`--name`), after that the version is reused. `--configuration without_skill` runs the same prompt with no skill in the workspace; `old_skill --baseline <run>` runs against that run's `_skill/` snapshot (SKILL.md and references only, so scripts are absent).

## Grading

`st grade` runs every pack in `bench.json` `packs` over each sample's primary artifact (the case's `bench.artifact` kind, else the first Markdown file) and writes `report.json`. Raw Jev answers are stored; thresholds and weights apply in `core/scoring.ts`, so the review tool can rescore from stored answers without new calls. `--no-jev` skips every TypeSafe call and leaves judged layers null. `--packs a,b` and `--bench <file>` override the skill's `bench.json` for one grading, so a skill in another repo can be graded without writing config into it.

A case's word range counts the copy only: prose and list units, not headings or code.

| Pack       | Judges                      | Layers (default points)                                                                  | Knobs in `bench.json`                                                                               |
| ---------- | --------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `generic`  | Markdown                    | adherence 50 (one Noul per skill rule), rubric 50 (one per grader statement)             | `rules`, `yes`                                                                                      |
| `writing`  | Markdown                    | lint 15, shape 15, structure 20, substance 25, tone 10, grounding 15                     | `lint`, `writingKind`, `warningCost`, `structure`, `substance`, `bands`, `groundingPrior`, `contradictionCap`, `writer`, `borrowed` |
| `code`     | code                        | check 60 (the case's `bench.check` exit code), review 40 (grader statements over the file) | `codeCheck.timeoutSeconds`, `codeCheck.maxChars`                                                   |
| `workflow` | the transcript, any sample  | efficiency 40, scope 20, process 40                                                      | `workflow.maxRetries`, `workflow.summaryLines`                                                      |
| `design`   | HTML, PNG or JPEG           | markup 40 (code checks), visual 60 (Jev over the HTML text or a screenshot)              | `design.maxChars`                                                                                   |

**Writing.** A port of the benchmark built for miles-brand-content, a private writing skill (the reference skill below). A case's `bench.kind` (article, linkedinPost, coverLetter, youtubeScript) picks the layers; shape applies to articles only. Grounding asks one Choice per factual claim against the nearest chunks of the case's `bench.evidence` files, and a contradiction counts only when a second literal question agrees. `writer` names who "I" is in the copy. `borrowed` lists case-insensitive patterns for lines the copy must not lift from a source; each match is a flag.

**Lint contract.** `lint.command` runs from the skill directory with the copy on stdin. `{kind}` in the command is replaced with the case's kind. It prints `{ "findings": [...] }` or a bare array of `{ severity: "error" | "warning" | "info", rule, message, excerpt? }`; the exit code is ignored. Any error scores lint 0 and each warning costs `warningCost`. With no command, a fallback lint flags em dashes and a word count outside the case's range. The reference skill's voice checker fits as is:

```json
{ "packs": ["writing"], "lint": { "command": "node scripts/check-voice.mjs --kind {kind} --format json" }, "writer": "Miles Roxas" }
```

**Code.** The check command runs in the sample directory, so it executes code the agent wrote. Run untrusted skills in a sandbox. Review reads the primary code file only, not a diff against the case's input files.

**Workflow.** Code counts tool calls, errors, identical repeated calls, time against the case's `timeout_seconds`, calls against `max_turns`, and absolute paths outside the sample. It checks that SKILL.md was read before the first write; a `without_skill` sample skips that check. Jev reads a one-line-per-step summary and answers whether the task was done and, after an error, whether the agent changed course. Legacy runs and anchors have no transcript and get no workflow layers.

**Design.** v1 does not render the page. The markup layer checks the document shell, landmarks, heading order, alt text and inline handlers. The visual layer asks about hierarchy and the case's graders over the HTML text, plus a "finished, nothing broken" question when the agent left a screenshot in `outputs/`.

**Parity.** Graded with `writing`, the reference skill's v2 run matches its original benchmark's report within 2 points on every layer and total, and its anchor self-test passes. The remaining gap is Jev's run-to-run variance on single claims, and word counts up to 2% higher where the tokenizer splits forms like "5/57".

## Server

`st serve` binds `127.0.0.1:4400` by default (`--port` changes it). It listens on loopback only and has no auth, so do not expose it. Routes take `?skill=<path|name>` when more than one skill is served.

The review UI lives in `app/`. `pnpm exec vite build --config app/vite.config.ts` writes `app/dist`, which `st serve` serves beside the API. `pnpm app` runs the Vite dev server on 4401 and proxies `/api` to 4400.

| Screen       | Does                                                                                    |
| ------------ | --------------------------------------------------------------------------------------- |
| Overview     | runs, versions and scores at a glance                                                   |
| Blind review | rate an output before its scores show, mark layers, reveal, promote it to an anchor     |
| Compare      | two outputs side by side, word diff, human and Jev votes, Bradley-Terry boards          |
| Insights     | your marks against the bench, per layer                                                 |
| Knobs        | rescore every output from stored answers, save `bench.json`                             |
| Edit skill   | edit `SKILL.md` and `references/`; a save is refused if the file changed on disk since  |
| Skill diff   | the working tree against any run's snapshot                                             |
| Transcript   | one sample's agent steps                                                                |
| Generate     | start runs and gradings as background jobs with live logs                               |

Artifacts are served with `Content-Security-Policy: sandbox` and shown in a sandboxed iframe, so HTML an agent wrote cannot run scripts on the API's origin.

| Route                                                                                   | Does                                                                                                                                            |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/skills`, `/api/state`                                                         | the served skills; cases, runs, versions, engines, config, reviews, anchors                                                                     |
| `GET /api/run?run=`, `/api/transcript?run=&sample=`, `/api/artifact?run=&sample=&file=` | one run; one transcript; one artifact served raw                                                                                                |
| `GET /api/skill-files?run=current\|<run>`                                               | the working tree or a run's snapshot                                                                                                            |
| `GET /api/queue`, `/api/leaderboard`, `/api/jobs`                                       | blind review order; Bradley-Terry boards and Jev/human agreement; background jobs                                                               |
| `POST /api/generate`, `/api/grade`, `/api/pairwise`                                     | start a job: `{cases, configs:[{engine,model,effort}], samples, configuration, baselineRun, skillName, note}`; `{run, jev}`; `{a, b, criteria}` |
| `POST /api/review`, `/api/preference`, `/api/config`, `/api/anchor`                     | save a rating; a human vote; `bench.json`; promote an output to an anchor                                                                       |
| `POST /api/skill-file`, `/api/skill-file/delete`                                        | write `{path, text, previous}` (refused when `previous` no longer matches the file); delete `{path}`. Only `SKILL.md` and `references/**`       |

## Engines

- **claude**: `claude -p --output-format stream-json --setting-sources project --strict-mcp-config --permission-mode acceptEdits`. Only the sample directory's own settings load, so the machine's skills, CLAUDE.md and MCP servers stay out of the run. The `CLAUDECODE` guard variable is dropped so `st` works from inside a Claude Code session. Models: sonnet, opus, haiku, fable; efforts low to max. A case's `max_turns` is not mapped (the CLI no longer has the flag).
- **cursor**: `cursor-agent -p --output-format stream-json --force --trust`. Needs `cursor-agent login` or `CURSOR_API_KEY`. The CLI has no setting-source switch, so a run sees the user's `~/.cursor/skills`. Effort rides on the model string (`model[effort=high]`). The adapter is untested against a live account; the stream parser reads each `tool_call` event's single key as the tool name.

Isolation is by convention: the skill copy omits `evals/`, and the prompt forbids reading outside the sample directory, but nothing stops an agent that follows an absolute path.

## Development

```
pnpm check        # typecheck, Biome, tests (what CI runs, plus pnpm build)
pnpm test:watch   # vitest in watch mode
pnpm format       # Biome formatting and safe fixes
```

Tests need no API key, network or agent CLI. Biome skips Markdown on purpose: its Markdown formatter misreads YAML front matter. Generated eval data (`evals/runs`, reviews, anchor reports) is excluded too.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the layout and test conventions, and [SECURITY.md](SECURITY.md) before running skills you did not write.

## License

[MIT](LICENSE)
