---
name: skill-studio-loop
description: Use when asked to write, test or compare an agent skill with Skill Studio's `st` command from this checkout, and to show a person the result.
---

# Write, run and compare a skill

Run every command from this checkout's root: relative paths are read from there. `<skill>` is the skill's folder: put it where the person says, or outside this checkout, so its runs stay out of this repository.

1. Build once: `pnpm build`. Runs draw pages with it, and `st sheet` and `st open` need it.
2. Check, without printing it, that `TYPESAFE_API_KEY` is set in the environment or in this checkout's `.env`. Without it a run is judged by code alone and draws no page. Where it is missing, stop and ask the person for it.
3. Make the skill: `pnpm st new <skill> --description "<when to use it>"`. It writes `<skill>/SKILL.md` and an empty `<skill>/evals/cases/`. Without `--name`, the folder's name is the skill's and must be a slug such as `react-card`. Write each rule as one top-level `-` bullet, a full sentence that asks something of the answer, never under an example heading, and write nothing else as a top-level bullet: those bullets are what a run is graded on. Where the drafts run with `--from` (step 7), leave this file as it was written.
4. Add each case: `pnpm st case add <skill> --title "<title>" --prompt "<request>" --check "<what a good answer does>"`. Only the prompt is required. Give `--check` once a check. For a page add `--artifact html`, for a picture `--artifact image`. It prints `Wrote evals/cases/<id>`.
5. A page loads nothing from the network: a script from a CDN never runs. Add `--file <path>` to the case's `pnpm st case add <skill>` once for each file its page needs. The agent finds them in `files/` and writes its answer in `outputs/`, so the prompt asks it to copy them into `outputs/` beside the page and load them by name.
6. Check the cases: `pnpm st case check <skill>`, and fix what it lists until it lists nothing. `pnpm st cases <skill>` lists each case's id.
7. Write each draft in a folder of its own outside `<skill>`, holding its `SKILL.md`: `<skill>-drafts/a/`, `<skill>-drafts/b/`. `--from` refuses one inside the skill.
8. Try one case once first: `pnpm st run <skill> --from <skill>-drafts/a --name "draft a" --cases <id> --samples 1 --model haiku --quiet --brief`, then make its sheet (step 11). A blank page means the case's files do not reach it: fix the case before running more. With no draft written yet, try the case with no skill: `pnpm st run <skill> --configuration without_skill --cases <id> --samples 1 --model haiku --quiet --brief`.
9. Run each draft on every case: `pnpm st run <skill> --from <skill>-drafts/a --samples 1 --model haiku --quiet --brief`, and the same for b. Give each draft `--name` on its first run, whichever step that is: b takes `--name "draft b"` here. With no skill: `pnpm st run <skill> --configuration without_skill --samples 1 --model haiku --quiet --brief`. A run's last line is `Open: pnpm st open <skill> --a <run>`, and that `<run>` is its name. `run`, `report`, `compare` and `sheet` print each run with its version and the `--name` it was given: `<run> (v1 · draft a)`. A draft's files that already ran are the version they ran as and need no `--name`. A draft you change is a new version and needs a name of its own, such as `--name "draft a2"`: `st run` refuses a name another version has.
10. Compare: `pnpm st compare <skill> <runA> <runB> --brief` prints each case, the run that did better on its checks, and what each missed. It takes two runs, so compare each pair. A case differs when a run did better on its checks: a draft's miss of its own rule is not one, since the other run is not held to that rule. Each case's line starts with its id in brackets, `[<id>]`: that is what `--cases` takes. On the cases that differ, run both drafts again with the same model, `pnpm st run <skill> --from <skill>-drafts/a --cases <a,b> --samples 3 --model haiku --quiet --brief` and the same for b, and compare those two new runs. Unchanged, each draft runs as its kept version, with no `--name`; one you changed since needs a new name.
11. Make the sheet: `pnpm st sheet <skill> --run <runA> --run <runB>` prints one PNG path a case, a row a run. Give `--run` once for each run, two or more, and `--out <dir>` to keep the pictures. Look at each PNG. It shows only pages a grading drew: a run with `--no-draw`, `--no-jev` or no key draws none.
12. Open the pair: `pnpm st open <skill> --case <id> --a <runA> --b <runB>`. Give the person the address it prints, at once: it opens once, within a minute. Run it again for a new one. When the person is done, `pnpm st open --stop` stops the app.

Each attempt's seconds, tokens and cost are in `<skill>/evals/runs/<run>/<case>-s<n>/timing.json`. `--json` in place of `--brief` adds `cost`: each model call the command made, added up, with its tokens and seconds. `timing.json` holds the answer's cost alone, and its input counts tokens read from cache: `pnpm st report <skill> --run <run>` prints what the grading read, and the rules Jev was not sure of, which `--brief` leaves out.

## Habits

- Never read `transcript.jsonl`: it is long. The `--brief` lines, the sheet and an attempt's `notes.md`, where it wrote one, say what is needed.
- Start with `--samples 1 --model haiku`: it is cheap, and finds the cases that tell two versions apart. With no `--model`, `st run` uses `sonnet` on its default engine.
- Run long commands in the background and read only the end of what they print: the end says what happened.
- Look at the sheet before opening any page: one picture a case costs less than each page. Read a page's source only to quote it.
