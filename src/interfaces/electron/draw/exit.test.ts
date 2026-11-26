import { describe, expect, it, vi } from 'vitest'
import { exitNowOf } from './exit.ts'

describe('exitNowOf', () => {
  it('ends through Node’s own exit where there is one, called on the process', () => {
    const host = {
      reallyExit: vi.fn(function (this: unknown) {
        return this
      }),
      exit: vi.fn(),
    }
    const end = exitNowOf(host as never)
    end(0)
    expect(host.reallyExit).toHaveBeenCalledWith(0)
    expect(host.reallyExit.mock.results[0]?.value).toBe(host)
    expect(host.exit).not.toHaveBeenCalled()
  })

  it('ends through process.exit where a Node has none, or something else under the name', () => {
    for (const reallyExit of [undefined, 'not a function']) {
      const host = { reallyExit, exit: vi.fn() }
      exitNowOf(host as never)(3)
      expect(host.exit).toHaveBeenCalledWith(3)
    }
  })
})
