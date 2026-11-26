# Skill and run files

Everything Skill Studio knows about a skill is plain files in the skill's `evals/` folder, so it can be committed and reviewed like code. The app's own files are in `~/.skill-studio/` (`SKILL_STUDIO_HOME` stands in for the home folder when set).

## A skill

```
<skill>/
  SKILL.md                        rules are its top-level `-` and `*` bullets (or `rules` in bench.json)
  references/                     longer material SKILL.md points to
  scripts/, assets/, *.md, …      any other file of the skill: an agent's copy holds it, and a version keeps it
  evals/
    cases/<case>/prompt.md        the task; front matter: tags, max_turns, timeout_seconds, allowed_tools
    cases/<case>/case.yaml        title, expected_outcome, bench
    cases/<case>/graders/*.md     one check each; front matter: type (llm when absent), focus, weight (1 to 5, 1 when absent), image
    cases/<case>/files/           input files, folders and pictures the agent gets, laid out as they are here; only the images right in it are the case's pictures
    cases/<case>/references/      pictures a check is about
    graders/*.md                  checks for every case: one check each, written as a case's are (below)
    <case>/                       a case folder may also sit here, below
    evals.json                    cases in skill-creator's `evals.json` shape, read when no folder has the same id
    bench.json                    packs, points per layer and the threshold (see grading.md#benchjson)
    anchors/*.md                  labelled outputs for `st self-test`; front matter: case, label, tests
    anchors/report.json           what `st self-test` scored, written each time it runs, with judge-cache.json beside it
    reviews.json                  your corrections to Jev's verdicts (see grading.md#corrections)
    rule-readings.json            how each rule and check is marked, as `st sort` read it (below)
    proposals.json                the checks `st propose` proposed for each case, and which were accepted or dropped (below)
    versions/<vN>/                a saved version (by the Assistant, or kept when its only run is deleted): version.json and files/, the skill as an agent's copy holds it
    runs/                         one directory per run, below
```

- `SKILL.md` opens with front matter that holds a `name` and a `description`. A one-line value that holds `: ` (`description: Use when: a release ships`) is not valid YAML, but people and models write it often and Claude Code reads it, so the app reads it the same way: as if the value were in double quotes (`readFrontMatter` in `src/domain/text.ts`). The editor offers **Add quotes** for it, since a stricter reader drops the whole block. A SKILL.md the assistant writes, whole or in part, gets those quotes before it reaches the file, and a skill the app creates writes each field on one line, quoted where it needs to be (`frontMatterYaml`). The editor warns when the block cannot be read even so. It also says when the name is over 64 characters, is not lowercase letters, digits and single dashes, holds `anthropic` or `claude`, or is not its folder's name, and when the description is over 1,024 characters or holds an XML tag such as `<example>` (`headProblems` in `src/domain/text.ts`). Those are the limits of the agent skills format: an app that holds a skill to them refuses it, and others load it all the same, so each line says what some apps will not take.
- The Skill screen lists every file an agent's copy of the skill holds ([versions](#versions) says which those are) and edits each one that reads as text (`skillTexts` in `src/infrastructure/skill.ts`, `isSkillFilePath` in `src/domain/paths.ts`). A file reads as text when its bytes are UTF-8 with no zero byte and it is 1 MB or less; any other file, such as a picture or a font, is listed and can be deleted, and is never written over. A Markdown file (`.md`, `.markdown`) is edited styled or as source, with **Write with AI**; any other text is edited as it is written. A saved script keeps the mode it had, so one that could be run still can. Nothing under `evals/`, no hidden file and nothing in a `node_modules`, `venv` or `__pycache__` folder is listed or written here.
- A new file or folder is named in the folder it was asked for: the open file's, from the two buttons beside Files, or the one right-clicked. A file's name with no extension is Markdown, and a name may hold folders of its own (`scripts/check.py`). A name is letters, digits, `_`, `.` and `-`; one already taken is refused whatever its capitals, and a folder typed with other capitals is the folder that is there, since most disks hold one of the two (`placeNew` in `src/domain/paths.ts`). A folder is there while a file is in it: nothing empty is written, so naming a folder goes on to naming its first file, and deleting a folder's last file removes it.
- A rule is a top-level bullet of `SKILL.md`; indented lines under it join it as a clause. A bullet under four words, made only of a link, only saying to read a file, or under an example heading is not a rule. A skill with no bullet that is a rule has its numbered steps read as rules ([grading.md](grading.md#rules)).
- A name the app is given for a file, such as a reference to save or an output to open, may hold spaces and letters of any alphabet, but not `<`, `>`, `:`, `"`, `|`, `?`, `*` or a backslash, and on Windows not a device name (`con`, `nul.md`, `com1`) or a final dot or space.
- The app saves a text file by writing a hidden `.<name>.<pid>.tmp` beside it and renaming that over the file, so a crash leaves the old file whole; a leftover one can be deleted. A file that is a link to another file in the skill stays a link, and the file it leads to is written.
- Any folder directly under `evals/` is read as a case too, except `runs`, `anchors`, `files`, `results`, `mocks`, `cases`, `node_modules`, `reviews`, `benchmarks` and `graders`. When a folder under `evals/cases/` has the same id, that one is read.
- A case folder's name is the case's id, and names a folder in every run. A folder whose name holds anything but letters, digits, `_`, `.` and `-`, or starts with a dot, is left out with a warning that names it. The app makes ids of lowercase letters, digits and single dashes.
- An `evals.json` case is named `<id>-<name>`, and a name that is not lowercase letters, digits and single dashes, or an entry with no prompt, is left out with a warning that names the entry.
- Every file under a case's `files/` is an input file, a hidden one such as `.eslintrc.json` or `.github/ci.yml` among them, and the agent gets each one. The skill's own hidden files stay out of its copy ([versions](#versions)).
- Saving a case is refused, before anything is written, when its folder, its `files/`, `graders/` or `references/`, its `prompt.md`, its `case.yaml` or one of its checks is reached through a link that leads out of the skill.
- A grader file must start with front matter (`---`), even an empty block. A file without it is skipped. Its `weight` is rounded and held to 1 to 5; a value that is not a positive number reads as 1. `type` and `focus` are kept when the case is saved. `st case check` lists each file skipped and each weight read otherwise than written ([cli.md](cli.md#adding-and-checking-cases)).
- `max_turns` is not passed to the agent. The workflow pack compares it with the number of tool calls.
- `allowed_tools` is passed to Claude Code. The Cursor agent takes no list of tools and can use every one: the Run panel says so under **Agent** when a ticked case sets `allowed_tools`.
- `allowed_tools` and `timeout_seconds` are part of what a case asks: a run made before either changed answered another request. `max_turns` and `timeout_seconds` are part of what an output is held to: one graded before either changed has no total until its run is graded again ([grading.md](grading.md#the-case-a-run-is-graded-on)).
- `fixtures/` holds four small skills with generated runs: `demo-skill` (generic pack), `code-skill` (code pack) and `design-skill` (design pack), each of which also runs the generic and workflow packs, and `launch-note`, a skill whose every rule code can answer, with the answer key the [reading bench](../scripts/reading-bench/README.md) counts against.

### Checks for every case

`evals/graders/` holds what every answer to the skill owes, whatever the case: that it names the product with its version, say, or leaves out a codename. A check there is kept with the cases and not in `SKILL.md`, so it stays the same from one version of the skill to the next, and a result can be read on it across an edit to a rule. A rule is named by its words, so an edited rule is a new one that an earlier run was never marked on.

```
---
type: llm
weight: 1
---

The announcement never mentions the codename Falcon, which the brief marks Internal.
```

- Each `.md` file is one check, written as a file in a case's `graders/` is: the same front matter (`type`, `focus`, `weight` 1 to 5, `image`), and a file without the `---` block is skipped. An `image` is a path under `evals/`, such as `references/logo.png` for `evals/references/logo.png`.
- Every output of every case is graded on each one after the case's own checks, asked the same way, counted in the same part of the score and shown as a check (`withEveryCase` in `src/domain/every-case.ts`). A run without the skill is graded on them too.
- Each is named `every/<file>` (`01-version.md` is `every/01-version`), so it never shares a name with a case's own check. Where one says what a case's own check says, the case's keeps its name and your corrections on it (`checkIds` in `src/domain/verdict.ts`).
- They are part of what each case holds an output to: adding, editing or removing one leaves every output graded before it with no total until its run is graded again ([grading.md](grading.md#the-case-a-run-is-graded-on)).
- `st sort` reads each one for each case, beside that case's request and files, since what it needs can differ from one request to the next ([cli.md](cli.md#sorting-rules-and-checks)).
- They are edited by hand for now, or written by `st propose --accept` from a proposal for every case ([cli.md](cli.md#proposing-checks)): the Cases screen lists a case's own checks only.

### `rule-readings.json`

`st sort` keeps here how each rule and check is marked ([cli.md](cli.md#sorting-rules-and-checks)). It is one object with a `readings` list, written whole as the app's other files are. Each entry holds:

| Key | Holds |
| --- | --- |
| `stamp` | What the reading was made from, as one hash: for a rule, the version of what the assistant is told, the whole SKILL.md and the rule's words; for a check, that version, the whole SKILL.md (a check is read beside the rules), what its case asks (its request and each input file by name and bytes) and the check's words |
| `kind`, `text`, `case` | `rule` or `check`, its words, and for a check the case's id |
| `reading` | The reading: `exact` with its tests, `judged` with its `span`, or `unmarkable` with `why`, `with` and `fix` (`RuleReading` in `src/domain/rule-reading.ts`). A check's is never `unmarkable` with `why: "conflict"`. `{ "reading": "judged", "span": null }` is one the assistant could not fill in the shape twice |
| `against` | For a check only: the rules that cannot hold beside it on its case, each `{ "rule": <its words>, "fix": <the rule rewritten, or null> }`. Each counts in no score on that case. An empty list when there is none |
| `reason` | The assistant's one sentence on why |
| `refused` | Why each earlier reading of it did not fit the shape: none, one or two |
| `provider`, `model`, `at`, `prompt` | Who read it, when, and the version of what it was told |

- A reading whose stamp no longer matches what it was read from is out of date and never used. It stays in the file, so the runs of an earlier version of the skill still find theirs, until the file holds 2,000 entries, when the oldest go.
- An entry that does not hold to its shape is left out when the file is read. A file that is not JSON stops the command with its name, and is not written over. It stops a grading too, before any output is graded ([grading.md](grading.md#readings-who-answers-a-rule-or-a-check)).

### `proposals.json`

`st propose` keeps here the checks it proposed ([cli.md](cli.md#proposing-checks)), so a screen can show them. It is one object with `proposals`, `reads`, `every` and `asked` lists, written whole as the app's other files are.

Each proposal holds:

| Key | Holds |
| --- | --- |
| `id` | Eight characters from a hash of its case, what the case asks and its words: what `--accept` and `--drop` name it by |
| `case`, `check`, `why` | The case's id, the check's words, and the assistant's one sentence on why |
| `scope` | `case`, or `every case` when the assistant said it would hold for every case of the skill. What makes a proposal part of one for every case (an entry of `every`) is that two cases or more propose it, whatever its scope |
| `basis` | What asks for it: `{ "in": "request" }`, `{ "in": "note" }` (the case's "A good answer") or `{ "in": "input", "file": <name> }`, with `quote`, its words there |
| `shownBy`, `fault` | An answer that misses it, or null; and where that answer says something wrong, `{ "file": <its path in the attempt's folder>, "quote": ... }`, or null when it leaves something out |
| `answers` | Each answer read, by `run`, `sample` (the attempt's folder), `configuration`, `version` and its `name`, with `meets`: `yes`, `no` or `cannot tell`, as the assistant read it |
| `tells` | `apart` when some answers read meet it and some miss it, `all meet`, `none meet`, or `unclear` when the assistant could not tell for enough of them |
| `state`, `decidedAt` | `proposed`, `accepted` or `dropped`, and when it was accepted or dropped |
| `stamp` | What it was made from, as one hash: the version of what the assistant is told, what its case asks (its request and each input file by name and bytes), the case's note, and each answer read by run, attempt and the bytes of the files it wrote |
| `ask` | What its case asked, as `rule-readings.json` stamps it |
| `provider`, `model`, `at`, `prompt` | Who proposed it, when, and the version of what it was told |
| `basisLines` | The whole lines of its basis that its quote stands in, as Jev reads them |
| `basisCheck` | Jev's answers on whether the words it stands on ask for all of it: `forward` (they do), `inverse` (it asks for more), and `reading`, `yes` or `not sure`. Null when Jev was not asked |

Each entry of `reads` is one case's last reading: `case`, `stamp`, `at`, `model`, `kept` (how many proposals it kept) and `refused` (why the assistant's proposals that did not fit were not taken), with:

| Key | Holds |
| --- | --- |
| `facts` | Each fact of the case's note as the assistant listed it: `fact` (its words in the note) and `by`: `check` with `check` (the words of the check that covers it), `proposal` with `proposal` (its id) and `check`, `reason` with `why` (why it cannot be a check), or `nothing`, with `why` when its proposal was left out |
| `unlisted` | Words of the note no listed fact holds |
| `factsRefused` | Why each fact the assistant listed was not taken: its words are not in the note, or the check or proposal it names is not there |
| `overreach` | The proposals left out because Jev was sure their words do not ask for all of them, each with `check`, `why`, `scope`, `basis` and Jev's `basisCheck` |
| `basisChecked` | Whether Jev was asked about each proposal's words |

Each entry of `every` is one proposal for every case, proposed on two cases or more: `id` (eight characters from a hash of its words, what `--accept` and `--drop` name it by without `--case`), `check` (the first case's words, with that case's name for its answer read as "The answer") and `why` (of the first case it was proposed on), `members` (each proposal it is made of, by `case` and `id`), `state`, `decidedAt` and `at`. Accepting it writes one file in `evals/graders/` and marks it and its members accepted.

Each entry of `asked` is one answer of Jev's: `key` (a hash of the model, the question's version and everything asked), `noul` (its probability, unrounded) and `at`. The newest 4,000 are kept.

- A proposal whose stamp is not its case's now is out of date: its request or note changed, an answer it read changed, or a newer run has a newer answer. It is not shown as current, and the next `st propose` reads the case again and puts new proposals in place of those still proposed for it. Accepted and dropped ones stay.
- A dropped one is not proposed again while its words and what its case asks stand.
- An entry that does not hold to its shape is left out when the file is read. A file that is not JSON stops the command with its name, and is not written over.

### The `bench` block of `case.yaml`

| Key | Does |
| --- | --- |
| `artifact` | The kind of output to grade: `markdown`, `html`, `image`, `code` or `transcript` |
| `words` | `[min, max]`, the word range the output should fall in: two numbers, the first 0 or more and the second no less |
| `check` | The command the code pack runs, as one line of text; its exit code is the check layer |
| `size` | `[width, height]` in whole pixels, each from 1 to 10,000: a picture must be exactly this size, and a page is drawn at this size for grading |
| `phone` | `true` also draws a page 390 by 1200 pixels, and the design pack asks whether it works on a phone |
| `judge` | `false` asks Jev nothing about this case's outputs, in any pack: only code checks run, and every layer Jev judges is null |

- `phone` and `judge` are read as true or false. `yes`, `on`, `no` and `off` are read too, in any case, quoted or not.
- A value of another kind (`words: 100-200`, a `check` that is a list, `judge: sometimes`) is left out, so the case is graded as if the key were not there, with a warning that names the case and the key.
- Any other key in the block is kept as it is.

## A run

```
evals/runs/<date>-skill-<vN>-<engine>-<model>[-<effort>][-<configuration>]/
  run.json                        skill version and hash, writer, cases, and each sample as its agent ended: cost, tokens, the files it wrote (`outputs`), `stopped`, `failed`
  report.json                     raw judge answers and scores per sample, written by grading: for a rule or check read by code, code's answer and what it saw beside Jev's; for one nobody can mark, why and its fix in place of an answer
  judge-cache.json                Jev's answer to each question by a hash of what it was asked, so Regrade asks only what changed
  _skill/                         the skill as it was when the run started, as an agent's copy holds it (see Versions): every sample is made from it
  _inputs/<case>/                 each case's input files as they were then, which grading reads its pictures and text files from
  _cases.json                     each case as it was then, with a fingerprint of what it asked and the checks for every case as they stood (`every`): what the run is graded on once the case changes or goes (see grading.md)
  _checks/<case>/                 the pictures the case's checks and the checks for every case were about then, under their paths in the skill: the run's copy of a check names its picture here
  <case>-s<n>/                    one sample: what its agent made, moved here when it ended (see below)
    prompt.md                     the exact prompt sent
    files/                        the case's input files
    .agents/skills/<name>/        the skill copy the agent saw, made from _skill/
    outputs/                      everything the agent produced; graded artifacts come from here
    scratch/                      the agent's working files (scripts, crops, trial renders), which the prompt sends here; never graded
    renders/                      the page as the desktop app drew it for grading: one PNG per size, beside each a `.json` of what was measured, and a `.match.json` where a picture the agent made was compared with it
    notes.md                      what the agent would have told the user
    transcript.jsonl              one event per line: system, text, thinking, tool, result, error;
                                  a tool event holds a hash of its whole input (`call`)
    timing.json                   start, end, duration, cost, tokens, model
    agent.json                    the folder the agent worked in (`workdir`, under each name it goes by), written as it starts;
                                  its exit state, error and last message once it ends
```

- Each sample's agent works in a folder of its own under the system's temporary folder, `skill-studio-sample-<random>/<case>-s<n>/` (`makeWorkdir` in `src/infrastructure/workdir.ts`). Nothing above it belongs to the skill or the run, so no `CLAUDE.md` or `.claude/skills` of the skill's repository is read, nothing of the run (`_skill/`, `_cases.json`, `_checks/`, `_inputs/`) is reached by `..`, and its path does not say whether the skill is there. It holds `files/`, the skill copy, `outputs/` and `scratch/`; `prompt.md`, `transcript.jsonl`, `agent.json` and `timing.json` are written in the sample's own folder from the start.
- When the agent ends, by itself, on a stop, on a failure or at its time limit, everything in its folder is moved into the sample's folder, copied when the two are on different disks, and the temporary folder is removed. A file the agent made with one of those four names stays out. What could not be moved stays where it was, and the log names it and the folder.
- While the agent works, Results shows its outputs from its folder. After a crash, its files stay in the temporary folder `agent.json` names until the system clears it: Results shows them from there while they last, and grading leaves the sample out.
- The date in a run's name is the day where you are, not the day in UTC. A second run that would take the same name gets `-2`, then `-3`.
- An input file of an `evals.json` case goes into `_inputs/<case>/` and a sample's `files/` by its name alone. Two of one case's files with the same name both keep their whole path in the skill (`files/evals/files/a/data.csv`), so the agent gets both.
- `run.json` lists a sample once its agent has ended. One the run was stopped on, or the app quit on, is marked `stopped`, whether it had written nothing or half a file. One whose agent did not run to its end with no stop is marked `failed` with why, in words: `ran out of time`, `could not start` or `ended with an error`, and `error` holds the CLI's own. Grading reads the samples listed and neither stopped nor failed: a folder the run never listed was made for an agent that was cut off. A run whose `run.json` has no `samples` list, or one of flat files, is graded whole.
- A sample's skill folder is named by a slug of the skill's name. `.claude/skills` and `.cursor/skills` in a sample link to `.agents/skills`. A `without_skill` sample has none of the three.
- Graded artifacts are read under `outputs/` only. Dotfiles, `node_modules` and every link are skipped: the agent wrote the folder, and a link may lead out of it.
- A sample's outputs are the files `run.json` lists for it (`outputs`), those of them still there. A file put under `outputs/` after the agent ended, such as one a check command builds, is not an output: grading and Results pass over it. A sample with no list, one still being written or from a run made before the list was kept, is read from the folder as it is.

Every other file under `outputs/` is an output too. Its kind comes from its extension, and a file whose extension is not listed is read: one whose start has no NUL byte and no more than one character in a hundred that does not read is `markdown`, judged as text (`.csv`, `.xml`, `.ipynb`, a file with no extension), and any other is `other` (`.pdf`, `.docx`):

| Kind | Files |
| --- | --- |
| `markdown` | `.md`, `.markdown`, `.txt` |
| `html` | `.html`, `.htm` |
| `image` | `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.svg` |
| `code` | source files: `.ts`, `.js`, `.py`, `.css`, `.json`, `.sh`, `.go`, `.rs` and the like |
| `transcript` | `transcript.jsonl` |
| `markdown` | any other file that reads as text |
| `other` | any other file: Jev cannot read it |

## Versions

A skill's version is a hash of every file an agent's copy holds: `SKILL.md`, `references/`, and the scripts, assets and other files beside them.

- The copy, and so the hash, leaves out `evals/`, hidden files and folders (`.git` and `.venv` among them), every `node_modules`, `venv` and `__pycache__` folder at any depth, and whatever a link out of the skill points at.
- A link that stays inside the skill is copied as the file it leads to.
- A skill with nothing beside `SKILL.md` and `references/` is stamped with the hash of those alone, so the first script or asset added to it is a new version.
- A version stamped from `SKILL.md` and `references/` alone while the skill had other files (Skill Studio 0.4.0 and earlier) cannot say which they were, but the `_skill/` copy a run of it took can. It stands for the skill as it is when one of its runs holds a copy with the same files, until a run stamps it with the whole hash. With no such copy, the skill as it is now is a new version.

A run keeps the version it tested. Its `_skill/` snapshot is the copy the app reads and restores.

- Restore makes the skill's files those of the version, byte for byte, all of them or none: every file the version's copy holds is put back, and a file the version does not have goes. `evals/`, hidden files and installed packages are no part of a version and are never touched. When the copy kept of a version does not hold all it was stamped with (a version marked `partial`), only `SKILL.md` and `references/` are restored and compared, and other files stay as they are: the version's page says so.
- The app asks before a restore when the files were saved since the last run or hold unsaved edits (`restoreAsk` in `src/renderer/restore.ts`). A restore drops the unsaved edits of the skill's files, so none stays to be saved back over a restored file.
- When a restore fails partway and a file cannot be moved back, your files are kept in a hidden `.restore-…` folder in the skill. The error names each one and where it goes.
- A changed tree needs a name on its first run. The app names a skill's first version "First version" and a later one after the date, unless you type what changed. `st run` asks for `--name`.
- A run without the skill tests no version. It needs no name, and it is stamped with the number the files have now but names no version: the files still count as changed until a run with the skill, which takes that number. Its `_skill/` is never read as a version's copy.
- Later runs of the same files reuse the version.
- The Assistant can keep the files as a version before it changes them. That copy lands in `evals/versions/`.
- Deleting a version's only run saves the version there too, from the run's `_skill/`, so the version stays.
- Saved and run versions share one numbering.

A run's configuration says which skill the agent saw:

- `with_skill` (the default): the skill as it is now.
- `without_skill`: no skill in the workspace, and no line in the prompt pointing at one.
- `old_skill --baseline <version>`: that version's files, from the first copy kept of it that holds all its hash covers: its saved copy in `evals/versions/`, then the `_skill/` of each of its runs, oldest first (`versionCopy` in `src/infrastructure/runs.ts`). The agent is told the skill by the name that copy gives it, whatever the skill is called now.
- A saved copy holds what a run's `_skill/` holds: SKILL.md, `references/`, scripts, assets and every other file the hash covers. One saved by Skill Studio 0.14.0 or earlier holds SKILL.md and `references/` only, and gives way to a run's copy that holds the rest. With no copy whole, a run of the version gets SKILL.md and `references/` alone: the log says so, and the Run panel says so under **Version**.
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
| `trash/` | Each deleted version or run, a skill's newest 10 for 30 days: `<uuid>/entry.json` (the skill, the version, its run names, the corrections that went with them and `deletedAt`; `kind: "run"` for one run, with `kept` when the delete saved the run's version, `took` when the run was its version's last copy, and `freedBy` when a later delete took the version the run left), `version/` and `runs/<run>/`. A later delete, in any skill, leaves an earlier one to undo. An entry marked `unfinished` belongs to a delete or an undo that stopped partway and could not put everything back, and the trash never empties it: the error said what to move where |

- When `library.json` is absent, `~/.skill-tester/library.json` is read in its place.
- With no saved workspaces, the Library scans none: it lists the user's own skills until a folder is added.
- Any other key in `library.json` is ignored and dropped on the next save.

Stored API keys are not here: the desktop app keeps them encrypted in its own user data folder ([SECURITY.md](../SECURITY.md)).
