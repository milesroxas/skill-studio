# Architecture

One table of operations serves the desktop app and the web server. [`src/application/api/contract.ts`](../src/application/api/contract.ts) names each operation with its input and output, and `operations.ts` beside it checks the input and runs it. The desktop app calls the table over IPC and `st serve` exposes it as `POST /api/<name>`, so an operation added once reaches both. The CLI has its own fixed commands, which call the same application functions.

## Layers

```
src/
  domain/          pure: schemas, read models, scoring, stats, text. No I/O
  judges/          the judge packs (generic, writing, code, workflow, design), one folder each, and the Jev client
    rule/            the judge behind the editor's selection popout; not a pack
    shared/          what the packs share: Jev questions, scoring helpers, running a check or lint command
  application/     use cases (generate, grade, jobs, the assistant) and the operations table
  infrastructure/  files on disk, the environment
    engines/         the agent CLIs: claude, cursor
    ai/              the assistant's providers
  interfaces/
    host.ts        the checkout's paths for the CLI and `st serve`: `.env` and `out/renderer`
    electron/      main process, preload bridge, backend utility process
    http/          `st serve`: the table over HTTP, the request guard, Tailscale
    cli/           the `st` command
  renderer/        the React app; reaches the table through a transport (IPC or HTTP)
    components/ui/   shadcn/ui sources (Radix + Tailwind v4), owned by the repo
    components/      the app's composites built on them
    editor/          CodeMirror: the Markdown language, the theme, the live preview
    lib/             `cn`, the class-name helper
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
- An app opened from the Finder or the Dock gets the system's bare PATH (`/usr/bin:/bin:/usr/sbin:/sbin`), where no CLI in the home folder or Homebrew is found. The main process starts the backend with `~/.local/bin`, `/opt/homebrew/bin` and `/usr/local/bin` added, then reads the login shell's PATH (`$SHELL -ilc`, five seconds at most) and hands it to the backend with `setEnv` (`src/infrastructure/path.ts`). Home is `os.homedir()`, which reads `HOME` as the Claude Code installer does.
- Job changes and assistant replies are pushed to the window as they happen. A browser polls instead.
- The renderer reaches the main process through one preload bridge (`window.studio`), with one function per message.
- The packaged app loads its pages from `studio://app/`, a sample's files from `artifact://sample?...` and a picture from `artifact://image?...`.
- A key in the environment at launch wins over a stored one. A stored Anthropic or OpenAI key reaches the backend under a name of the app's own (`SKILL_STUDIO_ANTHROPIC_API_KEY`, `SKILL_STUDIO_OPENAI_API_KEY`), so an agent the app starts does not bill a key stored for the assistant.

[SECURITY.md](../SECURITY.md) covers the hardening, and [cli.md](cli.md#the-web-server) the web server.

## The loop in the renderer

A skill has three screens (`SKILL_PLACES` in `src/renderer/places.ts`), one per step of the loop that is a place:

- **Skill** (`screens/Editor.tsx`) edits `SKILL.md` and `references/`, and lists the versions. A version opens in the main column (`components/VersionDetail.tsx`) with its changes and Restore.
- **Cases** (`screens/Cases.tsx`) edits the cases a run is made of. A case needs a prompt only.
- **Results** (`screens/Results.tsx`) lists the cases a run answered and compares two outputs of the one picked (`components/Comparison.tsx`). "All cases" is every run at once (`components/ResultsSummary.tsx`), with Scoring folded at its foot (`components/Scoring.tsx`).

Running is a button in the top bar, not a screen (`components/Run.tsx`): it calls `skill.generate`, which keeps the files as the next version when they changed since the last run.

Two things a reader says are kept, both in `evals/reviews.json` and both written from Results:

- A **pick** between two outputs (`skill.pick`). `src/domain/picks.ts` chooses the pair a case opens with, the latest version beside the one before it by the same writer, and says how a pick stands against the two scores.
- A **correction** to one verdict (`skill.correct`). Every pack's scorer reports the facts it counted (`Verdict` in `src/domain/pack.ts`) and takes the reader's corrections, so a score follows a correction with no new call to Jev. [grading.md](grading.md#verdicts) has the details.

A retired screen's address opens the screen its work moved to (`MOVED_SCREENS` in `src/domain/preferences.ts`).

## Engines

An engine runs one agent CLI in a sample directory (`src/infrastructure/engines/`).

- **claude**: `claude -p --output-format stream-json --verbose --no-session-persistence --strict-mcp-config --setting-sources project --permission-mode acceptEdits`, with `--allowedTools` set from the case's `allowed_tools` (by default Read, Write, Edit, Glob, Grep and Bash). Only the sample directory's own settings load, so the machine's skills, `CLAUDE.md` and MCP servers stay out of the run. Variables starting with `CLAUDECODE` are dropped, so a run works from inside a Claude Code session. Models: sonnet, opus, haiku, fable, and default (the CLI's own, with no `--model` flag). Efforts: low to max.
- **cursor**: `cursor-agent -p --output-format stream-json --force --trust`. It needs `cursor-agent login` or `CURSOR_API_KEY`. Models come from `cursor-agent --list-models`, and effort rides on the model string (`model[effort=high]`). The CLI has no setting-source switch, so a run sees the user's `~/.cursor/skills`. This adapter has not been run against a live account.

Isolation is by convention. The skill copy omits `evals/` and the prompt forbids reading outside the sample directory, but nothing stops an agent that follows an absolute path.

## The assistant

Four providers sit behind one port (`src/infrastructure/ai/`). The model in use is a preference, so every control shows the same one. Each vendor's CLI is the main way in and its API key a supported second: `AI_PROVIDER_IDS` lists the CLI first, which is the order of every model list and of the default when nothing is chosen, and Settings folds the key behind "Use an API key" (`VendorRoutes`).

- **anthropic**: the Anthropic SDK with your key. Replies stream, and a field's shape is enforced with structured outputs. Requests to Fable 5, Opus 5 and Sonnet 5.5 models opt in to Anthropic's server-side fallback, so a request a safety classifier declines is retried on the model Anthropic recommends.
- **claude-code**: `claude -p` with no tools, settings or skills, on the plan the CLI is signed in to. The shape goes in as `--json-schema`. One exception: a chat message that starts with `/name` is a command. That run loads the user's settings (`--setting-sources user`, so the user's hooks run too) and keeps slash commands on, the message goes in as the whole prompt so the CLI expands the skill as a terminal would, and the earlier turns go into the system prompt as context. Tools stay off, so a skill that needs one cannot use it. Each CLI adapter asks its CLI how it is signed in: `claude auth status --json` and `codex login status`. That is all the app does to a login. It runs the CLI as its maker publishes it, on whatever account the person signed it in to, with their environment passed through unchanged. It never installs a CLI, never runs `claude auth login`, `claude setup-token` or `codex login`, and never reads a token, a credentials file or the keychain entry a CLI keeps. A CLI that says it is signed out offers no models, and Settings and the welcome show the maker's own command (`signInCommand`, and `installCommand` for a CLI that is missing) with **Copy command** and **Check again**. The person runs it in their own terminal, and the row follows when the window gets the focus back. This is the line Anthropic draws: a person may sign in to the unmodified Claude Code with their own account, and a product may not offer Claude.ai login itself, handle its credentials, or use the Claude Code or Anthropic names in a feature name or a logo ([legal and compliance](https://code.claude.com/docs/en/legal-and-compliance)). So the app says in plain text that it runs Claude Code, and no control here is named "Sign in with Claude" or carries a vendor's mark. The status also says what pays (`CliAccount.billing`): a plan, or an API key the CLI found in its environment, which `claude -p` uses ahead of any plan. Settings shows which, so a key is never taken for a plan. A CLI too old to answer counts as signed in.
- **openai**: the OpenAI SDK (Responses API) with your key, with a strict JSON schema for the shape.
- **codex**: `codex exec --json` in a read-only sandbox, on the plan the CLI is signed in to. It reports a reply whole, not word by word.

Only `claude-code` has been run against a live account. A command with pictures attached has not been run live.

The side panel's slash menu lists the panel's own commands first (`src/renderer/commands.ts`: clear, settings and guide, run in the page and never sent) and then the skills Claude Code can invoke (`src/domain/commands.ts`, `src/infrastructure/ai/commands.ts`), through `ai.commands`. Only the CLI knows the whole list, with every plugin and every override, and it prints the list in the `init` event of a run before the model is asked. The lister starts such a run and ends it as soon as that event arrives, so a request to the model is at most cut off as it starts, then reads each skill's description from its file (`~/.claude/skills`, `~/.claude/commands`, or the plugin's folder, under `CLAUDE_CONFIG_DIR` when set). The list is kept for five minutes. The other providers offer no commands, and the menu does not open on them.

### Changes from the side panel

The side panel's assistant can propose changes to the open skill: a whole file (SKILL.md or one under `references/`), a case to add or replace, and a version to save. The model writes each one as a block fenced with four tildes, so a code fence inside a SKILL.md cannot end it early. `src/domain/changes.ts` holds the format: the brief that teaches it (`CHANGES_GUIDE`, part of `chatSystem`) and the parser that reads it (`replyParts`). The panel (`src/renderer/components/Change.tsx`) shows each block as a diff, a case or a version, with one button; how a row stands against the skill, what it says and whether applying it would lose unsaved work, is worked out in `src/renderer/changes.ts`, which is tested.

The assistant reads the skill as the writer has it, not as saved. `chat.send` carries the screen and what is open on it (the Editor's file, the case on Cases: `openAt` in `src/renderer/route.ts`, the same reading those screens use), and the backend lays the skill's stored drafts over its saved files and cases (`workingSkill` in `src/domain/assist.ts`). The drafts on disk are the one copy of unsaved work: the panel stores any still waiting before it sends (`Drafts.flush`), so a keystroke made just before is read. SKILL.md is read whole, and reference files in full up to `REFERENCE_BUDGET` characters, the open one first. A file change shows against the writer's unsaved text when there is some.

Nothing is written until the writer clicks. The button calls the operations the Skill and Cases screens call (`skill.saveFile`, `skill.saveCase`), and `skill.saveVersion` for a version, so the backend checks the path, the id and the file's text on disk as it does for them, and the status line offers Undo. A reply is marked with the path of the skill it was written about (`ChatMessage.skill`), and its changes are offered only while that skill is open. Whether a change is applied is read from the skill as it stands, never stored.

Each text area is one kind of field (`src/domain/assist.ts`). A kind states the shape its text has, built from the same rule guidance the editor shows. The reply is one JSON object holding that text, fitted to the field before it is shown.

### Improving a selected rule

Selecting four or more words in SKILL.md opens a popout with three actions. Code owns each workflow; a generative model only writes prose.

1. `src/domain/lint.ts` checks the selection by word lists and counts: hedge words, outcome adjectives, a missing number or absolute, a missing reason, a definition, nested bullets, piled conditions, words per rule, and the file's size band. Free and instant.
2. `src/judges/rule/index.ts` asks Jev one request over the rule and two lines either side: a yes/no per principle (`RULE_GUIDE`) and a complexity score. `src/domain/improve.ts` turns the probabilities into findings (holds above 0.7, drifts below 0.3, a maybe between). Without a TypeSafe key only step 1 runs.
3. Only then a model is asked, with the findings as its brief:
   - **Auto refine** (`ai.refine`) asks for one revision when anything drifts, and for nothing when the rule complies.
   - **Suggest changes** (`ai.rewrites`) asks for three rewrites in one reply, then has Jev check each kept the selection's facts and that the best practice one now holds every principle. The finished run's text is the `RewritesResult` as JSON.
   - **Help me improve** (`improve.*`) is a conversation in the side panel. The questions live in `IMPROVE_STEPS`, in a fixed order; the plan skips those the judge already cleared. After each reply Jev says whether the question was answered, and code moves on or asks once more. The draft is the last fenced block of the model's reply, and Jev's reading of it is the checklist under it. One button puts it where the selection was, through the editor's registered replacer (`src/renderer/replace.ts`).

The run kinds `refine`, `rewrites` and `improve` sit beside `assist` and `chat` in `src/domain/ai.ts`.
