/**
 * The real `st` under a replay: it asks no assistant and no Jev, so on an
 * empty folder of replies it stops at the first call, naming the call, and
 * still prints what the command cost.
 */
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

const ROOT = resolve(import.meta.dirname, '../../..')
const FIXTURE = join(ROOT, 'fixtures/launch-note')

const made: string[] = []
const scratch = (prefix: string): string => {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  made.push(dir)
  return dir
}
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

describe('st under ST_AI_REPLAY', () => {
  it('stops sort at a call with no saved reply, by its operation and key, and prints the cost', () => {
    const skill = join(scratch('st-replay-skill-'), 'launch-note')
    cpSync(join(FIXTURE, 'SKILL.md'), join(skill, 'SKILL.md'))
    cpSync(join(FIXTURE, 'evals/cases'), join(skill, 'evals/cases'), { recursive: true })
    const replies = scratch('st-replay-replies-')
    const st = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        'src/interfaces/cli/st.ts',
        'sort',
        skill,
        '--again',
        '--model',
        'sonnet',
        '--json',
      ],
      {
        cwd: ROOT,
        encoding: 'utf8',
        env: {
          ...process.env,
          ST_AI_REPLAY: replies,
          ST_AI_RECORD: '',
          SKILL_STUDIO_HOME: scratch('st-replay-home-'),
          TYPESAFE_API_KEY: '',
          ANTHROPIC_API_KEY: '',
          OPENAI_API_KEY: '',
        },
      },
    )
    expect(st.stderr).not.toContain('Set up the assistant')
    expect(st.stderr).toMatch(
      new RegExp(`No saved reply for sort in ${replies.replace(/[\\^$.*+?()[\]{}|/]/g, '\\$&')}`),
    )
    expect(st.stderr).toMatch(/claude-code\/[0-9a-f]{64}\.json/)
    expect(st.status).toBe(2)
    const printed = JSON.parse(st.stdout) as { cost: unknown }
    expect(printed.cost).toEqual([])
  }, 60_000)
})
