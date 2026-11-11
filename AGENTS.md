# Working in this repository

Skill Studio is an Electron app for writing and testing agent skills. [CONTRIBUTING.md](CONTRIBUTING.md) covers setup and pull requests. [docs/architecture.md](docs/architecture.md) maps the layers and the import rules.

## Before you finish any change

```sh
pnpm check   # typecheck, lint, dead code, tests. Must pass.
pnpm build   # must pass
```

## If you touch `src/renderer`

Read [docs/design/README.md](docs/design/README.md) first, then the one topic file it points you to. It is short on purpose. These hold on every screen:

1. **Tokens only.** No hex, `rgb()`, `oklch()` or arbitrary color class outside `src/renderer/styles.css`.
2. **No styling at call sites.** Screens compose components and name variants. A missing look is a missing variant: add it to the component.
3. **Closed sets.** A variant the design docs do not list does not exist. Do not invent one.
4. **Yellow means next or running.** One `signal` element per window. Never decoration, never success.
5. **Regions are never cards.** `Screen`, `Workbench` columns or `FormSection`, divided by hairlines.
6. **Words assume nothing.** The reader is new and does not write code. Say what they do or see, never how the app works, in one sentence, and write no hint that only repeats its heading. Read [docs/design/copy.md](docs/design/copy.md) before you write or change any text the app shows.

If the design docs and the code disagree, the code is what runs: say so in your report and fix the doc in the same change. Do not follow a doc into a variant that is not there.

If a task needs a color, a size, a component or a pattern the docs do not cover, stop and ask. Do not guess: the next reader cannot tell your guess from a choice someone made on purpose.

## Also

- The built app's CSP is `style-src 'self'` plus one per-page nonce, which only CodeMirror's style tag carries (`src/interfaces/electron/main/csp.ts`). A library that injects a `<style>` tag will not render. Dev allows inline styles, so check in a build.
- Update the docs in the same pull request as the change they describe.
- A release needs a `CHANGELOG.md` entry.
