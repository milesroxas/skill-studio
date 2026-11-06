import { describe, expect, it } from 'vitest'
import { createReset, type ResetSteps } from './reset.ts'

/** Steps that write down the order they ran in; `stopBackend` waits to be let go. */
function recorded(overrides: Partial<ResetSteps> = {}) {
  const log: string[] = []
  let release = (): void => {}
  const stopped = new Promise<void>((resolve) => {
    release = resolve
  })
  const steps: ResetSteps = {
    closeWindows: () => void log.push('close'),
    stopBackend: () => {
      log.push('stop')
      return stopped
    },
    clear: async () => void log.push('clear'),
    open: () => void log.push('open'),
    report: (error) => void log.push(`report: ${(error as Error).message}`),
    ...overrides,
  }
  return { log, release, reset: createReset(steps) }
}

describe('createReset', () => {
  it('closes the windows and stops the backend before it deletes, then opens the app', async () => {
    const { log, release, reset } = recorded()
    const done = reset.run()
    release()
    await done
    expect(log).toEqual(['close', 'stop', 'clear', 'open'])
  })

  it('deletes nothing while the backend is still going', async () => {
    const { log, release, reset } = recorded()
    const done = reset.run()
    await Promise.resolve()
    expect(log).toEqual(['close', 'stop'])
    release()
    await done
  })

  it('is running until the app is open again', async () => {
    const seen: boolean[] = []
    const { release, reset } = recorded({ open: () => void seen.push(reset.running()) })
    expect(reset.running()).toBe(false)
    const done = reset.run()
    expect(reset.running()).toBe(true)
    release()
    await done
    // The app opens once the reset is over, so nothing holds its first window back.
    expect(seen).toEqual([false])
    expect(reset.running()).toBe(false)
  })

  it('joins a reset under way and does not start a second', async () => {
    const { log, release, reset } = recorded()
    const first = reset.run()
    const second = reset.run()
    expect(second).toBe(first)
    release()
    await first
    expect(log.filter((step) => step === 'close')).toHaveLength(1)
  })

  it('says what failed and opens the app all the same', async () => {
    const { log, release, reset } = recorded({
      clear: async () => {
        throw new Error('EACCES: permission denied')
      },
    })
    const done = reset.run()
    release()
    await done
    expect(log).toEqual(['close', 'stop', 'report: EACCES: permission denied', 'open'])
    expect(reset.running()).toBe(false)
  })

  it('survives a step that throws before anything is awaited', async () => {
    const { log, reset } = recorded({
      closeWindows: () => {
        throw new Error('no windows')
      },
    })
    await reset.run()
    expect(log).toEqual(['report: no windows', 'open'])
    expect(reset.running()).toBe(false)
  })

  it('runs again after it has finished', async () => {
    const { log, release, reset } = recorded()
    release()
    await reset.run()
    await reset.run()
    expect(log.filter((step) => step === 'open')).toHaveLength(2)
  })
})
