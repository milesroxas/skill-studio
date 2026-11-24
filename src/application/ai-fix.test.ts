import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFixText } from '@domain/fix.ts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** What the model answers, one reply per request, and what it was asked. */
const world = vi.hoisted(() => ({
  replies: [] as string[],
  asked: [] as Array<{ system: string; user: string }>,
  files: [] as Array<{ path: string; text: string }>,
}))

vi.mock('@infrastructure/ai/index.ts', () => ({
  aiProvider: () => ({
    run: async ({ system, messages }: { system: string; messages: Array<{ text: string }> }) => {
      world.asked.push({ system, user: messages[0]?.text ?? '' })
      const text = world.replies.shift()
      if (text === undefined) throw new Error('no reply left')
      return { text, model: 'sonnet', usage: {} }
    },
  }),
  aiProviderInfo: async () => [
    {
      id: 'claude-code',
      connected: true,
      problem: null,
      models: [{ id: 'sonnet', label: 'Sonnet', efforts: [] }],
      account: null,
      installable: false,
    },
  ],
  isProviderError: () => false,
}))
vi.mock('@infrastructure/ai/store.ts', () => ({
  readChat: () => [],
  readUsage: () => [],
  recordUsage: () => {},
  writeChat: () => {},
}))
vi.mock('@infrastructure/preferences.ts', () => ({
  readPreferences: () => ({ aiProvider: 'claude-code', aiModel: 'sonnet', aiEffort: '' }),
}))
vi.mock('@infrastructure/answer-files.ts', () => ({
  answerText: () => ({ caseId: 'shelf', files: world.files }),
}))
vi.mock('@infrastructure/cases.ts', () => ({
  loadCases: () => [{ id: 'shelf', prompt: 'Write the launch note for Shelf.' }],
}))

const { findRun, startFix } = await import('./ai.ts')

const RULE =
  'Open with the headline and nothing before it, because readers decide in the first line.'

let skillDir = ''
beforeEach(() => {
  world.replies = []
  world.asked = []
  world.files = [{ path: 'outputs/output.md', text: 'Shelf is here. Meet the new shelf.' }]
  skillDir = mkdtempSync(join(tmpdir(), 'fix-'))
  writeFileSync(join(skillDir, 'SKILL.md'), `# Note\n\n## Rules\n\n- ${RULE}\n`)
})
afterEach(() => rmSync(skillDir, { recursive: true, force: true }))

async function ended(id: string): Promise<ReturnType<typeof findRun>> {
  for (let i = 0; i < 100 && findRun(id).status === 'running'; i += 1)
    await new Promise((next) => setImmediate(next))
  return findRun(id)
}

describe('startFix', () => {
  it('asks once, from the rule, the request and the answer, and ends on the draft', async () => {
    world.replies.push(
      JSON.stringify({
        why: 'The note opens with the product name, not the headline.',
        revision:
          'Open with the headline, never the product name, because readers decide in the first line.',
      }),
    )
    const run = await startFix({ skillDir, run: 'r1', sample: 'shelf-s1', rule: RULE })
    expect(run.kind).toBe('fix')
    const done = await ended(run.id)
    expect(done.status, done.error ?? '').toBe('done')
    expect(readFixText(done.text)).toEqual({
      why: 'The note opens with the product name, not the headline.',
      revision:
        '- Open with the headline, never the product name, because readers decide in the first line.',
    })
    expect(world.asked).toHaveLength(1)
    const { user } = world.asked[0]
    expect(user).toContain(`- ${RULE}`)
    expect(user).toContain('Write the launch note for Shelf.')
    expect(user).toContain('Shelf is here. Meet the new shelf.')
  })

  it('asks nothing when the rule is no longer in SKILL.md', async () => {
    await expect(
      startFix({
        skillDir,
        run: 'r1',
        sample: 'shelf-s1',
        rule: 'A rule since rewritten, with more words.',
      }),
    ).rejects.toThrow('changed since the run')
    expect(world.asked).toHaveLength(0)
  })

  it('fails the run on a reply with no fix in it', async () => {
    world.replies.push(JSON.stringify({ why: 'Nothing.', revision: '' }))
    const run = await startFix({ skillDir, run: 'r1', sample: 'shelf-s1', rule: RULE })
    const done = await ended(run.id)
    expect(done.status).toBe('failed')
    expect(done.error).toContain('no fix')
  })
})
