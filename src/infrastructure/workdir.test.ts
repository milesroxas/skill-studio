import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  asSamplePath,
  isWorkdir,
  liveWorkdir,
  makeWorkdir,
  moveEntry,
  moveWork,
  WORKDIR_PREFIX,
  workdirsOf,
} from './workdir.ts'

let scratch: string
const made: string[] = []
beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'st-workdir-'))
})
afterEach(() => {
  rmSync(scratch, { recursive: true, force: true })
  for (const dir of made.splice(0)) rmSync(dirname(dir), { recursive: true, force: true })
})

const work = (name = 'note-s1') => {
  const made_ = makeWorkdir(name)
  made.push(made_.dir)
  return made_
}

const exdev = () => {
  throw Object.assign(new Error('cross-device link not permitted'), { code: 'EXDEV' })
}

describe('makeWorkdir', () => {
  it('makes a folder under the system’s temporary folder whose parent holds it alone', () => {
    const { dir, paths } = work()
    expect(paths[0]).toBe(dir)
    expect(readdirSync(dirname(dir))).toEqual(['note-s1'])
    expect(dirname(dir).split(/[\\/]/).at(-1)?.startsWith(WORKDIR_PREFIX)).toBe(true)
    for (const path of paths) expect(isWorkdir(path)).toBe(true)
  })

  it('reads a folder with the shape of one, made anywhere else, as none', () => {
    const forged = join(scratch, `${WORKDIR_PREFIX}abc`, 'note-s1')
    mkdirSync(forged, { recursive: true })
    expect(isWorkdir(forged)).toBe(false)
    expect(isWorkdir(tmpdir())).toBe(false)
  })
})

describe('liveWorkdir', () => {
  it('reads the folder a sample names only while it is there and is one the run made', () => {
    const sample = join(scratch, 'note-s1')
    mkdirSync(sample)
    const { dir, paths } = work()
    writeFileSync(join(sample, 'agent.json'), JSON.stringify({ workdir: paths }))
    expect(liveWorkdir(sample)).toBe(dir)
    rmSync(dirname(dir), { recursive: true, force: true })
    expect(liveWorkdir(sample)).toBeNull()
    // A file anyone may write: a folder it names elsewhere is not read from.
    const forged = join(scratch, `${WORKDIR_PREFIX}abc`, 'note-s1')
    mkdirSync(forged, { recursive: true })
    writeFileSync(join(sample, 'agent.json'), JSON.stringify({ workdir: [forged, '/etc'] }))
    expect(liveWorkdir(sample)).toBeNull()
    expect(workdirsOf(sample)).toEqual([forged])
  })

  it('names none for a sample whose agent worked in the sample itself', () => {
    const sample = join(scratch, 'note-s1')
    mkdirSync(sample)
    expect(workdirsOf(sample)).toEqual([])
    writeFileSync(join(sample, 'agent.json'), JSON.stringify({ ok: true, error: null }))
    expect(workdirsOf(sample)).toEqual([])
  })
})

describe('moveWork', () => {
  it('moves what the agent made into the sample, keeps the run’s own files, and removes its folder', () => {
    const { dir } = work()
    mkdirSync(join(dir, 'outputs/deep'), { recursive: true })
    writeFileSync(join(dir, 'outputs/deep/a.md'), 'A')
    writeFileSync(join(dir, 'notes.md'), 'notes')
    writeFileSync(join(dir, 'transcript.jsonl'), 'the agent’s own')
    const sample = join(scratch, 'note-s1')
    mkdirSync(sample)
    writeFileSync(join(sample, 'transcript.jsonl'), 'the run’s')
    expect(moveWork(dir, sample)).toEqual([])
    expect(readFileSync(join(sample, 'outputs/deep/a.md'), 'utf8')).toBe('A')
    expect(readFileSync(join(sample, 'notes.md'), 'utf8')).toBe('notes')
    expect(readFileSync(join(sample, 'transcript.jsonl'), 'utf8')).toBe('the run’s')
    expect(existsSync(dirname(dir))).toBe(false)
  })

  it('copies across disks, where a rename fails, and keeps a link a link', () => {
    const { dir } = work()
    mkdirSync(join(dir, 'outputs'))
    writeFileSync(join(dir, 'outputs/a.md'), 'A')
    if (process.platform !== 'win32') symlinkSync('a.md', join(dir, 'outputs/link.md'))
    const sample = join(scratch, 'note-s1')
    expect(moveWork(dir, sample, exdev)).toEqual([])
    expect(readFileSync(join(sample, 'outputs/a.md'), 'utf8')).toBe('A')
    if (process.platform !== 'win32') {
      expect(lstatSync(join(sample, 'outputs/link.md')).isSymbolicLink()).toBe(true)
      expect(readlinkSync(join(sample, 'outputs/link.md'))).toBe('a.md')
    }
    expect(existsSync(dirname(dir))).toBe(false)
  })

  it('leaves the agent’s folder and says so when its work cannot be moved', () => {
    const { dir } = work()
    writeFileSync(join(dir, 'notes.md'), 'notes')
    const blocked = join(scratch, 'a file')
    writeFileSync(blocked, '')
    expect(moveWork(dir, join(blocked, 'note-s1'))[0]).toMatch(/could not be made/)
    expect(existsSync(join(dir, 'notes.md'))).toBe(true)
  })

  it('throws on a rename that fails for any other reason', () => {
    const from = join(scratch, 'from')
    writeFileSync(from, '')
    expect(() =>
      moveEntry(from, join(scratch, 'to'), () => {
        throw Object.assign(new Error('no'), { code: 'EACCES' })
      }),
    ).toThrow('no')
  })
})

describe('asSamplePath', () => {
  it('reads each name the agent’s folder went by, on either separator, as the sample', () => {
    const sample = '/skill/evals/runs/r/note-s1'
    const names = [
      '/private/var/T/skill-studio-sample-x/note-s1',
      '/var/T/skill-studio-sample-x/note-s1',
    ]
    expect(
      asSamplePath(
        'cat /private/var/T/skill-studio-sample-x/note-s1/outputs/a.md /var/T/skill-studio-sample-x/note-s1/notes.md',
        names,
        sample,
      ),
    ).toBe(`cat ${sample}/outputs/a.md ${sample}/notes.md`)
    expect(
      asSamplePath(
        'C:/Temp/skill-studio-sample-x/note-s1/outputs/a.md',
        ['C:\\Temp\\skill-studio-sample-x\\note-s1'],
        'C:\\s',
      ),
    ).toBe('C:\\s/outputs/a.md')
  })
})
