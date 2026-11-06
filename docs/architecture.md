# Architecture

One table of operations serves the desktop app and the web server. [`src/application/api/contract.ts`](../src/application/api/contract.ts) names each operation with its input and output, and `operations.ts` beside it checks the input and runs it. The desktop app calls the table over IPC and `st serve` exposes it as `POST /api/<name>`, so an operation added once reaches both. The CLI has its own fixed commands, which call the same application functions.

## Layers

```
src/
  domain/          pure: schemas, read models, scoring, stats, text. No I/O
  judges/          the judge packs, one folder each, and the Jev client
  application/     use cases (generate, grade, jobs, the assistant) and the operations table
  infrastructure/  files on disk, the engines, the assistant's providers, the environment
  interfaces/
    electron/      main process, preload bridge, backend utility process
    http/          `st serve`: the table over HTTP, the request guard, Tailscale
    cli/           the `st` command
  renderer/        the React app; reaches the table through a transport (IPC or HTTP)
    components/ui/   shadcn/ui sources (Radix + Tailwind v4), owned by the repo
    components/      the app's composites built on them
    screens/         one file per screen
```

Imports point inward only, and `pnpm fallow` fails on one that does not (`boundaries` in `.fallowrc.json`):

| Layer | May import |
| --- | --- |
| `domain` | nothing |
| `judges` | `domain` |
| `infrastructure` | `domain`, `judges` |
| `application` | `domain`, `judges`, `infrastructure` |
| `interfaces` | all of the above |
| `renderer` | `domain`, `judges`, and types from `application` |

## The desktop app

- Operations run in a backend utility process, not the main process, so the window never waits on a file read, a hash or an agent.
- Job changes and assistant replies are pushed to the window as they happen. A browser polls instead.
- The renderer reaches the main process through one preload bridge (`window.studio`), with one function per message.
- The packaged app loads its pages from `studio://app/`, a sample's files from `artifact://sample?...` and a picture from `artifact://image?...`.
- A key in the environment at launch wins over a stored one. A stored Anthropic or OpenAI key reaches the backend under a name of the app's own (`SKILL_STUDIO_ANTHROPIC_API_KEY`, `SKILL_STUDIO_OPENAI_API_KEY`), so an agent the app starts does not bill a key stored for the assistant.

[SECURITY.md](../SECURITY.md) covers the hardening, and [cli.md](cli.md#the-web-server) the web server.

## Engines

An engine runs one agent CLI in a sample directory (`src/infrastructure/engines/`).

- **claude**: `claude -p --output-format stream-json --setting-sources project --strict-mcp-config --permission-mode acceptEdits`, with `--allowedTools` set from the case's `allowed_tools` (by default Read, Write, Edit, Glob, Grep and Bash). Only the sample directory's own settings load, so the machine's skills, `CLAUDE.md` and MCP servers stay out of the run. Variables starting with `CLAUDECODE` are dropped, so a run works from inside a Claude Code session. Models: sonnet, opus, haiku, fable. Efforts: low to max.
- **cursor**: `cursor-agent -p --output-format stream-json --force --trust`. It needs `cursor-agent login` or `CURSOR_API_KEY`. Models come from `cursor-agent --list-models`, and effort rides on the model string (`model[effort=high]`). The CLI has no setting-source switch, so a run sees the user's `~/.cursor/skills`. This adapter has not been run against a live account.

Isolation is by convention. The skill copy omits `evals/` and the prompt forbids reading outside the sample directory, but nothing stops an agent that follows an absolute path.

## The assistant

Four providers sit behind one port (`src/infrastructure/ai/`). The model in use is a preference, so every control shows the same one.

- **anthropic**: the Anthropic SDK with your key. Replies stream, and a field's shape is enforced with structured outputs. Requests to Fable 5, Opus 5 and Sonnet 5.5 models opt in to Anthropic's server-side fallback, so a request a safety classifier declines is retried on the model Anthropic recommends.
- **claude-code**: `claude -p` with no tools, settings or skills, on the plan the CLI is signed in to. The shape goes in as `--json-schema`.
- **openai**: the OpenAI SDK (Responses API) with your key, with a strict JSON schema for the shape.
- **codex**: `codex exec --json` in a read-only sandbox, on the plan the CLI is signed in to. It reports a reply whole, not word by word.

Only `claude-code` has been run against a live account.

Each text area is one kind of field (`src/domain/assist.ts`). A kind states the shape its text has, built from the same rule guidance the editor shows. The reply is one JSON object holding that text, fitted to the field before it is shown.
