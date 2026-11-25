import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { commandOf, HELP } from './index.ts'

describe('st --help', () => {
  it('is put together from the commands as `pnpm st --help` printed it before they were split', () => {
    const printed = readFileSync(new URL('./__fixtures__/help.txt', import.meta.url), 'utf8')
    // `st --help` prints the help with console.log, which ends it with a newline.
    expect(`${HELP}\n`).toBe(printed)
  })
})

describe('commandOf', () => {
  it('finds the command the arguments name, and what followed its name', () => {
    expect(commandOf(['compare', 'skill', 'a', 'b'])).toMatchObject({
      command: { name: 'compare' },
      args: ['skill', 'a', 'b'],
    })
    expect(commandOf(['nope', 'skill'])).toBeNull()
  })
})
