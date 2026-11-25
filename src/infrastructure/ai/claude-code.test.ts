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

const { claudeAccountOf, claudeCodeProvider, commandProblem, folderArgs, placeBrief } =
  await import('./claude-code.ts')

const ask = (text: string) =>
  claudeCodeProvider.run({
    operation: 'chat',
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

  it('reports the thinking as it grows, apart from the reply', async () => {
    const delta = (d: Record<string, string>) =>
      JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', delta: d } })
    cli.lines = [
      delta({ type: 'thinking_delta', thinking: 'Counting ' }),
      delta({ type: 'thinking_delta', thinking: 'the rules.' }),
      delta({ type: 'text_delta', text: 'Three.' }),
      JSON.stringify({ type: 'result', subtype: 'success', result: 'Three.', usage: null }),
    ]
    const thinking: string[] = []
    const reply = await claudeCodeProvider.run({
      operation: 'chat',
      model: 'sonnet',
      effort: '',
      system: 'Brief.',
      messages: [{ role: 'user', text: 'How many?' }],
      schema: null,
      signal: new AbortController().signal,
      onText: () => {},
      onThinking: (text) => thinking.push(text),
    })
    expect(thinking).toEqual(['Counting ', 'Counting the rules.'])
    expect(reply.text).toBe('Three.')
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

describe('a session that reads a folder', () => {
  const request = {
    operation: 'read' as const,
    dir: '/private/tmp/skill-studio-reading-x/room',
    model: 'sonnet',
    effort: '',
    schema: { type: 'object' },
  }
  const given = (args: string[], flag: string) => args[args.indexOf(flag) + 1]

  it('gets only the tools that read, and asks nobody', () => {
    const args = folderArgs(request, 'Brief.')
    expect(given(args, '--tools')).toBe('Read,Glob,Grep')
    expect(given(args, '--permission-mode')).toBe('dontAsk')
    expect(given(args, '--setting-sources')).toBe('')
    expect(args).toContain('--disable-slash-commands')
    expect(args).toContain('--strict-mcp-config')
  })

  it('is allowed its own folder and nothing else', () => {
    const args = folderArgs(request, 'Brief.')
    expect(given(args, '--allowedTools')).toBe('Read(//private/tmp/skill-studio-reading-x/room/**)')
    expect(args.filter((arg) => arg === '--allowedTools')).toHaveLength(1)
  })

  it('names the effort only when one is given', () => {
    expect(folderArgs(request, 'Brief.')).not.toContain('--effort')
    expect(given(folderArgs({ ...request, effort: 'high' }, 'Brief.'), '--effort')).toBe('high')
  })

  it('returns the structured reply as JSON, with what it spent', async () => {
    cli.lines = [
      JSON.stringify({ type: 'system', subtype: 'init', model: 'claude-sonnet-5-5' }),
      JSON.stringify({
        type: 'result',
        subtype: 'success',
        structured_output: { note: 'Fine.' },
        usage: { input_tokens: 5, cache_read_input_tokens: 7, output_tokens: 3 },
      }),
    ]
    const reply = await claudeCodeProvider.readFolder?.({
      ...request,
      system: 'Brief.',
      prompt: 'Read it.',
      signal: new AbortController().signal,
    })
    expect(reply).toEqual({
      text: '{"note":"Fine."}',
      model: 'claude-sonnet-5-5',
      usage: { input: 12, output: 3 },
    })
  })

  it('throws what the CLI said when the session failed', async () => {
    cli.lines = [
      JSON.stringify({ type: 'result', subtype: 'error_max_turns', result: 'Too long.' }),
    ]
    await expect(
      claudeCodeProvider.readFolder?.({
        ...request,
        system: 'Brief.',
        prompt: 'Read it.',
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('Too long.')
  })
})
