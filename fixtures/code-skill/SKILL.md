---
name: code-skill
description: Write a small Node module with a test beside it. Use when asked for a utility function, a helper module or a script with tests.
---

# Small modules

Write one ES module per task and a test file beside it.

## Rules

- Export the function the prompt names, and nothing else.
- Put the module in `outputs/<name>.mjs` and its test in `outputs/<name>.test.mjs`.
- Write the test with `node:test` and `node:assert/strict`, with at least three cases.
- Never add dependencies; the module runs on Node alone.
- Handle the edge case the prompt mentions before the happy path.
