# Words

Every word the app shows: a label, a hint, a placeholder, a note, a dialog, an error.

Write for someone who opened the app for the first time today and does not write code. They know what they just did on this screen and what they can see on it. They do not know how a run works, where anything is stored, or what the parts are called inside the app.

## Does this text earn its place?

```
Does it stop a mistake the reader would otherwise make, or answer a question the control raises?
 ├── No → write nothing. A heading, a label and a button are often enough.
 └── Yes
      ├── Does it repeat its heading, its label or a line next to it? → cut the repeat, keep the rest.
      ├── Is it only true before the reader acts? → show it only then (the Files hint goes once a file is added).
      └── Otherwise → one sentence, 20 words or fewer. A second sentence only for what happens if they do not.
```

A hint under a section heading that says what the section is ("How Skill Studio looks", under Appearance) is the first case: it is not written.

## How to say it

1. **Say what the reader does or sees, not how the app does it.** "Add any file your prompt refers to", not "The agent works in an empty folder with the skill, this prompt and these files".
2. **No actor the reader has not met.** Write what happens ("It can't be read otherwise"), not who does it ("the agent cannot read it"). "The agent" belongs where the subject is the skill's own writing, such as how to shape a rule, and in the welcome, which introduces it.
3. **Use the words on the control.** Under an **Add files** button the hint says "add", not "attach" or "give it a copy".
4. **Name the thing.** "a file, such as a screenshot", not "a copy of what the prompt is about".
5. **Reason before rule, or consequence after it.** A bare rule reads as a restriction.
6. **One name per thing.** An attempt is an attempt on every screen. Jev is Jev: the grader has one name, and "Jev, the grader" where it is first met on a screen. Never "the judge": a judge's verdict is final, and here the reader's is.
7. **Plain and specific.** No "powerful", "seamless", "simply". Say what happens.
8. **An error says what failed and the next step.** Never "Something went wrong".

## The app's own words

| Thing | Word |
| --- | --- |
| what is graded | "output" |
| the model that grades it | "Jev" |
| what an output passes | "met" |
| what an output fails | "missed" |
| what Jev could not tell, so it is in no score | "not sure" |
| a rule for another kind of work than the output | "does not apply" |
| the reader's own answer on one verdict | a "correction", shown as "your answer" |

## Form

- Sentence case everywhere. No title case, and no trailing period on a label.
- A button is a verb and its object, except a dialog's confirm button, which is one verb ([buttons.md](buttons.md#every-button)).
- The button that starts a run names what it runs: "Run 3 cases", or "Run 3 cases, 2 attempts each".

## Words that are not written

These name how the app works. The reader never chose them.

| Not this | Say |
| --- | --- |
| on disk, from disk | "saved", "outside the app", or nothing |
| code checks | what is missing: "no rule or check is marked" |
| provider | the thing itself: "Claude Code or Codex", "the assistant" |
| keychain | "stored on this computer" |
| run snapshot | "past runs" |
| front matter | "the `---` lines at the top" |
| sample (of a run) | "attempt" |
| a storage path in a status ("Saved in evals/bench.json") | "Saved" |
| tokens, model ids, in a line about grading | leave them out |

`src/interfaces/renderer-copy.test.ts` fails when one of the first five comes back in the app's text. A new plumbing word goes in this table and in that test in the same change.

Some text is for a reader who is technical by being there: a key set in the environment, a case kept in `evals.json`, the transcript, the size meter's token count, the `st` command line. It keeps its exact terms.

## Before you say a change to the words is done

1. `pnpm check` passes, `renderer-copy.test.ts` with it.
2. Read each new line as someone who has never run a case. Any word they would have to ask about is rewritten or cut.
3. No new line repeats its heading, its label or the line above it.
4. The guide quotes the app's words: `grep` `docs/guide.md` for every label you changed.
