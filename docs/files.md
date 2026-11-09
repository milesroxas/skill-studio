# Skill and run files

Everything Skill Studio knows about a skill is plain files in the skill's `evals/` folder, so it can be committed and reviewed like code. The app's own files are in `~/.skill-studio/` (`SKILL_STUDIO_HOME` stands in for the home folder when set).

## A skill

```
<skill>/
  SKILL.md                        rules are its top-level `-` and `*` bullets (or `rules` in bench.json)
  references/                     snapshotted with SKILL.md as the skill's version
  evals/
    cases/<case>/prompt.md        the task; front matter: tags, max_turns, timeout_seconds, allowed_tools
    cases/<case>/case.yaml        title, expected_outcome, bench
    cases/<case>/graders/*.md     one check each; front matter: type (llm when absent), focus, weight (1 to 5, 1 when absent), image
    cases/<case>/files/           input files and pictures the agent gets
    cases/<case>/references/      pictures a check is about
    <case>/                       a case folder may also sit here, below
    evals.json                    cases in skill-creator's `evals.json` shape, read when no folder has the same id
    bench.json                    packs, points per layer and the threshold (see grading.md)
    anchors/*.md                  labelled outputs for `st self-test`; front matter: case, label, tests, about
    anchors/report.json           what `st self-test` scored, written each time it runs
    reviews.json                  your corrections to Jev's verdicts and your picks between two outputs (see grading.md)
    versions/<vN>/                a version saved by the Assistant: version.json and files/
    runs/                         one directory per run, below
```

- A rule is a top-level bullet of `SKILL.md`; indented lines under it join it as a clause. A bullet under four words, or made only of a link, is not a rule ([grading.md](grading.md#benchjson)).
- Any folder directly under `evals/` is read as a case too, except `runs`, `anchors`, `files`, `results`, `mocks`, `cases`, `node_modules`, `reviews` and `benchmarks`. When a folder under `evals/cases/` has the same id, that one is read.
- A grader file must start with front matter (`---`), even an empty block. A file without it is skipped. Its `weight` is rounded and held to 1 to 5; a value that is not a positive number reads as 1. `type` and `focus` are kept when the case is saved.
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

A second run that would take the same name gets `-2`, then `-3`.

`.claude/skills` and `.cursor/skills` in a sample link to `.agents/skills`. A `without_skill` sample has none of the three.

Graded artifacts are read under `outputs/` only, by extension: `.md`, `.markdown` and `.txt` are `markdown`; `.html` and `.htm` are `html`; `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif` and `.svg` are `image`; source files (`.ts`, `.js`, `.py`, `.css`, `.json`, `.sh`, `.go`, `.rs` and the like) are `code`; `transcript.jsonl` is `transcript`. Dotfiles and `node_modules` are skipped.

## Versions

A skill's version is a hash of `SKILL.md` and `references/`. A run keeps the version it tested: its `_skill/` snapshot is the copy the app reads and restores. A changed tree needs a name on its first run. The app names it after the date unless you type what changed; `st run` asks for `--name`. Later runs of the same files reuse the version. The Assistant can also save the files as a version before it changes them: that copy lands in `evals/versions/`. Saved and run versions share one numbering.

A run's configuration says which skill the agent saw:

- `with_skill` (the default): the skill as it is now.
- `without_skill`: no skill in the workspace, and no line in the prompt pointing at one.
- `old_skill --baseline <run>`: that run's `_skill/` snapshot. It holds `SKILL.md` and `references/` only, so scripts are absent.

## The app's own files

`~/.skill-studio/` (or `$SKILL_STUDIO_HOME/.skill-studio/`) holds what does not belong to one skill:

| Path | Holds |
| --- | --- |
| `library.json` | The workspace folders the Library scans, skills marked as someone else's, and skills opened recently |
| `preferences.json` | `theme`, `motion`, `editorMode`, `welcomed`, `hints`, `hintsSeen`, `aiProvider`, `aiModel`, `aiEffort`, `updates` |
| `drafts/` | Unsaved edits to files and cases |
| `practice/` | The walkthrough's skill, and `seen.json`: the walkthrough steps that only ask you to look at a screen, once you have |
| `chat.json`, `ai-usage.json` | The Assistant's conversation and its usage log |
| `uploads/` | Pictures added but not yet saved in a case. One nothing has read for 30 days is removed when the next picture is uploaded |
| `trash/` | The last deleted version, until the next delete: `<uuid>/entry.json` (the skill, the version, its run names, and the corrections and picks that went with them), `version/` and `runs/<run>/` |

When `library.json` is absent, `~/.skill-tester/library.json` is read in its place. With no saved workspaces, the Library scans `~/SITES` when that folder exists.

Stored API keys are not here: the desktop app keeps them encrypted in its own user data folder ([SECURITY.md](../SECURITY.md)).
