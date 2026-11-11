# Skill and run files

Everything Skill Studio knows about a skill is plain files in the skill's `evals/` folder, so it can be committed and reviewed like code. The app's own files are in `~/.skill-studio/` (`SKILL_STUDIO_HOME` stands in for the home folder when set).

## A skill

```
<skill>/
  SKILL.md                        rules are its top-level `-` and `*` bullets (or `rules` in bench.json)
  references/                     saved and restored with SKILL.md as the skill's version
  evals/
    cases/<case>/prompt.md        the task; front matter: tags, max_turns, timeout_seconds, allowed_tools
    cases/<case>/case.yaml        title, expected_outcome, bench
    cases/<case>/graders/*.md     one check each; front matter: type (llm when absent), focus, weight (1 to 5, 1 when absent), image
    cases/<case>/files/           input files, folders and pictures the agent gets, laid out as they are here; only the images right in it are the case's pictures
    cases/<case>/references/      pictures a check is about
    <case>/                       a case folder may also sit here, below
    evals.json                    cases in skill-creator's `evals.json` shape, read when no folder has the same id
    bench.json                    packs, points per layer and the threshold (see grading.md)
    anchors/*.md                  labelled outputs for `st self-test`; front matter: case, label, tests
    anchors/report.json           what `st self-test` scored, written each time it runs, with judge-cache.json beside it
    reviews.json                  your corrections to Jev's verdicts (see grading.md)
    versions/<vN>/                a saved version (by the Assistant, or kept when its only run is deleted): version.json and files/
    runs/                         one directory per run, below
```

- A rule is a top-level bullet of `SKILL.md`; indented lines under it join it as a clause. A bullet under four words, or made only of a link, is not a rule ([grading.md](grading.md#benchjson)).
- A name the app is given for a file, such as a reference to save or an output to open, may hold spaces and letters of any alphabet, but not `<`, `>`, `:`, `"`, `|`, `?`, `*` or a backslash, and on Windows not a device name (`con`, `nul.md`, `com1`) or a final dot or space.
- The app saves a text file by writing a hidden `.<name>.<pid>.tmp` beside it and renaming that over the file, so a crash leaves the old file whole; a leftover one can be deleted. A file that is a link to another file in the skill stays a link, and the file it leads to is written.
- Any folder directly under `evals/` is read as a case too, except `runs`, `anchors`, `files`, `results`, `mocks`, `cases`, `node_modules`, `reviews` and `benchmarks`. When a folder under `evals/cases/` has the same id, that one is read.
- An `evals.json` case is named `<id>-<name>`, and a name that is not lowercase letters, digits and single dashes, or an entry with no prompt, is left out with a warning that names the entry.
- Saving a case is refused, before anything is written, when its folder, its `files/`, `graders/` or `references/`, its `prompt.md`, its `case.yaml` or one of its checks is reached through a link that leads out of the skill.
- A grader file must start with front matter (`---`), even an empty block. A file without it is skipped. Its `weight` is rounded and held to 1 to 5; a value that is not a positive number reads as 1. `type` and `focus` are kept when the case is saved.
- `max_turns` is not passed to the agent. The workflow pack compares it with the number of tool calls.
- `fixtures/` holds three small skills with generated runs: `demo-skill` (generic pack), `code-skill` (code pack) and `design-skill` (design pack). Each also runs the generic and workflow packs.

### The `bench` block of `case.yaml`

| Key | Does |
| --- | --- |
| `artifact` | The kind of output to grade: `markdown`, `html`, `image`, `code` or `transcript` |
| `words` | `[min, max]`, the word range the output should fall in |
| `check` | The command the code pack runs; its exit code is the check layer |
| `size` | `[width, height]` in pixels: a picture must be exactly this size, and a page is drawn at this size for grading |
| `phone` | `true` also draws a page 390 by 1200 pixels, and the design pack asks whether it works on a phone |
| `judge` | `false` asks Jev nothing about this case's outputs, in any pack: only code checks run, and every layer Jev judges is null |

## A run

```
evals/runs/<date>-skill-<vN>-<engine>-<model>[-<effort>][-<configuration>]/
  run.json                        skill version and hash, writer, cases, per-sample cost and tokens
  report.json                     raw judge answers and scores per sample, written by grading
  judge-cache.json                each pack's raw answer by a hash of what it was asked, so Regrade asks only about what changed
  _skill/                         the skill as it was when the run started, as an agent's copy holds it (see Versions): every sample is made from it
  _inputs/<case>/                 each case's input files as they were then, which grading reads its pictures from
  <case>-s<n>/                    one sample: the agent's working directory
    prompt.md                     the exact prompt sent
    files/                        the case's input files
    .agents/skills/<name>/        the skill copy the agent saw, made from _skill/
    outputs/                      everything the agent produced; graded artifacts come from here
    renders/                      the page as the desktop app drew it for grading, one PNG per size
    notes.md                      what the agent would have told the user
    transcript.jsonl              one event per line: system, text, thinking, tool, result, error
    timing.json                   start, end, duration, cost, tokens, model
    agent.json                    exit state, error, the agent's last message
```

A second run that would take the same name gets `-2`, then `-3`.

`.claude/skills` and `.cursor/skills` in a sample link to `.agents/skills`. A `without_skill` sample has none of the three.

A sample's skill folder is named by a slug of the skill's name. Graded artifacts are read under `outputs/` only, by extension: `.md`, `.markdown` and `.txt` are `markdown`; `.html` and `.htm` are `html`; `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif` and `.svg` are `image`; source files (`.ts`, `.js`, `.py`, `.css`, `.json`, `.sh`, `.go`, `.rs` and the like) are `code`; `transcript.jsonl` is `transcript`. Dotfiles and `node_modules` are skipped, and so is every link: the agent wrote the folder, and a link may lead out of it.

## Versions

A skill's version is a hash of every file an agent's copy holds: `SKILL.md`, `references/`, and the scripts, assets and other files beside them. The copy, and so the hash, leaves out `evals/`, hidden files and folders (`.git` and `.venv` among them), every `node_modules`, `venv` and `__pycache__` folder at any depth, and whatever a link that leads out of the skill points at; a link that stays inside the skill is copied as the file it leads to. For a skill that holds only `SKILL.md` and `references/`, the version is the hash of those two.

A version stamped from `SKILL.md` and `references/` alone, as one from Skill Studio 0.4.0 or earlier is, cannot say which other files it had. It stands for the skill as it is only while it is the newest version and no run has stamped it with the whole hash, and the next run of it does; from then on a change to a script is a new version.

A run keeps the version it tested: its `_skill/` snapshot is the copy the app reads and restores. Restore puts back `SKILL.md` and `references/`, byte for byte, all of them or none; other files stay as they are. When a restore fails partway and a file cannot be moved back, your files are kept in a hidden `.restore-…` folder in the skill, and the error names each one and where it goes. A changed tree needs a name on its first run. The app names a skill's first version "First version" and a later one after the date, unless you type what changed; `st run` asks for `--name`. Later runs of the same files reuse the version. The Assistant can also save the files as a version before it changes them: that copy lands in `evals/versions/`. Deleting a version's only run saves the version there too, from the run's `_skill/`, so the version stays. Saved and run versions share one numbering.

A run's configuration says which skill the agent saw:

- `with_skill` (the default): the skill as it is now.
- `without_skill`: no skill in the workspace, and no line in the prompt pointing at one.
- `old_skill --baseline <run>`: that run's `_skill/` snapshot, which holds what the run's agents got.

## The app's own files

`~/.skill-studio/` (or `$SKILL_STUDIO_HOME/.skill-studio/`) holds what does not belong to one skill:

| Path | Holds |
| --- | --- |
| `library.json` | The workspace folders the Library scans, skills opened recently, and when each skill was marked done (`done`, by path): a skill leaves In progress until its SKILL.md, a case or its runs change after that time |
| `preferences.json` | `theme`, `motion`, `editorMode`, `welcomed`, `hints`, `hintsSeen`, `aiProvider`, `aiModel`, `aiEffort`, `updates` |
| `drafts/` | Unsaved edits to files and cases, with when each drafted case was saved as its draft began, so a save over a case changed since is refused |
| `practice/` | The walkthrough's skill, and `seen.json`: the walkthrough steps that only ask you to look at a screen, once you have |
| `chat.json`, `ai-usage.json` | The Assistant's conversation and its usage log |
| `claude-commands.json` | The skills Claude Code can invoke, for the side panel's slash menu, with the modification times of the folders they were read from |
| `agents.json` | The agents each running copy (the app's backend, `st`) has started, under the copy that started it, so a copy that starts after another crashed can end that copy's agents |
| `uploads/` | Pictures added but not yet saved in a case. One nothing has read for 30 days is removed when the next picture is uploaded |
| `uploads/inputs/` | Files and folders added to a case and not saved yet, one folder for each pick. One nothing has used for 30 days is removed when the next is added |
| `trash/` | The last deleted version or run, until the next delete: `<uuid>/entry.json` (the skill, the version, its run names, and the corrections that went with them; `kind: "run"` for one run, with `kept` when the delete saved the run's version), `version/` and `runs/<run>/`. An entry marked `unfinished` belongs to a delete or an undo that stopped partway and could not put everything back, and no later delete empties it: the error said what to move where |

When `library.json` is absent, `~/.skill-tester/library.json` is read in its place. With no saved workspaces, the Library scans none: it lists the user's own skills until a folder is added. Any other key in the file, such as an older `others` list, is ignored and dropped on the next save.

Stored API keys are not here: the desktop app keeps them encrypted in its own user data folder ([SECURITY.md](../SECURITY.md)).
