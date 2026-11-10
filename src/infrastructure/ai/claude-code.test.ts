import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { ExecOptions } from '../exec.ts'

// The CLI is a child process: these lines are what it prints.
const cli = vi.hoisted(() => ({ lines: [] as string[] }))
vi.mock('../exec.ts', async (actual) => ({
  ...(await actual<typeof import('../exec.ts')>()),
  exec: async (_command: string, _args: string[], options: ExecOptions) => {
    for (const line of cli.lines) options.onLine?.(line)
    return { code: 0, signal: null, stdout: '', stderr: '', timedOut: false, spawnError: null }
  },
}))

const { claudeAccountOf, claudeCodeProvider, commandProblem, placeBrief } = await import(
  './claude-code.ts'
)

const ask = (text: string) =>
  claudeCodeProvider.run({
    model: 'sonnet',
    effort: '',
    system: 'Line one.\nLine two.',
    messages: [{ role: 'user', text }],
    schema: null,
    signal: new AbortController().signal,
    onText: () => {},
  })

describe('run', () => {
  it('reads a result whose usage is null as no tokens counted', async () => {
    cli.lines = [
      JSON.stringify({ type: 'result', subtype: 'success', result: 'Hello.', usage: null }),
    ]
    expect(await ask('Hi')).toMatchObject({ text: 'Hello.', usage: { input: 0, output: 0 } })
  })
})

describe('commandProblem', () => {
  /** A Windows PATH with one folder holding `name`. */
  function pathWith(name: string): { env: NodeJS.ProcessEnv; done: () => void } {
    const dir = mkdtempSync(join(tmpdir(), 'st-claude-'))
    writeFileSync(join(dir, name), '')
    // Spelled as the files are, for a file system that minds the case.
    const env = { PATH: dir, PATHEXT: '.exe;.cmd' }
    return { env, done: () => rmSync(dir, { recursive: true, force: true }) }
  }

  it('says plainly that an npm install on Windows cannot run a command, and where the native one is', () => {
    const { env, done } = pathWith('claude.cmd')
    try {
      const problem = commandProblem('win32', env)
      expect(problem).toMatch('/name commands need the native Claude Code install')
      expect(problem).toMatch('https://code.claude.com/docs/en/setup')
      expect(problem).not.toMatch('one line')
    } finally {
      done()
    }
  })

  it('has nothing to say of the native install, or anywhere but Windows', () => {
    const native = pathWith('claude.exe')
    const npm = pathWith('claude.cmd')
    try {
      expect(commandProblem('win32', native.env)).toBeNull()
      expect(commandProblem('darwin', npm.env)).toBeNull()
      expect(commandProblem('linux', npm.env)).toBeNull()
    } finally {
      native.done()
      npm.done()
    }
  })
})

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
