# Releasing

A release is a `v*` tag on `main`. The `release` workflow runs the checks, packages the app for macOS (arm64 and x64, signed and notarized), Windows and Linux, and publishes one GitHub release. A version with a suffix, such as `1.2.0-beta.1`, is published as a prerelease.

A release is permanent. The repository refuses to move or delete a `v*` tag, and a published release cannot be changed. When a release run fails for a reason outside the code, run its failed jobs again. Otherwise fix the code and release the next version.

## Cut a release

[release-plan.md](release-plan.md) tracks what goes into the next release and the checks before it. Work through its release checklist; these are its steps in detail.

1. In [CHANGELOG.md](../CHANGELOG.md), rename `## [Unreleased]` to the version and the day, such as `## [1.2.0] - 2026-11-05`, start a new `## [Unreleased]` above it, and commit. The workflow refuses a version with no entry.
2. Bump, tag and push:

```
pnpm version minor -m "Release %s"    # or patch, major, prerelease, or an exact version
git push --follow-tags
```

`pnpm version` commits and tags `vX.Y.Z`. From a prerelease such as `0.1.0-beta.2`, `prerelease` gives `0.1.0-beta.3` and `patch` gives the stable `0.1.0`.

The workflow refuses a tag that does not match `package.json` or is not on `main`. To release the version already in `package.json`, tag it by hand: `git tag -a v0.1.0 -m "Release 0.1.0"`, then `git push origin v0.1.0`.

The changelog entry becomes the release's notes in three places: the What's New window in the app, the GitHub release, and the update files (`latest*.yml`), where a running copy reads what an update brings before it installs. `pnpm exec tsx scripts/release-notes.ts` prints the entry for the version in `package.json`.

## Rehearse

`gh workflow run release` builds every platform, keeps the files as workflow artifacts for 7 days, and publishes nothing. It needs a changelog entry for the version in `package.json`.

## Signing secrets

The Mac job reads its secrets from the `release` environment. A tag fails when `CSC_LINK`, `APPLE_API_KEY`, `APPLE_API_KEY_ID` or `APPLE_API_ISSUER` is missing; a rehearsal then builds unsigned.

The environment must be limited to `v*` tags and the `main` branch. Without that limit, anyone who can push a branch can name the environment in a workflow of their own and read the certificate, or run a rehearsal on their branch and download a signed, notarized build of it. With it, GitHub refuses the Mac job of a run from any other branch, so a rehearsal is run from `main`.

| Secret | Value |
| --- | --- |
| `CSC_LINK` | The Developer ID Application certificate with its key, exported from Keychain Access as a `.p12`, in base64 |
| `CSC_KEY_PASSWORD` | The password of that `.p12` |
| `APPLE_API_KEY` | The text of an App Store Connect API key (`AuthKey_<id>.p8`): a team key with the Developer role |
| `APPLE_API_KEY_ID` | The ID of that key |
| `APPLE_API_ISSUER` | The issuer ID shown above the list of keys |

```
gh api -X PUT repos/milesroxas/skill-studio/environments/release --input - <<'JSON'
{ "deployment_branch_policy": { "protected_branches": false, "custom_branch_policies": true } }
JSON
gh api -X POST repos/milesroxas/skill-studio/environments/release/deployment-branch-policies \
  -f name='v*' -f type=tag
gh api -X POST repos/milesroxas/skill-studio/environments/release/deployment-branch-policies \
  -f name=main -f type=branch
base64 -i DeveloperID.p12 | gh secret set CSC_LINK --env release
gh secret set APPLE_API_KEY --env release < AuthKey_XXXXXXXXXX.p8
gh secret set CSC_KEY_PASSWORD --env release     # each of these three asks for the value
gh secret set APPLE_API_KEY_ID --env release
gh secret set APPLE_API_ISSUER --env release
```

To check the limit, `gh api repos/milesroxas/skill-studio/environments/release/deployment-branch-policies` lists two policies: `v*` of type `tag` and `main` of type `branch`. A required reviewer on the environment (Settings, Environments, release) holds it further: each Mac job then waits for that person's approval.

[SECURITY.md](../SECURITY.md#checking-a-download) says what is signed and how a download is checked.

## Updates

A packaged copy updates itself from these releases through [electron-updater](https://www.electron.build/auto-update). It reads the release's `latest*.yml`, so those files and the `.zip` (macOS), `.exe` (Windows) and `.AppImage` (Linux) must stay in every release under the names electron-builder gave them. A copy on a `beta` version follows prereleases and stable releases. A copy on a stable version follows stable releases only.

The updater is `src/interfaces/electron/main/updater.ts`, and the state every window shows is worked out in `src/domain/update.ts`. Both are tested without Electron. A development build does not update itself.

To watch a real update, package a copy under an older version and open it. It finds the newest release on GitHub and downloads it.

```
pnpm build
pnpm exec electron-builder --mac zip --arm64 --publish never -c.extraMetadata.version=0.3.0
codesign --force --deep --sign - "dist/mac-arm64/Skill Studio.app"    # Apple silicon starts no unsigned app
open "dist/mac-arm64/Skill Studio.app"
```

Give the copy a stable version older than the latest release. It finds and downloads the update, and the checksum is checked; then Squirrel.Mac refuses it, because macOS installs an update only over a copy signed by the same Developer ID. Such a copy never shows **Restart to update**.

To see the whole path once a release is out, open the previous release's own download on a scratch home:

```
gh release download v0.4.0 -p 'skill-studio-0.4.0-mac-arm64.zip' && ditto -x -k skill-studio-0.4.0-mac-arm64.zip old
SKILL_STUDIO_HOME="$PWD/home" "old/Skill Studio.app/Contents/MacOS/Skill Studio" --user-data-dir="$PWD/profile"
```

Put `{"welcomed": true}` in `home/.skill-studio/preferences.json` first, so it opens on the app window. Within a minute the sidebar's foot shows **Restart to update**.

- Leave `HOME` as it is. With `HOME` moved, macOS cannot find the login keychain and asks to "Reset To Defaults"; press Cancel if it does.
- Quitting a copy that holds a downloaded update installs the update over that copy, owned by root, so its folder then needs `sudo` to delete. A copy outside `/Applications` never touches the installed one.

## Start over

To meet a release as a newcomer does, use **Reset Skill Studio…** under Start over, the last section of Settings. Only a development build and a prerelease offer it (`canReset` in `src/domain/reset.ts`).

It deletes `~/.skill-studio/` (the walkthrough's skill included), `~/.skill-tester/library.json`, the window's place, and the page's storage and cache, then opens the app on the welcome. Your skills and stored keys stay. A development build shares these files with an installed copy, so a reset in one resets both.

## The app icon

The icon comes from the Flow brand kit and is drawn in `build/icon-src/`: `mac.svg` becomes `build/icon.icns`, and `tile.svg` becomes `build/icon.ico` and `build/icon.png`. `mark.svg` is the mark alone. Every size is exported from these masters; export all three files again when the mark changes.
