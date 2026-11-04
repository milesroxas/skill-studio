# How to use Skill Studio

This guide walks one skill through the whole loop: write it, give it cases, run agents on it, read the scores, rate the answers yourself, tune the scoring, then change the skill and run it again. Each step says what to do in the app and why the step exists. The [README](https://github.com/milesroxas/skill-studio#readme) is the reference for file formats, packs, routes and flags.

## How the loop works

A skill is a `SKILL.md` an agent reads before it works. Skill Studio answers one question about it: does the skill make the agent's answers better, and did your last edit help or hurt?

It answers by repeating six steps. Every step lives in the app. When a step is due (the first case, a run of a new version, answers to rate), a Next button at the top right names it.

| Step | In the sidebar | What you do | Why |
| --- | --- | --- | --- |
| 1 | Library | Open or create a skill | Every skill on the machine is in one list, so you test the copy the agents use |
| 2 | Write, Versions | Edit `SKILL.md` and `references/`, save versions | Each version keeps its files, so scores stay tied to the text that produced them |
| 3 | Cases | Write the tasks the agent gets | A case is a test: a prompt, what a good answer does, and checks |
| 4 | New run, Results | Run agents, read scores | Real agent output, graded the same way every time |
| 5 | Rate blind | Rate answers blind | Your ratings are the ground truth the judge is measured against |
| 6 | Agreement, Scoring | Find where you and the judge disagree | Disagreement tells you whether to fix the skill or the scoring |

The sidebar lists every screen of the open skill, with what waits on each beside it: the number of cases, runs or answers to rate, and a dot where something is not saved. The top of the sidebar names the open skill and its version. Click it, or press Cmd+K (Ctrl+K on Windows and Linux), to switch to another skill without going back to the library.

## Before you start

You need three things. Without the API key the app still works, but grading falls back to code checks only.

1. The `claude` CLI or the `cursor-agent` CLI on your `PATH`, signed in. These are the agents that write the answers.
2. A TypeSafe API key from [typesafe.ai](https://typesafe.ai). Jev, the judge, needs it.
3. The app: a packaged build, or this repository cloned with Node 24 and pnpm (`pnpm install`).

## Start the app

Open Skill Studio, or from the repository folder:

```
pnpm dev
```

Then open Settings at the top right and paste the TypeSafe key. The app keeps it in your system keychain. If the app shows "Code checks only: no Jev key" at the top, the key is missing; the pill takes you to Settings.

To use the app in a browser, or from your phone or another computer, run `pnpm build` then `pnpm st serve` (add `--tailscale` for other devices). The [README](https://github.com/milesroxas/skill-studio#in-a-browser-or-from-another-device) explains who can reach it and why that is safe. In a browser the key comes from `TYPESAFE_API_KEY` in the environment or a `.env` in the checkout.

## 1. Open or create a skill

The app opens on the Library: every skill in your user skills folders (`~/.agents`, `~/.claude`, `~/.cursor`, `~/.codex`) and in projects under your workspace folders.

To work on a skill that exists:

1. Find it in the list, or type in the search box.
2. Click Open.

To create one:

1. Click New skill.
2. Pick what to start from. Blank is a title and an empty Rules section. Writing, Code, Workflow and Design are each a small finished skill of six to eight rules in the shape the judge grades, with three sample cases. Leave "Add 3 sample cases" ticked to have something to run on the first day.
3. Type a name: lowercase letters, digits and single dashes, like `release-notes`.
4. Write a one-line description. Agents read it to decide when to use the skill, so say what it is for. The grey text is the template's own description; leave the field empty to keep it.
5. Pick a Place. "User (every project)" makes it available everywhere; a project place keeps it in that project.
6. Tick the agents to install it for.
7. Click Create skill.

The skill is written to `.agents/skills/<name>` and linked into each agent you ticked. A Writing, Code, Workflow or Design skill also gets an `evals/bench.json` that turns on the matching judge pack, so its first run is graded for that kind of work. The Claude, Cursor and Codex buttons on a skill's row install or uninstall it later. Uninstalling removes the link only, never the skill.

If a project of yours is missing, open "Where skills are found" at the bottom and add its parent folder. The default is `~/SITES` when that folder exists.

## 2. Write the skill

Open Write.

1. Edit `SKILL.md` in the main panel. Save with the Save button or Cmd+S (Ctrl+S on Windows and Linux).
2. Add longer material as files under `references/` from the side panel, and point to them from `SKILL.md`.
3. Check the Graded rules list in the side panel. The generic pack scores each answer against these rules, one judge question per rule.

Write rules as top-level bullets in `SKILL.md`. A rule hidden inside a paragraph is not graded. Steps and checklists go in numbered lists, which are not graded.

You never start from a blank page:

- A `SKILL.md` with no rules yet shows a Start from a template strip. Each template is a finished small skill to edit, not a form to fill. Pick one and replace its rules with yours.
- The Insert buttons in the side panel put a rule, a decision tree, a process list or a reference link at the cursor, each in the shape that grades well.
- "How to write a rule the agent follows" in the side panel is the five-line version of the method: encode process not outcome, write the why in the bullet, be numeric or absolute, cut every line that does not change what the agent does, one skill per aspect.
- "Start over from a template" is there once the file has rules, behind a confirmation.
- A new reference file opens with a heading and a line for when the agent should read it.

Everything you type is kept as a draft as you go, in `~/.skill-studio/drafts/`, outside the skill's folder. Close the app, switch skills or reload, and the unsaved text is still there. The sidebar shows a dot beside Write while a draft is open. Save writes the file and clears its draft; Discard throws the draft away.

A save is refused if the file changed on disk since your draft began, so an edit made in your code editor is never overwritten. The editor says so and offers two ways on: keep your draft and save over the file, or take the file as it is now.

### Save versions

Open Versions. When the saved files are not a version yet, name them, say what changed and why, and click Save as v1 (or whatever number is next). A version keeps its own copy of `SKILL.md` and `references/` in `evals/versions/`, so it travels with the skill.

The history lists every version, newest first, with its runs and its mean score. A run also names a version: runs and saved versions share one numbering. From the history:

- Compare shows that version's files against the files now, or pick any two under Compare.
- Restore puts a version's files back. If the files now are not a version yet, you are asked first, because restoring would lose them; save them as a version to keep them.

## 3. Write cases

A case is one task an agent gets with your skill installed. Open Cases. With no cases yet, the form for the first one is already open.

A new case starts with Start from an example: three finished cases for the kind of skill your bench grades (Writing, Code, Workflow or Design, switchable). Pick one and the whole form fills in, with an id no existing case holds. Edit it into your task. The grey text in each field is the first example too, so the shape is visible before you type. Under Checks, "What the judge can mark" shows three vague checks next to the form the judge can actually mark.

1. Title: a short name for the task.
2. Id: filled in from the title. It names the case's folder and cannot change after you add it.
3. Prompt: exactly what the agent is asked, worded the way a user would ask. Never mention the skill: the test is whether the agent finds and uses it on its own.
4. A good answer: one or two sentences on what a good answer does. You see this when you rate, and the judge reads it too.
5. Checks: one statement per line that a good answer makes true, such as "The note says where to find the change." The judge marks each one. Raise a check's weight when it matters more than the rest.
6. Length: tick it and set a word range when length matters. Only prose and list text count, not headings or code.
7. Input files: files the prompt refers to. The agent finds them in `files/` next to the prompt.
8. Click Add case.

Write at least three cases before you trust a score, and make them differ. One case measures one task; a skill is meant to help across many.

## 4. Run the agents

Open New run.

1. Skill version: if the skill changed since the last run, this run starts a new version. Type what changed, so the version is easy to recognise later.
2. Cases: tick the cases to run.
3. Writers: pick the agent, model and effort. Add up to four writers to compare agents or models in one run.
4. Samples per case: how many answers each writer gives per case. Agents vary run to run, so use 2 or more before you trust a difference between versions.
5. Skill: choose what the agent gets. "With skill" installs this skill. "Without skill" installs nothing, which is the baseline the skill has to beat. "Old skill" uses an earlier run's copy, to test an edit against the version before it.
6. Leave "Grade when done" ticked so scores appear when the run finishes.
7. Click Start run.

The run happens in the background. The foot of the sidebar shows progress; click it for the live log. You can keep working on other screens.

Runs cost money: each sample is one agent session, and grading makes judge calls. The total is samples per case times cases times writers.

## 5. Read the results

Open Results.

Each run shows its version, its writer and a score per case. The total is out of 100 and is split into layers, such as adherence to the skill's rules and the rubric of your checks. Each pack's layers are listed in the [README](https://github.com/milesroxas/skill-studio#grading).

Read the layers, not only the total. A total can hold steady while one layer falls.

Click a run for its detail. From there:

- Compare skill with now opens Versions with this run's version against the files now.
- Regrade grades the run again, for example after you added checks.
- Each output has a Read link for its answer and a Transcript link for the agent's steps.

A score from a judge is a claim, not a fact. Step 5 tests it.

## 6. Rate answers blind

Open Rate blind.

The queue lists graded answers you have not rated. Answers the judge was least sure about, and cases whose samples scored far apart, come first, because your rating tells you the most there.

For each answer:

1. Read the answer. The prompt, what a good answer does, and the checks are above it.
2. Give it a rating from 1 to 5. 1 is unusable; 5 ships as is.
3. Mark each layer Good or Bad where you have an opinion.
4. Add a note on what works and what the skill should have done. Notes are what you act on later.
5. Click Save and reveal.

The scores and the writer stay hidden until you save. Seeing the judge's score first pulls your rating toward it, and then your rating no longer tests anything.

After the reveal you can:

- Compare it with another output.
- Make it an anchor: a labelled good or bad example the judge must rank correctly. Run `pnpm st self-test <skill-dir>` to check all anchors. Trust a judge pack only once its anchors pass.

### Compare two answers

Compare, under Review, puts two outputs side by side, with a word diff for text. Pick the better one under "Which is better?". These pairwise votes feed the Bradley-Terry leaderboard, which ranks versions and writers from head-to-head picks. Pairwise picks are more reliable than 1 to 5 scores, because people and judges agree more on which of two is better than on how good one is.

### Read a transcript

Review, then Transcripts shows every step an agent took on one sample: its messages, tool calls and errors. Read it when a score surprises you. It tells you whether the agent read the skill at all, and where it went wrong.

## 7. Check the judge against you

Open Agreement. This screen fills in once you have rated some answers.

It shows, per layer, how often you and the judge agree, and the rank correlation between your ratings and the totals (it needs 3 or more ratings). Read it like this:

| You see | It means | Do this |
| --- | --- | --- |
| You and the judge agree, scores are low | The skill is the problem | Edit the skill (step 2) |
| You and the judge disagree on a layer | The scoring is the problem | Tune that layer (step 8) |
| The judge gets your pairwise picks wrong | The judge cannot tell good from bad here | Add anchors, then check the pack's settings |

## 8. Tune the scoring

Open Scoring.

Move a setting and every graded output rescores at once, with the change shown beside each total. No new judge calls are made: the judge's raw answers are stored and the scoring is applied in code.

- Packs: which judge packs grade this skill.
- Layer weights: points per layer. A layer with no score drops out and the rest rescale.
- Thresholds: when a judge answer counts as yes, when it counts as unsure, and which layer score counts as good.
- Judge pack settings: each pack's own settings, such as the lint command for the writing pack.

Click Save to write them to `evals/bench.json`. Unsaved changes show as a dot beside Scoring in the sidebar.

Change one setting at a time, then reread Agreement. Moving several at once hides which one helped.

## 9. Change the skill and run again

This is the loop. Go back to step 2 with what you learned:

1. Read your notes and the Agreement screen.
2. Edit the skill to fix what the bad answers have in common, not a single answer.
3. Save the files as a version on Versions, with what changed and why. A run of unsaved files asks for a name instead.
4. Start a run, then compare the two versions' scores on Results and their files on Versions.

To be sure an edit helped, run it against the version before with the "Old skill" option on the same cases and enough samples. A difference smaller than the spread between samples of the same version is noise.

## Use it from the command line

Everything above can also be scripted. The CLI uses the same files as the app.

```
pnpm st new <skill-dir> --template writing --with-cases
pnpm st cases <skill-dir>
pnpm st run <skill-dir> --engine claude --model sonnet --samples 2 --name "what changed"
pnpm st grade <skill-dir> --run <run-name>
pnpm st report <skill-dir> --run <run-name>
pnpm st compare <skill-dir> <runA> <runB>
pnpm st self-test <skill-dir>
```

`pnpm st --help` lists every command and flag.

## Where your data lives

Everything is plain files inside the skill's `evals/` folder, so it can be committed and reviewed like code.

| Path | Holds |
| --- | --- |
| `evals/cases/<case>/` | the prompt, `case.yaml`, checks under `graders/`, input files under `files/` |
| `evals/runs/<run>/` | one folder per run: the skill snapshot, each sample's output and transcript, and `report.json` |
| `evals/reviews.json` | your ratings, notes and pairwise votes |
| `evals/anchors/` | labelled good and bad examples |
| `evals/bench.json` | the scoring settings from step 8 |

The agent never sees `evals/`: its copy of the skill leaves it out, so it cannot read the checks or your ratings.

## When something goes wrong

| Problem | Fix |
| --- | --- |
| "Code checks only: no Jev key" | Paste the key under Settings; in a browser, set `TYPESAFE_API_KEY` and restart `st serve` |
| An agent shows "(not set up)" in New run | Install that CLI, put it on your `PATH` and sign in |
| A skill is missing from the Library | Add its parent folder under "Where skills are found" |
| "Port 4400 is taken" (`st serve`) | Stop what holds it (`lsof -nP -iTCP:4400 -sTCP:LISTEN`) or start with `--port` |
| A save in Write is refused | The file changed on disk. Reload, then edit again |
| A score looks wrong | Read the transcript, then rate it blind; Agreement will show if the judge is off |

Run skills you did not write in a container or VM. The code pack runs code the agent wrote, with your permissions. [SECURITY.md](https://github.com/milesroxas/skill-studio/blob/main/SECURITY.md) has the details.
