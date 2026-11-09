# Changelog

What changed in each release of Skill Studio. The app shows this file under Help, What’s New, and the release workflow publishes each version’s entry as its GitHub release notes.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] - 2026-11-09

### Fixed

- A run made against an older version's snapshot counted as that version in a comparison but not in the version lift. It counts as that version in both.
- The code pack's check command ran with the app's own keys in its environment. It runs with the same environment an agent gets, with the keys left out.
- **Suggest changes** could leave nothing to pick: a rewrite Jev read as dropping a fact was locked. Every rewrite that changes something can now be picked, and the card says "May drop a fact" where Jev saw one.
- A grading whose judge failed on every output, such as with an expired TypeSafe key or no network, said "Graded." over scores counted from the code checks alone. The job now fails and says how many outputs were not judged and why; when only some failed it says so and goes on. A grading with no TypeSafe key says "No TypeSafe key: code checks only." as it starts.
- A check or lint command held the whole backend while it ran, so the window hung and the job's log stopped for up to two minutes per output. It now runs in the background.
- One output that failed to start no longer fails the run while the other outputs went on writing; it is recorded as a failed output and the rest finish.
- A TypeSafe key added in Settings during a session was not used by the selection tools until the app restarted, and every error from Jev there read as a missing key. The key is picked up at once, a refused key says "TypeSafe refused the key", and other errors are logged.
- Auto refine, Suggest changes and Help me improve asked Jev before checking that a model was connected, so Jev was paid for nothing when none was. They check first.
- A request the provider billed and then refused was left out of the usage log. Its tokens are recorded.
- The job list no longer grows without end: the last 50 finished jobs are kept.
- "Checks 2 of 3" beside a bar at 50: a check marked ×2 counted double in the score and once in the count. The count now counts each check by its weight, so it reads "3 of 4" and agrees with the bar.
- The version lift and a version's score averaged every output of a run, so a run on fewer cases or more samples was read as a better or worse skill. Each case now counts once, and two versions are compared over the cases both ran, by the writer that ran both.
- A file the assistant proposed with a line of four tildes inside, such as a tilde code fence, was cut off at that line and Apply wrote the fragment. The block now ends at its last line of four tildes.
- A SKILL.md the assistant handed back inside a code fence was saved with the fence, so its front matter sat in a code block and no rule was graded. The fence is removed, and a file that still opens with one is refused with "Try again".
- Bullets inside a `~~~` code fence were graded as rules and linted. A fence now closes only on its own character, as in Markdown.
- The selection tools flagged the templates' own rules and the practice skill's good rules: a why that said "feels slow" read as an outcome, "Read the code you are about to change" read as a definition, a list of four things read as four conditions, and a rule with no number read as vague. Checks now read the rule's first sentence, a definition needs a noun subject, only condition words count, and a bare rule with no hedge is left to Jev.
- Selecting prose opened the popout with rule findings on it. Only top-level bullets are rules; prose gets none, and a selection's first four words no longer count its list marker.
- A verdict you marked stopped saying "your answer" when a change to Scoring brought Jev round to it, and Take back disappeared with it. It stays yours, says "agrees with Jev", and Take back stays.
- A reference path such as `references/../x` or `references/` passed the editor's check. Only a plain path under `references/` is accepted.
- Open rule landed one line off on a SKILL.md saved with Windows line endings.
- **Regrade** on Results is busy from the press, where in a browser it waited for the next poll of the job list, so a second press could grade the run twice. When both outputs come from one run it says "Grading the run".
- Closing **Write with AI** discarded a reply being written, or one ready to accept, with no way back. The reply now goes on, and opening the box again on the same text finds it. Only **Discard** throws it away.
- **Start a run** pressed twice within a few seconds in a browser started two runs. The button stays busy until the run shows in the job list.
- Unsaved edits were lost when storing them failed. They are kept and stored on the next edit or when the page is left.
- A keystroke on Cases made before the stored drafts had been read replaced every other file's and case's unsaved edits with nothing. The edit now waits for the read and is laid over what it finds.
- Results said the first outputs show as the run writes them, but showed them only when the run ended. Each output now shows within two seconds of being written.
- In the Assistant, a file change whose saved file could not be read said "Reading the saved file…" for good, with no button. It now says "Could not read the saved file." and the reply offers **Retry**.
- Picking the transcript or another artifact on an output snapped back to the main one after a correction or a pick. It holds.
- A run of another skill hid the next step, the walkthrough's step and **Restart walkthrough** on the skill in view, and the walkthrough said a run was in progress. Only the open skill's own run does.
- Opening another skill with scoring changes unsaved dropped them. It asks first.
- **Stop** in the Assistant did nothing while a request was still being sent. It is disabled until there is a reply to stop.
- A model choice that could not be saved, a link or an artifact window that would not open, and a pop-up the browser blocked said nothing. They are reported on the status line.
- A skill with a run, report, review, version or draft file cut short, as a crash while writing leaves it, could not be opened, and the error named no file. These files are now written whole, so a crash leaves the old one; a damaged file is named in the error; and one damaged run or version leaves the rest listed.
- A version save that crashed partway left a folder that refused every later save of that version with "already saved". Such a folder is finished on the next save.
- A damaged keys file kept the window from opening. The app opens without the keys, says so once, and they can be set again in Settings.
- Quitting left a run's agents working, and billing, for up to twenty minutes. Quit now waits up to three seconds for them to end, and an app whose backend crashed ends the agents it left behind when it starts again.
- Ending an agent, on Stop, on a timeout or on quit, left the shells it had started with Bash running. Its whole process group is ended.
- On Windows every CLI read as not installed, and Claude Code installed with npm (`claude.cmd`) could not be started. The CLIs are found on the PATH, with `PATHEXT`, and started by their full name.
- Claude Code failed to start on a brief longer than the system allows for one argument, as a long SKILL.md with many references makes. Such a brief goes on stdin.
- The slash menu's list of skills is read from a run of `claude` ended at its first event; had that slipped, the run billed a full model call with the user's whole CLAUDE.md. The run is on the smallest model for one turn at most, and the list is kept on disk so a restart does not run it again.
- `st serve` sent the page with no Content Security Policy. It sends the desktop app's.
- On Linux with no keyring, a key could be stored under a fixed key anyone can read. The app refuses to store it there and says to set the environment variable instead.

### Changed

- **Stop** on a running job, in the job log at the foot of the sidebar. The agents in flight are ended, no more outputs start, and the job ends with "Stopped." in its log.
- Regrade asks Jev only about outputs whose text, rules, checks and settings changed since the last grading, and says "N of M outputs unchanged: kept their verdicts." A correction or a change of points or threshold still rescores at once. The kept answers live in `judge-cache.json` beside `report.json`.
- The generic pack's checks are asked once over the whole output. The "(closest: unit N)" note on an unmet check is gone with the per-paragraph pass, which cost one request per paragraph and no screen read.
- The writing pack asks about the title in the same request as the opening and ending.
- Regrade refuses a run that is still writing, and a run or a grading already in progress on the same skill or run is not started twice. A run writes at most 10 outputs per case.
- Suggest changes shows its three cards at once, each with "Replace" and its number key: click one or press 1, 2 or 3. The new text is tinted for a moment in the editor, and the status line offers Undo. **Try again** asks for three more, and the labels and notes are shorter.
- Auto refine says less: "Nothing to fix" when the rule holds.
- The selection tools work on whole lines. Selecting part of a rule selects the rule, so a rewrite never breaks the sentence it sits in. Auto refine, Suggest changes and Help me improve all put their text in place the same way: tinted for a moment, with Undo on the status line. Closing the popout stops a rewrite still being written, and asking a second tool about the same rule does not ask Jev to read it again.
- The assistant reads less of a long skill per turn: the reference files and the cases share 40,000 characters, the open file first, and a case past that is named by its title. The conversation sent back is capped at 24,000 characters of the newest messages as well as 40 messages.
- `bench.pack` and `viewports` on a case, which nothing read, are gone from the case schema.
- An agent, and the Claude Code and Codex CLIs the assistant runs, no longer see the app's keys: `TYPESAFE_API_KEY` and the stored Anthropic and OpenAI keys are dropped from their environment, so a skill from someone else cannot send them away.
- The app looks for a CLI where nvm, Volta, Bun and a global npm prefix install it, as well as in `~/.local/bin` and Homebrew, and reads the login shell's PATH once more, with longer to answer, when the first read ran out of time.
- With an Anthropic API key, the brief is cached between turns, so a conversation reads the skill at the cached rate.

## [0.3.0] - 2026-11-09

### Added

- **Add a check**, under two outputs on Results: one sentence on what a good answer does that one of these does not. It joins the case's checks, and Regrade applies it to the outputs in front of you.
- **Regrade** on each output, beside its time and cost.
- **All cases**, at the top of the list on Results: the version lift, the latest version's rules followed and checks met added up, and every run with a score per case.
- Settings and the welcome say how Claude Code and Codex stand: not installed, not signed in, or signed in, with the account and what pays. On a plan it names the plan; with an API key in the environment it says each request bills to that API account instead. A signed-out Claude Code or Codex no longer looks ready and fails on the first request.
- When Claude Code or Codex needs installing or signing in, Skill Studio shows its maker's own command with a button to copy it. You run it in Terminal, and Skill Studio looks again when you come back, or when you press Check again. Skill Studio never installs either tool, never signs you in, and never sees your login.

### Changed

- The loop is three steps: write, run, compare. A skill has three screens in the sidebar, Skill, Cases and Results, where it had ten in four groups. The work of the other seven moved into these three, and an address or a link to one of them opens the screen its work moved to.
- Results is the comparison. It lists the cases a run answered, each with how its score moved, and opens on one case with two outputs side by side: the version before on the left and the latest on the right, or the output written without the skill when there is one version. Compare, Transcripts and Rate blind are no longer screens.
- A score says what it is counted from. Each output shows "Rules 4 of 5" and "Checks 2 of 3" under its score, then **Missed**: every rule it broke and every check it did not meet, a line each. What it met folds away under its count. A missed rule has **Open rule**, which selects that rule on the Skill screen.
- You pick, Jev checks. Under two outputs, "Which is better?" takes A, B or a tie, and that pick is the last word. When Jev scores the other side higher, the bar says so, with the two ways out: mark the verdict that is wrong, or add what Jev missed as a check. The 1 to 5 rating, the Good and Bad marks per layer, the notes and "Ask Jev" are gone, and so are the Agreement screen and the leaderboard.
- A verdict you disagree with is yours to mark: **Mark as met** or **Mark as missed** beside any rule or check Jev read. It moves to the other list with "your answer" beside it, the score follows at once, and **Take back** lets Jev's answer stand again. Before, a rating changed no score.
- Run is a button at the top right, where New run was a screen. It opens a panel that says what the run will do and how many outputs it writes, over Start a run. It is yellow when running is the next step. Every case runs unless you untick it under Options, with the agent and model the last run used.
- A version saves itself. A run keeps the files as the next version when they changed since the last run, named after the date unless you say what changed. The Versions screen and its Save form are gone: versions are listed on the Skill screen under the files, and opening one shows what changed, against the files now or the version before, with Restore and Delete.
- A case starts as a prompt. The prompt leads the form and is all a case needs. The title is optional, and the case's id, its folder name, is made from the title or the prompt. Checks can come after a run.
- A transcript opens beside the output it belongs to, from the switch over the output, in place of a screen with a menu of every output.
- Scoring is folded at the foot of All cases on Results. Most skills never open it. Packs are "Graded as", layers are the parts of a score by name (Rules, Checks), and the settings that only the Agreement screen read are gone.
- The walkthrough takes Thank-you note round the loop in 7 steps, where it took 12: read the skill, read the cases, run, read what the notes missed, tighten a rule, run again, pick the better note.
- The Walkthrough box says where you are. A step that only asks you to look stays in the box while you are on its screen, and the yellow button at the top right leads to the step after it. The box used to move on the moment the screen opened, so the walkthrough began at step 2.
- The welcome tells the loop in three steps.
- The app says Jev, not "the judge". A judge's verdict is final, and here yours is.
- The pair a case opens with compares like with like: when one agent and model wrote on both sides, those two outputs are the pair, though another model wrote the latest version last.
- All cases lists each run with its date, time and cost under its name, and each output of an opened run with what it missed.
- Run says when skill files hold unsaved edits, since a run tests the files as saved.
- The welcome's setup says each thing once. The line between Back and the way forward is gone, and so are the notes that repeated the step's own sentence. What the walkthrough is, its first screen says.
- Claude Code and Codex are the main way to connect a model. Each stands first in Settings and the welcome, and in every model list, and is the default when both it and an API key are set up. The API key is still supported, one click away under "Use an API key", and opens by itself when a key is already set.

### Removed

- The screens Versions, New run, Rate blind, Compare, Transcripts, Agreement and Scoring. What each did is described under Changed.
- Up to four writers in one run. A run has one agent and model; a second run with another model compares them.
- A default case, a run's note, and saving a version by hand in the app. The Assistant can still save a version before a change.
- Anchors made in the app. `st self-test` still grades anchors written by hand in `evals/anchors/`.
- `sure`, `agreeAt` and `defaultCase` in `bench.json`. A file that holds them still reads.
- The operations `skill.queue`, `skill.leaderboard`, `skill.review`, `skill.preference`, `skill.anchor` and `skill.pairwise` of the HTTP API. `skill.pick` and `skill.correct` take the reader's picks and corrections.

### Fixed

- `reviews.json` keeps what an earlier version wrote in it. Ratings, notes and Jev's votes stay in the file when a pick or a correction is written.
- The app opened from the Finder or the Dock now finds Claude Code, Codex and Cursor installed in your home folder or with Homebrew. It used to say they were not installed.
- On a short window the Walkthrough box no longer pushes Cases and Results out of the sidebar. The box scrolls with them and goes out of view first.
- A note over the editor's text sits 32px above the text. It sat 84px above.
- "Saved" beside a file's or a case's name is read whole in a narrow column. It was cut to "Sa…".
- A label too long for its menu ends in an ellipsis. It was cut off mid-word.

## [0.2.0] - 2026-11-08

### Added

- The Assistant can change the open skill. Ask it to rewrite SKILL.md, add a reference file, add or replace a case, or save a version first, and each change stands under its reply: the file's changes, the case, or the version. One click applies it, and Undo in the status line takes it back. Nothing changes until you click, and a reply's changes apply only to the skill it was written about.
- The Assistant marks a check ×2 when it adds or replaces a case: ask for a check to count double and the case it proposes carries the mark. It reads the marks the case has, so it can change one and leave the rest, and its case change shows the mark after the statement, as does a flag for an unmet check on Results.
- The Cases screen says when no judge of the skill reads checks. The writing and workflow packs score an output by their own questions, so a case of theirs showed a Checks section that nothing marked. In its place one line names the packs that mark checks, with a button to Scoring.
- The Assistant reads the open skill as you have it: your unsaved edits, a reference file you have not saved yet, and a case you are still writing. It reads each reference file's text, not just its name, and knows which file or case you have open. A change it proposes shows against your unsaved text.
- Select four or more words in SKILL.md and a bar appears over them: Auto refine, Suggest changes, Help me improve. Auto refine checks the rule against the writing guide, its conditions and its length, and offers a revision only when something drifts; otherwise it says the rule already complies. Suggest changes offers three labelled rewrites, Best practice, More direct and Shorter, each one click to put in place. Help me improve opens the Assistant on a few fixed questions about the rule, drafts it from your answers, and puts the draft in the file with one button.
- With a TypeSafe key, Jev reads a selected rule before any model writes: whether it names a step, carries its why, fixes its boundary, changes what the agent does and belongs to the skill. A rule that holds costs no model call. Jev also checks that each suggested rewrite kept the selection's facts.
- The writing guide beside the editor has a sixth line: test it by running it.
- Commands in the Assistant: type `/` and pick from the list, or keep typing a name and press Tab. `/clear` starts a new conversation, `/settings` and `/guide` open those screens.
- Run a skill from the Assistant: with Claude Code as the model, the same list holds the skills your CLI knows, plugins included. Pick one and add any words it takes. The reply follows the skill as it would in your terminal, and your files still do not change.
- While the Assistant writes a reply, the send button becomes Stop, with yellow hazard bars moving under it.
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

- A check counts once, or double: one ×2 toggle per check in place of a weight from 1 to 5 on every row, with its column heading and its line of help. The intent an author has is "this one matters most", and seven steppers said nothing until one moved. A grader file written by hand may still say up to 5, and the toggle shows that number.
- Scoring's "Layer weights" is "Points per layer", so weight no longer names two things.
- A check row reads statement, ×2, remove. The button that adds the picture a check is about moved into the statement's corner, beside write with AI, since both are about what the check says; it stood past the weight, next to remove. Once added, the picture sits inside the field under the statement, as the Assistant's composer holds its pictures.
- A check's weight is held to 1 to 5 wherever it enters: the Assistant, the API and a grader file written by hand. A file saying 10 scored at 10 while the form could only show 5.
- Rules read as rules in the Editor. Each bullet the judge will check shows its number in place of its bullet, 01, 02, in the order Scoring lists them, hanging in the margin so the text keeps its edge; a bullet the judge skips keeps its dot, and says why when pointed at. The number turns amber when the writing checks find something in the rule, and the words that set a check off are underlined, with the finding as a tooltip. Clicking the number selects the rule, and the popout lists what the checks found over Auto refine, Suggest changes and Help me improve, with nothing to select by hand. The left column no longer repeats every rule in full, and Version sits above Insert, so it is in view however long the skill grows.
- Focus is quieter. Clicking no longer leaves a thick ring around a button, a menu or a choice. Moving with the keyboard shows a thin line just clear of whatever you land on, and inside a row of joined choices. A text field you click into shows a darker edge around it, with no ring.
- Green, amber and red are brighter and more vivid, and equally so: a pass, a warning and a failure now stand out from the page instead of blending into it, in both themes. Each is as light as its contrast allows, and every text pair still clears 4.9:1.
- Changes are easier to read. In Versions and in the Assistant, unchanged lines are dimmed, an added or removed line keeps full text color, and its + or - is green or red. In the dark theme the green and red behind changed lines are stronger. On Compare, the word diff keeps every word in text color: an added word is underlined in green and a removed one struck through in red.
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
- Stepped indicators, the file size meter and the walkthrough's progress, have 2px corners instead of pills, so each step reads as a step.
- Rate blind lists a case's checks without their weight, so a ×2 does not hint at which check matters before you rate.
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
- The window opens even when its saved bounds file is damaged, instead of failing to start.
- The writing checks skip words inside quotes, so a rule that bans "reasonably" is not itself flagged for saying it.

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
