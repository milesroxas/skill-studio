# Command line and web server

The `st` command runs from a checkout and uses the same files as the app:

```
pnpm st <command> [skill-dir] [options]
```

- A skill directory is any folder with a `SKILL.md`.
- `pnpm` runs the command from the checkout's root, so relative paths are read from there.
- With no skill directory named, the command looks for a `SKILL.md` in the checkout's root. Without one it stops with `No SKILL.md here. Pass the skill directory.`
- To try a command without writing a skill, use `fixtures/demo-skill`.

## Commands

| Command | Does |
| --- | --- |
| `new <dir>` | Scaffold a skill. `--name <id>` is the skill name (default the folder name; it must be a slug). `--description <text>` is its front matter description. `--template` is `blank` (the default), `writing`, `code`, `workflow` or `design`. `--with-cases` adds the template's sample cases |
| `cases` | List the skill's cases, each by its whole id as `--cases` and `--case` take it, with its checks, its files and its title |
| `case add` | Write a new case from flags, checked as the Cases screen checks one ([below](#adding-and-checking-cases)) |
| `case check` | List each case and check file that will not load or is skipped, each title with a line break in it, and each title two cases share. It exits 1 when it lists any ([below](#adding-and-checking-cases)) |
| `run` | Generate outputs with a headless agent, then grade them |
| `grade` | Grade a run again: `--run <name>` or `--all` |
| `report` | Print a run's report: `--run <name>`. Each sample and case is printed whole, as `--case` takes it. The scores are counted from the stored answers under `bench.json` as it is now, with your corrections from the app, as the app shows them. A sample folder since removed is left out. Under the table, each output's checks met and rules followed, counted apart: an output of a run without the skill has no rules count. `--brief` prints only each case and what it missed ([below](#short-output)) |
| `compare <runA> <runB>` | Score differences between two graded runs, both under `bench.json` as it is now, each case and sample printed whole. A sample is read against the one of its name in the other run (`email-s2` against `email-s2`), only where the app would set the two against each other: answers to the same case as it was asked, both graded with Jev or both without, with your corrections only on facts you answered in both. A change counts only the rules and checks marked in both: one Jev was not sure of, did not read, or set aside, in either run is left out of both, and the table says how many under it. Each sample left out is listed there too, with why. Then it reads the two runs as cases, on checks alone ([below](#reading-two-runs-as-cases)). `--brief` prints only each case, the run that did better on it and what each run missed ([below](#short-output)) |
| `sheet` | Put each case's drawn pages from the runs named side by side in one PNG a case, a row a run and a column an attempt, and print each PNG's path ([below](#contact-sheets)) |
| `read` | Have the assistant read a graded run: `--run <name>`. It answers the rules and checks Jev was not sure of or did not read, each with where it saw it, and prints how often its answers agree with yours. It writes nothing to the skill ([below](#reading-a-run)) |
| `sort` | Have the assistant read each rule and each check once and say how it will be marked: answered by code, asked of Jev, or not markable as written, with a fix. It keeps what it read in `evals/rule-readings.json` ([below](#sorting-rules-and-checks)) |
| `propose` | Have the assistant read each case's latest answers and propose checks a good answer meets. It changes no case until you accept a proposal. It keeps them in `evals/proposals.json` ([below](#proposing-checks)) |
| `versions` | List the skill versions seen in runs, and the working tree's |
| `self-test` | Grade `evals/anchors` and check that bad anchors lose to good ones ([anchors](grading.md#anchors)) |
| `serve [skill...]` | Start the app as a web server, below |
| `open` | Print an address that opens Results in a browser on one case and two runs' outputs, good for one load within a minute ([below](#opening-results-from-the-command-line)) |

```
pnpm st new skills/release-notes --template writing --with-cases
pnpm st run skills/release-notes --engine claude --model sonnet --samples 2 --name "what changed"
pnpm st report skills/release-notes --run <run-name>
```

To add a check for every case, write it as a file in the skill's `evals/graders/`, the way a case's checks are written ([files.md](files.md#checks-for-every-case)): every output of every case is graded on it from the next grading, a run without the skill's among them, and `sort` reads it for each case.

`run` takes:

- `--engine`: `claude` (the default) or `cursor`.
- `--model` and `--effort`: default per engine.
- `--cases a,b`: default every case.
- `--samples n`: a whole number from 1 (the default) to 10.
- `--configuration`: `with_skill` (the default), `without_skill`, or `old_skill` with `--baseline <version>` (such as `v1`) or `--baseline <run>` ([versions](files.md#versions)).
- `--from <dir>`: run the skill files in that folder in place of the skill's own, under the skill's cases and `bench.json`. The folder holds a `SKILL.md` and is outside the skill's folder; one inside it, or one that holds it, is refused. Its files are held against the skill's versions as the skill's own are: the same files as a kept version are that version, and new ones take the next number and need `--name`. The skill's own files are not touched, so two drafts can run at once, each its own version. With `with_skill` only ([versions](files.md#versions)).
- `--name` and `--note`: name the skill version and note on it, when the files changed. A name another version already has is refused, whatever its case, spacing, invisible characters or look-alike letters, before anything is written: changed files are a new version and need a name of their own. The same files as a kept version are that version, and keep its name. A run with `--configuration without_skill` tests no version and needs neither.
- `--parallel n`: samples in flight (3).
- `--no-grade`: skip grading.
- `--brief`: print only each case and what it missed in place of the report ([below](#short-output)).
- `--quiet`: print one line as each attempt ends, such as `Launch page, attempt 1: done in 20 s` or `Launch page, attempt 2: failed, it ran out of time (after 600 s)`, in place of the agents' and the grading's progress. A failed attempt has no other line. What went wrong is still said, once each: outputs that did not run to their end, a case's file that is missing, files left in an agent's work folder, a transcript that could not be written, an older version kept with `SKILL.md` and `references/` only, a run that has not finished, a cases file that does not read whole, a pack that failed on an output, a page or picture that could not be drawn or measured, a file or a check's picture Jev is not shown, an output Jev read only the first parts of, and that there was no output to grade.

`run` ends with the command that opens Results on the run it made, `Open: pnpm st open <skill> --a <run>`, and `compare` with the one that opens it on its two runs, `--a <runA> --b <runB>`. With `--json` neither prints it. A path a shell would split is quoted as that shell reads it: in single quotes on macOS and Linux, in double quotes on Windows.

### How a run is named

Wherever `st` names a run to you, it gives the run's folder, which `--run` takes, then the version it ran with the name that version was given, as `versions` lists it:

```
Run: 2026-11-26-skill-v1-claude-haiku (v1 · draft a)
```

- A run without the skill tested no version, whatever number its folder holds: `(without the skill)`. A run on a version's kept copy (`--configuration old_skill`) ends `· old skill`. A version with no name is its number alone, and a run that recorded no version is its folder alone.
- The name is printed on one line and whole. The folder always comes first, so two runs of one version, or two versions given the same name, are told apart.
- `run` says it after the agents are done: `Run: <path> (v1 · draft a)`, with the run's whole path. `report` starts with `Run: <run> (...)`, and so do `report --brief` and `run --brief`; `compare` and `compare --brief` start with `A: <runA> (...)` and `B: <runB> (...)`. `grade` names each run so above its report. Each row of a [sheet](#contact-sheets) is headed so, and so is its line for the pages it leaves out.
- With `--json` none of those lines is printed. `report`, `run` and `grade` carry `run`, and `compare` carries `a` and `b`, each `{ "name", "version", "versionName", "configuration" }`: the folder, `v1`, the name as it was given, and the configuration, with `version` and `versionName` null where there is none. `grade` still prints each run's folder alone above its JSON, and `run --no-grade --json` prints `run` and `cost` alone.

### Short output

`--brief` on `report`, `compare` and `run` prints what an agent in a chat needs in place of the report: each case, by its id and its name and in the order `cases` lists them, with what became of an attempt not read whole, then the words of each rule or check an output of it missed, one line each.

```
Run: 2026-11-20-skill-v1-claude-haiku (v1 · Second draft)
[email-free] Launch email, no price: nothing missed
[email-quote] Launch email, a quote that gives orders
  missed: Quote the customer in the brief's Quote word for word, with their name. A paraphrase puts words in their mouth.
```

- Every case the run took is printed, and every case it has a grading of.
- A case's line starts with its id in brackets, the one `--cases` takes, then its name: its title, or the start of its prompt when it has none, or as the run kept it when the case is since deleted. Where the name is the id, the id stands alone: `[short-note]: nothing missed`. An id holds no bracket or space, so `^\[([^\]]+)\]` finds it whatever the name holds. Each case is one head line: a line break or a run of white space in its title, or in what became of an attempt, reads as one space there. Every other line is indented: a missed line two spaces in, and a rule or check of several paragraphs keeps its line breaks, each later line four spaces in, so only a case's head line starts with `[`, and only a missed line starts two spaces in.
- A rule or check counts as missed where an output of the case missed it on any attempt, scored as `report` scores it: under `bench.json` as it is now, with your corrections. One Jev was not sure of, did not read, or set aside is not missed. A run without the skill misses no rule, since its agent never saw the rules.
- Where the case had more than one attempt, the missed line says how many missed it, out of the attempts it was marked on: `missed in 1 of 3:`. An attempt counts in neither number where the rule or check was not marked on it: Jev was not sure of it, did not read it or set it aside, or the attempt failed, was stopped, wrote nothing, was not graded or its folder was removed. The case's line already says what became of such an attempt. With one attempt the line says only `missed:`.
- A case says `nothing missed` only where every attempt was read whole. Otherwise its line says what became of each attempt that was not, from what the run and its grading recorded: `wrote nothing`, `could not be read` (a kind of file Jev cannot read), `not scored, <why>` (a pack failed on it, it is owed a grading, or nothing in it could be counted), `failed, it <why>`, `stopped before it finished`, `not graded` or `its folder was removed`, and `no attempt ran` for a case with none. With more than one attempt it names them: `attempt 2 wrote nothing`, `every attempt failed, it ran out of time`. Then how many rules and checks Jev did not read, as in a long output read in part: `3 rules and checks not read`.
- `report` and `run` read one run, so they name no run that did better.
- `compare --brief` calls the first run A and the second B, as its first two lines say. Each case's line says which did better on its checks, read as [below](#reading-two-runs-as-cases): `B did better`, `A did better`, `neither did better` or `no checks to compare`, or why the two were not read against each other: `only A answered it`, `only B answered it`, or not compared because Jev graded it in only one, or its agent was asked it another way. What became of attempts not read whole follows, `in A, ...` or `in B, ...`. Each missed line says which run missed it: `A missed:`, `B missed:` or `A and B missed:`, each with how often where that run had more than one attempt: `A missed in 1 of 3, B missed:`.
- `report --brief` and `run --brief` start with the run they read, `Run: <run> (v1 · draft a)`, and `compare --brief` with `A:` and `B:` lines ([how a run is named](#how-a-run-is-named)). `compare` and `run` still end with the `Open:` line. With `--no-grade`, `run --brief` names each case as `not graded`.
- `--brief` and `--json` together are refused.

### Opening Results from the command line

```
pnpm build
pnpm st open skills/release-notes --a <runA> --b <runB>   # http://127.0.0.1:<port>/?ticket=...&skill=...#/results?case=...
pnpm st open --stop
```

- `--a` and `--b` name the runs shown as A and B, each by the attempt at the case Results opens it on: the first with an output to show, else the first. `--case <id>` names the case; without it, the case is the first one, in the order Results lists them, that every run named answered.
- The address carries a one-use ticket, never the token: the first load within a minute trades it for the cookie, and a second load, or one after a minute, is refused. Run `st open` again for a new address. It is safe to paste in a chat. Its host is `127.0.0.1`, never `localhost`: a browser sends a cookie to every port of the host name it was set for, and dev servers are opened as `localhost`, so they are never sent this one ([SECURITY.md](../SECURITY.md#the-web-server)).
- With no server of this checkout running, it starts one in the background, on a port the system picks, and waits up to 30 seconds for it. Later calls use that server. Each checkout, a worktree among them, has a server of its own, and neither stops the other's.
- That server stops itself once 60 minutes have gone with no request it let in (one it refused for want of the token counts for nothing), but never while a run, a grading or a reading is going: it waits for the last one to end. It also stops when its file is gone or names another server, as when `st open` found it not answering and started another; that too waits for every job to end. It asks itself once a minute. `st open --stop` stops this checkout's now.
- Where the app is not built, it says `Run pnpm build first.` and exits 2.
- The server's port, pid and token are in `open-<hash>.json` in the app's own folder ([files.md](files.md#the-apps-own-files)), readable by you alone.
- What that server writes to stderr, a fault after it started among it, goes to `open-<hash>.log` beside its file, readable by you alone. Each start begins the log again; `--stop` and the server's own stop leave it, so it still says why a server died. Past 1 MB its oldest half goes, after a line that says so. Its stdout, where `st serve` prints the address with the token, goes nowhere. When the server stops as it starts, or has not started within 30 seconds, `st open` names the log.

### Adding and checking cases

`case add` writes a new case under `evals/cases/`, through the same check as a case saved on the Cases screen, so it refuses what the screen refuses: an empty prompt, a title another case has, a size out of range.

- `--prompt <text>` or `--prompt-file <file>` is the request the agent gets. Pass one of the two, not both.
- `--title <text>` is its title, saved on one line: a line break, a tab or a run of spaces in it is one space, as it is on the Cases screen and wherever a title is shown or compared (`oneLineTitle` in `src/domain/case-draft.ts`). Without one the case is named after the start of its prompt. The case's folder is named after its title, or after its prompt when it has none, with a number after it when that folder is taken.
- `--check <text>` adds a check a good answer meets, with weight 1. Give it once for each check.
- `--file <path>` copies a file or a folder into the case's `files/`, under its own name, for the agent to get with the request. Give it once for each. Two with the same name are refused.
- `--artifact html` or `--artifact image` is the file to grade: a page or a picture ([`bench.artifact`](files.md#the-bench-block-of-caseyaml)).
- `--size WxH`, such as `1280x800`, is the size in pixels a picture must be, or a page is drawn at for grading.

```
pnpm st case add skills/release-notes --title "Launch note" --prompt "Write the launch note." --check "It names the day." --check "It is under 100 words."
```

`case check` reads every case and check file of the skill as a run reads them, and lists:

- each check file that does not start with front matter, which is skipped;
- each check whose `weight` is outside 1 to 5 or is not a whole number, with the weight it is read as;
- each case folder that is skipped: one under `evals/cases/` with no `prompt.md`, one whose name cannot be a case's id, and one right under `evals/` whose id a folder under `evals/cases/` has;
- each `evals.json` entry that is left out, or is skipped because a case folder has its id, and an `evals.json` that is not JSON, which the app stops on;
- each `case.yaml` that cannot be read, and each `bench` value of the wrong kind, which is left out;
- each title written with a line break in it, which the app shows on one line, and each title two cases share, read on one line and whatever their capitals.

It changes nothing. It exits 0 when it lists nothing and 1 when it lists anything; `--json` prints the counts and the list.

### Reading two runs as cases

After its table, `compare` reads the two runs case by case, on checks alone: a case's own and the checks for every case, never rules. Rules come from the skill's text, and a rule edited between two versions is a new one the other run was never marked on.

```
Read as cases, on checks alone: better on 1, the same on 5, worse on 0.
  email-price                 better      checks met 8 of 9, then 9 of 9; one attempt each, so a small move may be chance
```

- A case is read over every attempt at it in each run, and only over the checks both runs were marked on. A check Jev was not sure of, did not read, or set aside in either run, on any attempt, is left out of both, and the line says how many were.
- Your corrections count only on checks you answered in both runs, as in the table above.
- With more than one attempt in either run, a case is the same where one run's mean lies between the lowest and the highest attempt of the other. With one attempt in each, it is better or worse by the difference alone, and the line says a small move may be chance.
- A case with no check marked in both runs has no checks to compare, and is counted apart from the same.
- A case only one run answered, or one asked another way in the two, is listed under the lines with why.

### Reading a run

`read` measures how well the assistant marks what Jev left. It is the first part of the assistant's work on Results, and nothing in the app reads its answers yet.

- It needs Claude Code installed and signed in, and it counts toward that account's usage. It asks once for each case, `--parallel` at once (2).
- `--model` is the model to ask (`sonnet`), and `--effort` its effort. `--cases a,b` reads only those cases.
- Each case's request, skill and outputs are sent in one message, with no tools ([architecture.md](architecture.md#reading-a-run)). On `launch-note`, read blind against the answer key, all six cases took 33 seconds and about 62,000 input tokens, and agreed with the key on 61 of 62 answers. `--deep` starts a session that reads them in a folder instead, with only the tools that read and nothing outside that folder, and sees a page as a browser drew it; it costs several times as much.
- Without `--blind` it is asked only the rules and checks Jev was not sure of or did not read (a long output's parts that do not settle a fact), and is shown what Jev was sure of. A case Jev was sure of asks nothing.
- With `--blind` it is asked every rule and check and shown none of Jev's answers, so the two can be set against each other. Your own answers are never shown to it.
- An answer names a file and quotes it. A quote that is not in that file sets the answer to "cannot tell".
- It prints each answer beside Jev's and yours, then the counts: how many it answered, how many of the rules and checks Jev was not sure of or did not read it settled, how often it agrees with your answers from the app, and with `--blind` how often it agrees with Jev where Jev was sure.
- `--out <file>` also writes the reading as JSON, and `--json` prints it.
- `--recount <file>` takes a reading saved with `--out` and counts it again against your answers as they are now, asking nothing: mark rows in the app, then recount. It needs no `--run`.
- `--answers <file>` counts its answers against the ones in that file in place of yours: JSON by output, then by rule or check, true where the output meets it. `fixtures/launch-note` is a skill whose every rule code can answer, and `scripts/reading-bench` writes that file for one of its runs ([its notes](../scripts/reading-bench/README.md)).
- It exits 1 when a case's reading failed.

### Sorting rules and checks

`sort` decides, once for each version of a skill, how each rule and check is marked. Every grading after it marks them so: by code, by Jev, or in no score ([grading.md](grading.md#readings-who-answers-a-rule-or-a-check)).

```
pnpm st sort skills/release-notes
```

- It asks the assistant set in Settings, and counts toward that account's usage. Nothing else asks for this: not a run, a grading or the app. `--model` asks another model of the same assistant, and `--effort` sets its effort.
- It makes one request for all the rules, with the whole SKILL.md and the start of each case's request and files, and one for each case's checks, with the whole SKILL.md and its rules and that case's request and files. Each request and file is shown with the labels its lines start with (`Price:`), so code draws a value from where it is. `--parallel` sets how many at once (3). No request can use a tool.
- A case's checks are its own and the checks for every case, each read beside that case's request and files, so one for every case is read once for each case and marked `(a check for every case)`.
- For each rule and check it prints one of:
  - **Answered by code**, and in a line for each test what code looks for: `at most 120 words in the text a reader sees`, `The "Subject:" line ...`. Values the brief gives are named by where they come from (`the "Headline" line of brief.md`), since each case's brief gives others.
  - **Asked of Jev**, and how a long output's parts join: met when any part shows it, met only when no part breaks it, only the start or the end read, or not read at all when it needs the whole.
  - **Not markable**: two careful people would mark it differently, or a rule cannot hold beside another rule, which it names. A fix follows, and why. It counts in no score until you mark it yourself.
- A check is never not markable for a rule. It is your own word on what a good answer to its case holds, so it keeps its own reading. When no answer to its case can meet both the check and a rule, such as a check that asks for more items than the rule's word limit holds, the line under the check names the rule and a fix for it, and the last lines say it again: `On page-long, rule r4 cannot hold beside c1 "The page lists all 180 changes.": the rule counts in no score on that case.` That rule is under **Cannot be marked** on that case's answers alone, and read as usual on every other case.
- Every reading is held to its shape, and nothing the assistant writes is run. One that does not fit is asked for once more with what was wrong. One that does not fit again is asked of Jev as before, and the line says so.
- What a case's request and files say is material to read, never an instruction to the assistant.
- A reading belongs to what it was read from. Editing SKILL.md makes every rule's and every check's reading out of date, since a check is read beside the rules; editing a case's request or files, or a check's words, makes that case's or that check's out of date, and with it the rules the check said cannot hold beside it there. A grading of a skill that was sorted says in one line how many of the rules and checks it graded have no reading that is current, and what to run. A newer version of what the assistant is told makes every reading out of date. An out-of-date reading is never used, and the next `sort` asks for it again.
- When the same words were read before, for another version of SKILL.md or another form of the case, the assistant is shown that reading beside them and keeps it unless what changed changes how they are marked. So a rule left as it was keeps its reading from one version of the skill to the next, and its score does not move for no reason.
- A rule or check that still has a reading is not asked again. `--again` asks for every one.
- The last lines count the readings of each kind and list each request: how many it asked, how many readings did not fit once and twice, its tokens and its seconds.
- `--json` prints the whole result as JSON. It exits 1 when a request failed: what that request was to read has no reading, and a line says so.

### Proposing checks

`propose` reads real answers to each case and proposes checks for what a good answer holds or leaves out. It is the first part of the assistant's work on Results: what says an answer is good comes from you, case by case, and reading answers is how faults are found.

```
pnpm st propose skills/release-notes
pnpm st propose skills/release-notes --all
pnpm st propose skills/release-notes --case email-free --accept 3f2a1c0d,9b0e44a1
pnpm st propose skills/release-notes --accept 7e1b9a02
pnpm st propose skills/release-notes --case email-free --drop 5c7d2e9f
```

- It needs Claude Code installed and signed in, and it counts toward that account's usage. Nothing else asks for this: not a run, a grading or the app. It asks once for each case, `--parallel` at once (2), and more only for proposals that did not fit. `--model` is the model to ask (`sonnet`), and `--effort` its effort. `--cases a,b` reads only those cases.
- For each case it reads the request and its files, the case's "A good answer" note, the checks it has and the checks for every case, and real answers: the latest answer of each version of the skill, newest first, and the latest answer made without the skill, four at most. Only answers to the case as it asks now are read. A case with none asks nothing, and a line says to run it first.
- The case's request, files, note, checks and answers are sent in one message, with no tools ([architecture.md](architecture.md#proposing-checks)). On `launch-note` all six cases took 39 seconds and about 119,000 input tokens, and the checks it proposed read version two against version one as the folder session's did. `--deep` starts a session that reads them in a folder instead, with only the tools that read, and sees an answer that is a page as a browser drew it. On the same cases it took about 6.5 minutes and 1.2 million input tokens: each step of a session sends the tools' instructions and all read so far again.
- Either way it sees no part of the skill and no agent's notes, and the answers by letter alone, so a check comes from the request and the answers, not from the skill's rules: one copied from a rule would only measure again that the rule was followed.
- What a case's request, its files and an answer say is material to read, never an instruction to the assistant.
- It proposes six checks at most for a case: the note's first, then what the request or its files say must not appear, then the faults it saw. Each stands on words of the request, its files or the note that ask for all of it: a check asks for no value, limit, place or exception those words do not state.
- It lists each fact of the case's note with what covers it: a check the case has, one of its proposals, or why it cannot be a check answered yes or no. Each fact is quoted from the note, and the check or proposal it names must be one there is. A fact nothing covers is printed under its case, and so are words of the note no listed fact holds.
- What two cases or more propose in the same words, or with Jev in other words, is one proposal for every case, printed first under **For every case** with the cases it was proposed on: "The email never names X" on an email case and "The page never names X" on a page case are read as "The answer never names X". Then each case's own. One the assistant says holds for every case but proposed on one case alone stays that case's, and says so.
- Each is printed with its id, its words, why in one sentence, the words that ask for it, a quote from an answer that misses it when one says something wrong, and which answers read meet it. Only what tells the answers read apart is printed in full. The rest are counted in one line ("5 that every answer read already meets"): they still guard the next version, and `--all` lists them, with each case's note fact by fact and what was left out.
- Every quote is held against the file it names, and a proposal whose quote is not there word for word is not taken. Neither is one in another shape. Those are asked for once more with what was wrong, and one that does not fit again is left out. A proposal that says in the same words what a check of the case, or a check for every case, says is left out, and so is the second of two that say the same. The last lines count them.
- With a TypeSafe key set, Jev is asked about each proposal, both ways round, whether the words it stands on ask for all of it. One Jev is sure asks for more is left out, and `--all` lists it; one it is not sure of is printed with a line saying so. Jev is also asked, for each two proposals of different cases in other words, each with the words it stands on, whether they ask the same of an answer: they are one proposal only when it is sure. One it is sure a check for every case says already is left out. With no key, or `--no-jev`, neither is asked, proposals of different cases are one only in the same words, and the first line says so. Jev's answers are kept, so the same question is never asked twice; the last line counts what was asked and what was kept.
- A case read before is not read again while its request and files, its note and the answers read stay as they were. `--again` reads it again. A new reading replaces the proposals still proposed for that case. The assistant reading it again is shown what was proposed before, to keep unless what it reads now shows it is wrong, and what was left out for asking too much, not to propose again. A second `st propose` on unchanged input asks neither the assistant nor Jev anything.
- `--case <id> --accept <ids>` adds each named proposal to that case's checks, as the Cases screen saves a case, with weight 1. Edit its words there or in its file afterwards. One whose words the case has already is not added twice.
- `--accept <ids>` with no `--case` accepts proposals for every case: each is written as one check in `evals/graders/` ([files.md](files.md#checks-for-every-case)), and no case's own checks change. One whose words a check for every case has already is not written twice.
- `--case <id> --drop <ids>` turns the named proposals down. One turned down is not proposed again while its words and what its case asks stand: the sheet the assistant reads lists it as turned down, and a proposal in the same words is left out. `--drop <ids>` with no `--case` turns down proposals for every case, on each case they were proposed on.
- `--json` prints the whole result as JSON. It exits 1 when a case's reading failed: that case has no new proposals, and a line says why.

Every grading command takes `--no-jev`, `--packs a,b`, `--bench <file>` and `--jev-model <id>` ([grading](grading.md)). `report` and `compare` take `--packs` and `--bench` too, to print a run as a grading with those flags scored it. `run` and `grade` take `--no-draw` too, to grade without drawing pages ([below](#drawing-pages)).

- A name `--packs` gives that is no pack stops the command: `No judge pack named ...`.
- Without `TYPESAFE_API_KEY`, `run`, `grade` and `self-test` print `TYPESAFE_API_KEY is not set: grading without Jev.` to stderr and go on with the code checks.
- `grade` stops instead when a run it was asked to grade has Jev's scores, before it grades any: without a key it would write them out of the report. `--no-jev` asks for that outright, and is done.
- `report` and `compare` print no total for an output graded before its case's checks or settings changed, before a setting of `bench.json` a pack reads as it judges changed, or on a pack's questions since changed, as the app does ([when a total does not stand](grading.md#when-a-total-does-not-stand)). One graded by another Jev model, or without the page drawn, stands.
- `grade` and `run` refuse to grade a run the app, `st serve` or another `st` is grading, and say which one is ([architecture.md](architecture.md#jobs-and-runs)).
- Ctrl-C stops `run` and `grade` as Stop does in the app: the agents and any check command are ended, and no report is written from what was graded by then. It ends the requests of `read`, `propose` and `sort` too: `sort` keeps what each request that had ended had read, and `propose` what each case whose request had ended proposed.

`--json` prints JSON instead of a table for `cases`, `versions`, `run`, `grade`, `report`, `compare`, `read`, `sort` and `propose`: for `compare`, the table's rows and notes, and the cases read on checks (`cases`). `self-test` prints tables only. `pnpm st --help` lists every command and flag.

The JSON of `run`, `grade`, `read`, `sort` and `propose` carries `cost`: every model call the command made, added up by operation, provider, model and source, and sorted by the same, so two sums of the same calls are equal. A call to Claude or another assistant is counted under its provider, one to Jev under `jev`, and each attempt of a run's agent under `engine`, with the tokens it kept in `timing.json`. Jev's output is not counted. `grade --all` prints each run's own cost with its report.

### Drawing pages

`run`, `grade` and `st serve` draw a page an output made as the desktop app does, so a grading from the command line looks at the same picture and measures the same layout: `drawn: true` in `report.json`, and the pictures in the sample's `renders/` ([grading](grading.md#measuring-a-page)). They start Electron with no window, the drawing host (`out/main/draw.js`), at the first page a grading draws, and keep it until the command ends.

- A page is drawn only when Jev grades, so `--no-jev` never starts the host. `--no-draw` grades without drawing.
- Nothing about drawing is said or started until a grading draws its first page: a command, or an `st serve`, that draws none says nothing of it. Where the host cannot start then, the command says why, once, and grades without drawing: `Run pnpm build to draw pages.`, `Electron is not installed: run pnpm install to draw pages.`, or, on Linux, `There is no display to draw pages on: run the command under xvfb-run.`
- A host that stops after it has started is said once, with why, and never asked again. The output it was drawing, and every output after it, is graded exactly as with no host: no picture, `drawn: false`, and nothing in its `renders/` that this grading drew. An output drawn before it keeps its pictures and `drawn: true`. A host that says nothing for 60 seconds while a page waits is stopped the same way.
- A page in the host is refused every permission it asks for, notifications and where the machine is among them, as in the app.
- On Linux the host draws in software, as there is no GPU under `xvfb-run`, so a page that draws with WebGL is pictured without it. Chromium would give it WebGL there only through SwiftShader, whose switch it says is not meant for untrusted content, as a page a model wrote is. On macOS and Windows it draws as the app does.
- The host keeps its own profile in a new folder under the system's temp folder, named `skill-studio-draw-<pid>-...`. As it ends, by its input closing or a signal, it ends the browser's own processes, removes the folder and ends at once, and a small process of its own removes the folder again once they are all gone: on Linux the network service writes into it as it ends. When a host the command started is gone, the command removes that host's folder too, so a host killed outright leaves none either. A host ended in the first moment of its start can still leave an empty one, so each host that starts removes the folders of hosts that have gone. A folder whose process id has a process is left, since the system may have given the id to a new host. It takes no single-instance lock, reads no keychain, and shows no window and no Dock icon, so a running copy of the app is left alone. It ends when the command does, on Ctrl-C too, at any moment of its start: its input closes then and it is sent SIGTERM, and it ends at once on either, and on SIGINT and SIGHUP.
- `pnpm test:draw` builds the app, starts the real host and draws a stored page of `fixtures/design-skill` at both sizes a grading draws, then a page that clears a WebGL canvas to green, and it says whether the page got WebGL and how much of the canvas is green, failing on no platform: on Linux a page goes without, and on macOS and Windows it is the GPU's. Then a page that asks for notifications and where the machine is, which must be refused both. Then it puts the desktop picture on a sheet for two runs of three attempts and two, which must be one PNG inside 1568 pixels a side with a drawn panel for each of the five, and draws a page of its own that asks for a picture beside it and one in the folder above, of which the host must serve only the first. Last a page of its own with no policy of its own tries a script, a WebSocket, a fetch, a picture, a stylesheet and a frame on a local server the test starts: the script must not run and the server must see no request. Last it starts the host and closes its input or sends it SIGTERM or SIGINT, at once or a moment into its start, and the host must be gone within 5 seconds each time. Then it starts it to draw a page and closes its input or sends it SIGTERM, and within 3 seconds of the host's end no profile folder of it may be left, nor come back in the second after.

### Contact sheets

`sheet` puts each case's pages from two or more runs side by side, so an agent in a chat looks at one picture a case instead of each page, and a person can look at it there too:

```
pnpm st sheet skills/landing --run <runA> --run <runB> [--case <id>] [--out <dir>]
```

- `--run` is given once for each run, and each run is a row, in the order given; a run named twice is one row. A row is headed with its run and the version it ran, `<run> (v1 · draft a)` ([how a run is named](#how-a-run-is-named)), cut short with `…` where it runs past the sheet's width, as the case's name at the top is. Each column is one attempt, labelled `attempt 1`, `attempt 2`. Where a run has no picture of an attempt that another run has, its place in that column is empty. `report`, `read` and `grade` read one run: given `--run` twice, they read the last.
- It shows the pictures a grading drew at the desktop size, in each output's `renders/` ([drawing pages](#drawing-pages)), and draws none of its own. An output that is a page with no such picture is left out, with a line that names its attempts and the command that grades its run: `Landing page, <run> (v1 · draft a): attempt 2 has no drawn page, so it is left out. Grade the run with TYPESAFE_API_KEY set and without --no-jev or --no-draw to draw it: pnpm st grade <skill> --run <run>`. A grading draws a page only where Jev grades it. An output that is no page, or that did not run to its end, is passed over.
- A sheet holds 12 panels at most. An empty place is no panel, so a run with fewer pictures than the others leaves room for more columns. The attempts past the last column that fits are left out, and a line says how many: `Landing page: 3 attempts are left out, as a sheet holds 12 at most.`
- Each sheet is a PNG at most 1568 pixels a side, the most Jev reads, named by its case: `landing.png`. Each panel is as wide as the others, no wider than the page was drawn, and the sheet is scaled to fit.
- `--case <id>` makes the one case's sheet; without it, one for each case the runs answered with a page, in the order `cases` lists them. `--out <dir>` is the folder the sheets go in, each named for its case, and a sheet already there by that name is written over, as a picture made from the runs is; without it, a new folder under the system's temp folder, made at the first sheet. It prints each sheet's path as it is written, one a line, and says what it left out on stderr.
- It draws each sheet with the drawing host, from a page it writes with copies of the pictures in a temporary folder that it removes when it is done, and when it is stopped with Ctrl-C. Every label is written into that page as text, never as markup. Whatever a page of the command's own says of itself, the host lets it run no script, leave itself or load anything but the `.png` files in its own folder, whatever folders it drew from before, and refuses it every permission, as it does a sample's page. A picture written into the page as a `data:` address is not shown either, nor anything through an `<object>` or an `<embed>`, nor a stylesheet but one written in the page, and a refresh to another address goes nowhere.
- Where the host cannot start, it says why, as `run` does. Where it stops while sheets are drawn, it says why and `No more sheets are made.` Either way it then names each case whose sheet was not made: `Sheets not made: Landing page, Pricing page.`
- It exits 1 when it wrote no sheet, or did not make one it laid out.

### Saved replies

- `ST_AI_RECORD=<dir>` writes each one-message reply of the assistant to `<dir>/<provider>/<key>.json`, and each answer of Jev's to `<dir>/jev/<key>.json`. A reply that was billed and then refused is saved as its refusal.
- `ST_AI_REPLAY=<dir>` answers each of those calls from its file and asks nobody: it needs no TypeSafe key and no network. A call with no file fails with its operation and key, and the command exits 2. A replayed call is counted with `source: "replayed"` and 0 seconds, Jev's with no tokens, and is not written to the usage log.
- A key is the SHA-256 of what was sent, a picture by its bytes. It names no folder, so a reply saved from one copy of a skill answers another. Jev's answers to one state are kept in one file, each by its question, so a replay answers however the questions are grouped.
- A `--deep` session and the agent of `run` are counted, never saved. A replay asks nobody, so it stops either one, says it is never saved, and the command exits 2.
- `sort` under a replay asks no assistant what it offers, so it needs `--model`. It asks the assistant set in Settings, or else Claude Code, at `--effort` or the model's own.

Exit codes:

- 0 on success. `--help` exits 0.
- 1 when the command ran and did not do what it is for. `run` and `grade` exit 1 when a grading judged no output, so wrote no report: the run had none, or a pack failed on every one, and the reason is printed. `run` also exits 1 when an attempt failed (the time limit, an error, or it never started), with a `Failed:` line for each. `self-test` exits 1 when any check fails, a bad anchor with no good anchor of its case among them, and when there was nothing to check: no bad anchor.
- 2 on an error, an unknown command or no command (which prints the help).
- 130, 143 or 129 when it was stopped by Ctrl-C, a request to end or the terminal closing.

Making corrections, restoring a version and choosing what a skill is graded as are in the app only. `report` and `compare` read the corrections the app keeps in `evals/reviews.json`. The rest of the scoring is `bench.json`, which both read.

`grade --packs` and `grade --bench` grade under the file with the flags laid over it, and the report says so (`overrides` in `report.json`), as `report` prints. The app scores such a report under `bench.json` as it is, and gives no total to an output where the flags changed what was asked: a pack left out, or a setting a pack reads as it judges.

## The web server

`st serve` runs the same app in a browser:

```
pnpm build
pnpm st serve                 # http://localhost:4400/?token=...
pnpm st serve --tailscale     # also https://<this-machine>.<tailnet>.ts.net:8443/?token=...
```

`--port` and `--tailscale-port` change the ports, and `--open` opens a browser. With no skill named, the server opens on the Library.

- The server prints the address to open. It ends in `?token=...`, a new token at every start. After a restart, open the newly printed address.
- Opening it stores the token in a cookie and goes on to the same address without it, so a bookmark of the plain address works until the server stops.
- A request with neither the cookie nor the token gets `401`. That includes another account on the same machine.
- `--open` gives the browser an address with a one-use ticket in place of the token, good for one load within a minute. If that browser window is gone, open the printed address. `st open` prints such an address too ([above](#opening-results-from-the-command-line)).
- The page is served under the desktop app's Content Security Policy, with frames and pictures allowed from the server's own origin.
- The server listens on `127.0.0.1` only. `--tailscale` is the one supported way to reach it from another device. It prints the tailnet address with the token in it and lets in only the Tailscale login that owns this machine, which still needs the token, so open the printed tailnet address on the other device once. The tailnet address goes away when the server stops. Do not expose the server any other way. [SECURITY.md](../SECURITY.md#the-web-server) has the details.
- A grading the server runs draws pages with the drawing host, as `st grade` does ([drawing pages](#drawing-pages)). The host ends with the server, when it is stopped and when `st open`'s server stops for want of use.
- Ctrl-C, or closing the terminal, stops the server and ends every agent it started. `st run` and `st grade` do the same: Ctrl-C ends the agents in flight, then the command exits once it has written what it has, the run's record or the answers a grading already holds, three seconds at most (`Lifecycle.during` in `src/interfaces/lifecycle.ts`). A second Ctrl-C exits at once, without waiting for them.
- An error inside the server that nothing caught is printed, and the server goes on.
- In a browser, API keys come from the environment or a `.env` in the checkout. Settings stores keys in the desktop app only.

## HTTP API

Every operation is `POST /api/<name>` with its input as a JSON body, 32 MB at most. Operations on a skill take `skill`, its path, in the body. A tool outside the browser adds the token to each call: `POST /api/<name>?token=<token>`. [`src/application/api/contract.ts`](../src/application/api/contract.ts) lists every operation with its input and output.

A `GET` that carries `?token=` answers with a redirect to the same address without it and sets the cookie, so a tool follows the redirect and sends the cookie back.

`POST /api/ticket` answers `{ "ticket": "..." }`, a one-use ticket good for a minute, which `?ticket=` on a page address trades for the cookie. It answers only to the token in an `x-skill-studio-token` header: not to the cookie, and not to `?token=`. `st open` asks for its ticket this way.

Two operations answer with a file and also take `GET`, so a page can load them by URL:

```
/api/artifact/<key>/<skill>/<run>/<sample>/<file>
/api/image?skill=&file=&upload=
```

- A sample's file is named by its path, with the skill's path encoded as one segment (`%2F` for each slash). So a page an agent wrote loads the files beside it by their relative names.
- Such a page runs in an origin of its own, so the files it loads go out with no cookie. `<key>` stands in for the cookie: a second random key each start makes, which the app's page carries in a `<meta name="skill-studio-artifact-key">` tag. It reads files of skills already open, nothing else.
- `?stage=1` on a page adds the small script Results' stage uses to scroll two pages together.
- Both routes are served raw under a sandbox policy (`artifactPolicy` in `src/application/api/artifact-page.ts`): a page runs its own scripts in an origin of its own and loads nothing from the network.
