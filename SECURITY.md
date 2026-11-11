# Security

## Reporting a vulnerability

Report vulnerabilities privately through [GitHub's advisory form](https://github.com/milesroxas/skill-studio/security/advisories/new), not in a public issue. Expect a first reply within a week.

Fixes go into the next release. Only the latest release is supported.

## Checking a download

Packages come from [Releases](https://github.com/milesroxas/skill-studio/releases) only, built by the `release` workflow from a tag on `main`. A published release and its tag cannot be changed afterwards.

- The Mac app is signed with a Developer ID certificate and notarized by Apple. The Windows and Linux packages are not signed.
- Every package carries a build provenance attestation. `gh attestation verify <file> -R milesroxas/skill-studio` confirms a file was built by that workflow. The release also holds that provenance as `skill-studio-<version>.intoto.jsonl`, to check offline with `--bundle`.

## Updates

Releases after 0.1.0-beta.2 update themselves from GitHub, over HTTPS.

- A download is installed only when it matches the SHA-512 hash the release publishes for it. On macOS the system also refuses an update not signed by the same Developer ID as the running app. On Windows and Linux the hash is the only check.
- The check for a new version asks GitHub for the release list. It carries nothing about you, your skills or the copy that asks: the per-install ID the updater would add is replaced with a fixed word.
- Settings, Updates turns the automatic check off.

## What to know before running it

Skill Studio runs coding agents and executes the code they write. Treat every skill and case you did not write as untrusted, and run it in a container or VM.

### Agents and their code

- Grading runs two shell commands, both written by the skill's author and both with your user's permissions. The `code` pack's check command (`bench.check` in a case's `case.yaml`) runs in the sample directory, so it also executes the code the agent wrote. The `writing` pack's lint command (`lint.command` in `evals/bench.json`) runs in the skill's folder. Grading a run of someone else's skill therefore runs their commands, even when no agent is started.
- Agents run with `--permission-mode acceptEdits` (claude) or `--force --trust` (cursor-agent). Isolation is by convention: nothing stops an agent that follows an absolute path out of its sample directory.
- Agents, the check and lint commands, and the Claude Code or Codex CLI the assistant runs, get the backend's environment less the app's own keys: `TYPESAFE_API_KEY` and every variable starting `SKILL_STUDIO_` are dropped (`src/domain/env.ts`), so an agent with Bash cannot read them.
- An agent is started in its own process group, and ending it, on Stop, on a timeout or when the app quits, ends the group, so a shell it started with Bash goes with it. A check or lint command runs the same way, and on macOS and Linux what it left running in the background (a server started with `&`) is ended once the command exits. Quitting waits up to three seconds for that. `st run`, `st grade` and `st serve` end their agents the same way on Ctrl-C, a request to stop or the terminal closing, and then exit. The app's backend and `st` record the agents they start in `~/.skill-studio/agents.json`, each under the copy that started it. A copy that starts later ends the agents of a copy that is gone, after checking that each pid still names that command and started when the record says, and leaves alone those of a copy still running.
- Artifacts are served under one sandbox policy (`artifactPolicy` in `src/application/api/artifact-page.ts`) and shown in an iframe with `sandbox="allow-scripts"`, or in their own tab or window under the same header. An agent's page runs its own scripts, so a page built by a script shows as written, but only in an origin of its own: without `allow-same-origin` it cannot reach the app's page, its storage, cookies or windows, and without `allow-forms`, `allow-popups` or `allow-top-navigation` it cannot submit a form, open a window or move the window away. `default-src 'none'` and `connect-src 'none'` keep it off the network: it loads only files samples wrote and pictures, of skills open already, and inline or `data:` content. Asking for either never opens a skill. It can still keep a processor busy while it is shown, and WebRTC is outside what a content policy governs; it knows nothing the agent did not write. A bypass is in scope.
- To judge a page as drawn, the desktop app opens it in an offscreen window under the same policy, with no preload, no new windows and no navigation, at the case's size or 1280 by 960, and at 390 pixels wide for a case that asks for a phone, and keeps a PNG of each in the sample's `renders/` folder. The window is closed after each picture.

### The web server

- `st serve` binds to `127.0.0.1`. It answers only requests addressed to `localhost`, `127.0.0.1` or `[::1]`, and refuses one that another site's page sent. Do not expose it on a network any other way than `--tailscale`.
- Every start makes a new token, 32 random bytes, and prints the address to open with the token in it. The first page load trades the token for a cookie (`HttpOnly`, `SameSite=Strict`) and goes on to the same address without it. Every later request, for a page, a file or an operation, needs that cookie, or the token as `?token=` on the call. A request with neither gets `401`. The one exception is a file a sample wrote: a page an agent wrote runs in an origin of its own and sends no cookie for the files beside it, so those are asked for under `/api/artifact/<key>/...`, with a second random key each start makes, and the key stands in for the cookie. It reads samples' files of skills open already, and calls no operation; where the request comes from is checked as for any other. The app's page carries it, and so does every page an agent wrote, in its own address. This holds for requests from the tailnet too.
- Another account on the same machine can connect to the port, and without the token it gets nothing: no page, no file, no operation. It cannot read the token from your terminal, and your browser hands it only to servers on `localhost`, as the cookie point below says.
- `--open` does not put the token on the opener's command line, which other accounts can list (on Linux, for as long as the browser it starts runs). It hands the browser an address with a one-use ticket instead, good for a minute: the first load trades it for the cookie and goes on without it, and the address left in the browser's history is worth nothing after. An account that read the ticket and loaded it before your browser did would get the cookie, and your browser would then be refused, so you would see it. The address `st serve` prints still carries the token: the terminal is yours.
- The cookie is named for the port (`st_token_<port>`) so two servers do not sign each other out, but a browser keeps cookies by host name whatever the port, so it sends this cookie to any server on `localhost` it visits. A program serving another `localhost` port that this browser loads a page or a file from receives the token while this server runs. The token changes at every start, so one read that way works only until the server stops.
- A request body may hold 32 MB at most. A larger one gets `413`, and the server reads no further.
- The page is served under the desktop app's Content Security Policy, with scripts from the server only, one nonce per page load for the editor's style tag, and frames and pictures from the server's own origin.
- `st serve --tailscale` proxies one HTTPS port on your tailnet name with `tailscale serve`, and prints the tailnet address with the token in it. A request from the tailnet needs the token or the cookie like any other, and also the login of the owner of this machine, which the server reads from the headers `tailscale serve` adds. Funnel (public) traffic, tagged devices and other tailnet users are refused. The server cannot tell that proxy from another program on this machine, which is why the login alone lets nothing in. On the tailnet the cookie is also `Secure`. The mapping ends when the server stops, whether by Ctrl-C, a request to stop or the terminal closing. A way around these checks is in scope.

### The desktop app

- The renderer runs sandboxed, with context isolation and no Node. It reaches the main process only through the preload bridge, and every IPC message is checked against the sending frame's origin.
- Pages load from the `studio://` scheme under a Content Security Policy that allows the app's own scripts only. Navigation away from the app, new windows and permission requests are refused; web links open in the default browser.
- The packaged app runs only the code in its own archive. It cannot be started as plain Node, and it ignores `NODE_OPTIONS` and Node's `--inspect` flags. It loads its page from the archive whatever its environment names, and it quits at once when started with one of Chromium's remote debugging switches (`--remote-debugging-port` and the like). On macOS and Windows it refuses an archive changed after the build.
- A way for a page, including an artifact, to reach Node, the file system or an operation it should not is in scope.

### Keys

- The keys the app stores (TypeSafe, Anthropic, OpenAI) are encrypted with Electron's `safeStorage`, whose key the OS keychain holds, and written whole to the app's user data folder, readable by your user only. A keys file that cannot be read counts as no keys: the app opens, says so once, and the keys can be set again.
- A development copy (`pnpm dev`, or the built app run by the stock Electron binary) runs as Skill Studio Dev and keeps its own keychain item, `Skill Studio Dev Safe Storage`. The stock binary is signed ad hoc, so macOS knows it only by its hash; it is never on the installed app's item, whose key only the signed app reads.
- On Linux with no keyring, `safeStorage` falls back to a fixed key anyone can read (`basic_text`). The app then refuses to store a key and says to set the environment variable instead.
- The main process and the backend hold them, never the page.
- A stored Anthropic or OpenAI key reaches the backend under a name of the app's own, so an agent the app starts does not find it in `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`.

### The assistant

- A request goes to the provider you chose with what it is about: your instruction, the field's text, the skill, case or output beside it, and any picture you attach. A request about a case carries that case's pictures too.
- The Assistant panel sends the open skill as you have it with each message, your unsaved edits included: `SKILL.md` whole, then the files under `references/` and the cases, up to about 40,000 characters of those together. The open file goes first, and a case past that limit is sent by its title only. It also sends the conversation so far (its last 40 messages, up to 24,000 characters), the name of the screen you are on, the file or case you have open there, and the pictures you add.
- Auto refine, Suggest changes and Help me improve also send the selected rule, the lines around it and the skill's description to Jev, with your TypeSafe key. Jev then reads the rewrites the model offers, or your draft and answers in Help me improve.
- No content is sent until you ask. With a stored Anthropic or OpenAI key, the app asks that provider for its list of models when it opens.
- A reply in the Assistant panel can propose changes to the open skill: SKILL.md, a file under `references/`, a case, or a version. Nothing changes until you click its button, which goes through the same checks as saving from the Skill or Cases screen. A change applies only to the skill the reply was written about, and only while that skill is open.
- The Claude Code provider runs with no tools, so a reply cannot read or change files. The Codex provider runs in a read-only sandbox: it can read files and cannot change them.
