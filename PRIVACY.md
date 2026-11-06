# Privacy

Skill Studio is a desktop app that runs on your computer. It has no account, no server of its own, no analytics and no crash reporting. Nobody behind the app receives your skills, your outputs or anything about you.

Data leaves your computer only in the cases below, and only to the service named. Each service handles what it receives under its own privacy policy and terms.

## What the app sends, and where

| When | Goes to | What is sent |
| --- | --- | --- |
| You start a run | The agent you chose: Anthropic through the `claude` CLI, or Cursor through `cursor-agent` | The case's prompt and input files, and the skill. The agent then reads and sends whatever it chooses from its working directory. It runs under your own sign-in or key. |
| You grade a run with Jev | [TypeSafe](https://typesafe.ai), with your TypeSafe key | The output being graded, the case it answers, the checks and rules it is graded against, and their pictures. |
| You ask the assistant | The provider you chose: Anthropic or OpenAI with your key, or the `claude` or `codex` CLI under your sign-in | Your instruction, the text it is about, and the skill, case or output beside it. [SECURITY.md](SECURITY.md#the-assistant) lists exactly what each request carries. |
| The app opens, with an Anthropic or OpenAI key stored | That provider | A request for its list of models. No content. |
| The app looks for an update | GitHub | A request for the release list. It carries no ID for your copy, and nothing about you or your skills. Settings, Updates turns the automatic check off. |
| You open a link | Your web browser | The link. Pages open outside the app. |

Nothing is sent to TypeSafe, Anthropic or OpenAI until you start a run, a grade or a request yourself.

## What stays on your computer

- Everything about a skill (cases, runs, reports, your ratings) is plain files in the skill's `evals/` folder ([docs/files.md](docs/files.md)).
- The app's own files are in `~/.skill-studio/`: your workspace folders, preferences, drafts, the assistant's conversation and a log of its token usage.
- API keys you store are encrypted with your operating system's keychain and kept in the app's user data folder. They are sent only to the service they belong to.

To remove everything, delete `~/.skill-studio/`, the app's user data folder and the `evals/` folders you want gone.

## The web server

`st serve` answers only on your own computer, or on your own tailnet with `--tailscale`. It sends nothing anywhere ([SECURITY.md](SECURITY.md#the-web-server)).

## Changes

A change to what the app sends is listed in [CHANGELOG.md](CHANGELOG.md) and updates this file in the same release.

## Questions

Open an [issue](https://github.com/milesroxas/skill-studio/issues). For a privacy problem you would rather not post in public, use the [private advisory form](https://github.com/milesroxas/skill-studio/security/advisories/new).
