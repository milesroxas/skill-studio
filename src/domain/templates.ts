/**
 * Starting points, so no screen opens on a blank text area: skill templates
 * with sample cases, snippets the editor inserts, worked examples of a good
 * check, and the first text of a new reference file. Every template follows
 * the same rules it asks the agent to follow: one rule per top-level bullet,
 * numeric or absolute, each with its why. Pure data and string functions.
 */
import type { CaseDraft } from './schemas.ts'
import { frontMatterBlock, stripComments, stripFrontMatter } from './text.ts'

export const TEMPLATE_IDS = ['blank', 'writing', 'code', 'workflow', 'design'] as const
export type TemplateId = (typeof TEMPLATE_IDS)[number]

/** What a new skill is written from: its description, judge packs, SKILL.md body and cases. */
export interface SkillStart {
  /** The front-matter description when the author gives none. */
  description: string
  /** Judge packs that fit this kind of skill, in order. */
  packs: string[]
  /** SKILL.md below the front matter. `{{title}}` is the skill's title. */
  body: string
  /** Sample cases, written when the skill is created with samples. */
  cases: CaseDraft[]
}

export interface SkillTemplate extends SkillStart {
  id: TemplateId
  label: string
  /** One sentence under the picker: what kind of skill this starts. */
  summary: string
}

/** A finished case in one line per part: the templates, the Cases screen's examples and the practice skill share it. */
export const kase = (
  id: string,
  title: string,
  prompt: string,
  expectedOutcome: string,
  checks: string[],
  words: [number, number] | null = null,
): CaseDraft => ({
  id,
  title,
  prompt,
  expectedOutcome,
  words,
  images: [],
  graders: checks.map((statement) => ({ id: null, statement, weight: 1, image: null })),
})

/** The shape of a graded rule, in one line: the templates say it, and so does the assistant. */
export const RULE_SHAPE =
  'one rule per top-level bullet, numeric or absolute, with its why in the same bullet. Every top-level bullet of four words or more is graded. Steps and checklists go in numbered lists, which are not graded.'

const GUIDE = `<!-- Replace the example rules with yours and keep the shape: ${RULE_SHAPE} -->`

/** The six principles a rule is written and checked by, as Help me improve and the lint name them. */
const PRINCIPLES = ['process', 'why', 'strict', 'earns', 'focused', 'tested'] as const
export type Principle = (typeof PRINCIPLES)[number]

/** How to write a rule an agent follows: the advice beside the editor, what the assistant writes by, and what Auto refine checks. */
export const RULE_GUIDE: ReadonlyArray<{ id: Principle; lead: string; text: string }> = [
  {
    id: 'process',
    lead: 'Encode process, not outcome.',
    text: '“Lead with the change for the reader” beats “write clearly”. The agent can walk a step; it cannot measure an adjective.',
  },
  {
    id: 'why',
    lead: 'Write the why in the same bullet.',
    text: 'A rule with its reason generalises to cases you did not write down. A bare rule is applied blindly.',
  },
  {
    id: 'strict',
    lead: 'Be numeric or absolute.',
    text: '“20 words or fewer”, “never”, “always”. “Reasonably” and “where appropriate” change nothing.',
  },
  {
    id: 'earns',
    lead: 'Every line must change what the agent does.',
    text: 'Cut definitions of things it knows. Attention spent there is taken from your rules.',
  },
  {
    id: 'focused',
    lead: 'One skill, one aspect.',
    text: 'Writing, code, workflow or design. A skill that covers everything is followed on nothing.',
  },
  {
    id: 'tested',
    lead: 'Test it by running it.',
    text: 'A rule is a hypothesis until a run shows it held. Change one rule, run again, compare.',
  },
]

/** The guide entry for a principle. */
export const principleGuide = (id: Principle): { lead: string; text: string } =>
  RULE_GUIDE.find((item) => item.id === id) ?? RULE_GUIDE[0]

/** What a case's prompt is, under its field and in the assistant's brief. */
export const CASE_PROMPT_HINT =
  'Exactly what the agent is asked, as a user would ask it. Do not mention the skill.'

export const TEMPLATES: readonly SkillTemplate[] = [
  {
    id: 'blank',
    label: 'Blank',
    summary: 'A title and an empty Rules section. Pick this when you know the shape you want.',
    description: 'What the skill does. Use when ...',
    packs: ['generic'],
    body: `# {{title}}

<!-- Write for the agent that loads this skill. Each top-level bullet under Rules is one graded rule. -->

## Rules

-
`,
    cases: [],
  },
  {
    id: 'writing',
    label: 'Writing',
    summary: 'Prose others will read: release notes, docs, announcements, summaries.',
    description:
      'Writes release notes and short docs that lead with the change for the reader. Use when asked to announce, document or summarise a change.',
    packs: ['generic', 'writing'],
    body: `# {{title}}

${GUIDE}

## When this applies

The user asks for prose that other people will read: a release note, a docs page, an announcement, a summary of a change.

## Process

1. Name the reader and the one thing they must be able to do after reading.
2. Draft the shortest text that gets them there.
3. Cut every sentence that does not change what the reader does.
4. Read it once as the reader. Fix the first place you had to reread.

## Rules

- Lead with the outcome for the reader, never with background. Readers decide on the first line whether to keep reading.
- One idea per sentence, 20 words or fewer. A longer sentence buries its verb and gets skimmed.
- Never use hedge words such as "reasonably", "where appropriate" or "try to". They give the reader nothing to act on.
- Name the file, command or setting the reader has to touch, spelled exactly as it is. A paraphrase sends them searching.
- Numbers go on their own line or in a table, never inside a sentence. A number mid-sentence is missed on a skim.
- No em dashes and no parentheticals. Split the thought into two sentences instead.
- End when the content ends. No closing summary, no offer of help.
`,
    cases: [
      kase(
        'release-note-export',
        'Release note for the export change',
        'Write the release note for this change: exports now run in the background and the user gets an email with a link when the file is ready. Before, the browser tab had to stay open. Large exports used to time out at 5 minutes; they no longer do.',
        'Tells the user what changed for them in the first line, says what they no longer need to do, and mentions the email with the link. Under 120 words.',
        [
          'The first sentence says what the user can now do, not what the team built.',
          'The note says the user gets an email with a link when the export is ready.',
          'The note does not describe the old timeout in more than one sentence.',
        ],
        [40, 120],
      ),
      kase(
        'docs-page-env-var',
        'Docs page for a new setting',
        'Write the docs section for the new LOG_LEVEL environment variable. Values: error, warn, info, debug. Default: info. It is read once at startup. Changing it needs a restart.',
        'Says what the setting does, lists the values with the default marked, and states that a restart is needed. Reader can set it without asking anyone.',
        [
          'The section names the variable exactly as LOG_LEVEL.',
          'The four values are listed and the default is marked.',
          'The text says a restart is required after a change.',
        ],
        [40, 150],
      ),
      kase(
        'summary-for-manager',
        'Summary of a week for a manager',
        'Summarise this week for my manager in one paragraph: we shipped the new billing page on Tuesday, found and fixed a double-charge bug on Thursday that affected 14 customers who have all been refunded, and the search rewrite slipped to next week because the index migration took two days longer than planned.',
        'One paragraph that leads with what shipped, states the bug and its resolution plainly, and gives the new date for search. No spin.',
        [
          'The summary states that 14 customers were affected and refunded.',
          'The summary gives a new time for the search rewrite.',
          'The summary does not use softening words such as "slightly", "a bit" or "unfortunately".',
        ],
        [50, 130],
      ),
    ],
  },
  {
    id: 'code',
    label: 'Code',
    summary: 'How the agent writes code in a project: conventions, tests, checks.',
    description:
      'Project coding conventions: how to change code, test it and prove it passes. Use when asked to fix, add or refactor code in this repository.',
    packs: ['generic', 'code'],
    body: `# {{title}}

${GUIDE}

## When this applies

The user asks for a code change in this project: a fix, a feature, a refactor, a test.

## Process

1. Read the code you are about to change and the tests that cover it.
2. Reproduce the problem with a failing test or a command before changing anything.
3. Make the smallest change that makes it pass.
4. Run the project's check command. Paste its last line in your answer.

## Rules

- Change the fewest files that fix the problem. Never reformat a line you did not need to touch, so the diff shows only the fix.
- Every new behaviour gets a test in the same change. A fix without a test is a fix that can come back.
- Run the project's check command before you report done, and quote its last line. "Should work" is not a result.
- Match the file's existing style for imports, naming and quotes. A second style in one file costs every later reader.
- Never add a lint, type or test suppression. Fix the cause, or say in one sentence why it cannot be fixed here.
- Name every file you changed in the answer, with the reason for each. The reader reviews from your list, not from the diff.

## Reference

See [references/checks.md](references/checks.md) for the commands this project runs.
`,
    cases: [
      kase(
        'fix-off-by-one',
        'Fix an off-by-one in pagination',
        'The last page of results is missing its final item. The pagination code is in src/lib/page.ts; the slice uses `start + size - 1` as its end. Fix it and make sure it cannot come back.',
        'Changes the slice bound, adds a test that covers the last page, runs the checks and quotes the result.',
        [
          'The answer names src/lib/page.ts as the file changed.',
          'The answer adds or updates a test for the last page.',
          'The answer quotes the output of a test or check command.',
        ],
      ),
      kase(
        'add-flag-to-cli',
        'Add a --dry-run flag to a CLI',
        'Add a --dry-run flag to the deploy command in cli/deploy.ts. With it, the command prints each step it would take and changes nothing. Keep the existing output format for the normal run.',
        'Adds the flag with a test, does not reformat unrelated code, and lists the files changed with why.',
        [
          'The answer lists every file it changed with one reason each.',
          'The answer includes a test for the dry-run path.',
          'The answer does not change the output of a normal run.',
        ],
      ),
      kase(
        'refactor-no-behaviour-change',
        'Extract a helper without changing behaviour',
        'formatPrice is copied in three places under src/ui/. Extract one helper and use it in all three. Behaviour must not change.',
        'One helper, three call sites, existing tests still pass, and the answer says how it knows behaviour is unchanged.',
        [
          'The answer creates one helper and replaces all three copies.',
          'The answer states that existing tests were run and passed.',
          'The answer does not add a lint or type suppression.',
        ],
      ),
    ],
  },
  {
    id: 'workflow',
    label: 'Workflow',
    summary: 'How the agent works: what it reads, confirms and reports, step by step.',
    description:
      'How to work on a task: investigate before changing, confirm before anything destructive, report what was verified. Use at the start of any task in this project.',
    packs: ['generic', 'workflow'],
    body: `# {{title}}

${GUIDE}

## When this applies

Any task that changes files, runs commands or touches a service. Load it first.

## Process

1. Restate the task in one line and name what "done" looks like.
2. Read the files the task touches before you propose anything.
3. If a bug: reproduce it first, with a command or a failing test.
4. Write a plan of three lines or fewer, then start.
5. Report what you verified and how, with the command output.

## Which step next

Is the task a bug?
  Yes: reproduce it before any edit.
  No:
    Does it change more than three files?
      Yes: show the plan and wait for a go-ahead.
      No: make the change, then run the checks.

## Rules

- Read the code you are about to change before you propose a change. A plan written from memory is a guess.
- Reproduce a bug with a command or a failing test before fixing it. A fix without a reproduction cannot be shown to work.
- State the plan in three lines or fewer before the first edit. Longer plans are not read; shorter plans are checked.
- Never run a destructive command such as a delete, reset or force push without asking first. Those cannot be undone.
- Report what was verified and quote the command output, never a summary of it. The reader trusts output, not adjectives.
- Say what you did not do and why, in one sentence each. A silent gap looks like a finished job.
`,
    cases: [
      kase(
        'flaky-test-report',
        'Investigate a flaky test',
        'The test "uploads resume after a dropped connection" in tests/upload.test.ts fails about one run in five on CI. Find out why and fix it.',
        'Runs the test repeatedly to reproduce, names the cause from the code, fixes it, and quotes a passing loop.',
        [
          'The answer shows the test being run more than once before the fix.',
          'The answer names the cause of the flake in the code.',
          'The answer quotes command output after the fix.',
        ],
      ),
      kase(
        'rename-across-repo',
        'Rename a concept across the repository',
        'Rename "customer" to "account" everywhere in src/, including file names. Tests must still pass.',
        'Shows a short plan first because many files change, then does the rename, runs the tests and lists what it left alone.',
        [
          'The answer gives a plan of three lines or fewer before editing.',
          'The answer states that tests were run after the rename and quotes the result.',
          'The answer says what it did not rename, if anything, and why.',
        ],
      ),
      kase(
        'cleanup-old-branches',
        'Clean up old branches',
        'Delete every local git branch that has been merged into main.',
        'Lists the branches first and asks for a go-ahead before deleting, since the deletion cannot be undone.',
        [
          'The answer lists the branches it would delete before deleting any.',
          'The answer asks for confirmation before running the delete.',
          'The answer does not run a force delete without being asked to.',
        ],
      ),
    ],
  },
  {
    id: 'design',
    label: 'Design',
    summary: 'HTML and UI the agent produces: markup, motion, colour, surfaces.',
    description:
      'Builds HTML pages and components that are valid, accessible and feel finished. Use when asked for a page, screen, component or prototype.',
    packs: ['generic', 'design'],
    body: `# {{title}}

${GUIDE}

## When this applies

The user asks for a page, a screen, a component or a prototype in HTML and CSS.

## Process

1. Decide the one thing the page is for and put it first on the screen.
2. Set the colour and spacing tokens on :root before any component.
3. Build the markup, then the styles, then the motion.
4. Open it at phone width and in dark mode before you answer.

## Rules

- Start every page with <!doctype html>, a lang on <html>, a <title> and a viewport meta. Without them the page renders in quirks mode, reads wrong to screen readers, or zooms on phones.
- Use one <main> landmark and heading levels that never skip. Assistive tech navigates by both.
- Every <img> carries alt text, and a decorative image carries alt="". A missing alt is read aloud as the file name.
- Define colours as variables on :root and flip them under prefers-color-scheme: dark. Per-element dark overrides drift apart.
- Animate only transform and opacity, 300ms or less, with an ease-out curve. Anything else drops frames or feels slow.
- Derive a nested radius as the outer radius minus the padding. A copied radius pinches the corner gap.
- Signal depth with a layered translucent shadow, and keep solid borders for dividers and inputs. A border tuned to one background looks wrong on every other.
- Fit the layout to a 360px wide screen with a 16px side gutter and no horizontal scroll. Most first views are on a phone.
`,
    cases: [
      kase(
        'pricing-page',
        'A pricing page with three tiers',
        'Build a pricing page with three tiers: Free, Team at $12 per seat per month, and Business at $30 per seat per month. Each tier lists four features. One call to action per tier. Single HTML file, no framework.',
        'Valid, accessible HTML with a clear hierarchy, dark mode support, and a layout that works at phone width.',
        [
          'The page has a doctype, a lang attribute, a title and a viewport meta.',
          'The page has exactly one <main> and the heading levels do not skip.',
          'Colours are defined as variables on :root and redefined for dark mode.',
          'The layout works at 360px wide without horizontal scrolling.',
        ],
      ),
      kase(
        'settings-form',
        'A settings form',
        'Build a settings form with a display name, an email, a timezone select and a notifications toggle. Show inline validation on the email. Single HTML file.',
        'Every control has a label, the error is announced to assistive tech, and the form reads well in light and dark mode.',
        [
          'Every input has an associated <label>.',
          'The email error is tied to the input with aria-describedby or aria-invalid.',
          'Form field borders are kept as real borders, not replaced with shadows.',
        ],
      ),
      kase(
        'toast-component',
        'A toast notification component',
        'Build a toast component that slides in from the bottom, stays 4 seconds, and can be dismissed. Include a button that triggers it. Single HTML file.',
        'The toast animates with transform and opacity only, under 300ms, respects reduced motion, and is announced with a live region.',
        [
          'The enter and exit animations change only transform and opacity.',
          'The animation duration is 300ms or less.',
          'The toast has role="status" or an aria-live region.',
          'A prefers-reduced-motion rule reduces or removes the movement.',
        ],
      ),
    ],
  },
]

export const templateById = (id: string): SkillTemplate =>
  TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0]

/** Templates with sample cases: the kinds the Cases screen offers examples from. */
export const EXAMPLE_KINDS: readonly SkillTemplate[] = TEMPLATES.filter((t) => t.cases.length)

/** The template whose judge packs the bench uses, for picking examples that fit. */
export function templateForPacks(packs: readonly string[]): SkillTemplate {
  const match = EXAMPLE_KINDS.find((t) => t.packs.some((p) => p !== 'generic' && packs.includes(p)))
  return match ?? EXAMPLE_KINDS[0]
}

/** A skill title from its name: `release-notes` reads as `Release notes`. */
const titleOfName = (name: string): string =>
  name.replace(/[-_]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

/** The template's SKILL.md body for a skill of this name. */
export const templateBody = (template: Pick<SkillStart, 'body'>, name: string): string =>
  template.body.replace(/\{\{title\}\}/g, titleOfName(name))

/**
 * True when SKILL.md says nothing yet: below the front matter there are only
 * headings, comments, empty bullets and whitespace. The editor then offers a
 * template in place of a blank page.
 */
export function isScaffold(skillMd: string): boolean {
  const body = stripComments(stripFrontMatter(skillMd))
    .replace(/^#{1,6}\s.*$/gm, '')
    .replace(/^[-*]\s*$/gm, '')
  return body.trim() === ''
}

/** SKILL.md with its front matter kept and the body replaced by the template's. */
export function applyTemplate(skillMd: string, template: SkillTemplate, name: string): string {
  const front = frontMatterBlock(skillMd)
  return `${front ? `${front.trimEnd()}\n\n` : ''}${templateBody(template, name)}`
}

/** Text the editor inserts at the cursor. `|` marks where the cursor lands. */
export interface Snippet {
  id: string
  label: string
  text: string
}

export const SNIPPETS: readonly Snippet[] = [
  {
    id: 'rule',
    label: 'Rule',
    text: '- |What to do, numeric or absolute. Why it matters, in the same bullet.\n',
  },
  {
    id: 'tree',
    label: 'Decision tree',
    text: `## Which to choose

Is the |first question true?
  Yes: do this.
  No:
    Is the second question true?
      Yes: do that.
      No: default.
`,
  },
  {
    id: 'process',
    label: 'Process',
    text: `## Process

1. |First step, as an instruction.
2. Second step.
3. Last step: how to check the result.
`,
  },
  {
    id: 'reference',
    label: 'Reference link',
    text: 'See [references/|name.md](references/name.md) for the longer material.\n',
  },
]

/** The snippet's text and where the cursor goes, as an offset into it. */
function snippetText(snippet: Snippet): { text: string; cursor: number } {
  const { text } = snippet
  const cursor = text.indexOf('|')
  if (cursor < 0) return { text, cursor: text.length }
  return { text: text.slice(0, cursor) + text.slice(cursor + 1), cursor }
}

/**
 * `text` with `insert` placed over the selection `[start, end)`, on a line of
 * its own when the snippet is a block. Returns the new text and cursor.
 */
export function insertAt(
  text: string,
  start: number,
  end: number,
  snippet: Snippet,
): { text: string; cursor: number } {
  const { text: insert, cursor } = snippetText(snippet)
  const before = text.slice(0, start)
  const after = text.slice(end)
  // A block snippet starts a new line; a lone rule joins a list it lands in.
  const lead = before === '' || before.endsWith('\n') ? '' : '\n'
  const tail = after === '' || after.startsWith('\n') ? '' : '\n'
  return {
    text: `${before}${lead}${insert}${tail}${after}`,
    cursor: before.length + lead.length + cursor,
  }
}

/** A worked example of a check: the vague form, the form the judge can mark, and why. */
export interface CheckExample {
  bad: string
  good: string
  why: string
}

export const CHECK_EXAMPLES: readonly CheckExample[] = [
  {
    bad: 'The answer is clear and well written.',
    good: 'The first sentence says what changed for the user.',
    why: 'A judge can find a first sentence and read it. It cannot measure "clear".',
  },
  {
    bad: 'The code is tested.',
    good: 'The answer adds or updates a test for the last page.',
    why: 'Names the thing to look for. "Tested" is true of almost any answer that mentions tests.',
  },
  {
    bad: 'The answer follows the skill.',
    good: 'The answer quotes the output of the check command.',
    why: 'One check, one fact. Rule adherence is already scored, one rule at a time.',
  },
]

/** The first text of a new reference file, so it opens with a shape rather than a blank. */
export function referenceTemplate(path: string): string {
  const name = path.replace(/^references\//, '').replace(/\.\w+$/, '')
  return `# ${titleOfName(name)}

<!-- Longer material SKILL.md points to. Say first when the agent should read this, then give the material. Bullets here are not graded. -->

Read this when ...

`
}
