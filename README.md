# Skill Studio

[![ci](https://github.com/milesroxas/skill-studio/actions/workflows/ci.yml/badge.svg)](https://github.com/milesroxas/skill-studio/actions/workflows/ci.yml)

A desktop app for writing and testing agent skills. Write a skill, give it cases, run headless coding agents (Claude Code, Cursor's agent) on them, grade the outputs with code checks and [TypeSafe](https://typesafe.ai) Jev judge packs, and rate them blind. Runs, reports and your ratings are plain files beside the skill, in its `evals/` folder.

It is built for outputs that are a matter of judgement, such as writing, HTML and agent process:

- Judge answers are stored, so you can change the scoring without new judge calls.
- A blind review queue measures the judge against your own ratings.
- Labelled good and bad outputs (anchors) show whether a judge pack can be trusted.

![Skill Studio with a skill open on Results: the sidebar on the left, and four runs with a score per case.](docs/images/app.webp)

## Install

Download the package for macOS, Windows or Linux from [Releases](https://github.com/milesroxas/skill-studio/releases). [SECURITY.md](SECURITY.md#checking-a-download) says how to check a download.

You also need:

- The `claude` or `cursor-agent` CLI on your `PATH`, signed in. These agents write the outputs.
- A [TypeSafe](https://typesafe.ai) API key, added under Settings. Without it, grading runs code checks only.
- Optional, to write with AI: an Anthropic or OpenAI API key, or the `claude` or `codex` CLI signed in.

## Run from source

Needs Node 24 or later and pnpm.

```
pnpm install
pnpm dev        # the desktop app, with hot reloading
```

Keys can also come from the environment or a `.env` in the checkout ([.env.example](.env.example)).

## Get started

A first launch opens a welcome that offers a practice skill: a finished skill to take once round the loop. The [guide](docs/guide.md) then walks a skill of your own through each step. It also opens from Guide in the app's sidebar.

## Documentation

| Page | Covers |
| --- | --- |
| [Guide](docs/guide.md) | Using the app, step by step |
| [Skill and run files](docs/files.md) | What a skill, a case and a run hold on disk |
| [Grading](docs/grading.md) | The judge packs, `bench.json` and how scores are made |
| [Command line and web server](docs/cli.md) | The `st` command, `st serve` and the HTTP API |
| [Architecture](docs/architecture.md) | The layers, the desktop app, engines and the assistant |
| [Releasing](docs/releasing.md) | Cutting a release, signing and updates |
| [Release plan](docs/release-plan.md) | What goes into the next release, and what is done |
| [Changelog](CHANGELOG.md) | What changed in each release |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). `pnpm check` runs the typecheck, Biome, fallow and the tests.

## Security

Skill Studio runs coding agents and executes the code they write. Read [SECURITY.md](SECURITY.md) before you run a skill you did not write.

## Privacy

The app has no account, analytics or crash reporting. [PRIVACY.md](PRIVACY.md) lists what it sends, to which service, and when.

## License

[MIT](LICENSE). The license is the only terms for using Skill Studio. The services it calls (Anthropic, OpenAI, Cursor, TypeSafe, GitHub) apply their own terms to what you send them.
