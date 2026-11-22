# Reshape plan: show whether the work got better

Skill Studio grades an answer mostly on the skill's own rules. That shows whether the agent did what the skill says. It does not show whether doing so made the answer better. This plan reorders the product around the second question and keeps the first as the way to find what to fix.

| | |
| --- | --- |
| Status | Proposed on 2026-11-20. Nothing here is built. |
| Reviewed | The app and docs at `28012ed`, with the `st read` harness and the `launch-note` test skill, both uncommitted on `t3/ai-results-skill-refinement` |
| Evidence | Five graded runs of `fixtures/launch-note`, counted against the answer key in `scripts/reading-bench/key.ts` |
| Owner | Miles Roxas |

Names in this file for new things ("criteria for every case", "kept back", "blind pick") are working names. None is product copy: [design/copy.md](design/copy.md) decides those words when a phase is built.

## What an evaluation of a skill has to answer

A skill is text added to an agent's context to change its work on one kind of task. So testing one is a question of cause: does adding this text make the work better, on the requests it will meet, at a cost worth paying? That question has five links. Each can fail alone, and each needs its own measure.

| Link | Question | What measures it |
| --- | --- | --- |
| Picked up | Does the agent read the skill when it should, and leave it when it should not? | Requests that should and should not use it |
| Followed | Did the agent do what the skill says? | Marking each rule on each answer |
| Works | Is the answer better for it? | Criteria that do not come from the skill's text, and a blind choice between two answers |
| Needed | Does each rule earn its place? | Whether the answer is as good without the rule |
| Worth it | What does the skill cost in time and money? | The same cases with and without it |

"Better" comes from the person, not from the skill. The skill is a guess at how to get good work, so a score counted on the skill's own text checks the guess against itself.

## Review of the product today

| Link | What the product does | Gap |
| --- | --- | --- |
| Picked up | A case's prompt does not name the skill, and the workflow pack flags `skill not read before writing` (`src/judges/workflow/score.ts`). | The flag is one fact among many. An answer written without reading the skill still has every rule marked, so its misses read as a wording problem. No case can say "the skill should not be used here". |
| Followed | Strong. One question a rule, three states and Does not apply, the reader's own mark, a count per rule in the editor's margin, the run's own copy of the skill. | It is half of the total (adherence 50, rubric 50), so it is read as "better". |
| Works | Checks on a case, a check command, the page as drawn, A beside B. | Checks are optional and few. A case's "A good answer" note is graded by nothing: no file under `src/judges/` reads `expected_outcome`. A and B are compared with their scores in view. |
| Needed | The guide says to leave out what the agent does anyway. | Nothing measures it. The run without the skill already holds the answer for each rule, and the app does not read it that way. |
| Worth it | Each run shows its time and cost. | The cost with the skill is not set against the cost without it. |

Three more findings cut across the links.

- **The change between two versions leaves out the rule that was edited.** A fact is named by its words (`rule:<text>`), and a change counts only the facts both runs hold. A reworded rule is a new fact, so the edit the writer just made is the one thing the lift cannot see. Only checks stay the same across an edit.
- **The run without the skill is graded on rules it never saw.** It scores low on them by construction. That proves the skill was obeyed, which is a different thing from the work being better.
- **A mean hides what a count shows.** The docs' own example has attempts at one case scoring 26 points apart. With a handful of cases and one attempt each, a move of a few points in a mean is not a finding.

## Evidence from the test skill

`fixtures/launch-note` has rules and checks that code can answer, so its runs can be counted against a key nobody marked by hand. One skill, six cases, five runs: enough to show a shape, too little to set a threshold by.

| Run (Sonnet) | Rules followed | Checks met |
| --- | --- | --- |
| Without the skill | 74 | 78 |
| Version one | 94 | 83 |
| Version two | 95 | 83 |

- The 83 is five cases at 100 and one at 0. So the only measure that does not come from the skill's text barely registers the skill, and cannot tell version one from version two. With one or two checks a case, it has no room to.
- Jev was sure and wrong on 17 of 357 answers. Sixteen are on the one 54,000-character page, each a sure "missed" for text past the 40,000 characters Jev reads. Those answers count: that page scored rubric 0 with every check in fact met. On the other five cases Jev was wrong once in 304, on a word count the report already holds.
- Of the 41 answers Jev was not sure of, 26 belong to two rules of version one that cannot both hold. Jev was right to hold back. The product then asks for a mark on each row, where one message about the two rules is what is needed.
- A vague rule ("Try to keep the tone reasonably friendly") was marked met 18 times of 18. A rule that cannot be missed adds the same point to every answer.

## What stays

- Yes and no facts, the Not sure state and Does not apply.
- The run without the skill, version copies, attempts per case, and a case read against its own runs.
- The reader's own mark as the last word on a fact.
- No fixed opinion in a grader: an answer is held only to what the skill and the case state.
- Jev's raw answers stored unrounded. Every change to scoring below rescores old runs without a new judge call.
- Plain files beside the skill, and three screens.

## The reshaped loop

Today: write the rules, run, read a score that is half rule-following, edit a rule.

Reshaped:

1. **Run the cases without the skill and read the answers.** What is wrong with them is why the skill exists.
2. **Say what a good answer needs.** Each kind of fault becomes a criterion. The assistant reads the answers and proposes them; the writer accepts, edits or drops each one.
3. **Write or edit the skill.**
4. **Run with the skill.**
5. **Read the result as cases:** better, the same or worse, on the criteria.
6. **Find where each miss sits on the chain,** and take the fix that goes with it.
7. **Change the smallest thing and run again.**

Rules still get marked on every answer. They move from the headline to step 6.

| Where a miss sits | How it shows | The fix offered |
| --- | --- | --- |
| The skill was not read | No read of `SKILL.md` before the first write | Work on the description. The rules of that answer are not counted against their wording. |
| A rule was read and broken | Rule missed | Reword the rule (the editor's rewrite tools, as now) |
| A rule was followed and the answer is no better | Rule met, criteria missed | Change what the rule asks, or add what is missing |
| Nothing asks for it | A fault the assistant or the writer sees that no criterion names | Add a criterion |
| The agent does it anyway | Rule met in the run without the skill | Offer to cut the rule |
| It fails with and without the skill, on every version | Criterion missed everywhere | Look at the case, or at what the model can do |

## Phases

Each phase lands on its own and is measured before the next starts. A phase that changes a screen begins with a prototype round and the design docs, as [AGENTS.md](../AGENTS.md) asks.

### Phase 0: stop grading wrongly

Scores have to be right before anything is built on them.

- **No sure "missed" on text that was not read.** A long output is asked in pieces and code joins the answers: "it holds" is a yes from any piece, "it never" is a no from every piece. Where a piece could not be read, the fact stands as not read, never as missed.
- **Exact rules are answered by code.** The assistant reads each rule once per version and sorts it: one code can answer, one Jev should be asked, or one that cannot be marked as written. For the first kind it picks from a closed set of checks (a count, holds, never holds, exactly n, an order, copied word for word, a value from a list, a measure) and fills in the values. No code a model wrote runs. This extends what the page measures already do.
- **A rule that cannot be marked is said once.** A vague rule, or two that cannot both hold, is shown with its fix and counts in no score. A rule Jev is not sure of on most answers is treated as this, not as rows to mark.
- **Grading has a key.** The `launch-note` count runs before a release, and a change to a question's words has to hold its numbers.

Measured by: on `launch-note`, sure and wrong goes from 17 to 1 or 0, and the 26 not-sure rows of the two rules become one message.

### Phase 1: what a good answer needs comes first

- **The assistant reads answers and proposes criteria.** This is the first job of the assistant on Results. It reads a case's answers with and without the skill in the read-only folder `st read` builds, lists what is wrong and what differs, and offers each as a check. A case's "A good answer" note is its starting point, so that note is at last put to use.
- **Criteria for every case.** A thing every answer to this skill owes has no home today but a rule, where it moves with each edit. Keep such criteria with the cases, under `evals/`, so they stay the same from one version to the next.
- **Two readings where there is one total.** "What a good answer needs" (criteria) and "followed the skill" (rules) are shown apart. A run without the skill is read on the first only.
- **A result is a count of cases.** Better on 4, the same on 1, worse on 1. "The same" means inside the spread of that case's attempts, which `attemptsOf` already holds. With one attempt, the page says a small move may be chance.

Measured by: on `launch-note` with proposed criteria accepted, the criteria tell version one from version two on the cases the key says differ, which 83 against 83 does not.

### Phase 2: say where each miss sits

- Sort every miss by the table above, from facts the report already holds.
- An answer whose skill was not read has its rules set aside, with the description as the fix.
- For each rule, show how often the run without the skill followed it. This costs nothing: that run is graded on the rules already.
- The assistant's work on one rule or one case starts from this placement.

Measured by: on `launch-note`, each planted fault lands in the row it was planted for (the vague rule, the pair that cannot both hold, the case that is unfair to a rule).

### Phase 3: a blind pick between two answers

For writing and design, which answer is better is the real measure, and people choose between two far more reliably than they score one.

- Test before building. A model picks blind between pairs of answers from two versions, sides shuffled, each pair asked both ways round. The writer picks the same pairs blind. Count how often they agree.
- If they agree often enough, the blind pick becomes a number ("the newer version was picked on 5 of 6 cases"), and a reason given for a pick becomes a proposed criterion.
- If they do not, criteria from phase 1 carry the result, and a pick stays a way to find criteria.

Measured by: agreement between the model's picks and the writer's on at least 30 pairs.

### Phase 4: needed, and worth it

- **Offer to cut a rule the agent follows anyway,** from phase 2's count.
- **A removal test for a rule in doubt.** Run the cases on a copy of the skill without the rule, and read the criteria. The copy takes no version number.
- **Cost beside the result.** Time and money with the skill against without, for each case.

### Phase 5: picked up, and kept back

- **A case can say the skill should not be used.** It passes when the skill is left unread. Cases that sit close to the skill's job are the useful ones.
- **A case can be kept back.** The assistant never reads a kept-back case while it drafts a change. It is run at the end, to show the change did not fit the skill to the cases it was tuned on.

## What this does to the assistant on Results

The plan for the assistant stays, in a new order.

1. Read answers and propose criteria (phase 1).
2. Say where a miss sits and offer the fix that goes with it (phase 2).
3. Work through one rule or one case with the writer: draft, apply, run, read.
4. Write the short summary, from numbers code counted.
5. Answer what Jev was not sure of, as a suggestion. On `launch-note` it agreed with the key on 17 of 27 such rows, so its answer does not count in a score.

What is built carries over: the read-only folder, the session held to it, the quote check and `st read`.

## Decisions for Miles

| # | Decision | Recommended |
| --- | --- | --- |
| 1 | Do grading fixes (phase 0) come before the assistant's screens? | Yes. A summary of wrong scores is worse than none. |
| 2 | Is the one total split into two readings? | Yes. One blended number is the root of the confusion between followed and better. |
| 3 | Do criteria for every case live outside `SKILL.md`? | Yes. It is the only way a change can be measured across an edit to a rule. |
| 4 | Is a result a count of cases, with the mean beside it or gone? | A count first, the mean kept in the note that explains it. |
| 5 | Is the blind pick tested (phase 3)? | Yes, as an experiment that costs an hour of picking, before any screen. |
| 6 | How many attempts does a run make by default? | Decide after phase 1 shows how far attempts sit apart on real skills. More attempts cost more. |

## Not in this plan

- A change to how an agent is run, or to the files a run keeps.
- A new judge. Jev stays the reader for facts.
- Screens. Each phase that needs one starts with a prototype round.
