# Changelog

What changed in each release of Skill Studio. The app shows this file under Help, What’s New, and the release workflow publishes each version’s entry as its GitHub release notes.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- The Assistant can change the open skill. Ask it to rewrite SKILL.md, add a reference file, add or replace a case, or save a version first, and each change stands under its reply: the file's changes, the case, or the version. One click applies it, and Undo in the status line takes it back. Nothing changes until you click, and a reply's changes apply only to the skill it was written about.
- The Assistant sets a check's weight when it adds or replaces a case: ask for a check to count twice and the case it proposes carries the weight. It reads the weights the case has, so it can change one and leave the rest. Write checks with AI does the same for the checks it adds when the request asks. Where checks are listed outside the Cases screen, under an output on Rate blind and in the Assistant's case change, a weight other than 1 reads after the statement, and so does a flag for an unmet check on Results.
- The Assistant reads the open skill as you have it: your unsaved edits, a reference file you have not saved yet, and a case you are still writing. It reads each reference file's text, not just its name, and knows which file or case you have open. A change it proposes shows against your unsaved text.
- Select four or more words in SKILL.md and a bar appears over them: Auto refine, Suggest changes, Help me improve. Auto refine checks the rule against the writing guide, its conditions and its length, and offers a revision only when something drifts; otherwise it says the rule already complies. Suggest changes offers three labelled rewrites, Best practice, More direct and Shorter, each one click to put in place. Help me improve opens the Assistant on a few fixed questions about the rule, drafts it from your answers, and puts the draft in the file with one button.
- With a TypeSafe key, Jev reads a selected rule before any model writes: whether it names a step, carries its why, fixes its boundary, changes what the agent does and belongs to the skill. A rule that holds costs no model call. Jev also checks that each suggested rewrite kept the selection's facts.
- The writing guide beside the editor has a sixth line: test it by running it.
- Commands in the Assistant: type `/` and pick from the list, or keep typing a name and press Tab. `/clear` starts a new conversation, `/settings` and `/guide` open those screens.
- Run a skill from the Assistant: with Claude Code as the model, the same list holds the skills your CLI knows, plugins included. Pick one and add any words it takes. The reply follows the skill as it would in your terminal, and your files still do not change.
- A default case: pick one under the cases on New run and it is ticked on every new run, first in the list. It can still be unticked. The Cases list says which case it is, and `bench.json` keeps it as `defaultCase`.
- Results opens with the version lift: the latest version's mean, what it gained since the first version, and a ribbon from one score to the other, over the same writer's score without the skill.
- A run counts its outputs as they are written, under its line at the foot of the sidebar ("3/6").
- A skill being run says so on its row in the Library.
- Graded rules on the Editor and Scoring are numbered "01", "02" in mono, so a rule is easy to find again.
- The welcome sets you up after its tour, in its own window: the folders your skills are found in, a model for the assistant, and the Jev key. Each step first checks what Skill Studio can already reach, and every step can be left for later.
- Getting a Jev key: a link to sign up at TypeSafe, and "Show me" for the three steps from there. Settings shows them too.
- In the desktop app, a folder for the Library to look in is picked in the system's own dialog.
- The Editor shows how big the file is: five bars at the end of the toolbar that fill as it grows, and turn amber when the file is long and red past 500 lines or 5,000 tokens. Point at them for the line and token counts, or click to show the counts in their place.
- The walkthrough's first screen says which skill it uses: until the first run, the Editor opens with a note that this is Thank-you note and what the walkthrough does with it.
- Restart walkthrough: once you have done any of the walkthrough, the skill menu at the top of the sidebar offers to start it over. Its skill goes back to how it was written, and its runs, ratings, votes, versions and unsaved edits are deleted.

### Changed

- A check row reads statement, weight, remove. The button that adds the picture a check is about moved into the statement's corner, beside write with AI, since both are about what the check says; it stood past the weight, next to remove. Once added, the picture sits inside the field under the statement, as the Assistant's composer holds its pictures.
- A check's weight is held to 1 to 5 wherever it enters: the form, the Assistant, the API and a grader file written by hand. A file saying 10 scored at 10 while the form could only show 5.
- Rules read as rules in the Editor. Each bullet the judge will check shows its number in place of its bullet, 01, 02, in the order Scoring lists them, hanging in the margin so the text keeps its edge; a bullet the judge skips keeps its dot, and says why when pointed at. The number turns amber when the writing checks find something in the rule, the words that set a check off are underlined, and the findings stand under the rule while the cursor is in it. Clicking the number selects the rule so Auto refine, Suggest changes and Help me improve open on it with nothing to select by hand. The left column no longer repeats every rule in full, and Version sits above Insert, so it is in view however long the skill grows.
- Focus is quieter. Clicking no longer leaves a thick ring around a button, a menu or a choice. Moving with the keyboard shows a thin line just clear of whatever you land on, and inside a row of joined choices. A text field you click into shows a darker edge around it, with no ring.
- New run reads top to bottom as the run it will start. It opens with the version under test, in large type, and that line follows your choices: the new version's name as you type it, "No skill" for a baseline, or the earlier version you picked. Write with (This version, No skill, An earlier version) is a row of three choices under it instead of a menu at the end. The writers' columns are labelled Agent, Model and Effort, and the model is picked from a list that matches the other menus; you can still type any model. The bar at the foot says how many outputs the run will write and how they add up, with Start a run at its far end, and shows the run's progress while it goes.
- New skill asks for the name first and has it focused, so from the skill menu a new skill is its name and two Returns away. The template follows, with its summary under the picker, and "Where it lives" is one line, saying the folder and the agents, that opens to change either. A blank skill is saved with no description, so the Editor asks for one instead of an agent reading a stand-in.
- The Editor no longer asks for a template a second time. An empty SKILL.md has one line over it, to write the first rule, take a template's rules, or draft rules with AI, and the writing guide beside it starts open. Graded rules and Version appear once there is something to show, and "Start over from a template" has left the Insert section: it replaced the whole file from a group of buttons that add text.
- Every button that waits for something is busy until it lands: disabled, and saying what it is doing ("Saving…", "Deleting…", "Restoring…") at the same width, so nothing beside it moves. Start a run stays "Running…" until the run is over, Regrade "Grading…", Ask Jev "Jev is voting…"; before, each came back as soon as the job was queued and looked ready to press again. The other buttons of the same form wait meanwhile, and "Try again" after a failed read says "Trying again…".
- A button with an icon keeps its text padding and trims 2px on the icon's side only, so the icon's ink sits as far from the edge as the letters do. Before, both sides shrank and the icon looked loose.
- New run starts with one case ticked, the default case or else the first, instead of every case. Running every case is a choice.
- What just happened is read on a status line at the foot of the window, in a strip kept for it, instead of a message floating over the screen: "Saved 1.2.0", "Deleted 1.1.0 and its 3 runs" with Undo, or why a save failed, with a red dot. The strip turns ink while it speaks, drawn in from the left, and Undo is a button in it. In the welcome it reads in the title strip.
- A dialog's confirm button is one verb: Restart, Restore, Start, Delete, Reset. The dialog's title names what it acts on.
- Practice is now the walkthrough, and it takes the thank-you note through the whole workflow in 12 steps: read the skill, save a version, read the cases, run, read the scores, rate, check the judge, see the scoring, tighten a rule, save it, run again and compare. It opens on the Editor.
- A new look. The sidebar is a blue-black ink in both themes, and the page is a warm off-white in the light theme and near-black in the dark one.
- The next step at the top right is a highlighter yellow, the one yellow control in the window. A running job's dot in the sidebar is yellow too.
- Scores, costs and times in tables are set in mono, so digits line up down a column. Score chips have small 4px corners.
- A pressed choice (a theme, an install toggle, a vote between two outputs) is filled solid, the same everywhere. Good and Bad marks stay green and red.
- Fields have a light fill, so they are easy to find on the page.
- Tighter corners. Buttons, fields, toggles and chips have 4px corners. Cards, menus, dialogs and panels are 10px on top and 12.5px below.
- The welcome opens on a dark cover with the new mark, and each step of the tour shows its number large.
- A new app icon: the Flow mark, two ribbons on near-black.
- The Write screen is now called Editor.
- The guide is shorter and written for people who use the app: each step leads with its picture and a few short lines. Developer setup, the command line and file paths are in the reference pages instead.
- Opening or switching to a skill always lands on the Editor, instead of on Cases or Results depending on what the skill holds. The practice skill still opens on the step in hand.

### Fixed

- Starting the walkthrough opens on the Editor and stays there. It used to move on to Versions as soon as the Editor marked its first step done.
- Results fits a 720px window: the "×2" beside a score folds away below 1024px, and the score still says it to a screen reader.
- Like the other verdicts, a failing message on Agreement colors only its heading.
- The welcome's first screen no longer opens with a focus ring on "See how it works".

## [0.1.0] - 2026-11-05

### Added

- The app updates itself: it looks for a new version when it opens and every few hours, downloads it in the background, and shows **Restart to update** at the foot of the sidebar. Rest the pointer on the button to read what the update brings.
- **What’s New**, under Help: a window with every release, its date and what changed. It also shows where an update stands and the one step that moves it on.
- **Check for Updates…** in the app menu on macOS, and under Help on Windows and Linux.
- Settings, Updates: let the app look for new versions on its own, or only when you ask.
- Settings, Start over, in test versions only: put the app back to how it opens the first time, to try a release from its first launch. Your skills and your stored keys stay.
- The Library looks for skills again each time you come back to the window, and when you press the round arrow beside **New skill**.
- **Reveal in Finder**: the folder icon at the end of a skill’s row in the Library shows its folder in Finder, in File Explorer on Windows, or in your file manager on Linux. For the open skill, the same step is at the foot of the skill list at the top of the sidebar.
- **Write checks with AI**, under a case’s checks: it writes new checks from the case and adds them to the list.

### Changed

- The Library’s columns stay where they are while you search, and line up between **In progress** and the list under it. **Yours**, **Installed** and **All** replace the checkbox for skills installed from elsewhere.

### Fixed

- Quitting the app no longer leaves a run or an assistant reply working in the background. The agent it started ends with the app.
- Sending a “write with AI” request with the arrow no longer saves the case, the version or the new skill behind it. On Cases it dropped the check being written and said “Saved”.
- A “write with AI” reply stops when you close it, discard it or leave the screen. Stop works from the moment a request is sent.
- The one-click requests fit the field: writing for an empty one, edits for one with text.
- When the assistant cannot be reached it says why and offers **Try again**. It asked you to connect a provider before.
- A reply no longer writes forever when the app’s background process restarts. It fails, and you can ask again.
- A picture dropped on a “write with AI” request on Cases is no longer added to the case as well.

## [0.1.0-beta.2] - 2026-11-05

### Added

- A welcome on first launch, in a small window of its own: what the app is for, one button, and a tour of the loop in six steps, one step to a screen.
- A help button at the top right of every screen: what the screen is for, what its words mean, and the way to the guide and the assistant.
- A hint under the top bar the first time each screen opens. Turn hints off, or bring them all back, under Settings, Help.
- Delete a version from the Versions screen, with its saved copy, its runs and their reviews. The toast that follows offers Undo.

### Changed

- The practice skill opens on the step in hand, so the first thing in view is the one thing to do.

## [0.1.0-beta.1] - 2026-11-05

### Added

- The first public release, for macOS, Windows and Linux.
- Write a skill and its reference files, formatted in place or as Markdown, and save named versions to compare and restore.
- Cases: the task an agent gets, what a good answer does, the checks a judge holds it to, and pictures where they help.
- Runs with Claude Code or Cursor's agent, graded by code checks and Jev judge packs.
- Review: rate outputs blind, compare two side by side, read transcripts, and see where your ratings and the judge disagree.
- An assistant that writes with you in every text area and in a side panel, through Anthropic or OpenAI.
- A practice skill and a guide that walk the whole loop.
