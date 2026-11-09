import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { installDirs, markedPath, mergePath, nvmBinDirs } from './path.ts'

describe('installDirs', () => {
  it("lists the installers' folders, each Node of nvm newest first among them", () => {
    expect(installDirs('/Users/a', ['/Users/a/.nvm/versions/node/v22.0.0/bin'])).toEqual([
      '/Users/a/.local/bin',
      '/Users/a/.nvm/versions/node/v22.0.0/bin',
      '/Users/a/.volta/bin',
      '/Users/a/.bun/bin',
      '/Users/a/.npm-global/bin',
      '/opt/homebrew/bin',
      '/usr/local/bin',
    ])
  })

  it('reads the nvm folders of a home that has none as none', () => {
    expect(installDirs('/nowhere/at/all')).not.toContain(expect.stringContaining('.nvm'))
  })
})

describe('nvmBinDirs', () => {
  it('finds each installed Node, newest first by version number', () => {
    const home = mkdtempSync(join(tmpdir(), 'st-home-'))
    try {
      for (const v of ['v18.20.4', 'v22.3.0', 'v9.11.2', 'v22.10.1', 'notes'])
        mkdirSync(join(home, '.nvm/versions/node', v), { recursive: true })
      expect(nvmBinDirs(home)).toEqual(
        ['v22.10.1', 'v22.3.0', 'v18.20.4', 'v9.11.2'].map((v) =>
          join(home, '.nvm/versions/node', v, 'bin'),
        ),
      )
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('is empty without nvm', () => {
    expect(nvmBinDirs('/nowhere/at/all')).toEqual([])
  })
})

describe('mergePath', () => {
  it('adds only the folders the PATH lacks, in order', () => {
    expect(
      mergePath('/usr/bin:/bin', ['/opt/homebrew/bin', '/usr/bin'], installDirs('/Users/a', [])),
    ).toBe(
      '/usr/bin:/bin:/opt/homebrew/bin:/Users/a/.local/bin:/Users/a/.volta/bin:/Users/a/.bun/bin:/Users/a/.npm-global/bin:/usr/local/bin',
    )
  })

  it('starts from nothing', () => {
    expect(mergePath(undefined, ['/a'])).toBe('/a')
    expect(mergePath('', ['/a', ''])).toBe('/a')
  })
})

describe('markedPath', () => {
  it('reads the PATH between the marks, whatever the shell printed around it', () => {
    expect(markedPath('Welcome!\n__SKILL_STUDIO_PATH__/a:/b__SKILL_STUDIO_PATH__\nbye')).toBe(
      '/a:/b',
    )
  })

  it('finds none without the marks', () => {
    expect(markedPath('zsh: no such option')).toBeNull()
    expect(markedPath('__SKILL_STUDIO_PATH____SKILL_STUDIO_PATH__')).toBeNull()
  })
})
