import { mkdirSync, mkdtempSync, rmSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

// The library reads SKILL_STUDIO_HOME once, at import.
const home = mkdtempSync(join(tmpdir(), 'st-commands-home-'))
process.env.SKILL_STUDIO_HOME = home
afterAll(() => rmSync(home, { recursive: true, force: true }))
const { fingerprint, watched } = await import('./commands.ts')

describe('the fingerprint of the folders a command list was read from', () => {
  it('changes when a skill is added inside a plugin that was already there', () => {
    const plugin = join(home, 'plugin')
    mkdirSync(join(plugin, 'skills', 'first'), { recursive: true })
    // Long enough ago that a change now cannot share its time.
    const before = new Date(Date.now() - 60_000)
    for (const dir of [plugin, join(plugin, 'skills')]) utimesSync(dir, before, before)
    const was = fingerprint(watched([plugin]))

    mkdirSync(join(plugin, 'skills', 'second'))

    expect(fingerprint(watched([plugin]))).not.toBe(was)
  })

  it('holds while nothing changes, a folder that is not there included', () => {
    const plugin = join(home, 'no-commands-folder')
    mkdirSync(plugin)
    expect(fingerprint(watched([plugin]))).toBe(fingerprint(watched([plugin])))
  })
})
