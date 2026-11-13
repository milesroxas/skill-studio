# How to use Skill Studio

A **skill** is a page of instructions that an AI agent, such as Claude Code, reads before it does one kind of task. Skill Studio helps you write one and shows whether each edit makes the agent's answers better.

## How it works

![The loop: Write, Run, Compare. An arrow returns from Compare to Write.](images/loop.svg)

You go round three steps:

1. **Write** the skill's rules, on the **Skill** screen.
2. **Run** it: click **Run** at the top right. An agent answers a few test tasks, called **cases**, using your skill.
3. **Compare** on the **Results** screen: each answer gets a score and a list of what it missed, beside the answer from your last version.

Then change a rule and go round again.

![The app with the release-notes skill open on Results: the sidebar with Skill, Cases and Results; three cases listed with how each score moved; and two outputs of one case side by side, each with its score and what it missed.](images/app.webp)

The pictures in this guide show an example skill that writes release notes. Its scores are made up.

### Who decides what is good

You do, in writing. The skill's **rules** say what the agent should always do. Each case's **checks** say what a good answer to that task contains.

**Jev** is the grader: an AI model that reads every answer and marks each rule and check as met or missed, the same way every time. The score, out of 100, counts what was met. When you think Jev got one wrong, you can mark it yourself.

### Finding your way

- **Sidebar:** Skill, Cases and Results for the skill you have open. Library, Guide and Settings sit at the bottom.
- **Top right:** the **Run** button, a yellow button when there is a next step to take, the **?** that explains the screen you are on, and the Assistant.
- **A word with a dotted underline:** click it to see what it means.
- **Right-click** a skill, a case, an answer or a rule to see what you can do with it.
- **Switch skill:** click the skill's name at the top of the sidebar, or press Cmd+K.

On Windows and Linux, press Ctrl where this guide says Cmd.

## Start the app

You need three things:

1. **Skill Studio.** Download it from [Releases](https://github.com/milesroxas/skill-studio/releases).
2. **Claude Code or Cursor**, installed and signed in. This is the agent that answers your cases.
3. **A TypeSafe key**, so Jev can grade. Get one at [typesafe.ai](https://typesafe.ai). Without it, no rule or check is marked.

The first time you open the app, a welcome asks how you want to start:

- **Try it on a sample skill** opens the walkthrough below. Most people start here.
- **See how it works** shows the three steps first, then opens the same sample skill.

If you have no TypeSafe key yet, the welcome asks for one. Click **Configure later** to skip it. You can add it any time in **Settings**. Until you do, a **No Jev key** button at the top right takes you there.

To see the welcome again, click **?**, then **How Skill Studio works**.

## Take the walkthrough first

The walkthrough takes a finished sample skill, **Thank-you note**, once round the loop. You type nothing, and a run takes a minute or two. Open it from the welcome, or with **Start the walkthrough** in the Library.

The **Walkthrough** box at the bottom of the sidebar shows your step. Click it to go where the step happens. The yellow button at the top right does the step.

1. **Run the skill.** Click **Run**, then **Run 3 cases**. The agent writes a thank-you note for each case.
2. **Read what the notes missed.** Results shows each note with its score and what it missed.
3. **Tighten one rule.** One rule says "Keep the note to a reasonable length". It is vague on purpose, so the notes come back too long. The Skill screen offers an exact rule instead: click **Use the exact rule**, then **Save**.
4. **Run it again, then compare.** Only that rule changed, so any difference comes from your edit. Read the two notes side by side.

To start over, click the skill's name at the top of the sidebar and choose **Restart walkthrough…**.

## 1. Open or create a skill

![The Library: a search box, a place filter, a round arrow and a New skill button above two tables, In progress and Other skills. Each row has the skill and its description, its place, Claude, Cursor and Codex buttons, and at its end a folder icon; rows in In progress also have Mark done.](images/library.webp)

The **Library** lists every skill on your computer.

- **Open a skill:** click its name, or type in the search box to find it.
- **In progress** holds the skills you are working on. **Mark done** moves one to **Other skills**.
- **Claude, Cursor, Codex:** turn the skill on or off for that app. Turning it off never deletes it.
- **Folder icon:** shows the skill's files on your computer.

**To make a new skill:**

1. Click **New skill**.
2. Type a name in lowercase, with dashes, such as `release-notes`.
3. Write one line on what it is for. The agent reads this line to decide when to use the skill.
4. Pick a template. **Blank** starts empty. The others start with example rules, and can add three example cases.
5. Click **Create skill**.

**A skill is missing?** Choose **Every place** in the filter and clear the search. If it is still missing, open **Where skills are found** at the bottom and add the folder it is in.

## 2. Write the skill

![The Skill screen: the files, the versions with each one's score, Insert buttons and a folded How to write a rule on the left; SKILL.md in the editor on the right, each graded rule numbered in the margin, with a formatting toolbar under a switch for Formatted, Markdown or Changes.](images/editor.webp)

Write the skill in the editor, then click **Save** (Cmd+S). Your unsaved text is kept even if you close the app.

- **Rules are bullets.** Each bullet of four words or more gets a number, such as 01, and Jev grades it. A bullet that keeps its dot is not graded: point at it to see why.
- **An amber number** means the rule could be clearer. Click it to see why and to get help.
- **Insert**, on the left, adds a ready-made rule, decision tree, step list or link.
- **The five bars** in the toolbar show how long the file is. Amber means getting long, red means too long.

### How to write a good rule

- **Say what to do, not the result you hope for.** "Open with what changed for the reader", not "write clearly".
- **Give the reason in the same bullet.** It tells the agent where the rule stops.
- **Make it checkable:** a number, a limit, or always, never or only.
- **Leave out what the agent does anyway**, such as "be accurate".
- **Keep to one job.** Rules for another job belong in another skill.

```
Leaves the agent to guess:
- Release notes should be clear and not too long.

Says what to do, and why:
- Open each note with what changed for the user, in one sentence. Most readers stop after the first line.
```

This way of writing rules comes from Emil Kowalski's course [AI for Designers and Engineers](https://aiforui.dev), which made Skill Studio possible.

### Get help from AI

First, connect a model in **Settings**. If you use Claude Code or Codex, it works with the account you already have. Settings shows what to do if one is not signed in.

- **Write with AI**, in the editor toolbar or in any text box: say what you want. Nothing changes until you click **Replace** or **Insert**.
- **Select a rule** to get three choices: **Auto refine** fixes what is unclear, **Suggest changes** offers three rewrites, and **Help me improve** works through it with you in a chat. Nothing changes until you pick a result, and **Undo** takes it back.
- **The Assistant** (top right, or Cmd+J) is a chat that reads your skill and suggests changes. You apply each one with a click.

### Versions

![A version open on the Skill screen: the list of versions on the left with each one's date and score; on the right v0 with its score, Restore and Delete version, and the lines that changed between it and the files now.](images/versions.webp)

Each run saves the skill as it was, as a **version**: v0, v1 and so on. You never save one by hand. Every score stays with the version that earned it.

- **Click a version** to see what changed since.
- **Restore** puts a version back.
- **Delete version** removes it and its runs. **Undo** brings them back.

## 3. Write cases

A **case** is one test task: what a person would ask the agent, and what a good answer contains.

![Cases: the list of three cases on the left; on the right the form for one case, with its title, its prompt and its files, with the Add files and Add folder buttons under them.](images/cases.webp)

Start with the request alone. Reading the first answer shows you what to check.

1. Click **+** above the list.
2. **Prompt:** type what a person would ask. Do not name the skill: the test is whether the agent uses it on its own. **Start from an example** fills in a finished case.
3. **Files** (optional): add any file the prompt mentions, such as a screenshot or a document. The agent sees only what you add here, not the rest of your computer.
4. Click **Add case**.

When you know what a good answer looks like, open the case again and add:

- **Checks:** one fact per row that a good answer makes true, such as "The note mentions the wedding". **×2** makes a check count double.
- **A good answer:** a sentence or two describing it.
- **Length:** the fewest and most words an answer may have.

**Duplicate**, at the top of a case, copies it so you can try a variation. Write at least three different cases before you trust a score.

## 4. Run it

![The Run panel, opened from the Run button at the top right: what this run tests, the button that runs the cases, who does the work, and Options folded under it.](images/run.webp)

1. **Save** your skill first. A run tests the saved file.
2. Click **Run** at the top right.
3. If you changed the skill, type what you changed under **What changed**. It names the new version.
4. Click **Run 3 cases** (the number is how many cases you have).

The first time, the button reads **Run without skill**. That run shows how the agent does with no skill at all: the score your skill has to beat. To skip it, open it and click **Test the skill instead**.

The run's progress shows at the bottom of the sidebar. Click it to watch, or to **Stop**. Each run costs a little money: the agent and Jev are both paid services.

**Options**, in the Run panel, lets you leave out cases, run an older version, pick another agent or model, and set **Attempts per case**. Two or more attempts show whether a result was luck, since the agent answers a little differently each time.

## 5. Compare the results

![Results: three cases on the left, each with its score before and after; on the right two outputs of one case side by side, A from v0 and B from v1, each with its version, its score and a list of what it missed.](images/results.webp)

Results shows one case at a time: **A**, the answer from your previous version, beside **B**, the answer from your latest.

- **The list on the left** has every case with its score and how much it moved. Click one to open it.
- **Missed** lists each rule and check the answer did not meet. **Open rule** takes you to that rule in the editor.
- **Met** folds away everything it got right.
- **Click a score** to see how it was counted.
- **Read the transcript** shows every step the agent took. Read it when a score surprises you.
- **Click a version name** to read a different answer on that side.
- **Side by side** and **Word diff**, at the top right, change how the two answers are shown. A web page or a picture opens large above the scores: press A and B to flip between the two.

### When you and Jev disagree

| You see | Do |
| --- | --- |
| Jev passed an answer you do not like | Write down what is missing: **Add a check** under the answers, or add a rule to the skill |
| Jev failed an answer you like | Edit or delete the rule or check that asked for the wrong thing |
| Jev got one rule or check wrong | Click **⋯** beside it, then **Mark as met** or **Mark as missed** |

Your mark replaces Jev's and the score updates. **Take back**, in the same menu, undoes it.

After you add a check, click **⋯** at the top right and choose **Regrade**, so Jev reads the answers again.

### All cases

![All cases: the version lift, a ribbon from v0's score to v1's over the score without the skill; under it the latest version's rules and checks added up, and each case with a score from every run.](images/all-cases.webp)

**All cases**, at the top of the list, shows how much your latest version gained, and a table of every case's score in every run. Click a score to open that answer. Under the table, each run shows when it ran, how long it took and what it cost, with **Delete run**.

Two versions only a few points apart may not really differ. Run with two or more attempts to be sure.

### Then change the skill

1. Read what the answers missed.
2. Fix what the weak answers have in common, not just one answer.
3. Run again, and compare.

## When something goes wrong

| Problem | Fix |
| --- | --- |
| **No Jev key** at the top right | Add your TypeSafe key in Settings |
| An agent says "not set up" in the Run panel | Install that agent and sign in to it |
| A skill is missing from the Library | Choose **Every place**, or add its folder under **Where skills are found** |
| The agent says it cannot find a file | Add the file to the case under **Files** |
| A bullet gets no number | Make it four words or more, and not part of a numbered list |
| A score looks wrong | Read the transcript, then mark the rule or check Jev got wrong |
| Results shows one answer, not two | Change the skill and run again, so there are two versions to compare |

Only test skills you trust. A skill can make the agent run programs on your computer.

For technical details, such as the files a skill keeps and how scores are counted, see the [developer docs](https://github.com/milesroxas/skill-studio#documentation).
