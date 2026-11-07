# Skill and run files

Everything Skill Studio knows about a skill is plain files in the skill's `evals/` folder, so it can be committed and reviewed like code. The app's own files are in `~/.skill-studio/`.

## A skill

```
<skill>/
  SKILL.md                        rules are its top-level bullets (or `rules` in bench.json)
  references/                     snapshotted with SKILL.md as the skill's version
  evals/
    cases/<case>/prompt.md        the task; front matter: max_turns, timeout_seconds, allowed_tools
    cases/<case>/case.yaml        title, expected_outcome, bench
    cases/<case>/graders/*.md     one check each; front matter: weight, image
    cases/<case>/files/           input files and pictures the agent gets
    cases/<case>/references/      pictures a check is about
    evals.json                    legacy skill-creator cases, read when no folder has the same id
    bench.json                    packs, weights and thresholds (see grading.md)
    anchors/*.md                  labelled outputs for `st self-test`; front matter: case, label, tests, about
    reviews.json                  your ratings and pairwise votes
    versions/<vN>/                a saved version: version.json and files/
    runs/                         one directory per run, below
```

- A grader file must start with front matter (`---`), even an empty block. A file without it is skipped.
- `max_turns` is not passed to the agent. The workflow pack compares it with the number of tool calls.
- `fixtures/` holds three small skills with generated runs: `demo-skill` (generic pack), `code-skill` (code pack) and `design-skill` (design pack). Each also runs the workflow pack.

### The `bench` block of `case.yaml`

| Key | Does |
| --- | --- |
| `artifact` | The kind of output to grade: `markdown`, `html`, `image`, `code` or `transcript` |
| `kind` | The writing pack's kind: `article`, `linkedinPost`, `coverLetter` or `youtubeScript` |
| `words` | `[min, max]`, the word range the output should fall in |
| `evidence` | Skill-relative files the writing pack checks claims against |
| `check` | The command the code pack runs; its exit code is the check layer |
| `judge` | `false` skips Jev for this case in the generic and writing packs |
| `aiBuilt` | `true` when AI helped build the work described; the writing pack flags copy that does not say so |

## A run

```
evals/runs/<date>-skill-<vN>-<engine>-<model>[-<effort>][-<configuration>]/
  run.json                        skill version and hash, writer, cases, per-sample cost and tokens
  report.json                     raw judge answers and scores per sample, written by grading
  _skill/                         SKILL.md and references/ as they were for this run
  <case>-s<n>/                    one sample: the agent's working directory
    prompt.md                     the exact prompt sent
    files/                        the case's input files
    .agents/skills/<name>/        the skill copy the agent saw, without evals/
    outputs/                      everything the agent produced; graded artifacts come from here
    notes.md                      what the agent would have told the user
    transcript.jsonl              one event per line: system, text, thinking, tool, result, error
    timing.json                   start, end, duration, cost, tokens, model
    agent.json                    exit state, error, the agent's last message
```

`.claude/skills` and `.cursor/skills` in a sample link to `.agents/skills`. A `without_skill` sample has none of the three.

## Versions

A skill's version is a hash of `SKILL.md` and `references/`. Save one in the app (it lands in `evals/versions/`), or let a run name it: a changed tree needs a name on its first run (`--name`), and later runs reuse the version. Saved and run versions share one numbering.

A run's configuration says which skill the agent saw:

- `with_skill` (the default): the skill as it is now.
- `without_skill`: no skill in the workspace, and no line in the prompt pointing at one.
- `old_skill --baseline <run>`: that run's `_skill/` snapshot. It holds `SKILL.md` and `references/` only, so scripts are absent.

## The app's own files

`~/.skill-studio/` holds what does not belong to one skill:

| Path | Holds |
| --- | --- |
| `library.json` | The workspace folders the Library scans, skills marked as someone else's, and skills opened recently |
| `preferences.json` | Theme, motion, editor view, hints, the assistant's model, the update setting |
| `drafts/` | Unsaved edits to files and cases |
| `practice/` | The walkthrough's skill, and `seen.json`: the walkthrough steps that only ask you to look at a screen, once you have |
| `chat.json`, `ai-usage.json` | The Assistant's conversation and its usage log |
| `uploads/` | Pictures added but not yet saved in a case, cleared after 30 days unused |
| `trash/` | The last deleted version, until the next delete |

Stored API keys are not here: the desktop app keeps them encrypted in its own user data folder ([SECURITY.md](../SECURITY.md)).
