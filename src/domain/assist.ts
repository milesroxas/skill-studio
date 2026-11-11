/**
 * What the assistant is asked and what it must hand back. Every text area in
 * the app is one kind of field, and each kind states the shape its text has:
 * a SKILL.md is rules in the graded form, a check is one fact Jev can
 * mark, a description says when to load the skill. A list is a kind too: its
 * reply is new items, one per line. The reply is one JSON object with the
 * field's text, so no greeting or explanation can land in a field, and the
 * text is then fitted to the field before anything shows it. Pure data and
 * functions.
 */

import { CHANGES_GUIDE } from './changes.ts'
import type { ImageRef } from './image.ts'
import { byFileOrder, isEditablePath } from './paths.ts'
import { type CaseDraft, NEW_CASE_KEY, type SkillDrafts } from './schemas.ts'
import { CASE_PROMPT_HINT, CHECK_EXAMPLES, RULE_GUIDE, RULE_SHAPE } from './templates.ts'
import { closesFence, fenceOf, frontMatterBlock, LIST_MARK } from './text.ts'

export const ASSIST_FIELD_IDS = [
  'skill.file',
  'skill.reference',
  'skill.passage',
  'skill.description',
  'case.prompt',
  'case.expected',
  'case.check',
  'case.checks',
] as const
export type AssistFieldId = (typeof ASSIST_FIELD_IDS)[number]

export interface AssistFieldDef {
  /** What the field holds, as its control names it: "Write the prompt". */
  name: string
  /**
   * `line`: one line, never a line break. `block`: a few lines of prose.
   * `file`: a whole Markdown file, shown as a change to the one there.
   * `items`: new items for a list, one per line, added to those it has.
   */
  form: 'line' | 'block' | 'file' | 'items'
  /** The shape the text must have, written for the model. */
  shape: string
  /**
   * Requests offered in one click, so the common ones are never typed: `write`
   * for an empty field, `edit` for one with text, which the reply replaces. A
   * list is only ever written to.
   */
  suggestions: { write: readonly string[]; edit: readonly string[] }
}

const RULES = [
  `Rules: ${RULE_SHAPE}`,
  ...RULE_GUIDE.map((item) => `${item.lead} ${item.text}`),
].join('\n- ')

const CHECKS = CHECK_EXAMPLES.map(
  (example) => `Not "${example.bad}" but "${example.good}" ${example.why}`,
).join('\n- ')

/** What one check is, for the field that holds one and the list that takes several. */
const CHECK = `a single statement a good answer makes true, that Jev, the grader, can mark by reading the answer. One fact per check, naming the thing to look for, in one sentence that starts "The answer", "The note" or the like.
- ${CHECKS}`

export const ASSIST_FIELDS: Record<AssistFieldId, AssistFieldDef> = {
  'skill.file': {
    name: 'SKILL.md',
    form: 'file',
    shape: `A complete SKILL.md: the file an agent loads to follow this skill.
- It opens with the front matter block between two --- lines, holding name and description. Keep the block that is there unless the request is about it.
- Below it: a # title, a "## When this applies" section of one or two sentences, a "## Process" numbered list when the work has steps, and a "## Rules" section.
- ${RULES}`,
    suggestions: {
      write: ['Draft rules for this skill', 'Write a process with three steps'],
      edit: ['Tighten every vague rule', 'Add the why to each rule', 'Cut what changes nothing'],
    },
  },
  'skill.reference': {
    name: 'the reference file',
    form: 'file',
    shape: `A reference file: longer material SKILL.md points to, as Markdown.
- It opens with a # title, then one sentence that starts "Read this when" and says when the agent should open it.
- Then the material itself: tables, examples, long lists. Bullets here are not graded, so write for lookup, not as rules.`,
    suggestions: {
      write: [],
      edit: ['Shorten it', 'Add a worked example', 'Turn the prose into a table'],
    },
  },
  'skill.passage': {
    name: 'the selection',
    form: 'block',
    shape: `Only the text that replaces the selected passage of a skill file, as Markdown that reads right where the selection was. Match the list markers, heading levels and voice of the file around it.
- ${RULES}`,
    suggestions: { write: [], edit: ['Make it exact', 'Add the why', 'Shorten it'] },
  },
  'skill.description': {
    name: 'the description',
    form: 'line',
    shape:
      'The description in a skill’s front matter, which agents read to decide when to load the skill. One or two sentences, 50 words or fewer, in the third person. First what the skill does, starting with a verb such as "Writes" or "Reviews". Then a sentence starting "Use when" that names the requests it should load for.',
    suggestions: {
      write: ['Say what it does and when to use it'],
      edit: ['Name when to use it', 'Make it shorter'],
    },
  },
  'case.prompt': {
    name: 'the prompt',
    form: 'block',
    shape: `The prompt of a test case. ${CASE_PROMPT_HINT} Write it in the first person, with the concrete facts a good answer needs: names, numbers, the thing that changed. A check can only look for a fact the prompt gave.`,
    suggestions: {
      write: ['Write a realistic request'],
      edit: ['Add concrete facts', 'Make it harder'],
    },
  },
  'case.expected': {
    name: 'the good answer',
    form: 'block',
    shape:
      'What a good answer to the case’s prompt does, in one to three sentences: what it says first, what it must include and how long it is. Describe the answer; do not write it.',
    suggestions: { write: ['Describe a good answer'], edit: ['Make it more specific'] },
  },
  'case.check': {
    name: 'the check',
    form: 'line',
    shape: `One check: ${CHECK}`,
    suggestions: {
      write: ['Write a check for this case'],
      edit: ['Make it something Jev can mark'],
    },
  },
  'case.checks': {
    name: 'checks',
    form: 'items',
    shape: `Checks to add to a test case: two or three, unless the request asks for another number. Each is about a fact the case's prompt gave, and none says what a check the case has already says. Each check is ${CHECK}`,
    suggestions: {
      write: ['Write the checks this case lacks', 'Check the facts in the prompt'],
      edit: [],
    },
  },
}

/** A text the model reads beside the field: the skill, the case, the output. */
export interface AssistContext {
  label: string
  text: string
}

export interface AssistInput {
  field: AssistFieldId
  /** What the writer asked for. */
  instruction: string
  /** The field as it is now; empty for a blank one. */
  current: string
  context: AssistContext[]
  /** Pictures the model reads beside the text: the case's own, and any attached to the request. */
  images: ImageRef[]
}

/** The most text one request carries, in characters. More than this is refused, never cut. */
export const ASSIST_LIMIT = 400_000

/** The reply's shape for every field: one object holding the field's text. */
export const ASSIST_SCHEMA = {
  type: 'object',
  properties: {
    text: { type: 'string', description: 'The new text of the field, complete, and nothing else.' },
  },
  required: ['text'],
  additionalProperties: false,
} as const

/** What Skill Studio and a skill are, in two sentences: how every brief to a model opens. */
export const APP_INTRO = `Skill Studio is a desktop app for writing agent skills and testing them. A skill is a folder with a SKILL.md an AI agent loads when its description matches the request.`

const APP = `${APP_INTRO} The app runs headless agents on the skill's cases, and Jev, a grading model, marks each output against the skill's rules and the case's checks. The author then reads the new version's output beside the last one's. Where they read a verdict differently from Jev, their answer stands, and what Jev missed becomes a check or a rule.`

/** `text` inside an XML-like tag, so a model tells what it is given from what it is asked. */
export const tag = (name: string, text: string, label?: string): string =>
  `<${name}${label ? ` name="${label.replace(/"/g, "'")}"` : ''}>\n${text.trim()}\n</${name}>`

const REPLACES = `Your reply is put in the field as it is, in place of what is there, so it holds the field's complete new text and nothing else: no greeting, no explanation, no code fence around it. When the field has text already, the request is an edit: change what it asks for and keep the rest word for word.`

/** What becomes of the reply, as the model is told, by the field's form. */
const PLACING: Record<AssistFieldDef['form'], string> = {
  line: `${REPLACES} This field is one line, so write no line breaks.`,
  block: REPLACES,
  file: REPLACES,
  items: `Each line of your reply is added to the list as one new item, so it holds the new items and nothing else: one to a line, with no numbers, no bullets, no greeting and no explanation.`,
}

/** The request as the model reads it: what the field is, what is around it, and what was asked. */
export function assistPrompt(input: AssistInput): { system: string; user: string } {
  const field = ASSIST_FIELDS[input.field]
  const system = `You write the text of one field in Skill Studio. ${APP}

The field holds ${field.name}. What its text must be:
${field.shape}

${PLACING[field.form]}`
  const user = [
    ...input.context.filter((c) => c.text.trim()).map((c) => tag('context', c.text, c.label)),
    // A list's own items are among the context, and nothing of it is replaced.
    field.form === 'items'
      ? ''
      : input.current.trim()
        ? tag('field_now', input.current)
        : 'The field is empty.',
    input.images.length
      ? `Attached, in this order: ${input.images.map((image) => image.name).join(', ')}.`
      : '',
    tag('request', input.instruction),
  ]
    .filter(Boolean)
    .join('\n\n')
  return { system, user }
}

const UNESCAPES: Record<string, string> = {
  '"': '"',
  '\\': '\\',
  '/': '/',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
}

/**
 * The field's text from a reply that is still arriving: the `key` string of
 * the JSON so far (`text` by default), decoded up to where it stops. Lets the page show the words
 * as they come, though the JSON is not complete until the end.
 */
export function partialText(raw: string, key = 'text'): string {
  const start = new RegExp(`"${key}"\\s*:\\s*"`).exec(raw)
  if (!start) return ''
  let out = ''
  for (let i = start.index + start[0].length; i < raw.length; i++) {
    const char = raw[i]
    if (char === '"') break
    if (char !== '\\') {
      out += char
      continue
    }
    const next = raw[i + 1]
    if (next === undefined) break
    if (next === 'u') {
      const hex = raw.slice(i + 2, i + 6)
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) break
      out += String.fromCharCode(Number.parseInt(hex, 16))
      i += 5
    } else {
      out += UNESCAPES[next] ?? next
      i += 1
    }
  }
  return out
}

/** A list marker a model may lead an item with, though it is told not to. */
const ITEM_MARKER = new RegExp(`^(?:${LIST_MARK}|•)(?:\\s+|$)`)

/** The items of a fitted `items` reply. */
export const assistItems = (text: string): string[] => text.split('\n')

/** A reply that is one code fence around the whole text, with any language after the opening. */
const WRAPPED = /^(\s*(?:`{3,}|~{3,})[^\n]*)\n([\s\S]*?)\n[ \t]*(?:`{3,}|~{3,})[ \t]*$/

/** Whether the text opens with a code fence. */
const startsFenced = (text: string): boolean => /^\s*(?:`{3,}|~{3,})/.test(text)

/** The text without the one fence a model may wrap a whole file in, though it is told not to. */
const unwrapped = (text: string): string => {
  const match = WRAPPED.exec(text.trim())
  const fence = match && fenceOf(match[1])
  if (!match || !fence) return text
  const lines = text.trim().split('\n')
  if (!closesFence(lines.at(-1) ?? '', fence)) return text
  // Named as Markdown, the fence is a wrapper for sure. Any other may be the file's own first
  // code block, which closes at the first bare fence: a file that opens and ends with code
  // blocks of its own is then left as it is, not cut at both ends.
  const wrapper = /^\s*(?:`+|~+)\s*(?:md|markdown)\s*$/i.test(match[1])
  let inner = false
  for (const line of lines.slice(1, -1)) {
    if (inner) inner = !closesFence(line, fence)
    else if (closesFence(line, fence)) {
      if (!wrapper) return text
      inner = true
    } else inner = fenceOf(line)?.char === fence.char
  }
  return match[2]
}

const FIT: Record<AssistFieldDef['form'], (text: string) => string> = {
  line: (text) => text.replace(/\s+/g, ' ').trim(),
  block: (text) => text.trim(),
  file: (text) => unwrapped(text).trim(),
  items: (text) =>
    text
      .split('\n')
      .map((line) => line.trim().replace(ITEM_MARKER, ''))
      .filter(Boolean)
      .join('\n'),
}

/**
 * The finished reply as the field's text, fitted to the field: one line stays
 * one line, a list's items stand one to a line without their markers, a file
 * ends with a newline, and a SKILL.md that came back without its front matter
 * gets the block it had. A file wrapped whole in one code fence is unwrapped.
 * Throws when the reply is not the agreed object, holds no text, or is a file
 * that still opens with a fence (its front matter would sit inside a code
 * block, and no rule would be graded), so a bad reply never reaches a field.
 */
export function assistText(input: Pick<AssistInput, 'field' | 'current'>, raw: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('The model’s reply was cut off or malformed. Try again.')
  }
  const value = (parsed as { text?: unknown } | null)?.text
  const { form } = ASSIST_FIELDS[input.field]
  const fitted = typeof value === 'string' ? FIT[form](value) : ''
  if (!fitted) throw new Error('The model returned no text for this field. Try again.')
  if (form !== 'file') return fitted
  if (startsFenced(fitted))
    throw new Error('The model wrapped the file in a code fence. Try again.')
  const text = `${fitted}\n`
  const front = input.field === 'skill.file' ? frontMatterBlock(input.current) : ''
  return front && !frontMatterBlock(text) ? `${front.trimEnd()}\n\n${text}` : text
}

/** One file of the open skill as the reader has it: their unsaved text when there is some. */
export interface SceneFile {
  path: string
  text: string
  unsaved: boolean
}

/** One case of the open skill as the reader has it. A case not saved yet has the id NEW_CASE_KEY. */
export interface SceneCase {
  id: string
  title: string
  prompt: string
  expected: string
  /** Each check's statement and weight; 1 is usual. */
  checks: Array<{ statement: string; weight: number }>
  unsaved: boolean
}

/** What the side panel's assistant knows about where the reader is. */
export interface ChatScene {
  /** The screen in view, by its name in the sidebar. */
  screen: string
  /** What the reader has open on that screen: a file in the Editor, a case on Cases (NEW_CASE_KEY: a new one). */
  open: { file: string | null; case: string | null }
  /** The open skill as the reader has it, unsaved work included. Null when none is open. */
  skill: { name: string; files: SceneFile[]; cases: SceneCase[] } | null
}

/** A case as saved or as drafted: both name these fields alike. */
type CaseText = Pick<CaseDraft, 'id' | 'title' | 'prompt' | 'expectedOutcome'> & {
  graders: Array<{ statement: string; weight: number }>
}

const sceneCase = (c: CaseText, unsaved: boolean): SceneCase => ({
  id: c.id,
  title: c.title,
  prompt: c.prompt,
  expected: c.expectedOutcome,
  checks: c.graders
    .filter((g) => g.statement.trim())
    .map((g) => ({ statement: g.statement, weight: g.weight })),
  unsaved,
})

/**
 * The skill as the reader has it: each saved file and case with their draft
 * laid over it, a file only drafted so far, and a new case not saved yet. A
 * draft that names a path the editor cannot write, or a case that is gone, is
 * left out.
 */
export function workingSkill(
  files: Record<string, string>,
  cases: CaseText[],
  drafts: Pick<SkillDrafts, 'files' | 'cases'>,
): { files: SceneFile[]; cases: SceneCase[] } {
  const paths = new Set([...Object.keys(files), ...Object.keys(drafts.files)])
  // Own keys only: a case id such as `constructor` names something every object has.
  const own = <T>(record: Readonly<Record<string, T>>, key: string): T | undefined =>
    Object.hasOwn(record, key) ? record[key] : undefined
  const fresh = own(drafts.cases, NEW_CASE_KEY)
  return {
    files: [...paths]
      .filter(isEditablePath)
      .sort(byFileOrder)
      .map((path) => {
        const draft = own(drafts.files, path)
        const saved = own(files, path)
        return draft && draft.text !== saved
          ? { path, text: draft.text, unsaved: true }
          : { path, text: saved ?? '', unsaved: false }
      }),
    cases: [
      ...cases.map((c) => {
        const draft = own(drafts.cases, c.id)
        return draft ? sceneCase({ ...draft, id: c.id }, true) : sceneCase(c, false)
      }),
      ...(fresh ? [sceneCase({ ...fresh, id: NEW_CASE_KEY }, true)] : []),
    ],
  }
}

/**
 * How much of the skill beyond SKILL.md the assistant reads each turn, in
 * characters, about 10,000 tokens: one budget for the reference files and the
 * cases together. SKILL.md is always read whole. The open file comes first,
 * then the other references, then the cases; a case past the budget is named
 * by its title alone.
 */
export const CONTEXT_BUDGET = 40_000

const SCREENS =
  'Skill (edit SKILL.md and references/, with every version to compare and restore), Cases (the prompts a run is made of, each with checks), Results (two outputs of a case side by side with what each missed, a pick between them, and every run under All cases), Library, Guide and Settings. Run, at the top of the window, has an agent do the cases and saves the skill as a version.'

/** Where the reader is and what they have open, as the brief says it. */
function whereText(scene: ChatScene): string {
  const { screen, open, skill } = scene
  const parts = screen ? [`The reader is on the ${screen} screen.`] : []
  const file = open.file && skill?.files.find((f) => f.path === open.file)
  if (file)
    parts.push(`They have ${file.path} open${file.unsaved ? ', with unsaved changes' : ''}.`)
  if (open.case === NEW_CASE_KEY) parts.push('They are writing a new case, not saved yet.')
  else {
    const c = open.case && skill?.cases.find((x) => x.id === open.case)
    if (c) parts.push(`They have the case "${c.title || c.id}" open.`)
  }
  return parts.join(' ')
}

/** What is left of the budget as the brief is built: files take from it first, then cases. */
interface Budget {
  left: number
}

/** Whether `text` fits in what is left; when it does, it is spent. */
function spend(budget: Budget, text: string): boolean {
  if (text.length > budget.left) return false
  budget.left -= text.length
  return true
}

/** The skill's files: SKILL.md whole, then each reference in full while the budget lasts, the open one first. */
function filesText(files: SceneFile[], open: string | null, budget: Budget): string {
  const mark = (f: SceneFile) => (f.unsaved ? `${f.path} (unsaved)` : f.path)
  const skillMd = files.find((f) => f.path === 'SKILL.md')
  const references = files
    .filter((f) => f !== skillMd)
    .sort((a, b) => Number(b.path === open) - Number(a.path === open))
  const shown: string[] = []
  const named: string[] = []
  for (const f of references) {
    if (spend(budget, f.text)) shown.push(tag('file', f.text, mark(f)))
    else named.push(mark(f))
  }
  return [
    skillMd ? tag('file', skillMd.text, mark(skillMd)) : 'The skill has no SKILL.md yet.',
    ...shown,
    named.length ? `Reference files too long to include here: ${named.join(', ')}.` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

/** A check's weight after its number, only when it is not the usual 1. */
export const weightNote = (weight: number): string => (weight === 1 ? '' : ` (weight ${weight})`)

/** A case's name in the brief: its title and id, and whether it is unsaved. */
const caseName = (c: SceneCase): string =>
  c.id === NEW_CASE_KEY
    ? `${c.title || 'New case'} (new, unsaved)`
    : `${c.title || c.id}${c.title && c.title !== c.id ? `, id ${c.id}` : ''}${c.unsaved ? ' (unsaved)' : ''}`

const caseText = (c: SceneCase): string =>
  tag(
    'case',
    [
      `Prompt: ${c.prompt}`,
      c.expected ? `A good answer: ${c.expected}` : '',
      ...c.checks.map(
        (check, i) => `Check ${i + 1}${weightNote(check.weight)}: ${check.statement}`,
      ),
    ]
      .filter(Boolean)
      .join('\n'),
    caseName(c),
  )

/** The skill's cases, each in full while the budget lasts; the rest by name, with how many. */
function casesText(cases: SceneCase[], budget: Budget): string {
  if (!cases.length) return 'The skill has no cases yet.'
  const shown: string[] = []
  const named: string[] = []
  for (const c of cases) {
    const text = caseText(c)
    if (spend(budget, text)) shown.push(text)
    else named.push(caseName(c))
  }
  return [
    shown.length ? `Its cases:\n${shown.join('\n')}` : '',
    named.length
      ? `${named.length} more ${named.length === 1 ? 'case is' : 'cases are'} left out here for length, by name: ${named.join('; ')}.`
      : '',
  ]
    .filter(Boolean)
    .join('\n')
}

/** The brief of the side panel's assistant: the app, how a skill is written, where the reader is, the skill in hand, and how to change it. */
export function chatSystem(scene: ChatScene): string {
  const parts = [
    `You are the assistant in Skill Studio's side panel. ${APP}`,
    `Its screens: ${SCREENS}`,
    `How a skill is written here. ${RULE_SHAPE.charAt(0).toUpperCase()}${RULE_SHAPE.slice(1)}\n- ${RULE_GUIDE.map((item) => `${item.lead} ${item.text}`).join('\n- ')}`,
    `How a check is written: one statement Jev can mark by reading the answer.\n- ${CHECKS}`,
    'Answer in a few short paragraphs of Markdown, without headings unless the answer is long. Lead with the answer. When you suggest a rule, a check or a prompt, write it out in full. If you do not know something about this app, say so.',
  ]
  const where = whereText(scene)
  if (where) parts.push(where)
  if (scene.skill) {
    const { name, files, cases } = scene.skill
    const budget: Budget = { left: CONTEXT_BUDGET }
    parts.push(CHANGES_GUIDE)
    parts.push(
      `The open skill is "${name}". You see its files and cases as the reader has them. One marked unsaved holds edits they have not saved yet: it is the current text, and a change you propose to it replaces those edits.\n${filesText(files, scene.open.file, budget)}`,
    )
    parts.push(casesText(cases, budget))
  } else
    parts.push('No skill is open, so you cannot change one: say to open it from the Library first.')
  return parts.join('\n\n')
}
