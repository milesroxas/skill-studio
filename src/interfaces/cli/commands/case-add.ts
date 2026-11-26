import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { parsers } from '@application/api/operations.ts'
import { newCaseId } from '@domain/case-draft.ts'
import { loadCases, saveCase, type Uploads } from '@infrastructure/cases.ts'
import type { Command, FlagValues } from './command.ts'
import { skillOf } from './shared.ts'

const flags = {
  title: { type: 'string' },
  prompt: { type: 'string' },
  'prompt-file': { type: 'string' },
  check: { type: 'string', multiple: true },
  file: { type: 'string', multiple: true },
  artifact: { type: 'string' },
  size: { type: 'string' },
} as const

/** The kinds `--artifact` takes: the ones the Cases screen's "File to grade" offers. */
const ARTIFACTS = ['html', 'image']

/** The prompt from `--prompt` or `--prompt-file`, which take one and only one. */
function promptOf(values: FlagValues<typeof flags>): string {
  const text = values.prompt
  const file = values['prompt-file']
  if (text !== undefined && file !== undefined)
    throw new Error('Pass --prompt or --prompt-file, not both.')
  if (file !== undefined) return readFileSync(resolve(file), 'utf8')
  if (text === undefined)
    throw new Error('Pass the prompt: --prompt <text> or --prompt-file <file>.')
  return text
}

/** `--size WxH` as a width and a height; their range is the save's to check. */
function sizeOf(value: string | undefined): [number, number] | null {
  if (value === undefined) return null
  const match = /^(\d+)x(\d+)$/i.exec(value.trim())
  if (!match)
    throw new Error(
      `--size takes a width and a height in pixels, such as 1280x800, not "${value}".`,
    )
  return [Number(match[1]), Number(match[2])]
}

/** What one `--file` adds: a file or a folder, copied into the case's `files/` under its own name. */
function addedOf(paths: readonly string[]) {
  const names = new Set<string>()
  return paths.map((given) => {
    const path = resolve(given)
    let folder: boolean
    try {
      folder = statSync(path).isDirectory()
    } catch {
      throw new Error(`There is no file at ${given}.`)
    }
    const name = basename(path)
    if (names.has(name)) throw new Error(`Two --file paths are called ${name}: rename one.`)
    names.add(name)
    const files = folder
      ? readdirSync(path, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).length
      : 1
    return { path, pick: { name, files, folder } }
  })
}

export const caseAdd: Command = {
  name: 'case add',
  help: [
    '  case add                    Write a new case, checked as the Cases screen checks one.',
    '    --title <text>            Its title; default the start of its prompt.',
    '    --prompt <text>           The request the agent gets.',
    '    --prompt-file <file>      The request, from a file, in place of --prompt.',
    '    --check <text>            A check a good answer meets. Once for each check.',
    '    --file <path>             A file or folder the agent gets with the request. Once for each.',
    '    --artifact <kind>         The file to grade: html (a page) or image (a picture).',
    '    --size <WxH>              The size in pixels a picture must be, or a page is drawn at.',
  ],
  flags,
  agents: false,
  async run(context) {
    const values = context.values as FlagValues<typeof flags>
    const { skill } = skillOf(context.args)
    const prompt = promptOf(values)
    const artifact = values.artifact
    if (artifact !== undefined && !ARTIFACTS.includes(artifact))
      throw new Error(`--artifact takes ${ARTIFACTS.join(' or ')}, not "${artifact}".`)
    const added = addedOf(values.file ?? [])
    const title = values.title ?? ''
    const taken = loadCases(skill).map((c) => c.id)
    // The draft the Cases screen sends, through the same check, so the two cannot drift apart.
    const input = parsers['skill.saveCase']({
      skill,
      case: {
        id: newCaseId({ title, prompt }, taken),
        title,
        prompt,
        expectedOutcome: '',
        words: null,
        phone: false,
        size: sizeOf(values.size),
        artifact: artifact ?? null,
        images: [],
        // Each one is kept where it is: its upload is its place in the list.
        added: added.map(({ pick }, i) => ({ ...pick, upload: String(i) })),
        removed: [],
        // Weight 1, as a check accepted from a proposal has.
        graders: (values.check ?? []).map((statement) => ({ id: null, statement, weight: 1 })),
      },
      isNew: true,
    })
    const uploads: Uploads = {
      picture: () => {
        throw new Error('A case from the command line names no picture to add.')
      },
      input: (id) => dirname(added[Number(id)].path),
    }
    const saved = saveCase(skill, input.case, input.isNew, uploads)
    const checks = input.case.graders.filter((g) => g.statement.trim()).length
    console.log(
      `Wrote ${saved}: ${checks} check(s)${added.length ? `, ${added.length} file(s)` : ''}.`,
    )
    return 0
  },
}
