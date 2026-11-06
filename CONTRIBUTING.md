# Contributing

Thanks for helping. Bug fixes, new judge packs, engine adapters and UI improvements are all welcome. For anything larger than a fix, open an issue first so we can agree on the shape before you write it.

Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md).

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

## The guide

`docs/guide.md` is one text for two readers: GitHub renders it, and the app shows it under Guide through its own small renderer (`src/renderer/markdown.ts`). Write only what both render: headings, paragraphs, one-line list items, tables, fenced code, `https` links, and a picture alone in its paragraph (`![what it shows](images/name.webp)`).

A change to how a screen looks or reads needs the guide checked in the same pull request:

- Retake the screenshots with `pnpm guide:shots`. It builds the app, starts it on a scratch home seeded with sample skills (`scripts/guide-shots/seed.ts`), and writes `docs/images/*.webp`. It never touches your own skills or settings.
- Read each step of the guide against its new picture, and fix any label, button or order that no longer matches.
- The two diagrams (`docs/images/*.svg`) are written by hand. Their step numbers must match the guide's headings.

## Releasing

A release is a `v*` tag on `main`. The `release` workflow runs the checks, packages the app for macOS (arm64 and x64, signed and notarized), Windows and Linux, and publishes one GitHub release. A version with a suffix, such as `1.2.0-beta.1`, is published as a prerelease.

Every release needs an entry in [CHANGELOG.md](CHANGELOG.md), and the workflow refuses a version without one. Add changes under `## [Unreleased]` as they land, one line each, written for the person using the app. To release, rename that heading to the version and the day, `## [1.2.0] - 2026-11-05`, start a new `## [Unreleased]` above it, and commit. That entry is the release's notes in three places: the What's New window in the app, the GitHub release, and the update files (`latest*.yml`), where a running copy reads what an update brings before it is installed.

```
pnpm version patch -m "Release %s"    # or minor, major, or an exact version; commits and tags vX.Y.Z
git push --follow-tags
```

`pnpm exec tsx scripts/release-notes.ts` prints the entry the workflow will use for the version in `package.json`.

To release the version already in `package.json`, tag it by hand: `git tag -a v0.1.0 -m "Release 0.1.0"`, then `git push origin v0.1.0`. The workflow refuses a tag that does not match `package.json` or is not on `main`.

To rehearse, run it by hand: `gh workflow run release`. That builds every platform, keeps the files as workflow artifacts for 7 days, and publishes nothing.

The Mac job reads its secrets from the `release` environment. A tag fails when the certificate or the notarization key is missing; a rehearsal builds unsigned instead.

| Secret             | Value                                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------------- |
| `CSC_LINK`         | The Developer ID Application certificate with its key, exported from Keychain Access as a `.p12`, in base64 |
| `CSC_KEY_PASSWORD` | The password of that `.p12`                                                                                |
| `APPLE_API_KEY`    | The text of an App Store Connect API key (`AuthKey_<id>.p8`): a team key with the Developer role           |
| `APPLE_API_KEY_ID` | The ID of that key                                                                                         |
| `APPLE_API_ISSUER` | The issuer ID shown above the list of keys                                                                 |

```
gh api -X PUT repos/milesroxas/skill-studio/environments/release
base64 -i DeveloperID.p12 | gh secret set CSC_LINK --env release
gh secret set APPLE_API_KEY --env release < AuthKey_XXXXXXXXXX.p8
gh secret set CSC_KEY_PASSWORD --env release     # each of these three asks for the value
gh secret set APPLE_API_KEY_ID --env release
gh secret set APPLE_API_ISSUER --env release
```

A release is permanent. The repository refuses to move or delete a `v*` tag, and a published release and its files cannot be changed. When a release run fails for a reason outside the code, run its failed jobs again; otherwise fix the code and release the next patch version.

[SECURITY.md](SECURITY.md#checking-a-download) says what is signed and how a download is checked.

### Updates

A packaged copy updates itself from these releases through [electron-updater](https://www.electron.build/auto-update). It reads the release's `latest*.yml`, so those files and the `.zip` (macOS), `.exe` (Windows) and `.AppImage` (Linux) must stay in every release under the names electron-builder gave them. A copy on a prerelease version follows prereleases and stable releases; a copy on a stable version follows stable releases only.

The updater lives in `src/interfaces/electron/main/updater.ts`, and the state every window shows is worked out in `src/domain/update.ts`. Both are tested without Electron. A development build does not update itself: its windows show the updater as unsupported.

To see the real thing, package a copy under an older version and open it. It finds the newest release on GitHub and downloads it for real.

```
pnpm build
pnpm exec electron-builder --mac zip --arm64 --publish never -c.extraMetadata.version=0.1.0-beta.1
codesign --force --deep --sign - "dist/mac-arm64/Skill Studio.app"    # Apple silicon starts no unsigned app
open "dist/mac-arm64/Skill Studio.app"
```

Give it a prerelease version while every release is a prerelease: a stable version looks for stable releases only. Everything up to **Restart to update** is real. The restart itself is the one step this does not prove: macOS installs an update only over a copy signed by the same Developer ID, so only a released copy can show it.

The app icon is drawn in `build/icon-src/`: `mac.svg` becomes `build/icon.icns`, and `tile.svg` becomes `build/icon.ico` and `build/icon.png`. The two `-small` drawings carry a larger mark for the 16 to 32 px sizes. Export all three files again when the mark changes.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
