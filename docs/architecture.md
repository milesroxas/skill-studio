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
    electron/      main process, preload bridge, backend utility process, and the drawing host the CLI starts
    http/          `st serve`: the table over HTTP, the request guard, Tailscale
    cli/           the `st` command: `st.ts` reads the flags, picks the command and exits with its code
      drawing.ts     how the command line draws pages: it starts the drawing host and speaks its lines
      open-server.ts   the server `st open` starts, one a checkout, found by its file in the app's own folder
      commands/      one module per command (its name, help lines, flags and `run`); the help is put together from them
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
- A grading also holds a lock in the folder it grades, so the app, `st serve` and `st` never grade one run at once, each in its own memory (`takeGradingLock` in `src/infrastructure/grading-lock.ts`). The lock is `.grading.lock`, made only when there is none (`wx`), holding the pid, the time it was taken and what took it. A second grading is refused with `This run is already being graded by st in a terminal, since 10:42. Try again once that grading is done.`, naming the app, `st serve` or `st`. The lock is given back on every way out of `gradeRun` and `gradeAnchors`, and when the process exits. One left by a process that has ended is taken over, as is one taken more than twelve hours ago, since the system may have given its pid to another program, and one with no text that is older than 10 seconds: of two gradings that find it so, the one that moves it aside first takes it.
- A run, as it starts, holds `.stamp.lock` in the skill's `evals/runs/`, made and taken over as `.grading.lock` is (`takeStampLock`, same file), from taking its version (`stampSkill` in `src/application/generate.ts`) through making its folder and its copy of the skill to writing its `run.json` (`takeRun`), and for that alone: the versions are read from the runs' `run.json` files and the names from their folders. The cases' input files and the cases themselves are copied once it is given back (`stageRun`), so a run with large input files holds up no other; a run whose copy fails is taken out whole, so it leaves no run and no version known from it alone. A lock left by a process that ended is taken over at once. So two runs of one skill started at once from different copies of the app, two `st run --from` drafts among them, never take one number or one name. A run that is refused, for a version with no name, a `--from` folder or a configuration, is refused before it takes the lock, so it leaves `evals/runs/` as it found it: the Library reads that folder's time as a run made. A second run waits for the lock instead of being refused, and after a minute is refused with `Another run of this skill is still starting (st in a terminal). Try again once it has started.`
- A run job lists the runs it is writing (`Job.writing`, set once `generateRun` names each run). Only those are refused a grading or a delete, so a run cut off earlier can be graded or deleted while another run of the skill is written. A run being graded is refused a delete too.
- A grading with no output to grade (every one stopped before it finished) writes no report, says so in its log and ends as failed.
- The window's list holds every running job and the newest 12 finished ones (`listJobs`). "Is anything running" asks every job, listed or not (`anyRunning`): deleting a version and restarting the walkthrough wait on it.
- The last 50 finished jobs are kept. A job's log keeps its first 100 lines and its latest, 500 in all.
- A run is made from copies taken as it starts (`src/application/generate.ts`), and every sample is built from those:
  - The skill, as an agent's copy holds it, goes to the run's `_skill/`. That copy leaves out `evals/`, hidden files, `node_modules`, `venv` and `__pycache__` folders at any depth, and links that leave the skill. It is exactly what the version's hash covers.
  - Each case's input files go to `_inputs/`, made even when no case has a file. Hidden ones go too (`Walk.hidden` in `src/infrastructure/fs.ts`), which the skill's copy and hash never ask for.
  - An `old_skill` run names the skill to its agents as the copy it is made against does.
  - Saving, restoring or editing the skill during the run changes nothing the run reads.
- Grading reads a case's pictures from `_inputs/`, as the agent got them, each only when it is a file inside that folder. A run with no `_inputs/` has its pictures read from the case as it is now.
- Grading reads the skill's rules from `_skill/SKILL.md`, the skill the run was made from. A run with no `_skill/` is graded on `SKILL.md` as it is now.
- `run.json` is written again as each sample ends, with the files the agent left under `outputs/` (`SampleMeta.outputs`). A sample whose agent did not run to its end with no stop (the time limit, an error, never begun: `ok` and `error` from the engine, `EngineResult.ended`) is marked `failed`. Grading reads the samples it lists that are neither `stopped` nor `failed` (`finishedSamples` in `src/infrastructure/runs.ts`), and both grading and Results read a listed sample's outputs from that list (`runSamples`), so a file a check command adds later is no output. Results still shows a folder not yet listed, so a run being written shows its outputs as they come.
- When the run's folder can no longer be written to, every worker stops and the agents in flight are ended.
- A case's `timeout_seconds` is held to six hours.

### Pages and pictures

- The packaged app loads its pages from `studio://app/`, a sample's files from `artifact://sample/<skill>/<run>/<sample>/<file>`, and a picture from `artifact://image?...`.
- A sample's file is named by its path (`src/domain/artifact-address.ts`), so a page an agent wrote finds the files beside it by their relative names.
- `?stage=1` asks for a page as Results' stage shows it. It adds a short script that lets two pages scroll together and passes A and B up (`withStageBridge` in `src/application/api/artifact-page.ts`).
- Grading draws a page for Jev to look at (the generic and design packs both do). Only the main process has a browser to draw with:
  - The backend posts `render` with the page and a size (`PageRenderer` in `src/domain/artifact-address.ts`).
  - The main process loads it in an offscreen window (`src/interfaces/electron/main/render.ts`), one page at a time, and answers `rendered` with a PNG of that size, scaled down whole when a side is past 1568 pixels, and the layout it measured: the box and the look of each element the page drew (`measure.ts`, read by `readLayout` in `src/domain/layout.ts`).
  - `gradeRun` draws at the case's size, or 1280 by 960, and also at 390 by 1200 for a case that asks for a phone. The PNGs go in the sample's `renders/` folder, named by size, each with its layout beside it as `.json`, and are drawn again only when the page is newer or a picture has no layout. A page is drawn only when a pack that looks at pages judges this output and has a question for it (`JudgePack.asks`): the generic pack has none without a rule or a check, and no pack has one for a case with `bench.judge: false`.
- `st run`, `st grade` and `st serve` draw the same way, through a second process: the drawing host.
  - It is Electron with no window. Its start file, `src/interfaces/electron/draw/index.ts` (built to `out/main/draw.js`), hides the Dock icon before anything else loads, then awaits the host itself, `host.ts` (built to `out/main/draw/host-<hash>.js`). Loading the host's code takes long enough that macOS would show it as an app in front for a moment first. Before that code loads, the start file reads the host's input, holding each line until the host takes it (`answerLines`), and ends the host at once when the input closes and on SIGTERM, SIGINT and SIGHUP, so a host whose command is gone ends at any moment of its start. Once the app is ready Electron takes those signals itself and quits the app, so the start file ends the host at `before-quit` too. It ends with Node's own exit (`process.reallyExit`), not `app.exit` or `process.exit`, which in Electron shut the browser down. That is no documented part of Node, so where a Node has none it ends with `process.exit` (`exitNowOf` in `draw/exit.ts`).
  - The host registers the `artifact:` scheme, serves it with `serveArtifacts` (`protocol.ts`) over operations of its own, and draws with `pageRenderer()`. It serves files only from the skills a request has named.
  - It draws a page of the command's own too, `st sheet`'s, from its `file:` address: the second kind of `HostRequest`. `st sheet` (`src/interfaces/cli/commands/sheet.ts`) lays each sheet out and writes its page with `src/domain/contact-sheet.ts`. Both kinds go through one `pageDrawer()` (`render.ts`), one page at a time. A page of the command's own is drawn on a session of its own, whatever the page says of itself. Its `file:` handler serves only an `.html` or `.png` file in a folder a request has named, never in a folder inside it, each with a `Content-Security-Policy` header that allows no script and no request but for pictures (`OWN_POLICY`). Its web request handler cancels every request to an address that is not `file:`, a WebSocket's among them.
  - It sets on its session what the app sets on its own, which the app's drawing windows share: every permission request refused (`refusePermissions` in `window.ts`). It sets the same on the session it draws its command's own pages on. The app sets nothing else on its own session: no permission check handler, so `navigator.permissions.query` still answers `granted`, and no download, web request or capture handlers.
  - The command's side is `src/interfaces/cli/drawing.ts`, a `PageRenderer` handed to `gradeRun`, or to `createOperations` through `startServer`, with a `file` method that `st sheet` draws its own pages with. It looks for the build, the display and Electron's binary at the first page asked for, finding the binary as `require('electron')` does but never fetching it, then starts the host and keeps it for the command's life.
  - They speak one JSON line each way for each page (`HostRequest` and `HostReply` in `src/domain/drawing-host.ts`), matched by `id`. The PNG goes as base64; a line that is not one is passed over.
  - On Linux the start file turns hardware acceleration off, as `capturePage` fails under `xvfb-run` with no GPU, so a page drawn there is pictured without WebGL. Chromium gives WebGL with no GPU only through SwiftShader, with `--enable-unsafe-swiftshader`, which it says is not meant for untrusted content because SwiftShader runs JIT-ed code in the GPU process; a page a model wrote is such content, so the switch is not taken. macOS and Windows keep the GPU.
  - The host takes a profile folder of its own in the system's temp folder, named by its process id (`profile.ts`, made by the start file before the host loads), no single-instance lock and no keychain, and hides its Dock icon. As the start file ends the host it kills the browser's own processes (`app.getAppMetrics`), removes the folder, and ends with no shutdown, as a browser that shuts down writes its settings back into a new folder of the same name. The GPU process and the network service outlive the host by a moment, and on Linux the network service writes its state and cache into the folder as it ends, so a process of its own, Electron run as Node, removes the folder again once every one of them is gone. The command removes the folder of a host it started once that host has gone (`drawing.ts`), which covers a host killed outright. A host ended before the app is ready can leave an empty folder, so each host that starts removes the folders of hosts whose process is gone. Both read a folder's process id off its name by one rule, and neither removes a folder whose id has a process, which may be a new host the system gave the id to (`goneProfiles` in `src/domain/drawing-host.ts`). The remover is handed its folder by name, never finds one by an id, and tells a process has ended from `/proc/<pid>/stat` on Linux, where one not yet reaped still answers a signal, and from a signal alone elsewhere. The host, the remover and the server `st open` starts are each started with `windowsHide`, so none opens a console on Windows. It quits when its input closes: when the command's lifecycle stops (`Lifecycle.signal`), and when the command exits, which also sends it SIGTERM (`drawing.ts`). While no page is waiting, the command holds none of its pipes open, so a command that is done exits as it would without it.
  - A host that cannot start (no build, no Electron, no display), or stops after it has started, is said once and not started again. The renderer then rejects every page with `RendererGone` (`src/domain/artifact-address.ts`), and `gradeRun` takes its drawing away for the rest of the grading: the output it was drawing, and each one after, is graded as with no renderer, `drawn: false`. Whatever this grading wrote to that output's `renders/` before the host stopped is removed, and the folder too when the grading made it, so the next grading draws it again.
  - The host is built in a pass of its own (`electron-vite build --mode draw`), so the app's `out/main/index.js` is one file as before and shares no chunk with it. The packaged app leaves `draw.js` and `draw/` out.

### Keys

A key in the environment at launch wins over a stored one. A stored Anthropic or OpenAI key reaches the backend under the app's own name (`SKILL_STUDIO_ANTHROPIC_API_KEY`, `SKILL_STUDIO_OPENAI_API_KEY`), so an agent the app starts does not bill a key stored for the assistant.

[SECURITY.md](../SECURITY.md) covers the hardening, and [cli.md](cli.md#the-web-server) the web server.

## The loop in the renderer

A skill has three screens (`SKILL_PLACES` in `src/renderer/places.ts`):

- **Skill** (`screens/Editor.tsx`) edits every file of the skill (`SKILL.md`, `references/`, scripts and the rest: `isSkillFilePath`), and lists the versions. A version opens in the main column (`components/VersionDetail.tsx`) with its changes and Restore. The file's **Changes** view reads the open file against the newest version, the copy the last run kept (`skill.files`), so a save does not empty it. **The last save** is the other thing to read it against, offered while the file holds unsaved text. Before the first run there is no version, and it reads against the last save alone. Files saved since the newest version stand over the versions as a row, "Edited since v1" (`editedSince`), which opens those changes; the sidebar's line under the skill's name says the same (`versionLine`). A version has a number on the page once a run has made it ([design/layout.md](design/layout.md#versions-and-edits)).
- **Cases** (`screens/Cases.tsx`) edits the cases a run is made of. A case needs a prompt only.
- **Results** (`screens/Results.tsx`) lists the cases a run answered and compares two outputs of the one picked (`components/Comparison.tsx`): the pair in a band that stays in view (`components/PairBand.tsx`), the outputs on the stage in every view (`components/OutputStage.tsx`), each opening on the file `previewArtifact` in `src/domain/primary.ts` names, and what to fix under it, in order (`components/Verdicts.tsx`, each miss placed by why in `src/domain/fix-order.ts`). "All cases" (`components/ResultsSummary.tsx`) shows how many cases got better, stayed the same and got worse on their checks (`components/CaseChecks.tsx`), or, for a skill none of whose cases can be read on checks, the lift (`components/Lift.tsx`); then how many cases are checked on the skill as it is now (`components/Coverage.tsx`), where each case stands (`components/CaseStandings.tsx`) and the runs, with Graded as folded at its foot (`components/GradedAs.tsx`).

Running is a button in the top bar (`components/Run.tsx`). It calls `skill.generate`, which keeps the files as the next version when they changed since the last run.

- `src/domain/standing.ts` reads where one case stands from its own runs, and the lift over the cases. A case is run when its writer chooses, so no case is read from a run that did not answer it.
- `src/domain/case-result.ts` reads two ends case by case, on checks alone: better, the same or worse, how many cases are each, and each check a mark a side (`checkSlots`). `st compare` prints it, and All cases reads each case's newest answer against its answer without the skill or its answer before with it (`src/renderer/case-checks.ts`) ([grading.md](grading.md#two-runs-read-as-cases-on-checks)).
- `src/domain/every-case.ts` lays the checks for every case (`evals/graders/`) after a case's own. They are added where a run takes its case (`takenCase` in `src/infrastructure/run-cases.ts`) and where `st sort` reads a case, so grading, sorting and Results see them as the case's checks, and the Cases screen, which edits a case's own, never does ([files.md](files.md#checks-for-every-case)).
- `src/domain/pairs.ts` chooses the pair a case opens with: the latest version beside the one before it, by the same writer where it can. A stopped output is passed over while the case has any other, so a version whose run was stopped is not the latest (`versionsRun` in `src/renderer/model.ts` reads versions the same way).
- A reader's answer on one verdict is a **correction** (`skill.correct`), kept in `evals/reviews.json` and written from Results. Every pack's scorer reports the facts it counted (`Verdict` in `src/domain/pack.ts`) and takes the corrections, so a score follows a correction with no new call to Jev. See [grading.md](grading.md#verdicts).
- `src/domain/results-address.ts` builds the address that opens Results on one case and two outputs, `?skill=<path>#/results?case=&a=&b=`: each run named names the attempt at the case Results opens it on, the first with an output to show (`firstAttempt` in `src/domain/pairs.ts`, which `defaultPair` picks with too), and with no case named, the case is the first one each run answered, in the order Results lists cases (`casesInOrder`). A sample's case is the one its grading names, else its folder's (`sampleOf` in `src/domain/run-name.ts`), as Results reads it. Results reads an address back with `resultsShown` in `src/renderer/model.ts`.
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
  - A store names the drafts the page set or cleared since the last one (`TouchedDrafts` in `src/domain/drafts.ts`). The host lays only those over the file as it is then and keeps every other (`mergeDrafts`), so the desktop app and `st serve` open on one skill each keep the other's drafts. A draft both change is the last one stored.
  - A draft of a case the skill no longer has is dropped.
  - A draft equal to what is saved is not unsaved work. An unsaved file is one whose draft differs from the file on disk (`unsavedFiles` in `src/renderer/changes.ts`). An unsaved case is one whose draft differs from the case (`unsavedCases` in `src/renderer/draft-edits.ts`).
  - In a browser, drafts stored as the tab closes go as a keep-alive request when the body is at most 60,000 bytes. A write under way as the tab hides is sent again that way.
- **When a case draft began** (`caseBases` in the drafts): the case's `savedAt` as the draft began, stored with the drafts so it survives a restart. A save sends it, and the host refuses the save when the case on disk is newer. Cases says the case changed on disk as soon as a read shows it newer, as the Editor does for a file (`FileDraft.previous`). A draft stored with no base counts as begun on the case as first shown.
- **The next step** in the top bar (`nextStep` in `src/renderer/next-step.ts`): add a case, run, read the results of a run that finished since Results was last open, or the walkthrough's own step. When Results was last open is kept per skill in the window's storage (`src/renderer/results-seen.ts`), so a cleared store asks once more. A run stopped before any answer was finished (`answered`, in the same file) is nothing to read and does not count as a run of the skill.

### Stores, actions and navigation

- A store kept outside React (the route, the preferences, the updates, the assistant) is a `createStore` or a `createEmitter` from `src/renderer/store.ts`.
- An awaited step behind a button is `useAction` in `src/renderer/hooks.ts`: busy while it runs, with a failure on the status line. A step that ends after another skill was opened leaves that skill alone.
- `useFetch` in the same file never shows what it read for one set of `deps` under another. A value that changes under the same `deps` is read again with its `reload`, which keeps the last value in view.
- Opening another skill clears the status line before the skill opens, so a step that reports once its skill is open (such as making a skill) reports after the open.
- Back and Forward return to the skill a place was seen in. Until that skill is open, the shell keeps the current place in view, so no screen shows one skill's place with another's data.

### Keyboard shortcuts

- Every shortcut a reader can change is a command in `SHORTCUT_COMMANDS` (`src/domain/shortcuts.ts`): its id, its group, its label and the keys it starts on. A command marked `fixed` (Save, Undo, Back) is listed in the reference and handled where it always was: the editor, the status line, the menu.
- A shortcut is one string the same on every computer, such as `mod+k` or `?`: `mod` is Cmd on a Mac and Ctrl elsewhere. A letter follows the layout's letters; a number is read from its key's place; a symbol carries its own Shift.
- Only the keys a reader changed are stored, in the preferences (`shortcuts`), with `''` for turned off. `shortcutKeysOf` drops unknown commands, keys that do not parse and refused keys, so a hand-edited file always reads, and a new default reaches everyone who left that command alone.
- `src/renderer/shortcuts.ts` listens to the window once. A component says what a command does with `useShortcut(id, run, enabled)`; the newest handler mounted runs. A key a component already handled (`defaultPrevented`), a key held down and a key that composes a character start nothing.
- Where the focus is decides what may start (`firesIn`): anything on the page; only a shortcut with Cmd or Control in a field, a menu, a list or a popover; nothing while a dialog stops the page or while Settings listens for new keys (`pauseShortcuts`).
- One key starts one thing: giving a command keys another has takes them from it (`assignKeys`), and Settings reports the move with Undo. Keys the computer or the app keep are refused (`refusalOf`).
- A control a shortcut also presses takes its keys in its hover text and in `aria-keyshortcuts` (`useShortcutHint`).
- A symbol is read from its key's place when a modifier types something else there (`PUNCTUATION`): Option on a Mac turns the backslash of `⌥⌘\` into «.

## Engines

An engine runs one agent CLI in a folder of the sample's own under the system's temporary folder (`src/infrastructure/engines/`, `makeWorkdir` in `src/infrastructure/workdir.ts`), and what the agent made is moved into the sample when it ends ([files.md](files.md#a-run)). A model or effort outside what an engine takes is refused before anything starts (`chosen` in `engines/stream.ts`).

### claude

- Command: `claude -p --output-format stream-json --verbose --no-session-persistence --strict-mcp-config --setting-sources project --permission-mode acceptEdits`.
- `--allowedTools` comes from the case's `allowed_tools` (by default Read, Write, Edit, Glob, Grep and Bash).
- `--setting-sources project` keeps the user's settings out, and with them the user's skills and `~/.claude/CLAUDE.md`; `--strict-mcp-config` keeps every MCP server out. Neither stops the CLI reading a `CLAUDE.md` from each folder above the one it starts in, or skills from each `.claude/skills` above it up to the nearest git root: the agent's folder has nothing above it, so those are none. The skills the CLI ships with itself still load. Checked live on 2026-11-15: a marked `CLAUDE.md` and a marked skill above the agent's folder came back, and with the folder under the temporary one neither they nor the user's own did.
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
- The CLI takes no list of tools, and `--force` lets it run every one, so a case's `allowed_tools` does not reach it (`limitsTools: false`). The Run panel says so under **Agent** when a ticked case sets them.
- This adapter has not been run against a live account.

Isolation is by place and by convention. The agent's folder has nothing of the skill or the run above it, and the skill copy omits `evals/`. The prompt forbids reading outside the folder, but nothing stops an agent that follows an absolute path, or `../..` to the temporary folder, where the folders of other samples being written at the same time sit.

## The assistant

Four providers sit behind one port (`src/infrastructure/ai/`). The model in use is a preference, so every control shows the same one. Each vendor's CLI is the main way in, and its API key a supported second. `AI_PROVIDER_IDS` lists the CLI first: that is the order of every model list and of the default. Settings folds the key behind "Use an API key" (`VendorRoutes`).

Only `claude-code` has been run against a live account. A command with pictures attached has not been run live.

The assistant never runs by itself. Every request starts from a press of the writer's (Write with AI, the chat, the selection popout, Write checks with AI, Fix with AI), or from a setting they turned on and can see, and the screen says while it runs and offers Stop. A run of the skill never starts the assistant: grading it is Jev's alone.

### anthropic

- The Anthropic SDK with your key. Replies stream, and a field's shape is enforced with structured outputs.
- The system prompt carries the skill and is the same from turn to turn. It is sent as a text block marked `cache_control: ephemeral`, so a later turn reads it at the cached rate. Where the reader is, the screen and the file or case they have open, changes from turn to turn, so it is a second block after the cached one (`chatBrief` in `src/domain/assist.ts`, `systemBlocks` in `src/infrastructure/ai/anthropic.ts`). The reference files keep their order as the reader moves; the open one goes first only when they do not all fit.
- A provider that takes the brief as one text gets the part that stays the same first and where the reader is after it (`systemText`), so a cache by prefix holds too.
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

### Counting each call

Each model call is one `CallRecord` (`src/domain/cost.ts`), named by the operation it was made for (`AiRequest.operation`, and the second argument of `new Jev`). It is taken where the call is made: `aiProvider()` hands out each provider wrapped (`src/infrastructure/ai/metered.ts`), which counts every reply, refused or not, and writes it to the usage log; `Jev.ask` counts its own; and `generateRun` counts each attempt of the agent from what it keeps in `timing.json`. Records go to every meter the call is made under (`withMeter`, `src/judges/meter.ts`): `st` runs each command under one and prints the sum with `--json`. The app runs under none. An answer kept from before (`judge-cache.json`, `Asking`) asks nobody and has no record. The same wrapper and `Jev.ask` save and replay replies under `ST_AI_RECORD` and `ST_AI_REPLAY` (`src/judges/replies.ts`, [cli.md](cli.md#saved-replies)). A call a replay cannot answer, one with no saved reply or a `--deep` session or a run's agent, which are never saved, throws an error counted to the meter (`unanswered`), and `st` exits 2 with it whatever the command made of the error.

The side panel's slash menu lists the panel's own commands first (`src/renderer/commands.ts`: clear, settings and guide, run in the page and never sent). Then it lists the skills Claude Code can invoke (`src/domain/commands.ts`, `src/infrastructure/ai/commands.ts`), through `ai.commands`. The other providers offer no commands, and the menu does not open on them.

- Only the CLI knows the whole list, with every plugin and override. It prints the list in the `init` event of a run, before the model is asked.
- The lister starts such a run on the smallest model with one turn at most (`--model haiku --max-turns 1`) and ends it as soon as that event arrives.
- It then reads each skill's description from its file: `~/.claude/skills`, `~/.claude/commands`, or the plugin's folder, under `CLAUDE_CONFIG_DIR` when set.
- The list is kept in memory for five minutes. On disk it is kept in `~/.skill-studio/claude-commands.json` with the modification times of the folders it came from: the user's `skills`, `commands`, `plugins` and `settings.json`, and each plugin's folder with its `skills` and `commands`. A restarted backend uses it until one of those changes.

### Changes from the side panel

The assistant can propose changes to the open skill: a whole file (SKILL.md or any other text file of the skill), a case to add or replace, and a version to save.

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

### Reading a run

The assistant reads a graded run as a second reader: it answers the rules and checks Jev was not sure of, and says where in the output it saw each. `st read` runs it and prints how its answers stand ([cli.md](cli.md#reading-a-run)). Nothing in the app reads them yet, and nothing is written to the skill.

- Code owns the work (`readingOfRun` in `src/application/reading.ts`). It reads each output's rules and checks as they are scored now (`runVerdicts` in `src/application/grade.ts`), decides which are asked (`factsAsked` in `src/domain/reading.ts`), and asks once for each case. A case with nothing to ask asks nothing. By default (`ReadingOptions.inline`) the room's files go to the provider's `run` in one message with no tools: `roomText` in `src/infrastructure/reading-room.ts` reads every file of the room but pictures, and `filesMessage` in `src/domain/reading.ts` puts each in a `<file>` block, sheet and request first (`READING_FIRST`), under `READING_BRIEF_INLINE`, the brief with the folder's sentences swapped for the message's (`swapped`): a page is read from its `layout.txt`, since its picture is not sent. With `--deep` the room is read by a session, as below.
- The room is a folder under the system's temporary folder with nothing above it, as a sample's own folder is (`makeRoom` in `src/infrastructure/reading-room.ts`). It holds copies only:
  - `request.md`, what the case asked, and `inputs/`, the files the agent was given, from the run's `_inputs/`;
  - `skill/`, the skill as the run had it, from `_skill/`;
  - a folder for each output: the files its agent wrote, as `run.json` lists them, its `notes.md`, and, where the app drew the page, `page.png` and `layout.txt`, the page's measured elements (`layoutText`);
  - `sheet.md`, the rules and checks to answer for each output, each under a short name (`R3`, `C1`).
- The reader's own answers are never in the room. Jev's sure answers are on the sheet unless the reading is blind, which asks every rule and check and shows none.
- A provider that can be held to one folder has `readFolder` (`AiProvider` in `src/infrastructure/ai/types.ts`). Claude Code has it: `claude -p` started in the room with `--tools Read,Glob,Grep`, no settings and no skills, `--permission-mode dontAsk` and one allow rule, the room itself (`folderArgs` in `src/infrastructure/ai/claude-code.ts`). Checked live on 2026-11-20: a file beside the room and `/etc/hosts` were both refused to Read and to Grep. The other three providers have none yet, and a reading on one is refused. The rule's path has not been run on Windows.
- What the output's files say is material to check, never an instruction: the brief says so (`READING_BRIEF`), and the session has no tool that writes, runs a command or reaches the network.
- The reply is held to a shape (`READING_SCHEMA`) and read as untrusted (`parseReading`). Code then checks it (`checkedMarks`): an answer on a fact that was not asked is left out, and an answer whose quote is not in the file it names is set to "cannot tell". An answer with no quote, as for a picture or for something the output lacks, stands and is counted apart.
- `agreementOf` counts the answers against the reader's own, where they gave one, and against Jev's where Jev was sure.

### Sorting rules and checks

The assistant reads each rule of a skill and each check of its cases once, and says how it is marked: answered by code, asked of Jev, or not markable as written. `st sort` runs it and prints the result ([cli.md](cli.md#sorting-rules-and-checks)). Grading marks each rule and check by its reading ([grading.md](grading.md#readings-who-answers-a-rule-or-a-check)).

- The shape of a reading is `RuleReading` (`src/domain/rule-reading.ts`): `exact`, tests from a closed set with their values, which `answerExact` in `src/domain/exact.ts` answers; `judged`, with the `Span` that says how a long output's parts join (`src/domain/span.ts`); or `unmarkable`, vague or (for a rule) in conflict with another rule, with a fix. `readRuleReading` holds a reading to the shape, and refuses a check in conflict: a check keeps its own reading, and a rule that cannot hold beside it on its case goes in the check's `against` (`CannotHold` in `src/domain/sorting.ts`). Nothing a model writes runs.
- Code owns the work (`sortSkill` in `src/application/sorting.ts`). It makes one call for every rule, with the whole SKILL.md, each rule's heading and the start of each case's request and files, and one call for each case's checks, with the whole SKILL.md and its rules, so a check that cannot hold beside a rule is found, and that case's request and files. Each request and file carries the labels its lines start with (`labelsIn`). Where the same words were read under another stamp, the last such reading is shown beside them (`<earlier>`), and the model is told to keep it unless what changed changes how they are marked. A case's files are never beside another case's checks, and no one reply runs long enough to meet a provider's time limit. The calls go to the model set in Settings, through the provider's `run`, with no tools.
- What the model is told is `SORT_BRIEF`, `rulesPrompt` and `checksPrompt` in `src/domain/sorting.ts`. Every request, file, rule, check and earlier reading is held in a tag as material to read, and a closing tag inside material is broken so it cannot end its tag early. The reply's shape is `SORT_SCHEMA` for the rules and `CHECKS_SCHEMA`, with each check's `against`, for a case's checks: `RULE_READING_SCHEMA` under an object root, with the bounds a strict provider may refuse taken out (`looseSchema`), since `readRuleReading` holds them itself.
- Each reading goes through `parseSorted`. Those it refuses are asked for once more in the same conversation, each with what was wrong (`retryPrompt`). One refused again is kept as `judged` with no span, the way it was graded before sorting.
- The readings are kept in `evals/rule-readings.json` (`src/infrastructure/rule-readings.ts`), each under a stamp of what it was made from: the prompt's version (`SORT_PROMPT_VERSION`), the exact SKILL.md and the rule's words for a rule; the prompt's version, the exact SKILL.md, what its case asks (`askOf`) and the check's words for a check. A reading whose stamp no longer matches is never found. A sort asks only for what has no current reading, unless told `--again`.
- `currentReadings` is what grading calls (`readingsFor` in `src/application/grade.ts`): given the skill folder, the SKILL.md text and a case (and, for a run, the case's kept `ask`), it returns each current reading by the id its verdict carries, and nothing for a rule or a check that has none. A rule a current check of the case names in `against` reads, for that case alone, as `unmarkable` in conflict with that check (`with: 'c1'`) and with the check's fix for it.
- `describeReading` says a reading in plain words, from the reading itself, so what a person is shown is what code will do.
- `scripts/reading-bench/sorted.ts` counts stored readings against the `launch-note` answer key, and `pnpm reading-gate` sorts and grades a copy of it live before a release ([its notes](../scripts/reading-bench/README.md), [releasing.md](releasing.md#check-grading-against-the-key)). `src/interfaces/cli/reading-gate.test.ts` holds its stored gradings and gold readings to pinned numbers in `pnpm check`.

### Proposing checks

The assistant reads a case's answers and proposes checks a good answer to it makes true, for the person to accept, edit or drop. `st propose` runs it, and accepts and drops from the command line ([cli.md](cli.md#proposing-checks)). `proposals.suggest` has the assistant read the named cases and propose, as `st propose` does, on the model chosen in Settings, as a job of kind `read`: it is listed and stopped as a run is, one at a time a skill, and its last log line says how it went. Write checks with AI on Cases asks it once a case has runs (`useReadRuns`). `proposals.size` says first how many characters the case's reading would send, asking no model (`readingSize`): past `LARGE_READING` (100,000, about four usual readings) the screen asks before it reads. Two operations give them to a screen: `proposals.read` lists them as `proposedChecks` reads them, those for every case first and each once, and `proposals.decide` accepts or drops one, or proposes again one that was dropped (`restoreProposals`, `restoreEveryCase`: the Undo of a drop). The Cases screen shows a case's own under its checks (`SuggestedChecks`, [design/layout.md](design/layout.md#suggested-checks)). Its Add does not accept: it puts the words in the case's unsaved draft, so Save and Discard hold them, and the suggestion stays proposed and hidden while a check of the case says the same (`waitingFor` in `src/renderer/suggested.ts`). Its Turn down drops at once.

- Code owns the work (`proposeChecks` in `src/application/proposing.ts`). For each case it picks the answers (`answersFor`): the latest finished attempt of the latest run of each version that answered the case as it asks now (`takenCase` with no `earlier`), newest version first, and the latest one made without the skill, `ANSWERS_MAX` (4) in all. One request per case. By default (`ProposeOptions.inline`) the room's files go to the provider's `run` in one message with no tools: `roomText` reads every file of the room but pictures, and `filesMessage` puts each in a `<file>` block, in the order to read them (`PROPOSE_FIRST`), under `PROPOSE_BRIEF_INLINE`, the brief with the folder's sentences swapped for the message's. A file's text goes in as it is, so a quote copied from it is held against the same text. With `--deep` it is one session per case through the provider's `readFolder`, as `st read`'s, which sees a page as drawn and costs about ten times as much: a session sends its tools' instructions and all it has read on every step.
- The room is `makeProposalRoom` in `src/infrastructure/proposal-room.ts`, made as `st read`'s is: the request, its files under `inputs/`, the case's note, its checks with the checks for every case, and each answer's outputs and drawn page under a letter, in an order hashed from the case and the run so it says nothing of which answer is which. It holds no part of the skill and no agent's `notes.md`, which often names the rule it followed: a check drawn from the skill's rules would measure obedience again.
- What the model is told is `PROPOSE_BRIEF`, `PROPOSE_PROMPT` and `proposalSheet` in `src/domain/proposal.ts`: the note's facts first, then what must not appear, then the faults seen in the answers, each standing on words of the request, its files or the note that ask for all of it, `PROPOSALS_MAX` (6) at most, and a list of the note's facts, each with the check or proposal that covers it or why it cannot be a check. A case read again has `earlier.md` in its room (`earlierSheet`): what was proposed before, to keep unless something changed, and what was left out for asking too much. Everything in the room is material to read. The reply's shape is `PROPOSE_SCHEMA`.
- `parseProposals` takes each proposal whole or refuses it with what was wrong: its basis quote must be in the request, the note or an input file, and its fault quote in the file of the answer it names, word for word (`quoteHolds` in `src/domain/reading.ts`). The refused ones are asked for once more, in a new request with the first reply and what was wrong (`retryText`); one refused again is dropped. `pickProposals` leaves out one that says what a check says, one the person dropped, and the second of two that say the same, in the same words give or take case and punctuation (`sameWords`). `tellsOf` says from the model's word on each answer whether it tells them apart. Each listed fact of the note is held to a quote of the note and to a check or proposal there is (`readFact`); `unlistedOf` finds the note's words no fact holds.
- Jev is asked two things about proposals, each question both ways round and the two answers read as one (`bothWays`), from `src/judges/proposals.ts`. Per case, in one request: whether the whole lines a proposal's basis quote stands in ask for all of it (`basisQuestions`); one Jev is sure does not is left out and kept in the case's read as `overreach`, before `PROPOSALS_MAX` is counted. After every case, in one request: whether each two proposals of different cases in other words, each with the whole lines it stands on, and each one and each check for every case, ask the same of an answer (`sameQuestions`). Each case's name for its answer is read as "The answer" first (`answerNoun`, `asAnswer`), so the same words on an email case and a page case join without Jev. `joinGroups` makes one set of each set Jev is sure of; a set on two cases or more is one proposal for every case, whatever scope the assistant gave its members, and one a check for every case says is left out. Without Jev (`ProposeOptions.jev` null) neither is asked, and only proposals in the same words are joined. Jev's answers are kept in `proposals.json` by a hash of what was asked (`askedKey`), so a run on unchanged input asks nothing.
- The proposals are kept in `evals/proposals.json` (`src/infrastructure/proposals.ts`) under a stamp of what they were made from (`caseStamp`), with a record of each case's last reading, so a case is read again only when that changes. `acceptProposals` adds checks through `saveCase`, the code the Cases screen saves with; `dropProposals` marks them dropped. `acceptEveryCase` writes a proposal for every case as one file in `evals/graders/` through `saveEveryCase` in `src/infrastructure/cases.ts`, beside `loadEveryCase`, and changes no case; `dropEveryCase` turns it and its members down.

### Improving a selected rule

Selecting four or more words in SKILL.md opens a popout with three actions. Code owns each workflow; a model only writes prose.

1. `src/domain/lint.ts` checks each top-level bullet in the selection by word lists and counts: a hedge word nothing answers (a measure answers any hedge, an absolute only one about effort, and "each" or "every" answers none), an outcome adjective or a definition in the rule's first sentence, a missing reason, nested bullets, piled conditions, a rule that asks for more than four things at once (Jev gives a rule one answer, so it cannot say which part was missed), a phrase that adds words and changes nothing (`FILLERS`), several words where one exact word says the same (`WORDY`), and the file's size band. Prose, steps and code are not rules and get no findings. A bare rule with no hedge and no number is left to Jev. Free and instant.
   - A rule has no word limit. Anthropic's guide to writing skills sets one for the file alone, 500 lines, and asks of each piece whether it earns what it costs. So a finding names something the writer can change, and changing it clears the finding.
   - The number in the margin and the underlined words read the rule alone (`lintRule`). The file's size is a finding about the file (`dimension: 'file'`), shown in the popout and never on a rule's number.
2. `src/judges/rule/index.ts` asks Jev one request over the rule and two lines either side: a yes/no per principle (`RULE_GUIDE`) and a complexity score. `src/domain/improve.ts` turns the probabilities into findings: holds above 0.7, drifts below 0.3, a maybe between. Without a TypeSafe key only step 1 runs.
3. Then a model is asked, with the findings as its brief:
   - **Auto refine** (`ai.refine`) asks for one revision when new words can fix a finding (`toFix`), and for nothing otherwise: when the rule complies, and when its trouble is not its wording. A line that changes nothing, a rule for another skill and a long file are not fixed by a rewrite, so the popout says so and offers Help me improve. The finished run's text is the `Revision` as JSON.
   - **Suggest changes** (`ai.rewrites`) asks for three rewrites in one reply: Best practice, More direct, and a third that fits the rule (`kindsFor`). The third is Shorter, or Split up when the selection is one rule the checks read as asking for several things or holding several conditions. Jev then checks that each kept the selection's facts, asked as whether following the rewrite would follow the rule (`keptQuestion`), so a rewrite that adds a number or a reason is not read as one that lost a fact. The finished run's text is the `RewritesResult` as JSON.
   - **Help me improve** (`improve.*`) is a conversation in the side panel, below.
4. A rewrite that says it fixes what the checks found is read by those checks before it is shown (`openIn`): Auto refine's revision and the Best practice rewrite.
   - Code reads it rule by rule. Jev reads it too when it read the selection and the rewrite is still one rule, since its questions are about one.
   - Only what Jev is sure of counts. An answer between 0.3 and 0.7 is no finding.
   - A rewrite that leaves a finding open is sent back to the model once, with its own text and what is still open (`oneMoreTry`). The second is taken only when it leaves less open. There is never a third request.
   - What is still open after that is said under the rewrite as what it needs (`needsOf`: "a reason", "a number, or an always or never"), with Help me improve beside it, which asks the writer for it.
5. Code decides what a card offers (`withheld`), so a card never holds less than its label says. A Shorter that is no shorter is "Nothing to cut", a Split up still in one piece is "Nothing to split", and any rewrite that is the selection again is "Same as the selection". The model may hand the selection back as its Shorter: a rule is as long as what it says needs.

Help me improve:

- `improve.start` opens it and asks the model nothing. Jev starts reading the rule at once, and the writer's first message (`improve.send`) waits on that reading and sets the course.
- With `walk`, it asks the questions in `IMPROVE_STEPS` in a fixed order, skipping those the judge already cleared. After each reply Jev says whether the question was answered, and code moves on or asks once more. A reply Jev could not read counts as answered, and the panel says so under the conversation (`ImproveThread.unread`). A key TypeSafe refuses is said, as when the rule is read, and the reply is kept out so it can be sent again.
- Without `walk`, the model drafts from what the writer asked, fixing what the checks found.
- The draft is the last fenced block of the reply (`draftReply` splits a reply around it). The newest draft's checklist is how it stands against the guide (`checklistOf`): Jev's reading, a miss only where Jev is sure, and what code finds in the draft, the same checks that mark the rule in the editor once the draft is applied. Once a draft stands, a question gets an answer and no draft, and a request gets a whole new draft.
- The editor follows the rule as a range that maps through every edit (`src/renderer/editor/improving.ts`) and publishes its text (`setPassage` in `src/renderer/replace.ts`). Apply puts a draft there through the registered replacer. The next `improve.send` carries the text as `current`, so the model works on the rule as it reads now.
- The conversation stays open after Apply. A rule picked while the last one is still opening takes its place.

The run kinds `refine`, `rewrites`, `improve` and `fix` sit beside `assist` and `chat` in `src/domain/ai.ts`.

### Fixing a broken rule from Results

**Fix with AI** on a broken rule's row (`FixWithAi` in `src/renderer/components/FixWithAi.tsx`) drafts a change to the rule from one short sheet of evidence, in one message, and the writer applies it and runs the case again.

- `ai.fix` takes the run, the attempt and the rule's words, and starts a run of kind `fix` (`startFix` in `src/application/ai.ts`) on the model chosen in Settings, through the provider's `run`, with no tools.
- The sheet (`fixPrompt` in `src/domain/fix.ts`) holds the rule as SKILL.md writes it now, list mark and all (`ruleSource`, found by the rule's words through `scanRules`), the case's request, and the files the attempt wrote, read as text (`answerText` in `src/infrastructure/answer-files.ts`, pictures left out) and cut to `ANSWER_BUDGET` (24,000 characters, `sheetFiles`). It holds no other rule and no agent's `notes.md`. A rule no longer in SKILL.md as the run read it is refused before anything is asked.
- The reply's shape is `FIX_SCHEMA`: `why`, one sentence on what in the answer broke the rule, and `revision`, the rule's whole new text, or the rule unchanged when the answer did follow it. `fixDraftOf` reads it and keeps the rule's list mark; the finished run's text is the `FixDraft` as JSON.
- Apply and run replaces the rule's lines in SKILL.md as saved (`replaceRule`, in the file's own line endings) through `skill.saveFile`, after asking when that drops unsaved edits to SKILL.md. Then `skill.generate` runs the case alone, one attempt, with the writer of the answer being fixed, as a new version named `Fix: ` and the rule's first words (`fixVersionName`), with the reason as its note. It is an ordinary run: graded when done, its answer the case's newest on Results.
