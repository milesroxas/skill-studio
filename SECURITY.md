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

- The `code` pack's check command runs in the sample directory, so it executes agent-written code with your user's permissions.
- Agents run with `--permission-mode acceptEdits` (claude) or `--force --trust` (cursor-agent). Isolation is by convention: nothing stops an agent that follows an absolute path out of its sample directory.
- Agents, the `code` pack's check command, and the Claude Code or Codex CLI the assistant runs, get the backend's environment less the app's own keys: `TYPESAFE_API_KEY` and every variable starting `SKILL_STUDIO_` are dropped (`src/domain/env.ts`), so an agent with Bash cannot read them.
- An agent is started in its own process group, and ending it, on Stop, on a timeout or when the app quits, ends the group, so a shell it started with Bash goes with it. Quitting waits up to three seconds for that. The backend records the agents it starts in `~/.skill-studio/agents.json`; a backend that starts after one crashed ends those still running, after checking that each pid still names that command and started when the record says.
- Artifacts are served with `Content-Security-Policy: sandbox; script-src 'none'` and shown in a sandboxed iframe, or in their own tab or window under the same header, so agent-written HTML cannot script the app. A bypass is in scope.

### The web server

- `st serve` binds to `127.0.0.1` and has no login of its own. It answers only requests addressed to `localhost`, `127.0.0.1` or `[::1]`. Do not expose it on a network any other way than `--tailscale`.
- The page is served under the desktop app's Content Security Policy, with scripts from the server only, one nonce per page load for the editor's style tag, and frames and pictures from the server's own origin.
- `st serve --tailscale` proxies one HTTPS port on your tailnet name with `tailscale serve`. The server lets a request through only if Tailscale signed it in as the login that owns the machine. Funnel (public) traffic, tagged devices and other tailnet users are refused, and the mapping ends when the server stops. A way around that check is in scope.

### The desktop app

- The renderer runs sandboxed, with context isolation and no Node. It reaches the main process only through the preload bridge, and every IPC message is checked against the sending frame's origin.
- Pages load from the `studio://` scheme under a Content Security Policy that allows the app's own scripts only. Navigation away from the app, new windows and permission requests are refused; web links open in the default browser.
- The packaged app runs only the code in its own archive. It cannot be started as plain Node, and it ignores `NODE_OPTIONS` and Node's `--inspect` flags. On macOS and Windows it refuses an archive changed after the build.
- A way for a page, including an artifact, to reach Node, the file system or an operation it should not is in scope.

### Keys

- The keys the app stores (TypeSafe, Anthropic, OpenAI) are encrypted with Electron's `safeStorage`, whose key the OS keychain holds, and written whole to the app's user data folder, readable by your user only. A keys file that cannot be read counts as no keys: the app opens, says so once, and the keys can be set again.
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
