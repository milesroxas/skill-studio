/**
 * What the assistant is asked and what it must hand back. Every text area in
 * the app is one kind of field, and each kind states the shape its text has:
 * a SKILL.md is rules in the graded form, a check is one fact a judge can
 * mark, a description says when to load the skill. The reply is one JSON
 * object with the field's text, so no greeting or explanation can land in a
 * field, and the text is then fitted to the field before anything shows it.
 * Pure data and functions.
 */
import { CASE_PROMPT_HINT, CHECK_EXAMPLES, RULE_GUIDE, RULE_SHAPE } from './templates.ts'
import { frontMatterBlock } from './text.ts'

export const ASSIST_FIELD_IDS = [
  'skill.file',
  'skill.reference',
  'skill.passage',
  'skill.description',
  'case.prompt',
  'case.expected',
  'case.check',
  'version.note',
  'review.note',
] as const
export type AssistFieldId = (typeof ASSIST_FIELD_IDS)[number]

export interface AssistFieldDef {
  /** What the field holds, as its control names it: "Write the prompt". */
  name: string
  /**
   * `line`: one line, never a line break. `block`: a few lines of prose.
   * `file`: a whole Markdown file, shown as a change to the one there.
   */
  form: 'line' | 'block' | 'file'
  /** The shape the text must have, written for the model. */
  shape: string
  /** Requests offered in one click, so the common ones are never typed. */
  suggestions: readonly string[]
}

const RULES = [
  `Rules: ${RULE_SHAPE}`,
  ...RULE_GUIDE.map((item) => `${item.lead} ${item.text}`),
].join('\n- ')

const CHECKS = CHECK_EXAMPLES.map(
  (example) => `Not "${example.bad}" but "${example.good}" ${example.why}`,
).join('\n- ')

export const ASSIST_FIELDS: Record<AssistFieldId, AssistFieldDef> = {
  'skill.file': {
    name: 'SKILL.md',
    form: 'file',
    shape: `A complete SKILL.md: the file an agent loads to follow this skill.
- It opens with the front matter block between two --- lines, holding name and description. Keep the block that is there unless the request is about it.
- Below it: a # title, a "## When this applies" section of one or two sentences, a "## Process" numbered list when the work has steps, and a "## Rules" section.
- ${RULES}`,
    suggestions: [
      'Tighten every vague rule',
      'Add the why to each rule',
      'Cut what changes nothing',
    ],
  },
  'skill.reference': {
    name: 'the reference file',
    form: 'file',
    shape: `A reference file: longer material SKILL.md points to, as Markdown.
- It opens with a # title, then one sentence that starts "Read this when" and says when the agent should open it.
- Then the material itself: tables, examples, long lists. Bullets here are not graded, so write for lookup, not as rules.`,
    suggestions: ['Shorten it', 'Add a worked example', 'Turn the prose into a table'],
  },
  'skill.passage': {
    name: 'the selection',
    form: 'block',
    shape: `Only the text that replaces the selected passage of a skill file, as Markdown that reads right where the selection was. Match the list markers, heading levels and voice of the file around it.
- ${RULES}`,
    suggestions: ['Make it exact', 'Add the why', 'Shorten it'],
  },
  'skill.description': {
    name: 'the description',
    form: 'line',
    shape:
      'The description in a skill’s front matter, which agents read to decide when to load the skill. One or two sentences, 50 words or fewer, in the third person. First what the skill does, starting with a verb such as "Writes" or "Reviews". Then a sentence starting "Use when" that names the requests it should load for.',
    suggestions: ['Name when to use it', 'Make it shorter'],
  },
  'case.prompt': {
    name: 'the prompt',
    form: 'block',
    shape: `The prompt of a test case. ${CASE_PROMPT_HINT} Write it in the first person, with the concrete facts a good answer needs: names, numbers, the thing that changed. A check can only look for a fact the prompt gave.`,
    suggestions: ['Write a realistic request', 'Add concrete facts', 'Make it harder'],
  },
  'case.expected': {
    name: 'the good answer',
    form: 'block',
    shape:
      'What a good answer to the case’s prompt does, in one to three sentences: what it says first, what it must include and how long it is. Describe the answer; do not write it.',
    suggestions: ['Describe a good answer', 'Make it more specific'],
  },
  'case.check': {
    name: 'the check',
    form: 'line',
    shape: `One check: a single statement a good answer makes true, that a judge can mark by reading the answer. One fact per check, naming the thing to look for, in one sentence that starts "The answer", "The note" or the like.
- ${CHECKS}`,
    suggestions: ['Write a check for this case', 'Make it something a judge can mark'],
  },
  'version.note': {
    name: 'the note',
    form: 'block',
    shape:
      'The note saved with a version of a skill: what changed and why, in one to three plain sentences. Name the rule or section that changed. No greeting and no list.',
    suggestions: ['Say what changed and why', 'Make it shorter'],
  },
  'review.note': {
    name: 'the note',
    form: 'block',
    shape:
      'A reviewer’s note on one output of a skill: what works, what to change, and what the skill should have made the agent do. Two to four short sentences that quote or name the part of the output they are about.',
    suggestions: ['Note what works and what to change', 'Tidy my note'],
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

const APP = `Skill Studio is a desktop app for writing agent skills and testing them. A skill is a folder with a SKILL.md an AI agent loads when its description matches the request. The app runs headless agents on the skill's cases, grades each output with code checks and a judge, and lets the author rate the outputs blind and compare versions.`

const tag = (name: string, text: string, label?: string): string =>
  `<${name}${label ? ` name="${label.replace(/"/g, "'")}"` : ''}>\n${text.trim()}\n</${name}>`

/** The request as the model reads it: what the field is, what is around it, and what was asked. */
export function assistPrompt(input: AssistInput): { system: string; user: string } {
  const field = ASSIST_FIELDS[input.field]
  const system = `You write the text of one field in Skill Studio. ${APP}

The field holds ${field.name}. What its text must be:
${field.shape}

Your reply is put in the field as it is, in place of what is there, so it holds the field's complete new text and nothing else: no greeting, no explanation, no code fence around it. When the field has text already, the request is an edit: change what it asks for and keep the rest word for word. ${
    field.form === 'line' ? 'This field is one line, so write no line breaks.' : ''
  }`.trim()
  const user = [
    ...input.context.filter((c) => c.text.trim()).map((c) => tag('context', c.text, c.label)),
    input.current.trim() ? tag('field_now', input.current) : 'The field is empty.',
    tag('request', input.instruction),
  ].join('\n\n')
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
 * The field's text from a reply that is still arriving: the `text` string of
 * the JSON so far, decoded up to where it stops. Lets the page show the words
 * as they come, though the JSON is not complete until the end.
 */
export function partialText(raw: string): string {
  const start = /"text"\s*:\s*"/.exec(raw)
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

/**
 * The finished reply as the field's text, fitted to the field: one line stays
 * one line, a file ends with a newline, and a SKILL.md that came back without
 * its front matter gets the block it had. Throws when the reply is not the
 * agreed object or holds no text, so a bad reply never reaches a field.
 */
export function assistText(input: Pick<AssistInput, 'field' | 'current'>, raw: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('The model’s reply was cut off or malformed. Try again.')
  }
  const value = (parsed as { text?: unknown } | null)?.text
  if (typeof value !== 'string' || !value.trim())
    throw new Error('The model returned no text for this field. Try again.')
  const { form } = ASSIST_FIELDS[input.field]
  if (form === 'line') return value.replace(/\s+/g, ' ').trim()
  if (form === 'block') return value.trim()
  const text = `${value.trim()}\n`
  const front = input.field === 'skill.file' ? frontMatterBlock(input.current) : ''
  return front && !frontMatterBlock(text) ? `${front.trimEnd()}\n\n${text}` : text
}

/** What the side panel's assistant knows about where the reader is. */
export interface ChatScene {
  /** The screen in view, by its name in the sidebar. */
  screen: string
  /** The open skill as saved: SKILL.md, its reference files by name, and its cases. Null when none is open. */
  skill: {
    name: string
    description: string
    skillMd: string
    references: string[]
    cases: Array<{ id: string; title: string; prompt: string; expected: string; checks: string[] }>
  } | null
}

const SCREENS =
  'Write (edit SKILL.md and references/), Versions (save, compare and restore), Cases (the prompts a run is made of, each with checks), New run (agents write an output per case), Results (scores per run), Rate blind (rate outputs before seeing the judge), Compare (two outputs side by side, vote for the better), Transcripts (what the agent did), Agreement (how often the judge and the author agree), Scoring (weights and thresholds), Library, Guide and Settings.'

/** The brief of the side panel's assistant: the app, how a skill is written, and the skill in hand. */
export function chatSystem(scene: ChatScene): string {
  const parts = [
    `You are the assistant in Skill Studio's side panel. ${APP}`,
    `Its screens: ${SCREENS}`,
    `How a skill is written here. ${RULE_SHAPE.charAt(0).toUpperCase()}${RULE_SHAPE.slice(1)}\n- ${RULE_GUIDE.map((item) => `${item.lead} ${item.text}`).join('\n- ')}`,
    `How a check is written: one statement a judge can mark by reading the answer.\n- ${CHECKS}`,
    'Answer in a few short paragraphs of Markdown, without headings unless the answer is long. Lead with the answer. When you suggest a rule, a check or a prompt, write it out in full so it can be copied as it is. You cannot change files: say which screen the change is made on. If you do not know something about this app, say so.',
  ]
  if (scene.screen) parts.push(`The reader is on the ${scene.screen} screen.`)
  if (scene.skill) {
    const { name, description, skillMd, references, cases } = scene.skill
    parts.push(
      `The open skill is "${name}"${description ? `: ${description}` : '.'}${
        references.length ? `\nIts reference files: ${references.join(', ')}.` : ''
      }\n${tag('skill_md', skillMd)}`,
    )
    parts.push(
      cases.length
        ? `Its cases, as saved:\n${cases
            .map((c) =>
              tag(
                'case',
                [
                  `Prompt: ${c.prompt}`,
                  c.expected ? `A good answer: ${c.expected}` : '',
                  ...c.checks.map((check, i) => `Check ${i + 1}: ${check}`),
                ]
                  .filter(Boolean)
                  .join('\n'),
                c.title || c.id,
              ),
            )
            .join('\n')}`
        : 'The skill has no cases yet.',
    )
  } else parts.push('No skill is open.')
  return parts.join('\n\n')
}
