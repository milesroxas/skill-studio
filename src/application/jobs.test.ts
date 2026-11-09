import { describe, expect, it } from 'vitest'
import { listJobs, runJob, runningJob, say, stopJob } from './jobs.ts'

/** A job that ends when told to, so a test controls when it finishes. */
function heldJob(kind: 'generate' | 'grade', target: string) {
  let release: (ok: boolean) => void = () => {}
  const job = runJob(
    kind,
    `Held ${target}`,
    null,
    target,
    (_job, signal) =>
      new Promise<boolean>((done) => {
        release = done
        signal.addEventListener('abort', () => done(true), { once: true })
      }),
  )
  return { job, release: (ok: boolean) => release(ok) }
}

const settled = () => new Promise((next) => setTimeout(next, 0))

describe('jobs', () => {
  it('finds the running job on a target, and not one on another', () => {
    const { job, release } = heldJob('generate', '/skills/a')
    expect(runningJob('generate', '/skills/a')?.id).toBe(job.id)
    expect(runningJob('generate', '/skills/b')).toBeUndefined()
    expect(runningJob('grade', '/skills/a')).toBeUndefined()
    release(true)
  })

  it('stops a running job: the work sees the signal, and the job ends as failed with "Stopped."', async () => {
    const { job } = heldJob('grade', '/skills/a/run-1')
    const stopped = stopJob(job.id)
    expect(stopped.log.at(-1)).toMatch(/Stopped\.$/)
    await settled()
    // The work answered true to the signal; a stopped job still does not count as done.
    expect(job.status).toBe('stopped')
    expect(job.finishedAt).not.toBeNull()
    expect(() => stopJob(job.id)).toThrow('That job has already finished.')
  })

  it('refuses to stop a job it does not list', () => {
    expect(() => stopJob(999_999)).toThrow('That job is no longer listed.')
  })

  it('does not repeat what the work threw after a stop', async () => {
    const job = runJob(
      'grade',
      'Throws on stop',
      null,
      '/skills/t',
      (_job, signal) =>
        new Promise<boolean>((_done, fail) => {
          signal.addEventListener('abort', () => fail(new Error('Stopped.')), { once: true })
        }),
    )
    stopJob(job.id)
    await settled()
    expect(job.status).toBe('stopped')
    expect(job.log.filter((line) => line.endsWith('Stopped.'))).toHaveLength(1)
  })

  it('keeps the last 50 finished jobs and every running one', async () => {
    const { job: running, release } = heldJob('generate', '/skills/kept')
    for (let i = 0; i < 60; i += 1) runJob('grade', `Quick ${i}`, null, `/q/${i}`, async () => true)
    await settled()
    const all = listJobs(1000)
    expect(all.filter((j) => j.status !== 'running')).toHaveLength(50)
    expect(all.some((j) => j.id === running.id)).toBe(true)
    // The newest finished jobs are the ones kept.
    expect(all.some((j) => j.title === 'Quick 59')).toBe(true)
    expect(all.some((j) => j.title === 'Quick 0')).toBe(false)
    say(running, 'still here')
    release(true)
  })
})
