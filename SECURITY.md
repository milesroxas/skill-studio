# Security

## Reporting a vulnerability

Report vulnerabilities privately through [GitHub's advisory form](https://github.com/milesroxas/skill-studio/security/advisories/new), not in a public issue. Expect a first reply within a week.

Fixes go into the next release. Only the latest release is supported.

## Checking a download

Packages come from [Releases](https://github.com/milesroxas/skill-studio/releases) only, built by the `release` workflow from a tag on `main`. A published release and its tag cannot be changed afterwards.

- The Mac app is signed with a Developer ID certificate and notarized by Apple. The Windows and Linux packages are not signed.
- Every package carries a build provenance attestation. `gh attestation verify <file> -R milesroxas/skill-studio` confirms a file was built by that workflow. The release also holds that provenance as `skill-studio-<version>.intoto.jsonl`, to check offline with `--bundle`.

## What to know before running it

Skill Studio runs coding agents and executes the code they write. Treat every skill and case you have not written yourself as untrusted.

- The `code` pack's check command runs in the sample directory, so it executes agent-written code with your user's permissions. Run untrusted skills in a container or VM.
- Agents run with `--permission-mode acceptEdits` (claude) or `--force` (cursor-agent). Isolation is by convention: nothing stops an agent that follows an absolute path out of its sample directory.
- `st serve` binds to `127.0.0.1` and has no login of its own. It answers only requests addressed to `localhost`. Do not expose it on a network any other way.
- `st serve --tailscale` is the one supported way to reach it from another device. It proxies one HTTPS port on your tailnet name with `tailscale serve`, and the server lets a request through only if Tailscale signed it in as the login that owns the machine. Funnel (public) traffic, tagged devices and other tailnet users carry no matching login and are refused. The mapping ends when the server stops. A way around that check is in scope.
- Artifacts are served with `Content-Security-Policy: sandbox; script-src 'none'` and shown in a sandboxed iframe, or opened in their own tab or window under the same header, so agent-written HTML cannot script the app. A bypass of that is in scope.
- The desktop app's renderer runs sandboxed with context isolation and no Node. It reaches the main process only through the preload bridge, and every IPC message is checked against the sending frame's origin. Pages load from the `studio://` scheme under a Content Security Policy that allows the app's own scripts only. Navigation away from the app, new windows and permission requests are refused; web links open in the default browser. A way for a page, including an artifact, to reach Node, the file system or an operation it should not is in scope.
- The packaged app runs only the code in its own archive. It cannot be started as plain Node, and it ignores `NODE_OPTIONS` and Node's `--inspect` flags. Where Electron supports the check (macOS and Windows), it refuses an archive that was changed after the build.
- The keys the app stores (TypeSafe, Anthropic, OpenAI) go through Electron's `safeStorage` (the OS keychain) into the app's user data folder, readable by your user only. They are held by the main process and the backend, never by the page. A stored Anthropic or OpenAI key reaches the backend under a name of the app's own, so an agent the app starts does not find it in `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`.
- The assistant sends what you ask it to the provider you chose: the request, the field's text, the skill, case or output beside it, and any picture you attach. A request about a case carries that case's pictures too. The Assistant panel sends the open skill's `SKILL.md` and cases with each message, and the pictures you add to it. Nothing is sent until you ask. The Claude Code and Codex providers run with no tools, so a reply cannot read or change files.
