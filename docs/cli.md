# Command line and web server

The `st` command runs from a checkout and uses the same files as the app:

```
pnpm st <command> [skill-dir] [options]
```

- A skill directory is any folder with a `SKILL.md`.
- `pnpm` runs the command from the checkout's root, so relative paths are read from there.
- With no skill directory named, the command looks for a `SKILL.md` in the checkout's root. Without one it stops with `No SKILL.md here. Pass the skill directory.`
- To try a command without writing a skill, use `fixtures/demo-skill`.

## Commands

| Command | Does |
| --- | --- |
| `new <dir>` | Scaffold a skill. `--name <id>` is the skill name (default the folder name; it must be a slug). `--description <text>` is its front matter description. `--template` is `blank` (the default), `writing`, `code`, `workflow` or `design`. `--with-cases` adds the template's sample cases |
| `cases` | List the skill's cases |
| `run` | Generate outputs with a headless agent, then grade them |
| `grade` | Grade a run again: `--run <name>` or `--all` |
| `report` | Print a run's report: `--run <name>` |
| `compare <runA> <runB>` | Score differences between two graded runs |
| `versions` | List the skill versions seen in runs, and the working tree's |
| `self-test` | Grade `evals/anchors` and check that bad anchors lose to good ones ([anchors](grading.md#anchors)) |
| `serve [skill...]` | Start the app as a web server, below |

```
pnpm st new skills/release-notes --template writing --with-cases
pnpm st run skills/release-notes --engine claude --model sonnet --samples 2 --name "what changed"
pnpm st report skills/release-notes --run <run-name>
```

`run` takes:

- `--engine`: `claude` (the default) or `cursor`.
- `--model` and `--effort`: default per engine.
- `--cases a,b`: default every case.
- `--samples n`: a whole number from 1 (the default) to 10.
- `--configuration`: `with_skill` (the default), `without_skill`, or `old_skill` with `--baseline <run>` ([versions](files.md#versions)).
- `--name` and `--note`: name the skill version and note on it, when the files changed.
- `--parallel n`: samples in flight (3).
- `--no-grade`: skip grading.

Every grading command takes `--no-jev`, `--packs a,b`, `--bench <file>` and `--jev-model <id>` ([grading](grading.md)). Without `TYPESAFE_API_KEY`, `run`, `grade` and `self-test` print `TYPESAFE_API_KEY is not set: grading without Jev.` to stderr and go on with the code checks.

`--json` prints JSON instead of a table for `cases`, `versions`, `run`, `grade` and `report`. `compare` and `self-test` print tables only. `pnpm st --help` lists every command and flag.

Exit codes: 0 on success. `self-test` exits 1 when any check fails. An error, an unknown command or no command (which prints the help) exits 2. `--help` exits 0.

Corrections, restoring a version and choosing what a skill is graded as are in the app only. The rest of the scoring is `bench.json`, which both read.

## The web server

`st serve` runs the same app in a browser:

```
pnpm build
pnpm st serve                 # http://localhost:4400/?token=...
pnpm st serve --tailscale     # also https://<this-machine>.<tailnet>.ts.net:8443/?token=...
```

`--port` and `--tailscale-port` change the ports, and `--open` opens a browser. With no skill named, the server opens on the Library.

- The server prints the address to open. It ends in `?token=...`, a new token at every start. After a restart, open the newly printed address.
- Opening it stores the token in a cookie and goes on to the same address without it, so a bookmark of the plain address works until the server stops.
- A request with neither the cookie nor the token gets `401`. That includes another account on the same machine.
- `--open` gives the browser an address with a one-use ticket in place of the token, good for one load within a minute. If that browser window is gone, open the printed address.
- The page is served under the desktop app's Content Security Policy, with frames and pictures allowed from the server's own origin.
- The server listens on `127.0.0.1` only. `--tailscale` is the one supported way to reach it from another device. It prints the tailnet address with the token in it and lets in only the Tailscale login that owns this machine, which still needs the token, so open the printed tailnet address on the other device once. The tailnet address goes away when the server stops. Do not expose the server any other way. [SECURITY.md](../SECURITY.md#the-web-server) has the details.
- Ctrl-C, or closing the terminal, stops the server and ends every agent it started. `st run` and `st grade` do the same: Ctrl-C ends the agents in flight, then the command exits. A second Ctrl-C exits at once, without waiting for them.
- An error inside the server that nothing caught is printed, and the server goes on.
- In a browser, API keys come from the environment or a `.env` in the checkout. Settings stores keys in the desktop app only.

## HTTP API

Every operation is `POST /api/<name>` with its input as a JSON body, 32 MB at most. Operations on a skill take `skill`, its path, in the body. A tool outside the browser adds the token to each call: `POST /api/<name>?token=<token>`. [`src/application/api/contract.ts`](../src/application/api/contract.ts) lists every operation with its input and output.

A `GET` that carries `?token=` answers with a redirect to the same address without it and sets the cookie, so a tool follows the redirect and sends the cookie back.

Two operations answer with a file and also take `GET`, so a page can load them by URL:

```
/api/artifact/<key>/<skill>/<run>/<sample>/<file>
/api/image?skill=&file=&upload=
```

- A sample's file is named by its path, with the skill's path encoded as one segment (`%2F` for each slash). So a page an agent wrote loads the files beside it by their relative names.
- Such a page runs in an origin of its own, so the files it loads go out with no cookie. `<key>` stands in for the cookie: a second random key each start makes, which the app's page carries in a `<meta name="skill-studio-artifact-key">` tag. It reads files of skills already open, nothing else.
- `?stage=1` on a page adds the small script Results' stage uses to scroll two pages together.
- Both routes are served raw under a sandbox policy (`artifactPolicy` in `src/application/api/artifact-page.ts`): a page runs its own scripts in an origin of its own and loads nothing from the network.
