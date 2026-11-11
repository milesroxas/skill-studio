import type { RunView } from '@domain/views.ts'
import { describe, expect, it } from 'vitest'
import { newestRun, resultsUnread, withSeen } from './results-seen.ts'

const run = (createdAt: string, finishedAt: string | null): RunView =>
  ({ name: createdAt, meta: { createdAt, finishedAt } }) as unknown as RunView

describe('newestRun', () => {
  it('is when the newest finished run started', () => {
    const runs = [
      run('2026-11-01T10:00:00.000Z', '2026-11-01T10:05:00.000Z'),
      run('2026-11-03T10:00:00.000Z', '2026-11-03T10:05:00.000Z'),
      run('2026-11-02T10:00:00.000Z', '2026-11-02T10:05:00.000Z'),
    ]
    expect(newestRun(runs)).toBe('2026-11-03T10:00:00.000Z')
  })

  it('passes over a run still writing, and one with no record of itself', () => {
    const runs = [
      run('2026-11-01T10:00:00.000Z', '2026-11-01T10:05:00.000Z'),
      run('2026-11-02T10:00:00.000Z', null),
      { name: 'legacy', meta: null } as unknown as RunView,
    ]
    expect(newestRun(runs)).toBe('2026-11-01T10:00:00.000Z')
    expect(newestRun([run('2026-11-02T10:00:00.000Z', null)])).toBeNull()
    // A run.json with no start time is never the one to read, or Results could never mark it.
    expect(newestRun([run('', '2026-11-02T10:05:00.000Z')])).toBeNull()
    expect(newestRun([])).toBeNull()
  })
})

describe('resultsUnread', () => {
  const at = '2026-11-02T10:00:00.000Z'

  it('is true for a finished run Results has not shown', () => {
    expect(resultsUnread(at, undefined)).toBe(true)
    expect(resultsUnread(at, '2026-11-01T10:00:00.000Z')).toBe(true)
  })

  it('is false once Results showed it, or a newer one, and with nothing to read', () => {
    expect(resultsUnread(at, at)).toBe(false)
    // The newest run was deleted since: the one left was read before it.
    expect(resultsUnread(at, '2026-11-03T10:00:00.000Z')).toBe(false)
    expect(resultsUnread(null, undefined)).toBe(false)
  })
})

describe('withSeen', () => {
  it('keeps each skill apart', () => {
    const one = withSeen({}, '/skills/a', '2026-11-02T10:00:00.000Z')
    expect(withSeen(one, '/skills/b', '2026-11-01T10:00:00.000Z')).toEqual({
      '/skills/a': '2026-11-02T10:00:00.000Z',
      '/skills/b': '2026-11-01T10:00:00.000Z',
    })
  })

  it('moves on to a newer run, and never back to an older one', () => {
    const seen = { '/skills/a': '2026-11-02T10:00:00.000Z' }
    expect(withSeen(seen, '/skills/a', '2026-11-03T10:00:00.000Z')).toEqual({
      '/skills/a': '2026-11-03T10:00:00.000Z',
    })
    expect(withSeen(seen, '/skills/a', '2026-11-01T10:00:00.000Z')).toBe(seen)
    expect(withSeen(seen, '/skills/a', '2026-11-02T10:00:00.000Z')).toBe(seen)
  })
})
