# Contributing

Thanks for helping. Bug fixes, new judge packs, engine adapters and UI improvements are all welcome. For anything larger than a fix, open an issue first so we can agree on the shape before you write it.

## Setup

You need Node 24 or later and pnpm. Any recent pnpm switches itself to the version pinned in `package.json` (`packageManager`).

```
pnpm install
cp .env.example .env    # TYPESAFE_API_KEY, only needed to grade with Jev from a checkout
pnpm dev                # the desktop app with hot reloading
```

The test suite needs no API key, no network and no agent CLI.

## Before you open a pull request

```
pnpm check      # typecheck, Biome, fallow, tests
pnpm build      # the electron-vite build, which CI also runs
pnpm format     # apply Biome's formatting and safe fixes
```

CI runs the first two on every pull request and must be green to merge. Warnings and findings are fixed, never suppressed: no `biome-ignore` or `fallow-ignore` comments and no rule turned off for one file, unless the pull request explains why the tool is wrong.

## Tests

Tests are colocated: `src/domain/scoring.ts` is tested by `src/domain/scoring.test.ts`. Run one folder with `pnpm exec vitest run src/judges`, or `pnpm test:watch` while you work.

- Test behaviour through the module's exports, with small inline inputs.
- Never call Jev, an agent CLI or the network from a test. Mock the boundary (`ask`, the child process) instead.
- Never write into `fixtures/`. Copy a fixture to a temp directory first; `src/application/grade.test.ts` shows how.
- A scoring change needs a test that pins the new number, and a note in the pull request on how scores on the fixtures moved.

## Where a change belongs

The README's [How it is built](README.md#how-it-is-built) maps the folders. Layers point inward only, and `pnpm fallow` fails on an import that does not (`boundaries` in `.fallowrc.json`). A shape two layers share belongs in the domain (`src/domain/views.ts` for what interfaces show). An operation is added once, in `src/application/api/contract.ts` and `operations.ts`, and the desktop app, `st serve` and the client all get it.

A new pack implements `JudgePack` (`src/judges/types.ts`, which extends `PackScoring` from `src/domain/pack.ts`) and is added to the list in `src/judges/index.ts`. Its `index.ts` runs the code checks and asks Jev; its `score.ts` turns stored answers into layer scores. Keep thresholds and weights in its scoring code, not in Jev prompts, so stored answers can be rescored without new calls.

## Style

The UI is shadcn/ui on Tailwind v4 (`components.json`, theme tokens in `src/renderer/styles.css`). Add a component source with `pnpm dlx shadcn@latest add <name>`, then run `pnpm format`. A screen composes components and names a variant; it does not carry utility classes of its own. When a look is missing, add a variant to the component's `cva` (or a composite under `src/renderer/components/`) rather than styling the call site. Color is for verdicts only: `success`, `warning` and `destructive`.

Biome formats and lints everything except Markdown. Write comments for the reason behind the code, not for what it does. Keep commits focused; the commit message says what changed and why.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
