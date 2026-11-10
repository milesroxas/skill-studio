import { describe, expect, it } from 'vitest'
import { agentEnv } from './env.ts'

describe('agentEnv', () => {
  it('keeps the app’s own keys and the Claude Code guard from a child', () => {
    const env = agentEnv({
      PATH: '/usr/bin',
      TYPESAFE_API_KEY: 'ts_1',
      SKILL_STUDIO_ANTHROPIC_API_KEY: 'sk-ant',
      CLAUDECODE: '1',
      ANTHROPIC_API_KEY: 'theirs',
    })
    expect(env).toEqual({ PATH: '/usr/bin', ANTHROPIC_API_KEY: 'theirs' })
  })

  it('hides a key under any case of its name on Windows, where the name reads the same', () => {
    const source = {
      Path: 'C:\\Windows',
      typesafe_api_key: 'ts_1',
      Skill_Studio_OpenAI_Api_Key: 'sk',
    }
    expect(agentEnv({ ...source, OS: 'Windows_NT' })).toEqual({
      Path: 'C:\\Windows',
      OS: 'Windows_NT',
    })
    expect(agentEnv(source, true)).toEqual({ Path: 'C:\\Windows' })
  })

  it('leaves a name in another case alone elsewhere, where it is another variable', () => {
    const source = { typesafe_api_key: 'not the key' }
    expect(agentEnv(source)).toEqual(source)
    expect(agentEnv({ ...source, OS: 'Windows_NT' }, false)).toEqual({
      ...source,
      OS: 'Windows_NT',
    })
  })
})
