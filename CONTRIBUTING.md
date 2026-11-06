# Contributing

Bug fixes, new judge packs, engine adapters and UI improvements are welcome. For anything larger than a fix, open an issue first so we can agree on the shape before you write it.

Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md). By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).

## Setup

You need Node 24 or later and pnpm. A recent pnpm switches itself to the version pinned in `package.json`.

```
pnpm install
cp .env.example .env    # optional: API keys for grading with Jev and for the assistant
pnpm dev                # the desktop app, with hot reloading
```

## Before you open a pull request

```
pnpm check      # typecheck, Biome, fallow, tests
pnpm build      # the electron-vite build
pnpm format     # apply Biome's formatting and safe fixes
```

CI runs `pnpm check` and `pnpm build` on every pull request, and both must pass to merge.

Fix warnings and findings; do not suppress them. A `biome-ignore` or `fallow-ignore` comment, or a rule turned off for a file, is accepted only when the pull request explains why the tool is wrong.

Keep commits focused, and say in the message what changed and why. Write comments for the reason behind the code, not for what it does.

## Tests

Tests sit beside the code: `src/domain/scoring.ts` is tested by `src/domain/scoring.test.ts`. Run one folder with `pnpm exec vitest run src/judges`, or `pnpm test:watch` while you work.

- Test behaviour through the module's exports, with small inline inputs.
- Never call Jev, an agent CLI or the network from a test. Mock the boundary (`ask`, the child process) instead.
- Never write into `fixtures/`. Copy a fixture to a temp directory first, as `src/application/grade.test.ts` does.
- A scoring change needs a test that pins the new number, and a note in the pull request on how scores on the fixtures moved.

## Where a change belongs

[docs/architecture.md](docs/architecture.md) maps the folders and the import rules, which `pnpm fallow` enforces.

- A shape two layers share belongs in the domain (`src/domain/views.ts` for what interfaces show).
- An operation is added once, in `src/application/api/contract.ts` and `operations.ts`. The desktop app and `st serve` both get it.
- A judge pack implements `JudgePack` (`src/judges/types.ts`) and is added to the lists in `src/judges/index.ts` and `src/judges/scorers.ts`. Its `index.ts` runs the code checks and asks Jev; its `score.ts` turns stored answers into layer scores. Keep thresholds and weights in `score.ts`, not in Jev prompts, so stored answers can be rescored without new calls.

## UI

The UI is shadcn/ui on Tailwind v4 (`components.json`, theme tokens in `src/renderer/styles.css`). Add a component source with `pnpm dlx shadcn@latest add <name>`, then run `pnpm format`.

- A screen composes components and names a variant. When a look is missing, add a variant to the component's `cva`, or a composite under `src/renderer/components/`, rather than styling the call site.
- Color carries meaning only: `success`, `warning` and `destructive` for verdicts, lime (`signal`) for the next step and a running job. [docs/design/](docs/design/README.md) is the full system.

## Docs

Update the docs in the same pull request as the change they describe: [docs/](docs/) for a command, flag, file layout or pack, and the guide for a screen.

`docs/guide.md` is one text for two readers: GitHub renders it, and the app shows it under Guide through its own small renderer (`src/renderer/markdown.ts`). The app's help links to the guide's `##` headings by name (`src/renderer/help.ts`), and a test fails when one is missing. Write only what both render:

- Headings, paragraphs, bold, italic, inline code, tables, fenced code and quotes.
- Lists whose items are one line each. A nested item is flattened.
- Links as full `https` URLs. A relative link stays plain text in the app.
- A picture alone in its paragraph, from `docs/images/`: `![what it shows](images/name.webp)`.

When a screen changes how it looks or reads:

1. Retake the screenshots with `pnpm guide:shots`. It builds the app, starts it on a scratch home seeded with sample skills (`scripts/guide-shots/seed.ts`), and writes `docs/images/*.webp`. It never touches your own skills or settings.
2. Read each step of the guide against its new picture, and fix any label, button or order that no longer matches.
3. Check the two diagrams (`docs/images/*.svg`). They are written by hand, and their step numbers must match the guide's headings.

## Releasing

[docs/releasing.md](docs/releasing.md) covers cutting a release, signing, updates and the app icon.

Add each change to [CHANGELOG.md](CHANGELOG.md) under `## [Unreleased]` as it lands: one line, written for the person using the app. That entry becomes the release's notes.
