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
| `cases` | List the skill's cases |
| `run` | Generate outputs with a headless agent, then grade them |
| `grade` | Grade a run again: `--run <name>` or `--all` |
| `report` | Print a run's report: `--run <name>`. The scores are counted from the stored answers under `bench.json` as it is now, with your corrections from the app, as the app shows them. A sample folder since removed is left out. Under the table, each output's checks met and rules followed, counted apart: an output of a run without the skill has no rules count |
| `compare <runA> <runB>` | Score differences between two graded runs, both under `bench.json` as it is now. A sample is read against the one of its name in the other run (`email-s2` against `email-s2`), only where the app would set the two against each other: answers to the same case as it was asked, both graded with Jev or both without, with your corrections only on facts you answered in both. A change counts only the rules and checks marked in both: one Jev was not sure of, did not read, or set aside, in either run is left out of both, and the table says how many under it. Each sample left out is listed there too, with why. Then it reads the two runs as cases, on checks alone ([below](#reading-two-runs-as-cases)) |
| `read` | Have the assistant read a graded run: `--run <name>`. It answers the rules and checks Jev was not sure of or did not read, each with where it saw it, and prints how often its answers agree with yours. It writes nothing to the skill ([below](#reading-a-run)) |
| `sort` | Have the assistant read each rule and each check once and say how it will be marked: answered by code, asked of Jev, or not markable as written, with a fix. It keeps what it read in `evals/rule-readings.json` ([below](#sorting-rules-and-checks)) |
| `propose` | Have the assistant read each case's latest answers and propose checks a good answer meets. It changes no case until you accept a proposal. It keeps them in `evals/proposals.json` ([below](#proposing-checks)) |
| `versions` | List the skill versions seen in runs, and the working tree's |
| `self-test` | Grade `evals/anchors` and check that bad anchors lose to good ones ([anchors](grading.md#anchors)) |
| `serve [skill...]` | Start the app as a web server, below |

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
- `--name` and `--note`: name the skill version and note on it, when the files changed. A run with `--configuration without_skill` tests no version and needs neither.
- `--parallel n`: samples in flight (3).
- `--no-grade`: skip grading.

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

Every grading command takes `--no-jev`, `--packs a,b`, `--bench <file>` and `--jev-model <id>` ([grading](grading.md)). `report` and `compare` take `--packs` and `--bench` too, to print a run as a grading with those flags scored it.

- A name `--packs` gives that is no pack stops the command: `No judge pack named ...`.
- Without `TYPESAFE_API_KEY`, `run`, `grade` and `self-test` print `TYPESAFE_API_KEY is not set: grading without Jev.` to stderr and go on with the code checks.
- `grade` stops instead when a run it was asked to grade has Jev's scores, before it grades any: without a key it would write them out of the report. `--no-jev` asks for that outright, and is done.
- `report` and `compare` print no total for an output graded before its case's checks or settings changed, before a setting of `bench.json` a pack reads as it judges changed, or on a pack's questions since changed, as the app does ([when a total does not stand](grading.md#when-a-total-does-not-stand)). One graded by another Jev model, or without the page drawn, stands.
- `grade` and `run` refuse to grade a run the app, `st serve` or another `st` is grading, and say which one is ([architecture.md](architecture.md#jobs-and-runs)).
- Ctrl-C stops `run` and `grade` as Stop does in the app: the agents and any check command are ended, and no report is written from what was graded by then. It ends the requests of `read`, `propose` and `sort` too: `sort` keeps what each request that had ended had read, and `propose` what each case whose request had ended proposed.

`--json` prints JSON instead of a table for `cases`, `versions`, `run`, `grade`, `report`, `compare`, `read`, `sort` and `propose`: for `compare`, the table's rows and notes, and the cases read on checks (`cases`). `self-test` prints tables only. `pnpm st --help` lists every command and flag.

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
- `--open` gives the browser an address with a one-use ticket in place of the token, good for one load within a minute. If that browser window is gone, open the printed address.
- The page is served under the desktop app's Content Security Policy, with frames and pictures allowed from the server's own origin.
- The server listens on `127.0.0.1` only. `--tailscale` is the one supported way to reach it from another device. It prints the tailnet address with the token in it and lets in only the Tailscale login that owns this machine, which still needs the token, so open the printed tailnet address on the other device once. The tailnet address goes away when the server stops. Do not expose the server any other way. [SECURITY.md](../SECURITY.md#the-web-server) has the details.
- Ctrl-C, or closing the terminal, stops the server and ends every agent it started. `st run` and `st grade` do the same: Ctrl-C ends the agents in flight, then the command exits once it has written what it has, the run's record or the answers a grading already holds, three seconds at most (`Lifecycle.during` in `src/interfaces/lifecycle.ts`). A second Ctrl-C exits at once, without waiting for them.
- An error inside the server that nothing caught is printed, and the server goes on.
- In a browser, API keys come from the environment or a `.env` in the checkout. Settings stores keys in the desktop app only.

## HTTP API

Every operation is `POST /api/<name>` with its input as a JSON body, 32 MB at most. Operations on a skill take `skill`, its path, in the body. A tool outside the browser adds the token to each call: `POST /api/<name>?token=<token>`. [`src/application/api/contract.ts`](../src/application/api/contract.ts) lists every operation with its input and output.

A `GET` that carries `?token=` answers with a redirect to the same address without it and sets the cookie, so a tool follows the redirect and sends the cookie back.

Two operations answer with a file and also take `GET`, so a page can load them by URL:

```
/api/artifact/<key>/<skill>/<run>/<sample>/<file>
/api/image?skill=&file=&upload=
```

- A sample's file is named by its path, with the skill's path encoded as one segment (`%2F` for each slash). So a page an agent wrote loads the files beside it by their relative names.
- Such a page runs in an origin of its own, so the files it loads go out with no cookie. `<key>` stands in for the cookie: a second random key each start makes, which the app's page carries in a `<meta name="skill-studio-artifact-key">` tag. It reads files of skills already open, nothing else.
- `?stage=1` on a page adds the small script Results' stage uses to scroll two pages together.
- Both routes are served raw under a sandbox policy (`artifactPolicy` in `src/application/api/artifact-page.ts`): a page runs its own scripts in an origin of its own and loads nothing from the network.
