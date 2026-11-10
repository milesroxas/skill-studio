import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const steps = vi.hoisted(() => ({
  order: [] as string[],
  orphans: [] as number[] | Error,
  shutdown: vi.fn(async () => {}),
}))

vi.mock('@application/shutdown.ts', () => ({ shutdown: steps.shutdown }))
vi.mock('@infrastructure/children.ts', () => ({
  agentWatcher: { started: () => {}, ended: () => {} },
  endOrphans: () => {
    steps.order.push('endOrphans')
    if (steps.orphans instanceof Error) throw steps.orphans
    return steps.orphans
  },
}))
vi.mock('@infrastructure/exec.ts', () => ({
  watchChildren: (watcher: unknown) => {
    steps.order.push(watcher ? 'watchChildren' : 'unwatch')
  },
}))

const { agentLifecycle, keepRunning } = await import('./lifecycle.ts')

/** A stand-in for `process`: signals are emitted on it, and its exit is recorded. */
function fakeHost() {
  const events = new EventEmitter()
  const exits: number[] = []
  return Object.assign(events, { exits, exit: (code: number) => void exits.push(code) })
}

const settled = () => new Promise((done) => setImmediate(done))

beforeEach(() => {
  steps.order.length = 0
  steps.orphans = []
  steps.shutdown.mockReset()
  steps.shutdown.mockResolvedValue(undefined)
})

describe('agentLifecycle', () => {
  it('ends the agents an earlier copy left, then records its own', () => {
    agentLifecycle({ log: () => {}, host: fakeHost() })
    expect(steps.order).toEqual(['endOrphans', 'watchChildren'])
  })

  it('says how many it ended, and nothing when there were none', () => {
    const lines: string[] = []
    agentLifecycle({ log: (line) => lines.push(line), host: fakeHost() })
    expect(lines).toEqual([])
    steps.orphans = [11, 12]
    agentLifecycle({ log: (line) => lines.push(line), host: fakeHost() })
    expect(lines).toEqual(['Ended 2 agent process(es) left by an earlier session.'])
  })

  it('stops everything once, however often it is asked', async () => {
    const { stop } = agentLifecycle({ log: () => {}, host: fakeHost() })
    await Promise.all([stop(), stop()])
    await stop()
    expect(steps.shutdown).toHaveBeenCalledTimes(1)
  })

  it('starts all the same when the agents an earlier copy left cannot be ended, and says why', () => {
    const lines: string[] = []
    steps.orphans = new Error('EACCES: permission denied')
    expect(() =>
      agentLifecycle({ log: (line) => lines.push(line), host: fakeHost() }),
    ).not.toThrow()
    expect(steps.order).toEqual(['endOrphans', 'watchChildren'])
    expect(lines.join('\n')).toMatch('EACCES')
  })

  it.each([
    ['SIGHUP', 129],
    ['SIGINT', 130],
    ['SIGTERM', 143],
  ])('on %s ends the agents first, then exits with %i', async (signal, code) => {
    const host = fakeHost()
    let ended = false
    let finish = () => {}
    steps.shutdown.mockImplementation(
      () =>
        new Promise<void>((done) => {
          finish = () => {
            ended = true
            done()
          }
        }),
    )
    agentLifecycle({ signals: true, log: () => {}, host })
    host.emit(signal)
    await settled()
    // Still waiting on the agents: the process has not gone.
    expect(steps.shutdown).toHaveBeenCalledTimes(1)
    expect(host.exits).toEqual([])
    finish()
    await settled()
    expect(ended).toBe(true)
    expect(host.exits).toEqual([code])
  })

  it('exits all the same when the agents could not be ended', async () => {
    const host = fakeHost()
    const lines: string[] = []
    steps.shutdown.mockRejectedValue(new Error('no such process'))
    agentLifecycle({ signals: true, log: (line) => lines.push(line), host })
    host.emit('SIGINT')
    await settled()
    expect(host.exits).toEqual([130])
    expect(lines.join('\n')).toMatch('no such process')
  })

  it('leaves signals alone unless asked, as the desktop backend needs', () => {
    const host = fakeHost()
    agentLifecycle({ log: () => {}, host })
    expect(host.listenerCount('SIGHUP')).toBe(0)
    expect(host.listenerCount('SIGINT')).toBe(0)
    expect(host.listenerCount('SIGTERM')).toBe(0)
  })
})

describe('keepRunning', () => {
  it('logs an error nothing caught, and a rejection nothing handled, and goes on', () => {
    const host = fakeHost()
    const lines: string[] = []
    keepRunning((line) => lines.push(line), host)
    host.emit('uncaughtException', new Error('bad file'))
    host.emit('unhandledRejection', 'timed out')
    expect(lines[0]).toMatch('Uncaught error: Error: bad file')
    expect(lines[1]).toBe('Unhandled rejection: timed out')
    expect(host.exits).toEqual([])
  })
})
