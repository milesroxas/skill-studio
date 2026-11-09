import { describe, expect, it } from 'vitest'
import { agentEnv } from './env.ts'

describe('agentEnv', () => {
  it("drops the app's keys and Claude Code's guard, and keeps the rest", () => {
    expect(
      agentEnv({
        PATH: '/usr/bin',
        HOME: '/Users/a',
        ANTHROPIC_API_KEY: 'theirs',
        CLAUDECODE: '1',
        CLAUDECODE_SESSION: 'x',
        TYPESAFE_API_KEY: 'ts_secret',
        SKILL_STUDIO_ANTHROPIC_API_KEY: 'sk-ant-secret',
        SKILL_STUDIO_OPENAI_API_KEY: 'sk-secret',
        SKILL_STUDIO_HOME: '/tmp/home',
      }),
    ).toEqual({ PATH: '/usr/bin', HOME: '/Users/a', ANTHROPIC_API_KEY: 'theirs' })
  })

  it('reads the process environment by default', () => {
    expect(agentEnv().PATH).toBe(process.env.PATH)
    expect(agentEnv().TYPESAFE_API_KEY).toBeUndefined()
  })
})
