# Security

## Reporting a vulnerability

Report vulnerabilities privately through [GitHub's advisory form](https://github.com/milesroxas/skill-tester/security/advisories/new), not in a public issue. Expect a first reply within a week.

## What to know before running it

skill-tester runs coding agents and executes the code they write. Treat every skill and case you have not written yourself as untrusted.

- The `code` pack's check command runs in the sample directory, so it executes agent-written code with your user's permissions. Run untrusted skills in a container or VM.
- Agents run with `--permission-mode acceptEdits` (claude) or `--force` (cursor-agent). Isolation is by convention: nothing stops an agent that follows an absolute path out of its sample directory.
- `st serve` binds to `127.0.0.1` and has no authentication. Do not expose it on a network.
- Artifacts are served with `Content-Security-Policy: sandbox` and shown in a sandboxed iframe, so agent-written HTML cannot script the API's origin. A bypass of that is in scope.
