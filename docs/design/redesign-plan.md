# Redesign plan: the Flow brand

Moves the app from the old theme (warm paper at hue 85, Geist, yellow `#ffe500`) to the system in this folder. Proposals for every phase are drawn in Paper: file "Scratchpad", page "Skill Studio" (Write, Results, Library, and seven welcome frames).

## How to run it

- One pull request per phase, in order. Each phase leaves the app shippable.
- Others push to `main`. Branch from a fresh `main`, keep the phase small, rebase before merge.
- Each phase ends with its checks and with the "Before you say a UI change is done" list in [README.md](README.md).
- When a phase merges, delete its lines from "Not in code yet" in [README.md](README.md).
- The codebase is already on tokens: one raw color in `src/renderer` (`images.ts:43`). So most of this plan is values and a few variants, not a rewrite. If a phase needs more than the files it lists, stop and say why.

## Phase 0: decided

Miles, 2026-11-05:

| Decision | Answer |
| --- | --- |
| Sans family | keep Geist and Geist Mono. The kit's Inter is not used. |
| The sidebar is ink in the light theme | yes |
| Chips become square (`rounded-xs`) and numbers mono | yes |

The Paper proposals are drawn in Inter. Read their type sizes and weights, not their family.

## Phase 1: tokens

Files: `src/renderer/styles.css`, `src/interfaces/electron/main/window.ts`, `src/renderer/index.html`.

1. Replace the `:root` and dark token values with the table in [color.md](color.md). Keep every token name. In this phase set `--sidebar` to `oklch(0.936 0.011 95)` and `--sidebar-accent` to `oklch(0.917 0.011 95)` in the light scope: the ink sidebar needs phase 2's scope, and ink without it puts dark grey text on ink.
2. Add `--signal`, `--signal-foreground` to `:root` and `--color-signal`, `--color-signal-foreground` to `@theme inline`. Add `--tracking-caps: 0.08em`. Leave `--brand` and `--brand-ink` until phase 4 removes their last use.
3. Rewrite the header comment of `styles.css`, which describes the old theme (hue 85, the yellow icon). Fonts do not change.
4. `paint.ts` (main process): `BACKGROUND = { light: '#F4F2EB', dark: '#141615' }`. `index.html`: the two `theme-color` metas take the same values. These are first-paint colors outside CSS, so they are hex by necessity. `paint.test.ts` fails if either drifts from `--background` in `styles.css`.

Checks: both themes at every screen. No text pair below the table in [color.md](color.md). The focus ring is visible on a button, an input and a nav item. The window does not flash white or yellow on launch.

## Phase 2: the ink surface

Files: `src/renderer/styles.css`, `src/renderer/components/Shell.tsx`, `src/renderer/components/Jobs.tsx`.

1. Add the ink scope: a rule for `[data-surface="ink"]` that sets every token in the "Dark and ink" column, with `--background: var(--sidebar)`, the dark `--elevation-*` values and `color-scheme: dark`.
2. Extend `@custom-variant dark` so `dark:` utilities also match `[data-surface="ink"]` and its descendants.
3. Light scope: `--sidebar: oklch(0.198 0.004 165)`, `--sidebar-accent: oklch(0.29 0.004 165)`.
4. `Sidebar` in `Shell.tsx` gets `data-surface="ink"`. Remove its `border-r`: ink against porcelain needs no rule.
5. `Jobs.tsx`: the running dot is `bg-signal`.

This CSS is not tested. Before anything else, open devtools on a `NavItem` in the light theme and confirm the computed `--foreground` is porcelain and `--muted-foreground` is `oklch(0.78 0.012 130)`.

Checks: everything that renders inside the sidebar, in both themes: `SkillSwitcher` trigger, each `NavItem` state (rest, hover, current, focus), the `warning` dot, `JobsIndicator` running, done and failed, the update notice in `SidebarFooter`'s `lead`. A popover opened from the sidebar is paper, not ink. The macOS window buttons are readable on ink.

## Phase 3: components

Files: `components/ui/button.tsx`, `ui/badge.tsx`, `ui/table.tsx`, `ui/toggle.tsx`, `ui/toggle-group.tsx`, `ui/input.tsx`, `ui/textarea.tsx`, `ui/select.tsx`, `components/Scores.tsx`, `components/text.tsx`, `components/Shell.tsx`, `App.tsx`.

1. `Button`: add `signal: 'bg-signal text-signal-foreground hover:bg-signal/85'`. `App.tsx`: the next-step button becomes `variant="signal"`, and its `<Text tone="muted">Next:</Text>` becomes plain text (`muted-foreground` fails on lime in the dark scope).
2. `Badge`: base `rounded-full` becomes `rounded-xs`. `TotalChip` adds mono.
3. `TableCell numeric` adds `font-mono text-code`; a head cell stays sans. Columns that used `numeric` only to sit right (a date, actions) take a new `trailing` variant and stay sans. Check every numeric column still fits at 720px.
4. `Toggle variant="outline"` and `Segmented`: pressed is `bg-primary text-primary-foreground`. The `default` (toolbar) and `filter` variants do not change. Read `toggle-group.tsx` first: the pressed style may be set there.
5. `Input`, `Textarea`, the `Select` trigger: `bg-transparent` becomes `bg-card` in the light scope. Keep the `dark:bg-input/30` they have.
6. `Text`: add `caps: { true: 'text-2xs font-medium uppercase tracking-caps', false: '' }`. `SidebarSection`'s label becomes `<Text caps tone="muted">`: `faint` is 3.05:1.
7. `Stepper` in `forms.tsx`: add `width` (`full` default, `auto`) and `labelledBy`, so it can sit in a `Field` tied to its visible `Label`. Its fill becomes `bg-card` with the inputs.

Checks: one `signal` element per window. `Segmented` in Settings and the Write screen's mode switch read the same pressed state. Library's install toggles are readable in both states.

## Phase 4: brand surfaces

Files: `components/Mark.tsx`, `screens/Welcome.tsx`, `components/LoopTour.tsx`, `styles.css`, `window.ts`, `build/`.

1. `Mark`: replace the yellow tile and three bars with the two ribbon paths in [brand.md](brand.md), `fill-current`. Keep `animate-draw`, lower ribbon first.
2. Replace `Highlight` with `Slab`: `bg-signal text-signal-foreground`, no rotation, drawn with `animate-draw` over an ink copy of the word (so the word reads before the slab lands; `swipe` and `settle` go with the old mark). Update its two uses (`Welcome.tsx`, `LoopTour.tsx`). Remove `--brand`, `--brand-ink`, `--color-brand*`. `pnpm fallow` must find no dead export.
3. `Welcome.tsx` opening: the frame carries `data-surface="ink"`, left-aligned, the mark cropped by the right and bottom edges, the version in mono from the app's real version.
4. `LoopTour.tsx`: step numeral, `TourProgress` as six mono numbers, `Sheet` with `border-foreground` and no shadow. Copy does not change.
5. `window.ts`: the welcome window's `backgroundColor` is the ink value (`BACKGROUND.dark`).
6. Copy the kit's `build/icon.icns`, `icon.ico`, `icon.png` over `build/`, and its SVG masters into `build/icon-src/`. Add the mark to the sidebar's drag strip on macOS.

Checks: the welcome at zoom level 0.5 (about 110%): the last step is not cut off. Reduced motion shows every frame complete. Build once and look at the icon in Finder, the Dock and at 16px.

## Phase 5: every screen

No new variants. For each screen: open it in both themes at 1280 x 860 and 720 x 480, with the seeded skills and with a large real library, and fix what the checklist finds.

`Editor` (Write), `Versions`, `Cases`, `Generate` (New run), `Overview` (Results), `Blind`, `Compare`, `Transcript`, `Insights` (Agreement), `Knobs` (Scoring), `Library`, `Docs` (Guide), `Settings`, `Changelog`. Then `Assist`, `Chat`, `Composer`, `Help`, `Update`, `Toast`, `ResetDialog`, `PracticeGuide`, `OutputCard`, the Markdown editor.

Then: `pnpm guide:shots` and commit every image (all of them changed this time), check `docs/guide.md` and `README.md` still describe what the pictures show, and add a `CHANGELOG.md` entry. A release fails without one.

## Phase 6: additions, each its own decision

These are in the Paper proposals and are new features, not restyling. Each needed its data checked first. Built 2026-11-05:

| Addition | How |
| --- | --- |
| Version lift figure on Results | `versionLift` in `domain/lift.ts` picks one writer's run on the first and on the latest version (the writer whose latest run is newest) and its latest run without the skill. `VersionLift` in `components/Lift.tsx` draws it. Rules in [brand.md](brand.md). |
| "Running 4/6" tag on a Library row | `Job` carries `skillPath` and `progress` (`domain/views.ts`). A run sizes its job (cases × samples × writers, plus one per writer for grading) and steps it per output and per grading (`sizeJob`, `stepJob` in `application/jobs.ts`); a writer that fails counts off what it will never do. `Job.skillPath` is the real path, as the Library lists it. `RunningTag` in `components/Jobs.tsx`. |
| Progress bar under the sidebar's job line | the same count, in `JobsIndicator`. The bar is foreground, not lime: the dot already says running. |
| Numbered graded rules on Write | `List variant="number"`: "01" in mono, hanging in the margin, also on Scoring and in the welcome's picture |

## Risks

- **CSP.** `style-src 'self'` plus a nonce for CodeMirror. A font package is a bundled stylesheet and is fine. A library that injects a `<style>` tag is not.
- **`font-synthesis: none`.** Geist's variable file covers weights 100 to 900, but has no italic. Italic text shows upright everywhere except the Markdown editor.
- **Fixed welcome window.** It is laid out for exactly 760 x 600 and scaled by zoom. Display type that fits at 100% can clip at 110%.
- **Two scopes of dark.** A component tested only in the dark theme can still break in the ink sidebar of the light theme, where the page around it is paper.
- **Guide pictures.** `pnpm guide:shots` rewrites images. Outside phase 5, keep only the ones whose screen changed.
