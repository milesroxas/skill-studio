import { describe, expect, it } from 'vitest'
import { noticeMs } from './hooks.ts'

describe('noticeMs', () => {
  it('keeps a failure and a warning until the reader dismisses them', () => {
    expect(noticeMs({ message: 'Not saved: disk full', tone: 'destructive' })).toBeNull()
    expect(noticeMs({ message: '1.2.0 already exists.', tone: 'warning' })).toBeNull()
  })

  it('gives a short fact a floor, and a long one time to read', () => {
    expect(noticeMs({ message: 'Saved' })).toBe(2600)
    const long = Array.from({ length: 30 }, () => 'word').join(' ')
    expect(noticeMs({ message: long })).toBe(30 * 300 + 1000)
  })

  it('leaves time to reach an offer', () => {
    expect(noticeMs({ message: 'Deleted v2', undo: () => {} })).toBe(7000)
    expect(noticeMs({ message: 'Created x', action: { label: 'Open', run: () => {} } })).toBe(7000)
  })
})
