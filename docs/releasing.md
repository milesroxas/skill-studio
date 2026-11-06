# Releasing

A release is a `v*` tag on `main`. The `release` workflow runs the checks, packages the app for macOS (arm64 and x64, signed and notarized), Windows and Linux, and publishes one GitHub release. A version with a suffix, such as `1.2.0-beta.1`, is published as a prerelease.

A release is permanent. The repository refuses to move or delete a `v*` tag, and a published release cannot be changed. When a release run fails for a reason outside the code, run its failed jobs again. Otherwise fix the code and release the next version.

## Cut a release

1. In [CHANGELOG.md](../CHANGELOG.md), rename `## [Unreleased]` to the version and the day, such as `## [1.2.0] - 2026-11-05`, start a new `## [Unreleased]` above it, and commit. The workflow refuses a version with no entry.
2. Bump, tag and push:

```
pnpm version prerelease -m "Release %s"    # or patch, minor, major, or an exact version
git push --follow-tags
```

`pnpm version` commits and tags `vX.Y.Z`. From a prerelease such as `0.1.0-beta.2`, `prerelease` gives `0.1.0-beta.3` and `patch` gives the stable `0.1.0`.

The workflow refuses a tag that does not match `package.json` or is not on `main`. To release the version already in `package.json`, tag it by hand: `git tag -a v0.1.0 -m "Release 0.1.0"`, then `git push origin v0.1.0`.

The changelog entry becomes the release's notes in three places: the What's New window in the app, the GitHub release, and the update files (`latest*.yml`), where a running copy reads what an update brings before it installs. `pnpm exec tsx scripts/release-notes.ts` prints the entry for the version in `package.json`.

## Rehearse

`gh workflow run release` builds every platform, keeps the files as workflow artifacts for 7 days, and publishes nothing. It needs a changelog entry for the version in `package.json`.

## Signing secrets

The Mac job reads its secrets from the `release` environment. A tag fails when one is missing; a rehearsal then builds unsigned.

| Secret | Value |
| --- | --- |
| `CSC_LINK` | The Developer ID Application certificate with its key, exported from Keychain Access as a `.p12`, in base64 |
| `CSC_KEY_PASSWORD` | The password of that `.p12` |
| `APPLE_API_KEY` | The text of an App Store Connect API key (`AuthKey_<id>.p8`): a team key with the Developer role |
| `APPLE_API_KEY_ID` | The ID of that key |
| `APPLE_API_ISSUER` | The issuer ID shown above the list of keys |

```
gh api -X PUT repos/milesroxas/skill-studio/environments/release
base64 -i DeveloperID.p12 | gh secret set CSC_LINK --env release
gh secret set APPLE_API_KEY --env release < AuthKey_XXXXXXXXXX.p8
gh secret set CSC_KEY_PASSWORD --env release     # each of these three asks for the value
gh secret set APPLE_API_KEY_ID --env release
gh secret set APPLE_API_ISSUER --env release
```

[SECURITY.md](../SECURITY.md#checking-a-download) says what is signed and how a download is checked.

## Updates

A packaged copy updates itself from these releases through [electron-updater](https://www.electron.build/auto-update). It reads the release's `latest*.yml`, so those files and the `.zip` (macOS), `.exe` (Windows) and `.AppImage` (Linux) must stay in every release under the names electron-builder gave them. A copy on a `beta` version follows prereleases and stable releases. A copy on a stable version follows stable releases only.

The updater is `src/interfaces/electron/main/updater.ts`, and the state every window shows is worked out in `src/domain/update.ts`. Both are tested without Electron. A development build does not update itself.

To watch a real update, package a copy under an older version and open it. It finds the newest release on GitHub and downloads it.

```
pnpm build
pnpm exec electron-builder --mac zip --arm64 --publish never -c.extraMetadata.version=0.1.0-beta.1
codesign --force --deep --sign - "dist/mac-arm64/Skill Studio.app"    # Apple silicon starts no unsigned app
open "dist/mac-arm64/Skill Studio.app"
```

Give the copy a prerelease version while every release is a prerelease. Everything up to **Restart to update** is real. The restart is the one step this does not prove: macOS installs an update only over a copy signed by the same Developer ID, so only a released copy can show it.

## Start over

To meet a release as a newcomer does, use **Reset Skill Studio…** under Start over, the last section of Settings. Only a development build and a prerelease offer it (`canReset` in `src/domain/reset.ts`).

It deletes `~/.skill-studio/` (the practice skill included), the settings from before the rename (`~/.skill-tester/library.json`), the window's place, and the page's storage, cache and zoom, then opens the app on the welcome. Your skills and stored keys stay. A development build shares these files with an installed copy, so a reset in one resets both.

## The app icon

The icon comes from the Flow brand kit and is drawn in `build/icon-src/`: `mac.svg` becomes `build/icon.icns`, and `tile.svg` becomes `build/icon.ico` and `build/icon.png`. `mark.svg` is the mark alone. Every size is exported from these masters; export all three files again when the mark changes.
