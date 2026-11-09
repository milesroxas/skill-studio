# How to use Skill Studio

Skill Studio helps you write a skill for an AI agent, and shows you whether your last edit made its answers better.

## How the loop works

![The loop: Write, Run, Compare. An arrow returns from Compare to Write.](images/loop.svg)

| Step | Where | You |
| --- | --- | --- |
| 1. Write | Skill | Write the skill's rules, or change one |
| 2. Run | The Run button | Have an agent do the skill's cases |
| 3. Compare | Results | Read the new output beside the last one, and pick the better |

Then you go round again. Cases are the tasks a run is made of. You write them once on the Cases screen and add to them as you learn what to check.

![The app with the release-notes skill open on Results: the sidebar with Skill, Cases and Results; three cases listed with how each score moved; and two outputs of one case side by side, each with its score and what it missed.](images/app.webp)

The pictures show a sample skill, release-notes. Its scores are made up.

### Finding your way

- **Sidebar:** the three screens of the open skill. A number counts what is there: the cases, and on Results the cases that wait for your pick. A dot means unsaved work.
- **Run** (top right): has an agent do the cases. It is yellow when running is the step to do now.
- **Next** (top right, yellow): the step to do now, when it is on another screen.
- **Switch skill:** click the skill's name at the top of the sidebar, or press Cmd+K.
- **Back and forward:** the arrows at the top left.
- **Help:** the question mark at the top right explains the screen you are on.
- **Dotted underline:** click the word to see what it means.

On Windows and Linux, press Ctrl where this guide says Cmd.

### Who decides what is good

You do. You say what good is in writing: the **rules** of the skill and the **checks** of each case.

**Jev** is an AI model that reads every output against those rules and checks, the same way each time. It answers facts: was this rule followed, was this check met. A score is a count of those facts.

You answer the one question Jev cannot: which of two outputs is better. That is your **pick**, and it is the last word. "When you and Jev disagree", under step 5, says what to do then.

## Start the app

You need:

1. **Skill Studio.** Download it from [Releases](https://github.com/milesroxas/skill-studio/releases).
2. **Claude Code or Cursor**, installed and signed in. These agents write the outputs.
3. **A TypeSafe key** from [typesafe.ai](https://typesafe.ai), for Jev. Without it, outputs get basic automatic checks only: no rule and no check is marked.

The first time you open the app, a welcome walks you through:

1. **See how it works:** the loop in three steps.
2. **Setup:** where your skills are, a model for the Assistant, and the Jev key. Already set? Click **Continue**. Not now? Click **Configure later**.

The last setup step's button opens the walkthrough. It reads **Start the walkthrough** once the Jev key is set, and **Configure later** before that.

To see the welcome again, click the question mark, then "How Skill Studio works".

To add the Jev key later, open **Settings** at the foot of the sidebar. Until you do, a "No Jev key" label at the top right takes you there. Settings also holds the theme and your other preferences.

## Take the walkthrough first

Take a finished skill once round the loop. Click **Start the walkthrough** in the welcome, or in the Library before your first run. After that, the New skill form has a **Take the walkthrough** link.

The walkthrough's skill, Thank-you note, writes short thank-you notes, so a run takes a minute or two. Nothing needs typing. The Walkthrough box in the sidebar shows your step, and clicking it takes you there. The yellow button at the top right is the way on:

1. **Read the skill.** The Skill screen shows the rules the agent reads.
2. **Read the cases.** The three tasks, and the checks a good note passes.
3. **Run the skill.** Click **Run** at the top right, then "Start a run".
4. **Read what the notes missed.** Results shows each note with its score, and under it the rules and checks it missed.
5. **Tighten one rule.** "Keep the note to a reasonable length" is vague on purpose, so the notes come back too long. Click "Use the exact rule", then Save.
6. **Run it again.** Only the rule changed, so any difference is your edit.
7. **Pick the better note.** Read a note from each version side by side, and say which is better.

A step that only asks you to look is done once you open its screen. The box keeps to that step while you read, and the yellow button leads to the one after it.

The walkthrough never changes what your agents do. To start over, open the skill menu at the top of the sidebar (Cmd+K) and choose **Restart walkthrough…**.

## 1. Open or create a skill

![The Library: a search box, a place filter, a round arrow and a New skill button above two tables, In progress and Your skills. Each row has the skill and its description, its place, Claude, Cursor and Codex buttons, and at its end a Not mine button and a folder icon.](images/library.webp)

- **Open a skill:** click its name. Type in the search box to find one.
- **In progress:** the skills you have worked on.
- **Claude, Cursor, Codex:** install the skill for that agent, or remove it. Removing never deletes the skill.
- **"copy" on a button:** that agent has its own copy. Your edits here do not reach it.
- **Not mine:** moves a skill you did not write to the Installed list. Once a skill is there, a **Yours / Installed / All** switch appears beside the place filter, and **Mine** on an installed skill brings it back.
- **Folder icon:** shows the skill's files on your computer.

To make a new skill:

1. Click **New skill**, or press Cmd+K and type the name. Return creates it when no skill of that name exists; otherwise it opens the one that matches.
2. Type a name in lowercase, with dashes, like release-notes.
3. Write one line on what it is for. Agents read this to decide when to use it. Left empty, the Skill screen asks for it.
4. Pick a template: Blank, or a kind of skill with example rules to replace. For a kind of skill, leave "Add 3 sample cases to run against" ticked.
5. **Where it lives** says the folder and the agents that get it: your home, for Claude Code. Open "Change the place or the agents" to pick a project or other agents.
6. Click **Create skill**, or press Return.

A skill missing from the list?

- Choose **Every place** in the place filter, and **All** on the Yours / Installed / All switch if it shows.
- Click the round arrow beside New skill to look again.
- Open "Where skills are found" at the bottom, and add the folder its project is in.

## 2. Write the skill

![The Skill screen: the files, the versions with each one's score, Insert buttons and a folded How to write a rule on the left; SKILL.md in the editor on the right, each graded rule numbered in the margin, with a formatting toolbar under a switch for Formatted, Markdown or Changes.](images/editor.webp)

- **Write** the skill's rules in the editor. Save with **Save** or Cmd+S.
- **An empty SKILL.md** has one line over it: write the first rule, take a template's rules, or draft rules with AI. It goes once you write.
- **Rules are numbered.** Each bullet Jev will check shows its number in place of the bullet, 01, 02. A bullet that keeps its dot is skipped; point at it for why. An amber number means the writing checks found something: the words that set a check off are underlined (point at one to read why), and clicking the number selects the rule: the popout lists what the checks found over Auto refine, Suggest changes and Help me improve.
- **Insert** adds a ready-made rule, decision tree, process or reference link at the cursor.
- **Formatted, Markdown, Changes:** read the page styled, as plain text, or as your unsaved changes.
- **Five bars** (before Write with AI, at the end of the toolbar) show the file's size. Amber: getting long. Red: too long.
- **Long background material** goes in a file of its own: click the plus beside Files. **Delete file** under a saved reference file removes it.

Unsaved text is kept, even if you close the app. **Discard** throws it away.

### What Jev checks

Jev checks every bullet that starts a line and has four words or more. It skips:

- Numbered lists. Use them for steps.
- Sentences inside a paragraph.
- Indented bullets. They count as part of the bullet above.

### How to write a good rule

- **Say what to do.** "Lead with the change" beats "write clearly".
- **Give the reason.** The agent applies a rule better when it knows why.
- **Use numbers or absolutes.** "Under 120 words" or "never", not "reasonably".
- **Cut what changes nothing.** Every extra line takes attention from your rules.
- **One skill, one job.** A skill that covers everything is followed on nothing.

```
Vague:
- Try to keep notes reasonably short.

Exact, with its reason:
- Keep the note under 120 words. A note longer than one screen is not read.
```

### Write with AI

- **Connect a model** in Settings. Claude Code and Codex are the main way: they run on the account you already use, with no key. An API key works too, under **Use an API key**. Settings says whether Claude Code and Codex are installed and signed in. When one is not, it shows the command to run in Terminal (`claude auth login`, or `codex login`), with **Copy command**. Run it, come back, and Settings shows the account and the plan.
- **Ask:** click the small button in any text box, or **Write with AI** in the editor toolbar. Say what you want.
- **Nothing changes** until you click **Replace** or **Insert**.
- **Select text first** to rewrite only that part.
- **Assistant** (top right, or Cmd+J): a chat beside every screen. It reads the open skill as you have it, unsaved edits and new files included, and knows the screen you are on and the file or case you have open. Ask it to change something and the reply shows each change under it: a file's changes, a new case, or a version to keep first. A case it adds or replaces can mark a check ×2: ask for it. Click the button at the end of a change's row to apply it. For a file change or a new case, Undo in the status line takes it back; a replaced case or a kept version offers **Open** instead. Nothing changes until you click. **New conversation** in the panel's header starts over.
- **Commands in the Assistant:** type `/` and pick from the list, or keep typing a name; Tab takes the one shown. `/clear` starts a new conversation, `/settings` and `/guide` open those screens. While a reply is written, the send button becomes Stop.
- **Run a skill in the Assistant:** with Claude Code as the model, the same list holds the skills your CLI knows. Pick one, add any words it takes and press Return. The skill shapes the reply the way it would in your terminal, and still nothing in your files changes.

### Improve a selected rule

Select four or more words in SKILL.md and a small bar appears over them with three choices. Nothing changes until you click a result.

- **Auto refine** checks the rule against the guide above, how many conditions it holds, and how long it and the file are. If something drifts, you see what and a revision to **Replace**. If nothing does, it says so and offers Help me improve instead.
- **Suggest changes** writes three rewrites, always in this order: **Best practice** fixes what drifts, **More direct** puts the constraint first in the imperative, **Shorter** cuts what changes nothing. Click one to put it in place. Undo brings the selection back.
- **Help me improve** opens the Assistant on a short set of questions about this rule: what the agent does differently, whether it is a step or a quality, where the line is, why the rule exists. Answer each in a sentence or two. It then drafts the rule, shows how the draft stands against the guide, and **Replace selection** puts it in the file.

With a TypeSafe key, Jev reads the rule and the answers, so the checks are exact and the same whatever model writes the text. Without one, only the word and count checks run.

### Versions

![A version open on the Skill screen: the list of versions on the left with each one's date and score; on the right v0 with its score, Restore and Delete version, and the lines that changed between it and the files now.](images/versions.webp)

A version is a copy of the skill as it was for a run, named v0, v1 and so on. You never save one by hand: when the files changed since the last run, the next run keeps them as the next version. Every score stays tied to the version that produced it.

- **Versions**, under Files, lists them, newest first, each with its date and score.
- **Click one** to see what changed between it and the files now, file by file. **The version before** shows what that version itself changed.
- **Restore** puts a version's files back. If the files changed since the last run, they are kept nowhere else: run them first to keep them.
- **Delete version** deletes it and its runs. **Undo** brings them back.

## 3. Write cases

A case is one task for the agent: a request, and what a good answer does.

![Cases: the list of three cases on the left; on the right the form for one case, with its prompt, its title, an Add pictures button and what a good answer does. The checks start below.](images/cases.webp)

Start with the prompt alone. It is enough to run the case, and reading what the agent wrote shows you what to check.

1. Click the plus above the list. A new case can start empty or from one of the examples under "Start from an example".
2. **Prompt:** what a user would ask. Do not mention the skill: the test is whether the agent uses it on its own.
3. **Title** (optional): a short name for the lists. Left empty, the case is named after its prompt.
4. **Pictures** (optional): a screenshot or mock-up the prompt is about.
5. **A good answer** (optional): one or two sentences on what it does.
6. **Checks** (optional): one fact per row that a good answer makes true. Return starts the next row; Backspace on an empty row removes it. The picture button in a check's corner attaches a mock-up or screenshot the check is about. **×2** makes a check count double. **Write checks with AI** adds checks from the prompt.
7. **Length** (optional): tick it to score the word count.
8. Click **Add case**.

Checks can come later: on Results, **Add a check** turns what an output got wrong into one.

Some kinds of skill are not scored on checks. A skill graded as Writing or Workflow says so in place of the Checks section. Scoring, on Results, changes how a skill is graded.

Write at least three different cases before you trust a score.

## 4. Run it

![The Run panel, opened from the Run button at the top right: what this run will do, how many outputs it writes, and Start a run, with Options folded under it.](images/run.webp)

1. Click **Run** at the top right. A panel opens and says what the run will do: the version it tests and how many outputs it writes.
2. If the skill changed since its last run, the run keeps it as a new version. Type what changed under **What changed**, or leave it: the version is then named after the date.
3. Click **Start a run**.

The defaults suit most runs: every case, once, with the agent you used last. **Options** changes them:

- **Cases:** untick the ones to leave out.
- **Write with:** "This version", "No skill" (the baseline to beat), or "An earlier version" (to run an old copy of the skill again).
- **Agent, Model, Effort:** who writes the outputs. Pick a model from the list or type its name.
- **Samples per case:** use 2 or more to see how steady the skill is. Agents answer a little differently each time.

The run works in the background. Its progress shows at the foot of the sidebar: click it for the log. Jev grades the outputs when they are written.

Runs cost money: each output is an agent session, and Jev is paid per call.

## 5. Compare the results

![Results: three cases on the left, each with its score before and after; on the right two outputs of one case side by side, A from v0 and B from v1, each with its score, the rules and checks it met as counts, and a list of what it missed. A bar at the foot asks which is better.](images/results.webp)

Results opens on a case with two outputs side by side: **A**, the version before, and **B**, the latest. With one version, A is the output written without the skill, if you ran one.

- **The list** on the left has every case that was run, with how its score moved. Click one to compare it.
- **Each output** has its score out of 100, then what the score is counted from: "Rules 4 of 5", "Checks 2 of 3".
- **Missed** lists each rule the output broke and each check it did not meet. This is what to fix. **Open rule** takes you to that rule on the Skill screen.
- **Met** folds the rest away. Open it to read them.
- **Transcript**, above the output, shows every step the agent took. Read it when a score surprises you. Did the agent read the skill at all?
- **Word diff** marks what differs between the two. **Swap** trades their sides, and the **A** and **B** menus pick any other outputs of the case.
- **Regrade** has Jev read an output's run again, for example after you add a check.

Then say **which is better**: A, B, or a tie. Picking the better of two outputs is easier, and more reliable, than scoring one.

### When you and Jev disagree

Your pick is the last word. When Jev scores the other side higher, the bar at the foot says so, and the case is marked in the list. A disagreement means one of three things, and each has a fix:

| You see | It means | Do |
| --- | --- | --- |
| Jev passes an output you do not like | Something you care about is not written down | Add a check, below, or add a rule to the skill |
| Jev fails an output you like | A rule or a check asks for the wrong thing | Edit or delete it |
| Jev misread one rule or check | That verdict is wrong | Click **Mark as met** or **Mark as missed** beside it |

A verdict you mark is yours from then on. It moves to the other list with "your answer" beside it, the score follows, and **Take back** lets Jev's answer stand again.

### Add a check

Under the two outputs, **Add a check** takes one sentence: what a good answer does that one of these does not. It joins the case's checks. Jev marks it on every run from then on, and on the outputs in front of you once you click **Regrade**.

### All cases

![All cases: the version lift, a ribbon from v0's score to v1's over the score without the skill; under it the latest version's rules and checks added up, and each run with a score per case.](images/all-cases.webp)

**All cases**, at the top of the list, shows every run at once.

- **Top:** how much your latest version gained since the first, and against no skill at all. Under it, the latest version's rules followed and checks met, added up.
- **Each row:** one run, with a score per case and the average. Under its name: when it ran, how long it took and what it cost.
- **Click a score** to read that output beside the one before it.
- **Click a run** to see each output with what it missed. **Changes since this run** shows what changed in the skill after it. **Regrade** has Jev read the run again.

To be sure an edit helped, run with **Samples per case** at 2 or more. If two versions' scores differ less than one version's samples do, the edit made no clear difference.

### Scoring

Most skills never need this. **Scoring**, folded at the foot of All cases, sets how Jev's answers become a score. Move a setting and every score updates at once. Nothing runs again, so it costs nothing.

- **Graded as:** the kind of work the skill does. Generic counts rules and checks. Writing, Code, Workflow and Design score their own parts.
- **Points:** how much each part counts.
- **Threshold:** how sure Jev must be before a rule or check counts as met.
- **Rules:** the bullets read from SKILL.md, in the order the Skill screen numbers them.

Click **Save scoring**, or **Discard**.

### Then change the skill

1. Read what the outputs missed.
2. Fix what the weak outputs have in common, not one output.
3. Run again, and compare.

## When something goes wrong

| Problem | Fix |
| --- | --- |
| "No Jev key" at the top right | Add the key in Settings |
| An agent says "(not set up)" under Run, Options | Install that agent and sign in to it |
| A skill is missing from the Library | Choose Every place, click the round arrow, or add its folder under "Where skills are found" |
| Save is greyed and a notice says the file changed on disk | The file changed outside the app. "Keep my draft", then Save, writes yours over it; "Use the file on disk" keeps the other |
| A bullet keeps its dot and gets no number | Make it a bullet of four words or more, outside a numbered list, and not only a link |
| A score looks wrong | Read the transcript, then mark the verdict that is wrong |
| Results shows one output and no pick | The case has one version and no run without the skill. Edit the skill and run again, or run with "No skill" under Options |

Only test skills you trust. A skill can make the agent run code on your computer.
