# Changelog

What changed in each release of Skill Studio. The app shows this file under Help, What’s New, and the release workflow publishes each version’s entry as its GitHub release notes.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Results opens with the version lift: the latest version's mean, what it gained since the first version, and a ribbon from one score to the other, over the same writer's score without the skill.
- A run counts its outputs as they are written, under its line at the foot of the sidebar ("3/6").
- A skill being run says so on its row in the Library.
- Graded rules on Write and Scoring are numbered "01", "02" in mono, so a rule is easy to find again.

### Changed

- A new look. The sidebar is near-black in both themes, and the page is a warm off-white in the light theme and near-black in the dark one.
- The next step at the top right is lime, the one lime control in the window. A running job's dot in the sidebar is lime too.
- Scores, costs and times in tables are set in mono, so digits line up down a column. Score chips have small 5px corners.
- A pressed choice (a theme, an install toggle, a vote between two outputs) is filled solid, the same everywhere. Good and Bad marks stay green and red.
- Fields have a light fill, so they are easy to find on the page.
- The welcome opens on a dark cover with the new mark, and each step of the tour shows its number large.
- A new app icon: the Flow mark, two ribbons on near-black.

### Fixed

- Results fits a 720px window: the "×2" beside a score folds away below 1024px, and the score still says it to a screen reader.
- Like the other verdicts, a failing message on Agreement colors only its heading.

## [0.1.0] - 2026-11-05

### Added

- The app updates itself: it looks for a new version when it opens and every few hours, downloads it in the background, and shows **Restart to update** at the foot of the sidebar. Rest the pointer on the button to read what the update brings.
- **What’s New**, under Help: a window with every release, its date and what changed. It also shows where an update stands and the one step that moves it on.
- **Check for Updates…** in the app menu on macOS, and under Help on Windows and Linux.
- Settings, Updates: let the app look for new versions on its own, or only when you ask.
- Settings, Start over, in test versions only: put the app back to how it opens the first time, to try a release from its first launch. Your skills and your stored keys stay.
- The Library looks for skills again each time you come back to the window, and when you press the round arrow beside **New skill**.
- **Reveal in Finder**: the folder icon at the end of a skill’s row in the Library shows its folder in Finder, in File Explorer on Windows, or in your file manager on Linux. For the open skill, the same step is at the foot of the skill list at the top of the sidebar.
- **Write checks with AI**, under a case’s checks: it writes new checks from the case and adds them to the list.

### Changed

- The Library’s columns stay where they are while you search, and line up between **In progress** and the list under it. **Yours**, **Installed** and **All** replace the checkbox for skills installed from elsewhere.

### Fixed

- Quitting the app no longer leaves a run or an assistant reply working in the background. The agent it started ends with the app.
- Sending a “write with AI” request with the arrow no longer saves the case, the version or the new skill behind it. On Cases it dropped the check being written and said “Saved”.
- A “write with AI” reply stops when you close it, discard it or leave the screen. Stop works from the moment a request is sent.
- The one-click requests fit the field: writing for an empty one, edits for one with text.
- When the assistant cannot be reached it says why and offers **Try again**. It asked you to connect a provider before.
- A reply no longer writes forever when the app’s background process restarts. It fails, and you can ask again.
- A picture dropped on a “write with AI” request on Cases is no longer added to the case as well.

## [0.1.0-beta.2] - 2026-11-05

### Added

- A welcome on first launch, in a small window of its own: what the app is for, one button, and a tour of the loop in six steps, one step to a screen.
- A help button at the top right of every screen: what the screen is for, what its words mean, and the way to the guide and the assistant.
- A hint under the top bar the first time each screen opens. Turn hints off, or bring them all back, under Settings, Help.
- Delete a version from the Versions screen, with its saved copy, its runs and their reviews. The toast that follows offers Undo.

### Changed

- The practice skill opens on the step in hand, so the first thing in view is the one thing to do.

## [0.1.0-beta.1] - 2026-11-05

### Added

- The first public release, for macOS, Windows and Linux.
- Write a skill and its reference files, formatted in place or as Markdown, and save named versions to compare and restore.
- Cases: the task an agent gets, what a good answer does, the checks a judge holds it to, and pictures where they help.
- Runs with Claude Code or Cursor's agent, graded by code checks and Jev judge packs.
- Review: rate outputs blind, compare two side by side, read transcripts, and see where your ratings and the judge disagree.
- An assistant that writes with you in every text area and in a side panel, through Anthropic or OpenAI.
- A practice skill and a guide that walk the whole loop.
