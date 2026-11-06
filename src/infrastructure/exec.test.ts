import { describe, expect, it } from 'vitest'
import { exec, stopAll } from './exec.ts'

const node = process.execPath
/** Prints its pid, then stays up; `deaf` also ignores the request to end. */
const stay = (deaf: boolean): string[] => [
  '-e',
  `${deaf ? "process.on('SIGTERM', () => {});" : ''}console.log(process.pid);setInterval(() => {}, 1000)`,
]

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** Start a process that stays up; gives its pid once it has printed it, and its end. */
async function start(deaf = false) {
  let ready: (pid: number) => void = () => {}
  const pid = new Promise<number>((resolve) => {
    ready = resolve
  })
  const done = exec(node, stay(deaf), {
    cwd: process.cwd(),
    timeoutMs: 30_000,
    onLine: (line) => ready(Number(line)),
  })
  return { pid: await pid, done }
}

describe('stopAll', () => {
  it('ends every process still running and waits until each is gone', async () => {
    const first = await start()
    const second = await start()

    await stopAll()

    expect(alive(first.pid)).toBe(false)
    expect(alive(second.pid)).toBe(false)
    expect((await first.done).timedOut).toBe(false)
  })

  it('ends a process that ignores the request, once the wait is over', async () => {
    const deaf = await start(true)

    await stopAll(100)

    expect(alive(deaf.pid)).toBe(false)
    // SIGKILL, where the platform says which signal ended it.
    if (process.platform !== 'win32') expect((await deaf.done).signal).toBe('SIGKILL')
  })

  it('has nothing to wait for when nothing is running', async () => {
    const finished = await exec(node, ['-e', ''], { cwd: process.cwd(), timeoutMs: 30_000 })
    expect(finished.code).toBe(0)

    await expect(stopAll()).resolves.toBeUndefined()
  })
})
