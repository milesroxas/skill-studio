# Contributing

Thanks for helping. Bug fixes, new judge packs, engine adapters and UI improvements are all welcome. For anything larger than a fix, open an issue first so we can agree on the shape before you write it.

## Setup

You need Node 24 or later and pnpm. Any recent pnpm switches itself to the version pinned in `package.json` (`packageManager`).

```
pnpm install
cp .env.example .env    # TYPESAFE_API_KEY, only needed to grade with Jev
```

The test suite needs no API key, no network and no agent CLI.

## Before you open a pull request

```
pnpm check      # typecheck, Biome, tests: the same steps CI runs
pnpm format     # apply Biome's formatting and safe fixes
pnpm build      # if you changed app/
```

CI runs `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm build` on every pull request. A pull request needs a green CI run to merge.

## Tests

Tests are colocated: `core/scoring.ts` is tested by `core/scoring.test.ts`. Run one folder with `pnpm exec vitest run judges`, or `pnpm test:watch` while you work.

- Test behaviour through the module's exports, with small inline inputs.
- Never call Jev, an agent CLI or the network from a test. Mock the boundary (`ask`, the child process) instead.
- Never write into `fixtures/`. Copy a fixture to a temp directory first; `server/grade.test.ts` shows how.
- A scoring change needs a test that pins the new number, and a note in the pull request on how scores on the fixtures moved.

## Where things live

| Folder    | Holds                                                                                    |
| --------- | ---------------------------------------------------------------------------------------- |
| `core/`   | schemas, scoring, stats and Bradley-Terry. Pure code with no I/O                          |
| `judges/` | one folder per pack: code checks in `index.ts`, Jev questions and layer scoring beside it |
| `server/` | engines, case and run loading, grading, the HTTP API                                     |
| `cli/`    | the `st` command                                                                         |
| `app/`    | the React review UI                                                                      |

A new pack implements `JudgePack` (`judges/types.ts`, which extends `PackScoring` from `core/pack.ts`) and is added to the list in `judges/index.ts`. Keep thresholds and weights in its scoring code, not in Jev prompts, so stored answers can be rescored without new calls.

## Style

Biome formats and lints everything except Markdown. Write comments for the reason behind the code, not for what it does. Keep commits focused; the commit message says what changed and why.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
