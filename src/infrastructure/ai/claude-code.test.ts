import { describe, expect, it } from 'vitest'
import { claudeAccountOf, placeBrief } from './claude-code.ts'

describe('placeBrief', () => {
  it('passes a small brief as the system prompt argument', () => {
    expect(placeBrief('Be brief.', 'Hello', false, 'darwin')).toEqual({
      systemPrompt: 'Be brief.',
      prompt: 'Hello',
    })
  })

  it('leads the prompt with a brief too long for an argument, and says so in the argument', () => {
    const brief = 'x'.repeat(30 * 1024)
    const placed = placeBrief(brief, 'Hello', false, 'linux')
    expect(placed.systemPrompt).toMatch(/first block of the prompt/)
    expect(placed.prompt).toBe(`<system>\n${brief}\n</system>\n\nHello`)
  })

  it('always leads the prompt on Windows, where a command line takes no line break', () => {
    expect(placeBrief('Line one.\nLine two.', 'Hello', false, 'win32').prompt).toMatch(/^<system>/)
  })

  it('keeps a command whole, since the CLI expands only a prompt that is the command alone', () => {
    const brief = 'x'.repeat(30 * 1024)
    expect(placeBrief(brief, '/review', true, 'linux')).toEqual({
      systemPrompt: brief,
      prompt: '/review',
    })
  })
})

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
