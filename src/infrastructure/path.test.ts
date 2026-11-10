import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { installDirs, loginShellPath, markedPath, mergePath, nvmBinDirs } from './path.ts'

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

describe.skipIf(process.platform === 'win32')('loginShellPath', () => {
  /** A stand-in for a login shell: a script that does `body`, whatever it is asked. */
  async function withShell<T>(body: string, use: (shell: string) => Promise<T>): Promise<T> {
    const dir = mkdtempSync(join(tmpdir(), 'st-shell-'))
    const shell = join(dir, 'shell')
    writeFileSync(shell, `#!/bin/sh\n${body}\n`)
    chmodSync(shell, 0o755)
    try {
      return await use(shell)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
  // What a startup file can leave behind: a process that outlives the shell and holds its output.
  const LEFT_BEHIND = 'sleep 4 &'

  it('reads the PATH the shell prints', async () => {
    const path = await withShell(
      `printf '__SKILL_STUDIO_PATH__%s__SKILL_STUDIO_PATH__' /a:/b`,
      (shell) => loginShellPath(shell, 10_000),
    )
    expect(path).toBe('/a:/b')
  })

  it('takes the PATH as soon as it is whole, though the output is still held open', async () => {
    const started = Date.now()
    const path = await withShell(
      `${LEFT_BEHIND}\nprintf '__SKILL_STUDIO_PATH__%s__SKILL_STUDIO_PATH__' /a:/b`,
      (shell) => loginShellPath(shell, 60_000),
    )
    expect(path).toBe('/a:/b')
    expect(Date.now() - started).toBeLessThan(3000)
  })

  it('gives up when the time is over, though the output never closes', async () => {
    const path = await withShell(LEFT_BEHIND, (shell) => loginShellPath(shell, 200))
    expect(path).toBeNull()
  })
})
