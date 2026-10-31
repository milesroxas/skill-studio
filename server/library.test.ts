import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

// The library reads SKILL_TESTER_HOME once, at import.
const home = mkdtempSync(join(tmpdir(), 'st-home-'))
process.env.SKILL_TESTER_HOME = home
const library = await import('./library.ts')
const { createSkill, linkSkill, markOthers, scanLibrary, setWorkspaces, touchRecent, unlinkSkill } =
  library

const project = join(home, 'work', 'shop')

const writeSkill = (dir: string, name: string) => {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: About ${name}.\n---\n`)
}

const rowOf = (name: string, scope = 'user') => {
  const row = scanLibrary().skills.find((s) => s.name === name && s.scope === scope)
  if (!row) throw new Error(`No row for ${name} in ${scope}.`)
  return row
}

beforeAll(() => {
  mkdirSync(join(project, '.agents/skills'), { recursive: true })
  setWorkspaces([join(home, 'work')])
})
beforeEach(() => {
  for (const dir of ['.agents', '.claude', '.cursor', '.codex', '.skill-tester'])
    rmSync(join(home, dir), { recursive: true, force: true })
  rmSync(join(project, '.agents/skills'), { recursive: true, force: true })
  mkdirSync(join(project, '.agents/skills'), { recursive: true })
  setWorkspaces([join(home, 'work')])
})
afterAll(() => rmSync(home, { recursive: true, force: true }))

describe('scanLibrary', () => {
  it('lists the user and every project with a skills folder as places', () => {
    expect(scanLibrary().places.map((p) => p.label)).toEqual(['User', 'shop'])
  })

  it('folds an agent link into the skill it points at', () => {
    writeSkill(join(home, '.agents/skills/notes'), 'notes')
    mkdirSync(join(home, '.claude/skills'), { recursive: true })
    symlinkSync('../../.agents/skills/notes', join(home, '.claude/skills/notes'))
    const rows = scanLibrary().skills.filter((s) => s.name === 'notes')
    expect(rows).toHaveLength(1)
    expect(rows[0].installs).toEqual({ claude: 'link', cursor: null, codex: null })
  })

  it('edits the store folder and reports other folders of the same name as copies', () => {
    writeSkill(join(home, '.agents/skills/notes'), 'notes')
    writeSkill(join(home, '.cursor/skills/notes'), 'notes')
    const row = rowOf('notes')
    expect(row.path).toBe(realpathSync(join(home, '.agents/skills/notes')))
    expect(row.installs.cursor).toBe('copy')
    expect(row.copies).toEqual([realpathSync(join(home, '.cursor/skills/notes'))])
  })

  it('takes the source of an installed skill from the lock file', () => {
    writeSkill(join(home, '.agents/skills/caveman'), 'caveman')
    writeFileSync(
      join(home, '.agents/.skill-lock.json'),
      JSON.stringify({ skills: { caveman: { source: 'someone/caveman' } } }),
    )
    expect(rowOf('caveman').source).toBe('someone/caveman')
  })

  it('keeps an open skill that lives outside every place', () => {
    const outside = join(home, 'elsewhere', 'loose')
    writeSkill(outside, 'loose')
    const row = scanLibrary([outside]).skills.find((s) => s.name === 'loose')
    expect(row?.scope).toBe('other')
    expect(row?.open).toBe(true)
  })
})

describe('createSkill', () => {
  it('writes the skill to the store and links each agent picked', () => {
    const dir = createSkill({
      scope: 'user',
      name: 'notes',
      description: 'Notes: short.',
      agents: ['claude'],
    })
    expect(dir).toBe(join(home, '.agents/skills/notes'))
    expect(readFileSync(join(dir, 'SKILL.md'), 'utf8')).toMatch('description: "Notes: short."')
    const link = join(home, '.claude/skills/notes')
    expect(lstatSync(link).isSymbolicLink()).toBe(true)
    expect(readlinkSync(link)).toBe('../../.agents/skills/notes')
    expect(rowOf('notes').installs).toEqual({ claude: 'link', cursor: null, codex: null })
  })

  it('creates in a project', () => {
    createSkill({ scope: project, name: 'shop-copy', description: '', agents: [] })
    expect(rowOf('shop-copy', project).scopeLabel).toBe('shop')
  })

  it('refuses a bad name, an unknown agent and a name already taken, writing nothing', () => {
    expect(() =>
      createSkill({ scope: 'user', name: 'Bad Name', description: '', agents: [] }),
    ).toThrow('lowercase')
    expect(() =>
      createSkill({ scope: 'user', name: 'ok', description: '', agents: ['vim'] }),
    ).toThrow('Unknown agent')
    writeSkill(join(home, '.claude/skills/taken'), 'taken')
    expect(() =>
      createSkill({ scope: 'user', name: 'taken', description: '', agents: ['claude'] }),
    ).toThrow('already exists')
    expect(scanLibrary().skills.map((s) => s.name)).toEqual(['taken'])
  })
})

describe('linkSkill and unlinkSkill', () => {
  it('installs and uninstalls by link only', () => {
    writeSkill(join(home, '.agents/skills/notes'), 'notes')
    const { path } = rowOf('notes')
    linkSkill(path, 'codex', 'user')
    expect(rowOf('notes').installs.codex).toBe('link')
    expect(() => linkSkill(path, 'codex', 'user')).toThrow('already exists')
    unlinkSkill(path, 'codex', 'user')
    expect(rowOf('notes').installs.codex).toBeNull()
  })

  it('never removes a folder, or a link to another skill', () => {
    writeSkill(join(home, '.claude/skills/notes'), 'notes')
    const { path } = rowOf('notes')
    expect(() => unlinkSkill(path, 'claude', 'user')).toThrow('left alone')
    expect(lstatSync(join(home, '.claude/skills/notes')).isDirectory()).toBe(true)

    writeSkill(join(project, '.agents/skills/notes'), 'notes')
    mkdirSync(join(project, '.cursor/skills'), { recursive: true })
    symlinkSync(join(project, '.agents/skills/notes'), join(project, '.cursor/skills/notes'))
    expect(() => unlinkSkill(path, 'cursor', project)).toThrow('left alone')
  })
})

describe('settings', () => {
  it('remembers opened skills newest first, and marks skills as someone else’s', () => {
    writeSkill(join(home, '.agents/skills/a'), 'a')
    writeSkill(join(home, '.agents/skills/b'), 'b')
    touchRecent(join(home, '.agents/skills/a'))
    touchRecent(join(home, '.agents/skills/b'))
    expect(rowOf('a').recent && rowOf('b').recent).toBe(true)
    markOthers(rowOf('a').path, true)
    expect(rowOf('a').source).toBe('marked')
    markOthers(rowOf('a').path, false)
    expect(rowOf('a').source).toBeNull()
  })

  it('refuses a workspace that is not a folder', () => {
    expect(() => setWorkspaces([join(home, 'missing')])).toThrow('not a folder')
  })
})
