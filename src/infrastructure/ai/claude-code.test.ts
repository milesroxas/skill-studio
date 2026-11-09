import { describe, expect, it } from 'vitest'
import { claudeAccountOf } from './claude-code.ts'

describe('claudeAccountOf', () => {
  it('reads who the CLI is signed in as, and the plan that pays', () => {
    expect(
      claudeAccountOf(
        '{"loggedIn": true, "authMethod": "claude.ai", "email": "a@b.co", "subscriptionType": "max"}',
      ),
    ).toEqual({ signedIn: true, email: 'a@b.co', billing: 'plan', plan: 'max' })
    expect(claudeAccountOf('{"loggedIn": true, "authMethod": "oauth_token"}')?.billing).toBe('plan')
  })

  it('reads a key in the environment as a key, not a plan', () => {
    expect(
      claudeAccountOf(
        '{"loggedIn": true, "authMethod": "api_key", "apiKeySource": "ANTHROPIC_API_KEY"}',
      ),
    ).toEqual({ signedIn: true, email: null, billing: 'key', plan: null })
  })

  it('reads a signed-out CLI', () => {
    expect(
      claudeAccountOf('{"loggedIn": false, "authMethod": "none", "loginExpiresAt": null}'),
    ).toEqual({
      signedIn: false,
      email: null,
      billing: null,
      plan: null,
    })
  })

  it('cannot say from anything else', () => {
    expect(claudeAccountOf('')).toBeNull()
    expect(claudeAccountOf('error: unknown command auth')).toBeNull()
    expect(claudeAccountOf('null')).toBeNull()
    expect(claudeAccountOf('{"authMethod": "none"}')).toBeNull()
  })
})
