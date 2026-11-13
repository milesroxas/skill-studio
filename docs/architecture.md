# Architecture

One table of operations serves the desktop app and the web server. [`src/application/api/contract.ts`](../src/application/api/contract.ts) names each operation with its input and output. `operations.ts` beside it checks the input and runs it. The desktop app calls the table over IPC, and `st serve` exposes it as `POST /api/<name>`, so an operation added once reaches both. The CLI has its own fixed commands, which call the same application functions.

## Layers

```
src/
  domain/          pure: schemas, read models, scoring, stats, text. No I/O
  judges/          the judge packs (generic, code, workflow, design), one folder each, and the Jev client
    rule/            the judge behind the editor's selection popout; not a pack
    shared/          what the packs share: Jev questions, scoring helpers, the output as a picture, running a check command
  application/     use cases (generate, grade, jobs, the assistant) and the operations table
  infrastructure/  files on disk, the environment
    engines/         the agent CLIs: claude, cursor
    ai/              the assistant's providers
  interfaces/
    host.ts        the checkout's paths for the CLI and `st serve`: `.env` and `out/renderer`
    lifecycle.ts   what every host does about agents: end a crashed copy's, record its own, end them on a signal
    renderer-files.ts  the built renderer's file for a request path, for the `studio://` scheme and `st serve`
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

Imports point inward only. `pnpm fallow` fails on one that does not (`boundaries` in `.fallowrc.json`):

| Layer | May import |
| --- | --- |
| `domain` | nothing |
| `judges` | `domain` |
| `infrastructure` | `domain`, `judges` |
| `application` | `domain`, `judges`, `infrastructure` |
| `interfaces` | all of the above |
| `renderer` | `domain`, `judges`, and types from `application` |

## The desktop app

### Processes and the PATH

- Operations run in a backend utility process, so the window never waits on a file read, a hash or an agent.
- The renderer reaches the main process through one preload bridge (`window.studio`), with one function per message.
- Job changes and assistant replies are pushed to the window as they happen. A browser polls instead.
- An app opened from the Finder or the Dock gets the bare PATH `/usr/bin:/bin:/usr/sbin:/sbin`. So the main process starts the backend with the installers' folders added: `~/.local/bin`, each nvm Node's `bin` newest first, `~/.volta/bin`, `~/.bun/bin`, `~/.npm-global/bin`, `/opt/homebrew/bin`, `/usr/local/bin`.
- It then reads the login shell's PATH (`$SHELL -ilc`, five seconds at most) and hands it to the backend with `setEnv` (`src/infrastructure/path.ts`). The PATH is taken as soon as it is printed, even if a startup file holds the output open. A shell that does not answer is asked once more ten seconds later, with fifteen to answer.
- Home is `os.homedir()`, which reads `HOME` as the Claude Code installer does.

### Starting and ending processes

- One function starts every process the backend runs: `exec` in `src/infrastructure/exec.ts`. That covers the agents, the assistant's CLIs, and the code pack's check command (a shell command line).
- A CLI is found on the PATH (`resolveCommand`), with `PATHEXT` on Windows, and started by its full path. `PATH` and `PATHEXT` are read whatever the case of their names.
- On Windows a `.cmd` or `.bat` runs through cmd.exe. Every argument is quoted, and each character cmd.exe acts on is escaped with a caret, twice, since the script reads its arguments once more (`cmdLine`). An argument with a line break cannot cross a cmd.exe line, so the run is refused with a line saying so.
- On POSIX each process starts as its own process group, and ending it ends the group.
- Everything `exec` starts gets `agentEnv()` unless it is handed another environment.
- Output is decoded as a stream and kept within bounds: stdout up to 16 MB, or its last 64 KB when lines are handed on as they arrive, and the last 64 KB of stderr.
- A process asked to end gets five seconds, then is killed. The run settles a quarter of a second later, whether or not its output has closed.
- A process that exits while a child still holds its output open (a server put in the background with `&`) settles once that output is quiet for half a second, with the process's own exit code. For a POSIX shell line, and for a run being stopped, what is left of its process group is ended then.
- A judge pack starts nothing itself. Grading puts a runner on the judge context (`JudgeContext.run`, a `CommandRunner` from `commandRunner(signal)`), so a check command is ended as a group at its timeout, when its job stops and when the app quits. Stopped before or during its run, the runner rejects with "Stopped.", so a command cut short is never read as the check's answer.

### Quitting and orphaned agents

- Stopping everything is `shutdown` in `src/application/shutdown.ts`: it stops every job (`stopAllJobs`) and every assistant reply (`stopAllRuns`), then ends the processes still running (`stopAll`).
- Quitting the app calls it. Quitting holds `will-quit` until `stopAll` is done, three seconds at most. An update's restart quits the same way.
- The CLI calls it on SIGINT (Ctrl-C), SIGTERM and SIGHUP (the terminal closing), through `agentLifecycle` in `src/interfaces/lifecycle.ts`, then exits with 130, 143 or 129. `st run` and `st grade` work outside a job, so the lifecycle hands them a signal that fires before any process is ended (`Lifecycle.signal`): they stop as a stopped job does.
- From the moment `stopAll` is called, `exec` starts nothing more and rejects with "Stopping.", so a job between two agents cannot start the next.
- `st serve`, like the desktop backend, keeps running through an error nothing caught (`keepRunning`): the error is logged and every job goes on.
- The backend records the agents it starts in `~/.skill-studio/agents.json` (`src/infrastructure/children.ts`), each with the pid and start time of the backend that owns it. Every running copy of the app shares the file.
- A backend that starts ends the agents whose owner is gone (`endOrphans`). It first checks each pid is still that command, started when the record says. It leaves the records of a copy still running.
- A record is ignored unless its pid is a whole number above 1 and its command is `claude`, `cursor-agent` or `codex`.
- Checking records runs `ps`, so the file is read again just before it is written, and only the orphaned records are taken out. A record another copy wrote meanwhile stays.
- A record that cannot be written is warned of once. It never stops a run, the backend or `st`.

### Files and paths

- JSON the app writes (`run.json`, `report.json`, `reviews.json`, versions, drafts, settings) goes to a temporary file beside the target, which then takes its name (`writeJson`). A crash leaves the old file whole.
- Text files are written the same way (`writeText`): `SKILL.md`, a reference, and a case's `prompt.md`, `case.yaml` and checks.
- A file that does not parse throws an error naming it (`readJson`). The lists of runs, versions, cases and lock files skip a bad one with a warning.
- A path from a request is checked twice (`src/infrastructure/fs.ts`):
  - `assertSafePath` takes any name a folder can hold, spaces and other alphabets included. It refuses an empty part, a hidden name, `..`, a backslash, a control character and any of `< > : " | ? *`. On Windows it also refuses a device name such as `con` or `nul.md`, and a name ending in a dot or a space.
  - `assertInside` resolves every link on the way and refuses a path that ends outside the skill, or at a link to nothing. A file not there yet is judged by the nearest folder that is.
  - Saving, deleting and restoring a skill file, saving and deleting a case, reading a picture and serving a sample's file all go through both.
- `readTree` passes over a link that leaves its folder. The scan of a sample's `outputs/` follows no link at all, since the agent wrote that folder.

### Jobs and runs

- A job (`src/application/jobs.ts`) has an abort controller, kept out of the job the window reads. `jobs.stop` fires it:
  - Generation stops taking samples and ends the agents in flight. The signal reaches `exec` through `EngineRequest.signal`. A sample whose agent did not end cleanly on its own while the stop was in force is recorded as `stopped`, with whatever it had written.
  - Grading stops at once: an answer still on its way is not waited for (`untilStopped` in `src/application/grade.ts`). It keeps no answer from the sample the stop came in, and writes no report.
  - The job ends as stopped, with "Stopped." in its log.
- A job names what it works on: the skill path or the run. While it runs, a second run of the same skill, or a second grading of the same run, is refused. A run job's own grading of the run it made counts as a grading of that run.
- A run job lists the runs it is writing (`Job.writing`, set once `generateRun` names each run). Only those are refused a grading or a delete, so a run cut off earlier can be graded or deleted while another run of the skill is written. A run being graded is refused a delete too.
- A grading with no output to grade (every one stopped before it finished) writes no report, says so in its log and ends as failed.
- The window's list holds every running job and the newest 12 finished ones (`listJobs`). "Is anything running" asks every job, listed or not (`anyRunning`): deleting a version and restarting the walkthrough wait on it.
- The last 50 finished jobs are kept. A job's log keeps its first 100 lines and its latest, 500 in all.
- A run is made from copies taken as it starts (`src/application/generate.ts`), and every sample is built from those:
  - The skill, as an agent's copy holds it, goes to the run's `_skill/`. That copy leaves out `evals/`, hidden files, `node_modules`, `venv` and `__pycache__` folders at any depth, and links that leave the skill. It is exactly what the version's hash covers.
  - Each case's input files go to `_inputs/`, made even when no case has a file.
  - An `old_skill` run names the skill to its agents as the copy it is made against does.
  - Saving, restoring or editing the skill during the run changes nothing the run reads.
- Grading reads a case's pictures from `_inputs/`, as the agent got them, each only when it is a file inside that folder. A run with no `_inputs/` has its pictures read from the case as it is now.
- Grading reads the skill's rules from `_skill/SKILL.md`, the skill the run was made from. A run with no `_skill/` is graded on `SKILL.md` as it is now.
- `run.json` is written again as each sample ends, with the files the agent left under `outputs/` (`SampleMeta.outputs`). Grading reads the samples it lists that are not `stopped` (`finishedSamples` in `src/infrastructure/runs.ts`), and both grading and Results read a listed sample's outputs from that list (`runSamples`), so a file a check command adds later is no output. Results still shows a folder not yet listed, so a run being written shows its outputs as they come.
- When the run's folder can no longer be written to, every worker stops and the agents in flight are ended.
- A case's `timeout_seconds` is held to six hours.

### Pages and pictures

- The packaged app loads its pages from `studio://app/`, a sample's files from `artifact://sample/<skill>/<run>/<sample>/<file>`, and a picture from `artifact://image?...`.
- A sample's file is named by its path (`src/domain/artifact-address.ts`), so a page an agent wrote finds the files beside it by their relative names.
- `?stage=1` asks for a page as Results' stage shows it. It adds a short script that lets two pages scroll together and passes A and B up (`withStageBridge` in `src/application/api/artifact-page.ts`).
- Grading draws a page for Jev to look at (the generic and design packs both do). Only the main process has a browser to draw with:
  - The backend posts `render` with the page and a size (`PageRenderer` in `src/domain/artifact-address.ts`).
  - The main process loads it in an offscreen window (`src/interfaces/electron/main/render.ts`), one page at a time, and answers `rendered` with a PNG of that size, scaled down whole when a side is past 1568 pixels.
  - `gradeRun` draws at the case's size, or 1280 by 960, and also at 390 by 1200 for a case that asks for a phone. The PNGs go in the sample's `renders/` folder, named by size, and are drawn again only when the page is newer.
  - The CLI and `st serve` have no renderer, so there a page is judged by its HTML and any screenshot the agent left.

### Keys

A key in the environment at launch wins over a stored one. A stored Anthropic or OpenAI key reaches the backend under the app's own name (`SKILL_STUDIO_ANTHROPIC_API_KEY`, `SKILL_STUDIO_OPENAI_API_KEY`), so an agent the app starts does not bill a key stored for the assistant.

[SECURITY.md](../SECURITY.md) covers the hardening, and [cli.md](cli.md#the-web-server) the web server.

## The loop in the renderer

A skill has three screens (`SKILL_PLACES` in `src/renderer/places.ts`):

- **Skill** (`screens/Editor.tsx`) edits `SKILL.md` and `references/`, and lists the versions. A version opens in the main column (`components/VersionDetail.tsx`) with its changes and Restore.
- **Cases** (`screens/Cases.tsx`) edits the cases a run is made of. A case needs a prompt only.
- **Results** (`screens/Results.tsx`) lists the cases a run answered and compares two outputs of the one picked (`components/Comparison.tsx`). "All cases" shows every run at once (`components/ResultsSummary.tsx`), with Graded as folded at its foot (`components/GradedAs.tsx`).

Running is a button in the top bar (`components/Run.tsx`). It calls `skill.generate`, which keeps the files as the next version when they changed since the last run.

- `src/domain/pairs.ts` chooses the pair a case opens with: the latest version beside the one before it, by the same writer where it can.
- A reader's answer on one verdict is a **correction** (`skill.correct`), kept in `evals/reviews.json` and written from Results. Every pack's scorer reports the facts it counted (`Verdict` in `src/domain/pack.ts`) and takes the corrections, so a score follows a correction with no new call to Jev. See [grading.md](grading.md#verdicts).
- An address that names a screen folded into another opens that screen (`MOVED_SCREENS` in `src/domain/preferences.ts`). A name the app has no screen for opens home (`screenFor` in `src/renderer/next-step.ts`).

### What every screen reads

The shell (`App.tsx`) hands every screen one object, `Ctx` in `src/renderer/ctx.ts`, built again only when something in it changes:

- **The open skill** (`useSkillState` in `src/renderer/skill-state.ts`): its state, its scoring (`bench.json` over the defaults) and its saved files.
  - Every call addresses the skill open when it is made, so a reply that lands after another skill was opened is dropped.
  - Reads can land out of order. A reply is dropped only once a newer one has landed. An awaited `reload` resolves once every read asked for after it has landed too (`createReads` in `src/renderer/reads.ts`).
  - The saved files are read once (`ctx.files`) for the Editor and the side panel. A save updates the copy at once (`took`), so the text in view never steps back.
- **The jobs** (`useJobs` in `src/renderer/use-jobs.ts`): pushed by the desktop app, polled in a browser. The skill is read again when a job ends, and at most every two seconds while a run of it writes outputs.
- **The drafts** (`useDrafts` in `src/renderer/drafts.ts`): unsaved files and cases, stored on disk half a second after the last keystroke.
  - A save clears its draft unless more was typed while it was written. That text stays, as a draft begun on what was saved (`src/renderer/draft-edits.ts`). A save that ends after another skill was opened clears the draft in that skill's stored drafts.
  - A failed read of the stored drafts is tried three more times before an edit may be stored over them. A read waits for any write under way.
  - A draft of a case the skill no longer has is dropped.
  - A draft equal to what is saved is not unsaved work. An unsaved file is one whose draft differs from the file on disk (`unsavedFiles` in `src/renderer/changes.ts`). An unsaved case is one whose draft differs from the case (`unsavedCases` in `src/renderer/draft-edits.ts`).
  - In a browser, drafts stored as the tab closes go as a keep-alive request when the body is at most 60,000 bytes. A write under way as the tab hides is sent again that way.
- **When a case draft began** (`caseBases` in the drafts): the case's `savedAt` as the draft began, stored with the drafts so it survives a restart. A save sends it, and the host refuses the save when the case on disk is newer. Cases says the case changed on disk as soon as a read shows it newer, as the Editor does for a file (`FileDraft.previous`). A draft stored with no base counts as begun on the case as first shown.
- **The next step** in the top bar (`nextStep` in `src/renderer/next-step.ts`): add a case, run, read the results of a run that finished since Results was last open, or the walkthrough's own step. When Results was last open is kept per skill in the window's storage (`src/renderer/results-seen.ts`), so a cleared store asks once more.

### Stores, actions and navigation

- A store kept outside React (the route, the preferences, the updates, the assistant) is a `createStore` or a `createEmitter` from `src/renderer/store.ts`.
- An awaited step behind a button is `useAction` in `src/renderer/hooks.ts`: busy while it runs, with a failure on the status line. A step that ends after another skill was opened leaves that skill alone.
- `useFetch` in the same file never shows what it read for one set of `deps` under another. A value that changes under the same `deps` is read again with its `reload`, which keeps the last value in view.
- Opening another skill clears the status line before the skill opens, so a step that reports once its skill is open (such as making a skill) reports after the open.
- Back and Forward return to the skill a place was seen in. Until that skill is open, the shell keeps the current place in view, so no screen shows one skill's place with another's data.

## Engines

An engine runs one agent CLI in a sample directory (`src/infrastructure/engines/`). A model or effort outside what an engine takes is refused before anything starts (`chosen` in `engines/stream.ts`).

### claude

- Command: `claude -p --output-format stream-json --verbose --no-session-persistence --strict-mcp-config --setting-sources project --permission-mode acceptEdits`.
- `--allowedTools` comes from the case's `allowed_tools` (by default Read, Write, Edit, Glob, Grep and Bash).
- Only the sample directory's own settings load, so the machine's skills, `CLAUDE.md` and MCP servers stay out of the run.
- The environment is the backend's less three things (`agentEnv` in `src/infrastructure/env.ts`): variables starting with `CLAUDECODE`, so a run works from inside a Claude Code session; `TYPESAFE_API_KEY`; and every `SKILL_STUDIO_*` variable, so an agent with Bash never sees the app's keys. The assistant's CLIs get the same environment.
- Models offered: sonnet, opus, haiku, fable, and default (the CLI's own, with no `--model` flag). Any other name is passed on too, such as its aliases (`opusplan`), full ids (`claude-…[1m]`) and Bedrock and Vertex ids, as long as it is one argument: 1 to 120 letters, digits and `. _ - : @ [ ] /`, starting with a letter or a digit. The CLI says itself when it has no such model.
- Efforts: low to max.

### cursor

- Command: `cursor-agent -p --output-format stream-json --force --trust`. It needs `cursor-agent login` or `CURSOR_API_KEY`.
- Models come from `cursor-agent --list-models`, read in the background with eight seconds to answer. `models()` answers at once with what the CLI has listed so far, and starts a read when none is under way.
- A list with models in it is kept. While there is none (signed out, or the CLI failed), it is read again at most every half a minute, and its models show from the next load of the skill.
- Effort rides on the model string (`model[effort=high]`). A run's model must be one the CLI listed, or `auto`. Before any list arrives, it must have the shape of a model id.
- The prompt is an argument, so on Windows with a `.cmd` install a prompt of more than one line is refused.
- The CLI has no setting-source switch, so a run sees the user's `~/.cursor/skills`.
- This adapter has not been run against a live account.

Isolation is by convention. The skill copy omits `evals/` and the prompt forbids reading outside the sample directory, but nothing stops an agent that follows an absolute path.

## The assistant

Four providers sit behind one port (`src/infrastructure/ai/`). The model in use is a preference, so every control shows the same one. Each vendor's CLI is the main way in, and its API key a supported second. `AI_PROVIDER_IDS` lists the CLI first: that is the order of every model list and of the default. Settings folds the key behind "Use an API key" (`VendorRoutes`).

Only `claude-code` has been run against a live account. A command with pictures attached has not been run live.

### anthropic

- The Anthropic SDK with your key. Replies stream, and a field's shape is enforced with structured outputs.
- The system prompt carries the skill and is the same from turn to turn. It is sent as a text block marked `cache_control: ephemeral`, so a later turn reads it at the cached rate.
- Requests to Fable 5, Opus 5 and Sonnet 5.5 models opt in to Anthropic's server-side fallback, so a request a safety classifier declines is retried on the model Anthropic recommends.
- A reply may run to 64,000 tokens, or to the model's own `max_tokens` from the Models API when that is lower.

### claude-code

- `claude -p` with no tools, settings or skills, on the plan the CLI is signed in to. The shape goes in as `--json-schema`.
- The brief goes in as `--system-prompt` while it is under 24 KB. A longer one leads the prompt on stdin in a `<system>` block, and the argument is one line saying so (`placeBrief`). On Windows the brief always leads the prompt, since a command line takes no line break. A command line the system still refuses is reported as a conversation too long to send.
- The flags every headless `claude` run shares, and the sum of its token counts, are in `src/infrastructure/claude-cli.ts`. A line of CLI output that is not a JSON object is never read as an event (`jsonLine` in `src/infrastructure/json-lines.ts`).
- A chat message that starts with `/name` is a command:
  - The run loads the user's settings (`--setting-sources user`, so the user's hooks run too) and keeps slash commands on.
  - The message is the whole prompt, so the CLI expands the skill as a terminal would. The earlier turns go into the system prompt as context, which stays an argument whatever its size.
  - On Windows that argument cannot reach an npm install of the CLI (a `.cmd` script). There a command is refused before anything runs, with a line saying it needs the native install and linking the install guide (`commandProblem`).
  - Tools stay off, so a skill that needs one cannot use it.
- Sign-in: each CLI adapter asks its CLI how it is signed in, with `claude auth status --json` and `codex login status`.
  - A signed-in answer stands for half a minute (`keptAccount`). `aiProviderInfo({ fresh: true })` asks again. A signed-out answer is never kept. A CLI too old to answer counts as signed in.
  - The status also says what pays (`CliAccount.billing`): a plan, or an API key the CLI found in its environment, which `claude -p` uses ahead of any plan. Settings shows which.
  - A CLI that says it is signed out offers no models. Settings shows the maker's own command (`signInCommand`, and `installCommand` for a missing CLI) with **Copy command** and **Check again**. The person runs it in their own terminal, and the row updates when the window gets the focus back.
  - The app never installs a CLI, never runs `claude auth login`, `claude setup-token` or `codex login`, and never reads a token, a credentials file or a CLI's keychain entry. It runs the CLI as its maker publishes it, with the environment an agent gets.
  - This follows Anthropic's line: a person may sign in to the unmodified Claude Code with their own account, and a product may not offer Claude.ai login itself, handle its credentials, or use the Claude Code or Anthropic names in a feature name or a logo ([legal and compliance](https://code.claude.com/docs/en/legal-and-compliance)). So the app says in plain text that it runs Claude Code, and no control is named "Sign in with Claude" or carries a vendor's mark.

### openai

The OpenAI SDK (Responses API) with your key, with a strict JSON schema for the shape.

### codex

`codex exec --json` in a read-only sandbox, on the plan the CLI is signed in to. It reports a reply whole, not word by word.

### Refusals and the slash menu

A reply a provider billed and then refused (the model declined, or the reply ran past its length) is thrown as a `ProviderError` (`src/infrastructure/ai/types.ts`). It carries the `usage` and `model` the reply would have had, so the cost is still recorded.

The side panel's slash menu lists the panel's own commands first (`src/renderer/commands.ts`: clear, settings and guide, run in the page and never sent). Then it lists the skills Claude Code can invoke (`src/domain/commands.ts`, `src/infrastructure/ai/commands.ts`), through `ai.commands`. The other providers offer no commands, and the menu does not open on them.

- Only the CLI knows the whole list, with every plugin and override. It prints the list in the `init` event of a run, before the model is asked.
- The lister starts such a run on the smallest model with one turn at most (`--model haiku --max-turns 1`) and ends it as soon as that event arrives.
- It then reads each skill's description from its file: `~/.claude/skills`, `~/.claude/commands`, or the plugin's folder, under `CLAUDE_CONFIG_DIR` when set.
- The list is kept in memory for five minutes. On disk it is kept in `~/.skill-studio/claude-commands.json` with the modification times of the folders it came from: the user's `skills`, `commands`, `plugins` and `settings.json`, and each plugin's folder with its `skills` and `commands`. A restarted backend uses it until one of those changes.

### Changes from the side panel

The assistant can propose changes to the open skill: a whole file (SKILL.md or one under `references/`), a case to add or replace, and a version to save.

- The model writes each change as a block fenced with four tildes, so a code fence inside a SKILL.md cannot end it early. A file block closes at the last four-tilde line before the next block or the end of the reply, so a four-tilde fence inside the file is kept too.
- `src/domain/changes.ts` holds the format: the brief that teaches it (`CHANGES_GUIDE`, part of `chatSystem`) and the parser (`replyParts`).
- How the model talks to the reader is one brief, `VOICE` in `src/domain/assist.ts`, used by `chatSystem` and `improveSystem`: one to three short sentences unless asked for more, the reader's words, and nothing of how the app works inside unless the reader asks. It is [design/copy.md](design/copy.md) said to the model, so change both together.
- The panel (`src/renderer/components/Change.tsx`) shows each block as a diff, a case or a version, with one button. How a row stands against the skill (what it says, and whether applying it would lose unsaved work) is worked out and tested in `src/renderer/changes.ts`.

The assistant reads the skill as the writer has it, not as saved:

- `chat.send` carries the screen and what is open on it (the Editor's file, the case on Cases: `openAt` in `src/renderer/route.ts`). The backend lays the skill's stored drafts over its saved files and cases (`workingSkill` in `src/domain/assist.ts`).
- The stored drafts are the one copy of unsaved work, so the panel stores any still waiting before it sends (`Drafts.flush`).
- The message being typed is kept in `src/renderer/ai.ts` (`useChatDraft`, and `useImproveDraft` for an improve conversation), so closing the panel or switching conversations does not lose it.
- A reply still being written when the page loads is followed to its end. In a browser that is the only way its end arrives.
- SKILL.md is read whole. The reference files and the cases share `CONTEXT_BUDGET` characters: the open file first, then the other references in full while it lasts, then each case in full. A reference or case past the budget is named alone (a case by its title and id), with a line saying how many cases were left out.
- The conversation goes back to the model as the newest messages that fit `CHAT_WINDOW` messages and `CHAT_WINDOW_CHARS` characters (`chatWindowOf` in `src/domain/ai.ts`), starting at a user message.
- A file change shows against the writer's unsaved text when there is some.

Nothing is written until the writer clicks:

- The button calls the operations the Skill and Cases screens call (`skill.saveFile`, `skill.saveCase`), and `skill.saveVersion` for a version. So the backend checks the path, the id and the file on disk as it does for them, and the status line offers Undo.
- A file change shows against the shell's copy of the saved files (`ctx.files`), and applying one updates that copy.
- A reply is marked with the skill it was written about (`ChatMessage.skill`). Its changes are offered only while that skill is open.
- Whether a change is applied is read from the skill as it stands, never stored.

Each text area is one kind of field (`src/domain/assist.ts`). A kind states the shape its text has, built from the same rule guidance the editor shows. The reply is one JSON object holding that text, fitted to the field before it is shown.

### Improving a selected rule

Selecting four or more words in SKILL.md opens a popout with three actions. Code owns each workflow; a model only writes prose.

1. `src/domain/lint.ts` checks each top-level bullet in the selection by word lists and counts: a hedge word with no number or absolute to anchor it, an outcome adjective or a definition in the rule's first sentence, a missing reason, nested bullets, piled conditions, words per rule, and the file's size band. Prose, steps and code are not rules and get no findings. A bare rule with no hedge and no number is left to Jev. Free and instant.
2. `src/judges/rule/index.ts` asks Jev one request over the rule and two lines either side: a yes/no per principle (`RULE_GUIDE`) and a complexity score. `src/domain/improve.ts` turns the probabilities into findings: holds above 0.7, drifts below 0.3, a maybe between. Without a TypeSafe key only step 1 runs.
3. Then a model is asked, with the findings as its brief:
   - **Auto refine** (`ai.refine`) asks for one revision when anything drifts, and for nothing when the rule complies.
   - **Suggest changes** (`ai.rewrites`) asks for three rewrites in one reply. Jev then checks that each kept the selection's facts, and that the best practice one holds every principle. The finished run's text is the `RewritesResult` as JSON.
   - **Help me improve** (`improve.*`) is a conversation in the side panel, below.

Help me improve:

- `improve.start` opens it and asks the model nothing. Jev starts reading the rule at once, and the writer's first message (`improve.send`) waits on that reading and sets the course.
- With `walk`, it asks the questions in `IMPROVE_STEPS` in a fixed order, skipping those the judge already cleared. After each reply Jev says whether the question was answered, and code moves on or asks once more.
- Without `walk`, the model drafts from what the writer asked, fixing what the checks found.
- The draft is the last fenced block of the reply (`draftReply` splits a reply around it). Jev's reading of the newest draft is its checklist. Once a draft stands, a question gets an answer and no draft, and a request gets a whole new draft.
- The editor follows the rule as a range that maps through every edit (`src/renderer/editor/improving.ts`) and publishes its text (`setPassage` in `src/renderer/replace.ts`). Apply puts a draft there through the registered replacer. The next `improve.send` carries the text as `current`, so the model works on the rule as it reads now.
- The conversation stays open after Apply. A rule picked while the last one is still opening takes its place.

The run kinds `refine`, `rewrites` and `improve` sit beside `assist` and `chat` in `src/domain/ai.ts`.
