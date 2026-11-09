import { describe, expect, it } from 'vitest'
import { codexAccountOf } from './codex.ts'

describe('codexAccountOf', () => {
  it('reads a ChatGPT login as the plan', () => {
    expect(codexAccountOf('\nLogged in using ChatGPT\n')).toEqual({
      signedIn: true,
      email: null,
      billing: 'plan',
      plan: null,
    })
  })

  it('reads a key login as a key', () => {
    expect(codexAccountOf('Logged in using an API key - sk-…abcd')?.billing).toBe('key')
  })

  it('reads a signed-out CLI', () => {
    expect(codexAccountOf('Not logged in\n')?.signedIn).toBe(false)
  })

  it('cannot say from anything else', () => {
    expect(codexAccountOf('')).toBeNull()
    expect(codexAccountOf("error: unrecognized subcommand 'status'")).toBeNull()
  })
})
