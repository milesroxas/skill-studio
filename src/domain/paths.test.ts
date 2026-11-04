import { describe, expect, it } from 'vitest'
import { isWithin } from './paths.ts'

describe('isWithin', () => {
  it('accepts the root itself and anything below it', () => {
    expect(isWithin('/runs/case-s1', '/runs/case-s1')).toBe(true)
    expect(isWithin('/runs/case-s1/outputs/a.md', '/runs/case-s1')).toBe(true)
    expect(isWithin('/runs/case-s1/', '/runs/case-s1')).toBe(true)
  })

  it('rejects a sibling that only shares a name prefix', () => {
    expect(isWithin('/runs/case-s10/a.md', '/runs/case-s1')).toBe(false)
  })

  it('resolves .. segments before comparing', () => {
    expect(isWithin('/runs/case-s1/../case-s2/a.md', '/runs/case-s1')).toBe(false)
    expect(isWithin('/runs/case-s1/x/../a.md', '/runs/case-s1')).toBe(true)
  })

  it('keeps a file whose name starts with two dots inside', () => {
    expect(isWithin('/runs/case-s1/..notes', '/runs/case-s1')).toBe(true)
  })
})
