# Skill Studio

[![ci](https://github.com/milesroxas/skill-studio/actions/workflows/ci.yml/badge.svg)](https://github.com/milesroxas/skill-studio/actions/workflows/ci.yml)

A desktop studio for agent skills. Write a skill, give it cases, run headless coding agents (Claude Code, Cursor's agent) on them, grade the outputs with code checks and [TypeSafe](https://typesafe.ai) Jev judge packs, and review them blind. Runs, reports and your ratings live beside the skill in its `evals/` folder.

Most skill eval tools stop at pass/fail. Skill Studio is built for subjective outputs (writing, HTML, agent process): judge answers are stored so you can reweight without new calls, a blind review queue calibrates the judges against your own ratings, and labelled anchors gate whether a judge pack can be trusted.

New here? [docs/guide.md](docs/guide.md) walks one skill through the whole loop, step by step. The same guide opens from Guide at the foot of the app's sidebar.

## Setup

Needs:

- Node 24 and pnpm, to build and to use the CLI. The packaged app needs neither: Electron carries its own Node. Download it for macOS, Windows or Linux from [Releases](https://github.com/milesroxas/skill-studio/releases).
- A [TypeSafe](https://typesafe.ai) API key. Jev is the judge for every pack, so grading needs it. Add it under Settings in the app, which keeps it in the system keychain, or set `TYPESAFE_API_KEY` in the environment (a `.env` in the checkout works for development). Without it grading runs code checks only and leaves every judged layer null.
- The `claude` or `cursor-agent` CLI on your `PATH`, signed in, to generate outputs.
- Optional, to write with AI: an Anthropic or OpenAI API key (added under Settings, or `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` in the environment), or the `claude` or `codex` CLI signed in to your plan.

```
pnpm install
```

## Quick start

```
pnpm dev
```

This starts the desktop app against the dev server, with hot reloading. `pnpm build && pnpm start` runs the built app; `pnpm dist` packages it with electron-builder into `dist/`.

The app opens on the library: every skill in your user skills folders (`~/.agents`, `~/.claude`, `~/.cursor`, `~/.codex`) and in projects under your workspace folders (`~/SITES` by default, when it exists; change them under "Where skills are found", saved in `~/.skill-studio/library.json`). From there the whole loop runs in the app:

1. **Library**: open a skill, or create one. A new skill is written to `.agents/skills/<name>` and linked into the agents you pick.
2. **Write** and **Versions**: edit `SKILL.md` and `references/` (the side panel lists the rules a run is graded on), then save the files as a named version you can compare and restore. Unsaved edits are kept as drafts in `~/.skill-studio/drafts/` until you save or discard them.
3. **Cases**: write each task the agent gets, what a good answer does, and the checks the judge holds it to.
4. **Runs**: start a run with one or more agents and models, then read the scores per case and version.
5. **Review**: rate answers blind, compare two side by side, read transcripts.
6. **Bench**: see where your ratings and the judge disagree, and tune the scoring.

The sidebar holds every screen of the open skill, with counts and unsaved marks beside them; Cmd+K switches skill from anywhere. When a step is due, a Next button at the top right names it. Install or uninstall a skill for Claude Code, Cursor or Codex from its row in the library.

### In a browser, or from another device

The same app also runs as a local web server, for a browser on this machine or, with [Tailscale](https://tailscale.com) on both devices, from your phone:

```
pnpm build
pnpm st serve                 # http://localhost:4400
pnpm st serve --tailscale     # also https://<this-machine>.<tailnet>.ts.net:8443
```

Only your own Tailscale login gets in: the server checks the user Tailscale signed the request in as, so other people on a shared tailnet, tagged devices and Funnel traffic are refused (`--tailscale-port` changes the port). The tailnet address goes away when the server stops. In a browser the Jev key comes from the environment only; the keychain belongs to the desktop app.

### From the command line

For scripts and batch work, the CLI covers scaffolding, runs, grading and reports:

```
pnpm st new <skill-dir> --template code --with-cases   # scaffold from a template, with sample cases
pnpm st cases <skill-dir>
pnpm st run <skill-dir> --engine claude --model sonnet --cases a,b --samples 2 --name "v0 first draft"
pnpm st report <skill-dir> --run <run-name>
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
    versions/<vN>/              a version saved by hand: version.json (name, note, hash, date) and files/
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

Skill versions come from a hash of `SKILL.md` and `references/`. Save one by hand in the app (it lands in `evals/versions/`), or let a run name it: a changed tree needs a name on its first run (`--name`), after that the version is reused. Saved and run versions share one numbering. `--configuration without_skill` runs the same prompt with no skill in the workspace; `old_skill --baseline <run>` runs against that run's `_skill/` snapshot (SKILL.md and references only, so scripts are absent).

## Grading

`st grade` runs every pack in `bench.json` `packs` over each sample's primary artifact (the case's `bench.artifact` kind, else the first Markdown file) and writes `report.json`. Raw Jev answers are stored; thresholds and weights apply in `src/domain/scoring.ts`, so the review tool can rescore from stored answers without new calls. `--no-jev` skips every TypeSafe call and leaves judged layers null. `--packs a,b` and `--bench <file>` override the skill's `bench.json` for one grading, so a skill in another repo can be graded without writing config into it.

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

**Design.** v1 does not render the page. The markup layer checks the document shell, landmarks, heading order, alt text and inline handlers. The visual layer asks about hierarchy and the case's graders over the HTML text, plus a "finished, nothing broken" question when the agent left a screenshot in `outputs/`. A screenshot outside the sizes Jev reads (280 to 1568 px a side) is left out and flagged, and the HTML is still judged.

**Pictures.** Jev's image input is a preview: a request that holds a picture is sent with the `TypeSafe-Danger-Zone-Images: true` header, and no other request is. A case's pictures (the PNG and JPEG files in its `files/`) go in state once as `request_images`, beside `request`. A grader with `image: references/<file>` in its front matter is asked with that picture in its own instructions. Each picture is checked against Jev's limits first, because Jev fails the whole request for one it refuses.

**Pairwise votes.** `skill.pairwise` sends Jev both outputs with the case's prompt, the skill's current rules and the case's graders. The first active pack that judges the output's kind casts the vote, and it compares text. The design pack also compares screenshots, when both outputs have one Jev can read. A Jev vote with confidence under `sure` is kept in `reviews.json` and left off the leaderboard and the agreement count.

**Parity.** Graded with `writing`, the reference skill's v2 run matches its original benchmark's report within 2 points on every layer and total, and its anchor self-test passes. The remaining gap is Jev's run-to-run variance on single claims, and word counts up to 2% higher where the tokenizer splits forms like "5/57".

## How it is built

One operations table serves every interface. `src/application/api/contract.ts` names each operation with its input and output; `operations.ts` checks the input and runs it. The desktop app calls the table over IPC, `st serve` exposes it as `POST /api/<name>` with a JSON body, and the CLI calls the same application functions directly. A new operation is added once and reaches all three.

```
src/
  domain/          pure: schemas, read models, scoring, stats, Bradley-Terry, text. No I/O
  judges/          the judge packs and the Jev client; one folder per pack
  application/     use cases (generate, grade, jobs) and the operations contract and table
  infrastructure/  files on disk: cases, runs, reviews, the library, skill files; engines; env
  interfaces/
    electron/      main process, preload bridge, backend utility process
    http/          `st serve`: the table over HTTP, the localhost guard, Tailscale
    cli/           the `st` command
  renderer/        the React app; reaches the table through a transport (IPC or HTTP)
    components/ui/   shadcn/ui sources (Radix + Tailwind v4), owned by the repo
    components/      the app's composites built on them: the shell, screens, workbench columns, form sections, text roles
    screens/         one file per screen
```

The layers only point inward, and `fallow` enforces that (`.fallowrc.json`): the domain imports nothing, judges and infrastructure import the domain, the application imports those, and the interfaces and renderer sit on top.

### The desktop app

- The operations run in a backend utility process, not in the main process, so the window never waits on a file read, a hash or an agent. Job changes are pushed to the window; a browser polls instead.
- The renderer reaches the main process through one preload bridge (`window.studio`) with one function per message.
- Pages load from `studio://app/`; a sample's files load from `artifact://sample?...`.
- A key in the environment at launch wins over a stored one. A stored Anthropic or OpenAI key reaches the backend under a name of the app's own (`SKILL_STUDIO_ANTHROPIC_API_KEY`), never as `ANTHROPIC_API_KEY`, so an agent the app starts does not bill a key you stored for the assistant.
- An assistant reply is pushed to the window as it grows, the same way job changes are; a browser polls a running reply.

[SECURITY.md](SECURITY.md) covers the hardening: the sandbox, the origin check on IPC, the Content Security Policies, key storage and what the app refuses.

### The web server

`st serve` binds `127.0.0.1:4400` by default (`--port` changes it). It listens on loopback only and has no login of its own, so do not expose it any other way than `--tailscale` (above). Every request must be addressed to `localhost` (or, with `--tailscale`, come through Tailscale as your login), come from the app's own pages, and send POST bodies as JSON. The built renderer (`out/renderer`) is served beside the API.

Every operation is `POST /api/<name>` with its input as the JSON body; operations on a skill take `skill` (its path) in the body. The artifact operation is also `GET /api/artifact?skill=&run=&sample=&file=`, served raw with `Content-Security-Policy: sandbox; script-src 'none'`.

| Operations                                                                            | Do                                                                                                                                        |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `library.skills`, `library.scan`                                                      | the open skills; every skill on the machine, the places it is in, and the workspace folders scanned                                        |
| `library.create`, `library.link`, `library.unlink`                                    | create `{scope, name, description, agents}` and open it; link or unlink `{path, agent, scope}` into an agent's skills folder               |
| `library.practice`                                                                    | open the practice skill, written with its cases to `~/.skill-studio/practice/` the first time                                              |
| `library.workspaces`, `library.mark`                                                  | set the folders to scan `{workspaces}`; list a skill with installed ones `{path, theirs}`                                                 |
| `jobs.list`, `settings.read`, `settings.key`                                          | background jobs; where each key (`jev`, `anthropic`, `openai`) comes from; store one `{id, value}` (desktop app only)                      |
| `ai.status`, `ai.usage`                                                               | the four ways to reach a model, which are connected and the models each offers; requests and tokens today and over 30 days                 |
| `ai.assist`, `ai.run`, `ai.stop`                                                      | start writing one field `{field, instruction, current, context}`, in that field's shape; read a reply `{id}` as it grows; stop it          |
| `chat.read`, `chat.send`, `chat.clear`                                                | the Assistant panel's conversation, kept in `~/.skill-studio/chat.json`; add a message `{skill, text, screen}` and start the reply         |
| `preferences.read`, `preferences.write`                                               | your theme, motion and editor view, kept in `~/.skill-studio/preferences.json`; write `{preferences}`                                      |
| `skill.state`                                                                         | cases, runs, versions, engines, config, reviews, anchors                                                                                  |
| `skill.run`, `skill.transcript`, `skill.artifact`, `skill.files`                      | one run `{run}`; one transcript `{run, sample}`; one artifact `{run, sample, file}`; the skill's files `{source}`: `current`, a version (`v2`) or a run |
| `skill.saveVersion`, `skill.restoreVersion`                                           | save the files as the next version `{name, note}`; put a version's files back `{version, force}` (refused without `force` when the files are no version) |
| `skill.drafts`, `skill.saveDrafts`                                                    | unsaved file and case edits, kept in `~/.skill-studio/drafts/` `{drafts}`                                                                |
| `skill.queue`, `skill.leaderboard`                                                    | blind review order; Bradley-Terry boards and Jev/human agreement                                                                          |
| `skill.generate`, `skill.grade`, `skill.pairwise`                                     | start a job: `{cases, configs:[{engine,model,effort}], samples, configuration, baselineRun, skillName, note, grade}`; `{run, jev}`; `{a, b, criteria}` |
| `skill.review`, `skill.preference`, `skill.config`, `skill.anchor`                    | save a rating `{key, review}`; a human vote `{a, b, criterion, vote}`; `bench.json` `{config}`; promote an output to an anchor             |
| `skill.saveCase`, `skill.deleteCase`                                                  | save `{case, isNew}`, validated before it writes; delete `{id}`                                                                           |
| `skill.saveFile`, `skill.deleteFile`                                                  | write `{path, text, previous}` (refused when `previous` no longer matches the file); delete `{path}`. Only `SKILL.md` and `references/**` |

## Engines

- **claude**: `claude -p --output-format stream-json --setting-sources project --strict-mcp-config --permission-mode acceptEdits`. Only the sample directory's own settings load, so the machine's skills, CLAUDE.md and MCP servers stay out of the run. The `CLAUDECODE` guard variable is dropped so a run works from inside a Claude Code session. Models: sonnet, opus, haiku, fable; efforts low to max. A case's `max_turns` is not mapped (the CLI no longer has the flag).
- **cursor**: `cursor-agent -p --output-format stream-json --force --trust`. Needs `cursor-agent login` or `CURSOR_API_KEY`. The CLI has no setting-source switch, so a run sees the user's `~/.cursor/skills`. Effort rides on the model string (`model[effort=high]`). The adapter is untested against a live account; the stream parser reads each `tool_call` event's single key as the tool name.

Isolation is by convention: the skill copy omits `evals/`, and the prompt forbids reading outside the sample directory, but nothing stops an agent that follows an absolute path.

## The assistant

Four providers sit behind one port (`src/infrastructure/ai/`), and the model in use is a preference, so every control shows the same one.

- **anthropic**: the Anthropic SDK with your key. Replies stream; a field's shape is enforced with structured outputs; models and the effort levels each takes come from the Models API. Requests to Claude Fable 5, Opus 5 and Sonnet 5.5 opt in to Anthropic's server-side fallback, so a request a safety classifier declines is retried on the model Anthropic recommends instead of failing.
- **claude-code**: `claude -p` with no tools, settings or skills, on the plan the CLI is signed in to. The shape goes in as `--json-schema`.
- **openai**: the OpenAI SDK (Responses API) with your key, with a strict JSON schema for the shape. Untested against a live account.
- **codex**: `codex exec --json` in a read-only sandbox, on the plan the CLI is signed in to. Untested against a live install; it reports a reply whole, not word by word.

Each text area is one kind of field (`src/domain/assist.ts`). A kind states the shape its text has, built from the same rule guidance the editor shows, and the reply is one JSON object holding that text, fitted to the field before it is shown.

## Development

```
pnpm check        # typecheck, Biome, fallow, tests (what CI runs, plus pnpm build)
pnpm test:watch   # vitest in watch mode
pnpm format       # Biome formatting and safe fixes
pnpm fallow       # unused code, duplicate exports and layer boundaries
pnpm guide:shots  # retake the guide's screenshots from sample skills in a scratch home
```

Tests need no API key, network or agent CLI. Biome skips Markdown on purpose: its Markdown formatter misreads YAML front matter. Generated eval data (`evals/runs`, reviews, anchor reports) is excluded too.

See [CONTRIBUTING.md](CONTRIBUTING.md) for test conventions, where a change belongs and how a release is cut, and [SECURITY.md](SECURITY.md) before running skills you did not write.

## License

[MIT](LICENSE)
