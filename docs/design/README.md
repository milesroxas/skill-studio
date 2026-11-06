# Design system

Skill Studio looks like a print proof: ink on porcelain stock, hairline rules, one fluorescent mark for what is live. The sidebar is the app icon's ink ground and the page is the paper it prints on. Color says only two things: how something stands (green works or passes, amber needs action, red is broken or failing) and what is running or next (lime).

Read this file before any change to `src/renderer`. Then read only the topic files your task touches.

**Target and today.** These docs describe the system after the redesign. A name that is not built yet is marked **(phase N)** where it appears, and listed under "Not in code yet" below. Until its phase merges, use what the code has today, and never write a call site against a planned name: it will not compile.

## Five rules that hold everywhere

1. **Tokens only.** A component uses a semantic token class (`bg-background`, `text-muted-foreground`, `border-border`). Never a hex, `rgb()`, `oklch()` or an arbitrary color (`bg-[#141615]`) outside `src/renderer/styles.css`. One raw value is one place the next theme change misses.
2. **No styling at call sites.** A screen composes components and names variants. If a screen needs a `className` that sets color, size, radius, shadow or font, the variant is missing: add it to the component, then use it. Layout classes (`flex`, `gap-*`, `min-w-0`) are the only exception.
3. **Closed sets.** Each topic file lists every variant that exists. A variant not listed there does not exist. Do not invent one in a call site, and do not pass one the union type rejects.
4. **Lime is a signal, not a decoration.** `signal` marks exactly three things: the next step, a running job, and the one slab in the welcome. One lime element per window, a running job's dot excepted. Two lime elements means neither is the next thing to look at. See [color.md](color.md).
5. **Regions are never cards.** A screen is `Screen`, `Workbench` columns or `FormSection`, divided by hairlines. `Card` is for an object a person compares or picks up, such as `OutputCard`. See [layout.md](layout.md).

## Index

| File | Read it when you touch |
| --- | --- |
| [color.md](color.md) | any color, a surface, a border, a shadow, the dark theme, the ink sidebar |
| [typography.md](typography.md) | text size, weight, mono, numbers, headings, labels |
| [layout.md](layout.md) | a screen's structure, the shell, columns, empty and loading states |
| [buttons.md](buttons.md) | a button, a link, an action in a row or a table |
| [forms.md](forms.md) | an input, a choice, a toggle, a form section |
| [data.md](data.md) | a table, a score, a status, a count |
| [brand.md](brand.md) | the mark, the ribbon, the welcome, the app icon |
| [redesign-plan.md](redesign-plan.md) | the move from the old theme to this one, phase by phase |

## Not in code yet

These names are the target. Each lands in the phase named in [redesign-plan.md](redesign-plan.md). Until its phase is merged, a name here does not exist: do not use it. When a phase merges, delete its lines from this list and its **(phase N)** markers in the topic files, in the same pull request.

| Name | Phase |
| --- | --- |
| `data-surface="ink"` | 2 |
| `Button variant="signal"`, `Text caps` | 3 |
| `rounded-xs` badges, mono in `numeric` cells and `TotalChip` | 3 |
| Ink fill on a pressed `Segmented` and `Toggle variant="outline"`, `bg-card` inputs | 3 |
| `Stepper` `width` and `labelledBy` | 3 |
| The ribbon `Mark`, the `Slab` | 4 |

Still in code and due to go: `--brand` (`#ffe500`), `--brand-ink`, `Highlight` in `components/Mark.tsx`. Do not add a use of them.

## Before you say a UI change is done

Run each check. Each one is a command or a look, not a judgment.

1. `pnpm check` passes.
2. `grep -rnE '#[0-9a-fA-F]{3,8}\b|oklch\(|rgba?\(' src/renderer --include='*.tsx' --include='*.ts'` prints only `images.ts:43` (a JPEG's white ground).
3. `grep -rnoE '(text|bg|border|fill|stroke)-\[[^]]+\]' src/renderer --include='*.tsx'` prints only `text-[length:inherit]` in `ui/button.tsx`.
4. The screen has at most one `signal` element besides a running job's dot.
5. You looked at the screen in the light theme and the dark theme, at 1280 x 860 and at the 720 x 480 minimum.
6. Every text pair you added meets 4.5:1. [color.md](color.md) lists the pairs already checked.
