import { describe, expect, it } from 'vitest'
import { pairwisePack } from './index.ts'

describe('pairwisePack', () => {
  it('takes the first listed pack that judges the kind, and only one', () => {
    expect(pairwisePack(['generic', 'writing'], 'markdown')?.id).toBe('generic')
    expect(pairwisePack(['writing', 'generic'], 'markdown')?.id).toBe('writing')
  })

  it('skips a pack that cannot compare or does not judge the kind', () => {
    // The workflow pack reads transcripts and has no pairwise question.
    expect(pairwisePack(['workflow', 'code'], 'code')?.id).toBe('code')
    expect(pairwisePack(['generic', 'workflow'], 'code')).toBeUndefined()
    expect(pairwisePack(['generic'], null)).toBeUndefined()
  })
})
