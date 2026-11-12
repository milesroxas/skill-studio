# Changelog

What changed in each release of Skill Studio. The app shows this file under Help, What’s New, and the release workflow publishes each version’s entry as its GitHub release notes.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- On Results, the list on the left is headed **Scores**, so it no longer reads like the Cases screen. It lists the same cases, each with how its score moved, under a line that sets **All cases** apart from them.
- After a run without the skill, **All cases** shows that run's score, marked "Without skill". Before, it showed no score until the skill itself was run.
- A run without the skill is named **Without skill** wherever runs are listed, with no version, since it tested none. Before, it read like "v0 · Claude Sonnet · without skill".
- The lists that pick an output on Results put runs without the skill in a group of their own, **Without the skill**, after the versions, and the runs table on **All cases** lists them last. They are the score to beat, not one more version.
- A run without the skill no longer offers **Changes since this run**, since it used no skill.

### Fixed

- On Results, an output a run is still writing says **Writing…** where it will show, on the stage or in its card, and fades in when it is done. Before, it read "This output wrote no file to show here" and offered **Grade**, which could not grade a run still being written. Grading a run from **More actions** (⋯) waits for it the same way.
- On Results, **A** and **B** over a page or a picture name their version again, such as "A v1 72" and "B v2 88". Before, they showed the score alone, and the version was only on the cards under the stage.
- An output a run has started shows on Results within two seconds of the start. Before, it showed only once the screen was read again.

## [0.9.0] - 2026-11-12

### Changed

- On Results, each output's card says only what tells it from the other side or what went wrong. Its head is one line: the version, which you click to read another output of the case on that side, and the score. Click the score to see what it is counted from and how the output was made: who wrote it, when, which attempt and its length. A line under the version names the agent when A and B were written by different ones, or the attempt when both are one version. **Read the transcript** is under the output, and the file tabs show only when the output wrote two files or more. **Swap A and B** is under **More actions** (⋯), and **Comparing v0 with v1** shows only under Word diff or with one side empty. Before, every card listed who wrote it, when, the attempt and the length, and a bar for each part of its score.
- Before a skill's first run, the yellow **Run** button reads **Run without skill** and opens on **First, test without the skill**: the same cases with no skill, the score your skill has to beat. **Test the skill instead**, under its button, skips it in one press. Once the run without the skill is done, Run suggests testing the skill. Before, the first run always tested the skill, and nothing suggested a run without it.
- On Results, each rule or check under **Missed** and **Met** keeps its actions at the end of its line. **Open rule** shows beside every rule, and **Mark as met**, **Mark as missed** and **Take back** are under **More actions** (⋯) on each row. A row names its kind, "Rule" or "Check", only when the list holds both. **Missed** explains that the rules come from your skill.
- A part of a score that a kind of work adds, such as **Look** or **Process**, says where it comes from: click it to read what it grades, and **Change what is graded** opens **Graded as** on All cases. Each fact it counts says its part under it, such as "Look".
- Workflow's facts on Results read as sentences: "Stayed inside its own folder", "Read the skill before writing", "No step repeated more than allowed".
- Resting the pointer on an underlined word in SKILL.md opens the same popout as clicking the rule's number: what the word set off, over **Auto refine**, **Suggest changes** and **Help me improve**. Before, it showed only what the word set off.
- Number fields, such as **Attempts per case** and a case's word count, have a minus and a plus at their ends. Hold one to keep stepping, or hold Shift to step by ten. A number typed past a limit is set to the limit when you leave the field.

### Added

- A case on Results can delete the run it shows: **More actions** (⋯), last and in red, **Delete this run**, or **Delete A’s run** and **Delete B’s run** when the two outputs come from two runs. It asks first, says the run goes from every case, and **Undo** brings it back. Before, a run could be deleted only from All cases.
- The app carries the license of each open-source package it includes, in `THIRD-PARTY-LICENSES.txt` in its resources folder, and its own MIT license as `LICENSE.txt` beside it.

## [0.8.0] - 2026-11-11

### Changed

- Results shows fewer controls over an output, and each stands with what it changes. The pair is one line, **Comparing v0 with v1**, that opens to the **A** and **B** menus and **Swap**. **Edit case** and **Regrade this run** are under **More actions** (⋯) at the top right, and Regrade names the run, since it grades the whole run. An output with no score still shows **Grade** on its card.
- A page's size is changed where it is read, in the line under the stage, and only a page shows it. **Phone**, **Tablet**, **Desktop** and **Full width** are in that menu, and a page starts at the stage's own width, not at Desktop. A case with a size opens at **Case size** and shows the whole page at it. Under **Side by side** a page has the same menu and is scaled down to fit its card. Before, a card showed only the corner of a page wider than it.
- An output's files are one menu beside **A** and **B**, with **Transcript** in it, so the agent's steps can be read on the stage too. Before, the files were a row of names that ran into the widths.
- **Flip** is **One at a time**. The views show only with two outputs to compare.
- What an output is decides how its case opens: a page or a picture on the stage, two outputs of code as their diff, anything else as cards. A picture written beside a note no longer puts the note's case on the stage.
- **Graded as** lists what to grade beside rules and checks, which are always graded: **Code**, **Workflow** and **Design**, each with a line on what it adds. **Generic** is gone from the list, and a skill can have none of the three ticked.
- A case always shows its **Checks**: every skill is graded on them.
- Under Graded as, **Code** adds only the check command a case names: a case's checks are marked once, as Checks, and no longer a second time as part of Code or Design.
- The Run panel says what it tests in plain words: **Test this skill**, **Test your edits**, **Test v2 again**, and one line on what comes of it. Its button names the run, **Run 3 cases** or **Run 3 cases, 2 attempts each**, in place of **Start a run** over a count of outputs, samples and agent sessions. The line under the button says which agent answers the cases and that Jev grades the results.
- Under Options, **Write with** is now **Skill**, **Copy from** is **Version**, and **Samples per case** is **Attempts per case**. An agent that is not set up says how to set it up under **Agent**.
- What stops a run, or makes it grade less, shows as a warning: no Jev key, files not saved, no agent set up. With no case ticked the button says **Tick a case to run**. Before, each was a grey line of help text.
- Ticking a case or changing the attempts no longer moves the button or the field under the pointer: only the button's words change.
- A case's pictures and files are one list, under **Files**. Each row leads with a thumbnail or an icon and ends in its **×**, and a picture picked with **Add files** stays in the list it was added to. **Add pictures** is gone: **Add files** takes pictures too.
- Files and folders can be dropped anywhere on a case, as pictures already could.
- **Show folder** is **Reveal in Finder** (or your system's name for it), at the end of the Files label.
- The case form says less and assumes less: the notes under the prompt, the files and the checks are shorter and no longer speak of "the agent".
- The rest of the app says less too. Hints that repeated their heading are gone from Settings, New skill and the Library, and notes no longer speak of files "on disk", "code checks" or providers. A file or case changed outside the app now offers **Keep my edits** and **Take the changed file** (or **case**). Without a Jev key, **Regrade** reads **Regrade without Jev**.
- **Versions** on the Skill screen says less: the line that repeated the newest version is gone, and after **Restore** the version the files match reads *in the files now*. Edits since the last run read "The next run keeps your edits as v2", and no longer name the wrong version after a restore. A rule divides Versions from Files again.
- A result made on a second or third attempt reads "attempt 2 of 3", as the Run panel names it. A skill with no name or description says so in those words, and a stored key reads **Stored on this computer**.

### Removed

- **Writing** under Graded as. It held every piece to one way of writing about your own work: an opening inside the work, a decision, a setback, an ending that says what it adds up to, no selling, and no em dash. A release note or a thank-you owes none of that, and lost points for it. A skill that wants any of it says so in a rule. A skill graded as Writing is now graded on its rules and checks, and the `writing` settings in `bench.json` (`lint`, `writingKind`, `writer`, `borrowed` and the rest) and `kind`, `evidence` and `aiBuilt` in a `case.yaml` are no longer read.

### Fixed

- A skill is graded on its own rules and its cases' checks whatever it makes. Before, rules were only marked on text: a skill that made a page, a picture or code had none of its rules graded, and Results showed no Rules part for it. A past run says so under its name on All cases: **Regrade** it to see them.
- Design grading no longer fails a page for what no rule asked of it. It used to check every page for a `lang`, a `<title>`, a viewport, a `<main>` and heading order, so a mockup or a slide lost points on every run, with and without the skill. A skill that wants those says so in a rule or a check, as the Design template does.
- "Nothing in the output looks broken" no longer counts grey blocks or empty space as unfinished, so a wireframe or a mockup is not failed for being one. It asks only about what is broken: text that overlaps or is cut off, a missing picture, a blank page.
- Whether a page has one clear main point is read off the page as drawn. Before, it was read off the HTML when there was any.
- Rules and checks are marked on everything a run made: the file, how a page or picture looks, the other files beside it, and what was said about it. A rule such as "say which size you used" could never pass before, since what a run says about its work was not read. A page with a script, or code with its test, was read as one file.
- A page beside a script is graded as the page for every skill. Before, a skill not graded as Design was graded on whichever file came first by name.
- Workflow grading takes nothing off for an error by itself. A test that fails before the fix is the work going right; what happened after the error is still graded.
- The Skill screen's file list marks a file with unsaved changes with the same dot as every other list, and **Try again** under Assistant in Settings reads **Trying again…** while it checks.

## [0.7.2] - 2026-11-11

### Changed

- A case takes files and folders while you write it: **Add files** and **Add folder** sit under Pictures, in the task, and what you add is copied into the case when you save it. Before, input files could only be added to a saved case, by hand, with **Show folder**. Adding a file or folder again under its name brings the copy up to date, and **×** takes one off. The note on what the agent sees is there from the first keystroke.
- A picture inside a folder of a case's files is an input file like the rest of the folder: the judge no longer gets it as one of the case's pictures.

## [0.7.1] - 2026-11-11

### Changed

- A new case shows the task alone: the prompt, a title and pictures. The rest (a good answer, checks, length and size) folds under one line that names it, and opens and closes from there. It opens by itself when any of them holds something, as on a case started from an example, and saving a case never changes which parts show.
- Results reads in one order: the case, the two outputs, then the output itself. "The prompt and its checks" comes first, and the **A** and **B** menus are the same width and name each output by its version alone. Who wrote an output and when is a line under each name in the menu.
- Over a page or a picture there is one bar where there were two, and it only picks: **A** and **B** carry each output's score, the file and the page width are quieter beside them. Under the stage, the size line ends in **Open full size**, so it no longer looks like a second **Swap**. The stage no longer moves when a picture loads.
- On an output's card, **Regrade** is a button at the end of its details, under the score. The time and cost of an output are in its transcript.
- The letters A and B are drawn the same everywhere, so a filled control only ever means the one that is on.
- On a narrow window the case's name keeps its own row above **Flip**, **Side by side** and **Word diff**.
- **Start from an example** folds under the prompt, and its examples fit the kind of work the skill is graded as. Only a skill graded as generic asks for the kind first. Each example ends in **Use**, as picking one fills the form in place.
- The Cases screen says less. Its notes are one or two sentences each, Title, Pictures and A good answer are marked optional, and Length and Size are one section.
- A check row is lighter: its ×2 is muted text until it is on, and the pen in each check is gone. **Write checks with AI**, under the list, writes them.
- An empty check row no longer repeats the first example: each example shows once.
- Save case and Add case are filled only when pressing them saves something.
- A case with unsaved changes is marked in the list with the same amber dot as the sidebar, which a screen reader reads as "unsaved changes".
- While a picture is dragged over a case, the whole case is tinted, and the note under Pictures no longer changes and moves the form.
- The remove button on a picture is 44 px to hit under a finger.

### Fixed

- The Cases screen no longer draws two rules in a row under the examples or under a note at its top.

## [0.7.0] - 2026-11-11

### Added

- **Delete run**, under an open run on Results, All cases. It deletes the run's outputs and your corrections on them, and every score stops counting it. The version it was made with stays: when the run was its only copy, the version is saved from the run first. The dialog says what goes, and **Undo** on the status line brings the run back.
- **Input files** on a saved case, with **Show folder**: it opens the case's `files` folder, where you copy in whatever the prompt is about, such as a screen's code. A run starts in an empty folder and never sees your project, and the case now says so. A folder copied in reaches the agent as you laid it out; before, only the files right in `files` did.
- The Assistant knows what a run can see and which input files each case has, so it no longer writes a prompt or a check that counts on your project.

### Changed

- The welcome asks less before you start. Its main button, **Try it on a sample skill**, opens the walkthrough at once; **See how it works** shows the three-step tour first, for anyone who wants to see before doing. Setup is one step, the Jev key, and only when the key is missing. Where your skills live is added in the Library, and a model for Write with AI in Settings, when you first need them.
- The walkthrough is four steps instead of seven: run the skill, read what the notes missed, tighten one rule, run it again and compare. It opens on the Skill screen with the rules in view, so reading the skill and its cases are no longer steps of their own.
- While the walkthrough runs, its box in the sidebar is the only guide on screen: the Skill screen's "This is Thank-you note" note and each screen's first-visit line are gone from the sample skill. The first-visit lines still show on a skill of your own.
- The walkthrough no longer offers the exact rule before you have read what the notes missed, and without a Jev key it no longer promises a score it cannot give.
- A run's line in the status strip reads "Run 3 cases with Claude Code", not "Generate 3 case(s): claude".
- The tour's last step is **Fix, then compare**, in the order you do them.
- On a narrow window the top bar keeps the screen's name: the "No Jev key" badge gives way first, then "Next:" before the step's name. The Assistant button no longer shrinks.
- The top bar's right end reads as three groups: the "No Jev key" warning, then the next step and Run, then Help and the Assistant. The warning is now a quiet amber dot and label at the height of the buttons beside it, not a smaller filled badge.
- On a narrow window the Skill screen opens on the document: its files, versions and inserts follow it. The file's name keeps its own row above Save, and the formatting tools scroll with the text.
- In SKILL.md, resting the pointer on a word the writing checks underlined opens a note under it that says what the check found, the same lines the popout lists. Before, the reason was a system tooltip that took a second or more to show, when it showed at all. The word is tinted while its note is open.

### Security

- The app quits when started with `--use-mock-keychain`, as it does with a remote debugging switch. Started that way, it would have stored a key you typed under a fixed key anyone can read, not the keychain's.

## [0.6.1] - 2026-11-11

### Changed

- Results no longer asks which of two outputs is better. A pick changed no score, and the scores on screen could sway it. What you say now always moves a score: mark the verdict Jev got wrong, or turn what it missed into a check or a rule. Picks already in `evals/reviews.json` stay in the file, and deleting a version still takes the ones on its runs.
- After a run, the yellow step at the top right is **Read the results** until you open Results, in place of one "Compare" step per case. The Results count in the sidebar, of cases waiting for a pick, is gone. A skill that already has runs asks once, the first time you open it.
- Scoring, at the foot of All cases, is now **Graded as**: tick the kinds of work the skill does, then Save. Points per part, the threshold and each kind's own settings are set in `evals/bench.json`, and Graded as names any the file sets. Saving changes `packs` alone and writes every other key back as the file holds it; before, Save wrote out every setting. Scoring changed on Results and not saved is no longer kept as a draft.
- The walkthrough's last step is **Compare the two notes**: open Results and read v0 beside v1. A walkthrough finished with a pick shows this step once more.

## [0.6.0] - 2026-11-10

### Added

- Results shows a page or a picture as a browser draws it. A case whose output is a page, a component or a picture opens on **Flip**: the output on a stage above the scores, with **A** and **B** (or the A and B keys) putting either one in the same place, so a flip shows exactly what changed. Pick the width a page is drawn at, Phone, Tablet, Desktop or Fit, and the line beside it says how far it is scaled to fit. Two pages scroll together. **Side by side** and **Word diff** are still there.
- In the desktop app, the design pack looks at a page as drawn: in a desktop window, or at the case's own size. A case can also ask for a phone ("Check that a page works on a phone too"), and then Jev says whether the page fits one: "The page fits a phone screen". The pictures are kept in each sample's `renders/` folder. `st grade` draws nothing and judges as before.
- A case can name a size in pixels, under Size on Cases. A picture of any other size is listed under Missed, as a word count outside the range is, and the output's card shows its size beside the one asked. A page opens on Results at the case's width.
- A run asks the agent to write `outputs/preview.html` beside an interface that does not open in a browser by itself, such as a React component, so Results can show it working.

### Changed

- An update ready to install now says so on the status line until you restart or dismiss it, and again each time the app's window opens while it waits. Before, the notice left after a few seconds.
- When the app's own check for updates fails, it tries again after 10 minutes instead of at the next check, hours later.
- A page an agent wrote runs its own scripts when shown, so a page built by a script no longer shows blank. It still runs sandboxed, in an origin of its own and with no network. See `SECURITY.md`.
- A sample's files are served by path, `artifact://sample/<skill>/<run>/<sample>/<file>` in the app and `/api/artifact/<key>/<skill>/<run>/<sample>/<file>` on `st serve`, so a page loads the styles, scripts and pictures beside it. On `st serve` the key in the path stands in for the cookie, which a sandboxed page does not send.
- Asking for a sample's file no longer opens the skill it names: only a skill open already is served.
- Which file stands for an output: one of the kind its case names; else a page, a picture or code that one of the skill's packs judges, in that order; else Markdown. Among files of one kind, `index.html` or `preview.html` comes first and a `README` or a `.txt` file last. So a design skill's page is judged even beside a README, a page beside its script is judged as the page, and the order a skill lists its packs in no longer matters. Results opens the same file before an output is graded. Regrade a run to judge it this way.
- **Copy from**, for a run of an earlier version, starts on the newest run's copy instead of the oldest.

### Fixed

- A page an agent wrote could open any skill on disk by loading a picture from it, and add it to the library's recent list. Only a skill open already serves its pictures now.
- Drawing a page for grading has a time limit as a whole, and stops at once if the page crashes, so a page that hangs after it loads no longer holds up grading.
- A size written into a case file by hand is checked when the case is read, as one typed on Cases is, and dropped when it is not a width and a height from 1 to 10,000 pixels.
- A check's time limit in `bench.json` (`lint.timeoutSeconds`, `codeCheck.timeoutSeconds`) is held to six hours. A limit past about 24 days ended the check at once.
- A picture is no longer read whole to learn its size, and one larger than Jev takes is refused before it is read.

## [0.5.4] - 2026-11-10

### Added

- **Mark done** on a skill in In progress moves it down to Other skills, with Undo on the status line. Saving SKILL.md, adding or changing a case, or a new run brings it back, even when the change is made outside the app. Opening it does not.
- On a narrow window, a Library row's actions fold into a **…** menu instead of disappearing.
- The Skill screen says when a tool installed the skill from a lock file, and that updating it from there replaces the folder and your edits.

### Removed

- The Mine and Not mine buttons and the Yours, Installed and All switch in the Library. A skill is listed once: in In progress while you work on it, otherwise under Other skills. A skill a tool installed still shows its source under its place.

## [0.5.3] - 2026-11-10

### Changed

- The app runs on Electron 45.3.0.

## [0.5.2] - 2026-11-10

### Changed

- The guide to writing a rule, beside the editor and in the guide, is reworded with new examples: name the action, give the reason in the same bullet, make it checkable, cut what the agent would do anyway, one skill per job, prove it with a case. The checks and scores are unchanged.
- The README and the guide credit Emil Kowalski's course [AI for Designers and Engineers](https://aiforui.dev), which Skill Studio's approach to rules comes from.

### Fixed

- The design check reads a page's title with every tag removed, including a tag hidden inside another one.

## [0.5.1] - 2026-11-10

### Changed

- Download file names no longer carry the version, such as `skill-studio-mac-arm64.dmg`, so a link to the latest download stays the same from one release to the next. Updates work as before. On Linux, the first update from 0.5.0 writes `skill-studio-linux-x86_64.AppImage` beside the old file, which you can then delete.

## [0.5.0] - 2026-11-10

### Security

- `st serve` needs a token. It prints an address that carries one, made new at every start; opening it signs the browser in with a cookie, and any other request is refused. Another account on the same machine can no longer drive the server, and with `--tailscale` the tailnet needs the token too, so faked Tailscale headers get nowhere. `--open` hands the browser a one-use address that works for a minute, never the token itself. A request body over 32 MB is refused.
- A link inside a skill, such as a `references` folder that points elsewhere, is never read, written or deleted through, so opening someone else's skill and pressing Restore cannot write outside it. The same holds for links an agent leaves in its outputs.
- A run name, a version label or a case file read from a skill's own files can no longer point outside the skill. Saving a case refuses a `files/`, `graders/` or `references/` folder that is a link leading out of the skill. File names with `< > : " | ? *`, and Windows device names such as `con` or `nul.md`, are refused, so a skill opens on every system.
- A packaged app ignores `ELECTRON_RENDERER_URL` and quits when started with a remote debugging switch, so no other program can load its own page into the app with its keys.
- A Cursor agent, and the read of Cursor's model list, ran with the app's keys in their environment: `TYPESAFE_API_KEY` and the stored Anthropic and OpenAI keys. Both run with the environment a Claude Code agent gets, with the keys left out.
- On Windows, arguments to a `.cmd` CLI are escaped so a case's text or a model name cannot run a command, and a multi-line Cursor prompt is refused rather than cut. Not yet run on Windows.

### Fixed

- A sample was graded against the wrong case when one case's name starts another's, such as `email` and `email-reply`.
- Every sample of a run used the skill as it was when that sample started, so editing during a run mixed two texts under one version. A run now copies the skill and the cases' input files once, at the start.
- A skill's version counts its scripts and other files, not only `SKILL.md` and `references/`, so a changed script makes a new version.
- Restore corrupted pictures and other non-text files under `references/`, and could stop half way. It now restores every file byte for byte, or none; if a file cannot be put back, the error says where it is kept.
- Deleting a version that stopped part way could lose runs. What could not be put back stays in the trash, the error says what to move where, and later deletes leave it alone.
- A grading that was stopped or failed threw away the last report and Jev's answers. Both are kept, and going back to an earlier setting asks Jev nothing new.
- A run cut off by quitting could never be graded. It can, and a sample stopped before it wrote anything is left out of the scores instead of counting as a failure.
- An output with nothing in it, no file or only whitespace, was left out of the averages, so a version that often failed looked no worse. It scores 0 and is flagged. A file of punctuation only, such as `{}`, is judged as an output.
- Changing a case's picture under the same name kept the old verdicts. It is judged again; a setting that belongs to another judge pack no longer re-asks Jev.
- A check or lint command that hung kept the grading running for good, and Stop could not end it. It is ended with everything it started, at its timeout, on Stop and on quit. A check that leaves a background server running finishes with its own exit code instead of timing out, and stopping a grading no longer leaves a "check failed" answer for the next Regrade to reuse.
- Quitting could leave an agent started in the last moment running. Nothing new starts once quitting begins.
- Ctrl-C, or closing the terminal, on `st run`, `st grade` or `st serve` left the agents running. They are ended before the command exits, and the tailnet address goes with them. `st serve` keeps running when one request hits an unexpected error.
- A second copy of the app, such as a dev build, ended the first copy's agents when it started.
- A full disk or a deleted sample folder during a run took the backend down with every job. The job log says the transcript could not be written.
- Saving a file put the old text back in the editor for a moment, and what was typed then could be lost. What you type while it saves is kept.
- Opening another skill while the first was still loading could show, or save, the first skill's scoring in the second.
- Unsaved scoring was lost on a reload or a quit, and Back and Forward discarded it without asking. It is kept with the skill's drafts, as unsaved text is, until you save or discard it, so opening another skill no longer asks first.
- One unreadable case, or an odd file an agent left behind, stopped the skill from opening.
- Files and outputs with spaces or accents in their names could not be opened, saved or restored.
- Saving a case that changed on disk since its draft began deleted its checks or wrote over the outside edit. Cases says it changed on disk, as the Skill screen does for files, and you choose which to keep, after a restart too.
- Grading the same run twice at once was possible from the run's own grading step; it is refused, and Regrade shows busy while any job grades the run.
- A running job could drop out of the job list behind newer ones, where it could not be stopped, and deleting a version did not wait for it.
- Pressing send twice in the side panel started two paid replies.
- An unsent message in the side panel was lost when the panel closed.
- A picture added to a case landed in whichever case was open when it finished loading.
- Word diff froze the window on long outputs. It compares texts of about 3,000 words a side word by word; past that it compares them line by line, and the card says so.
- An output's text blanked and reloaded each time you marked a verdict, made a pick or a run moved on.
- Undo for a correction or a deleted version ran against another skill if one had been opened since.
- The assistant's case without an id could replace an unrelated case with the same title. It is added beside it.
- The version lift's "without the skill" line could be read over different cases than the two runs beside it. It is read over the same cases, and says so when it cannot be.
- A case marked `judge: false` was still sent to Jev, and billed, by the code, design and workflow packs.
- The word count missed a paragraph placed directly under its heading, and counted code in tilde fences as prose; the shape checks read code blocks as prose too.
- The scope check dropped to 0 for a search pattern such as `"/api/users"`, and missed `../` and `~/` paths. A relative path is read from the folder the agent's shell moved to, so `cd outputs && cat ../input.md` stays inside, and a climb out of the sample counts even when it lands in `/tmp`.
- A hand-written `bench.json` with a wrong value could push a score above 100 or break scoring. A value of the wrong kind falls back to its default, points and settings below 0 are held at 0, a threshold or share to 0 to 1, and no layer scores past 100. Points and a threshold saved past Scoring's sliders score as saved.
- `* * *` was reported as a short rule, tab-indented nested bullets were dropped, and a line starting with inline code hid every rule after it.
- The selection tools flagged "Clear the cache…" as an outcome word.
- The assistant's changes were not found in replies with Windows line endings.
- Pictures too thin for Jev's limits were stretched.
- Characters with accents or emoji could be garbled in transcripts.
- A TypeSafe key missing at grading told the app to edit `.env`. The app says to add it in Settings, and `st` says `.env` or `--no-jev`.
- An unknown address opened an endless spinner, or Results under the wrong heading. It opens the home screen.
- The New skill form stayed on "Creating…" when opening the new skill was cancelled.
- In a browser: a reply in progress stopped updating after a page reload, a failed read of the drafts let the next keystroke erase them, and the last keystrokes were lost when the tab closed, or refused for text outside ASCII.
- A run cut off earlier can be graded while another run of the same skill is being written.
- Grading judges a run's pictures as the agent got them, and a picture path that is a folder or a pipe no longer breaks it.
- Regrading a run whose outputs were all stopped keeps the last report.
- Results shows outputs as a run writes them even when reading the skill is slow, and text typed while a new case saves is kept.
- Saving and then switching skill before the save finished left a stale draft: a false "changed on disk" alert, or a duplicate new case.
- "Created …" vanished from the status line as soon as the new skill opened.
- In the Library, a folder that could not be added lost its path from the field.
- A deleted reference file, made again, came back with its old undo history.
- A version's changes flashed Loading whenever the files changed.
- The assistant's proposed case says when a saved case has the same title, and its Save a version is no longer blocked by drafts that match the files on disk.
- Back or Forward to a place in another skill showed it with the open skill's data until that skill opened.
- Picking another rule while Help me improve was still reading the last one was refused. It switches to the new rule.
- The design pack's markup check failed a page for an attribute such as `online` or `only`, which runs no script. Only an event handler attribute fails it.
- In the writing pack, a missing answer to an optional question took the whole pack down; it is left out.
- A case with the id `constructor` broke the version lift and the side panel's reading of the skill.
- A Claude Code reply that reports no usage no longer fails.
- On Windows with the npm install of Claude Code, `/name` commands say they need the native install instead of failing with a line-break error. Not yet run on Windows.

### Changed

- Assistant requests start faster: the CLI's sign-in is checked at most every 30 seconds, and **Check again** in Settings always asks.
- The slash menu picks up a skill added inside an existing plugin.
- A model name with spaces or quotes is refused before a run starts; Bedrock and Vertex ids and aliases such as `opusplan` pass. Agents or cases left out of a run are named in its log.
- Loading a skill no longer waits on Cursor when it lists no models: the list is read in the background.
- An agent's copy of a skill, and its version, leave out `node_modules`, `venv` and `__pycache__` folders at any depth, hidden files, and links that leave the skill, so runs of skills with large dependency folders start faster and the app stays responsive while they run.
- The first Regrade of a run graded before this release asks Jev again, once, since the judges' questions and readings changed. Later regrades reuse the answers.
- For a skill with scripts or assets whose latest version came from 0.4.0, a script-only edit becomes a new version once that version has run once in this release.
- `evals.json` cases whose names are not lowercase letters, digits and dashes are named in a warning instead of disappearing, and the Library no longer counts a case twice.
- Samples per case are a whole number from 1 to 10, in the app and in `st run`; `st` refuses a bad `--samples`, `--parallel`, `--run` or `--baseline` with a line naming the flag.
- The Library no longer scans `~/SITES` until you add it.
- Long job logs keep their first and latest lines.
- F6 moves the keyboard into the editor's selection popout, and Escape returns to the text.
- Removing a stored key asks first and shows "Removing…" on its own button, and **Check again** reports its own result. Scoring's number fields stay inside each slider's range, and the sliders are named for screen readers.
- Failed reads of an output, a transcript, a diff, usage or a version's files offer **Try again**.
- The skill is read again when the window regains focus, so an edit made outside the app shows at once.
- A failure or a warning on the status line stays until you dismiss it or the next message replaces it, instead of leaving after a few seconds. Other messages wait while the pointer or the keyboard is on the line.
- Delete and reset buttons in the dark theme are pale red with dark text, readable at rest and on hover.
- An agent's HTML output shows on a white page in every theme, so a page that assumes white reads as written.
- The selection in Help me improve, Auto refine's revision and the assist panel's reply sit on one muted panel, and long words wrap instead of running out of it.

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
