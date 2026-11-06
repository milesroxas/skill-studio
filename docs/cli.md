# Command line and web server

The `st` command runs from a checkout and uses the same files as the app:

```
pnpm st <command> [skill-dir] [options]
```

A skill directory is any folder with a `SKILL.md`. Paths are read from the checkout's root. To try a command without writing a skill, use `fixtures/demo-skill`.

## Commands

| Command | Does |
| --- | --- |
| `new <dir>` | Scaffold a skill. `--template` is `blank`, `writing`, `code`, `workflow` or `design`; `--with-cases` adds the template's sample cases |
| `cases` | List the skill's cases |
| `run` | Generate outputs with a headless agent, then grade them |
| `grade` | Grade a run again: `--run <name>` or `--all` |
| `report` | Print a run's report: `--run <name>` |
| `compare <runA> <runB>` | Score differences between two graded runs |
| `versions` | List the skill versions seen in runs, and the working tree's |
| `self-test` | Grade `evals/anchors` and check that bad anchors lose to good ones |
| `serve [skill...]` | Start the app as a web server, below |

```
pnpm st new skills/release-notes --template writing --with-cases
pnpm st run skills/release-notes --engine claude --model sonnet --samples 2 --name "what changed"
pnpm st report skills/release-notes --run <run-name>
```

`run` takes `--engine` (`claude` or `cursor`), `--model`, `--effort`, `--cases a,b`, `--samples n`, `--configuration` with `--baseline <run>` ([versions](files.md#versions)), `--name`, `--note`, `--parallel n` and `--no-grade`.

Every grading command takes `--no-jev`, `--packs a,b`, `--bench <file>` and `--jev-model <id>` ([grading](grading.md)). `--json` prints JSON instead of a table. `pnpm st --help` lists every command and flag.

The CLI covers scaffolding, runs, grading and reports. Rating, voting, saving versions and tuning the scoring are in the app only.

## The web server

`st serve` runs the same app in a browser:

```
pnpm build
pnpm st serve                 # http://localhost:4400
pnpm st serve --tailscale     # also https://<this-machine>.<tailnet>.ts.net:8443
```

`--port` and `--tailscale-port` change the ports, and `--open` opens a browser. With no skill named, the server opens on the Library.

The server listens on `127.0.0.1` only and has no login of its own. `--tailscale` is the one supported way to reach it from another device: it lets in the Tailscale login that owns this machine and nobody else, and the tailnet address goes away when the server stops. Do not expose the server any other way. [SECURITY.md](../SECURITY.md#the-web-server) has the details.

In a browser, API keys come from the environment or a `.env` in the checkout. The Settings screen stores keys in the desktop app only.

## HTTP API

Every operation is `POST /api/<name>` with its input as a JSON body. Operations on a skill take `skill`, its path, in the body. [`src/application/api/contract.ts`](../src/application/api/contract.ts) lists every operation with its input and output.

Two operations answer with a file and also take `GET`, so a page can load them by URL:

```
/api/artifact?skill=&run=&sample=&file=
/api/image?skill=&file=&upload=
```

Both are served raw with `Content-Security-Policy: sandbox; script-src 'none'`.
