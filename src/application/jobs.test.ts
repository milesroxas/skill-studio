import { describe, expect, it } from 'vitest'
import {
  anyRunning,
  listJobs,
  markGrading,
  runJob,
  runningJob,
  say,
  stopAllJobs,
  stopJob,
} from './jobs.ts'

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
  it('lists the runs a job is grading while it grades them', async () => {
    const { job, release } = heldJob('generate', '/skills/g')
    expect(job.grading).toEqual([])
    markGrading(job, 'run-1', true)
    markGrading(job, 'run-1', true)
    markGrading(job, 'run-2', true)
    expect(job.grading).toEqual(['run-1', 'run-2'])
    markGrading(job, 'run-1', false)
    expect(job.grading).toEqual(['run-2'])
    release(true)
    await settled()
  })

  it('finds the running job on a target, and not one on another', async () => {
    const { job, release } = heldJob('generate', '/skills/a')
    expect(runningJob('generate', '/skills/a')?.id).toBe(job.id)
    expect(runningJob('generate', '/skills/b')).toBeUndefined()
    expect(runningJob('grade', '/skills/a')).toBeUndefined()
    release(true)
    await settled()
    expect(runningJob('generate', '/skills/a')).toBeUndefined()
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
    const quick: number[] = []
    for (let i = 0; i < 60; i += 1)
      quick.push(runJob('grade', `Quick ${i}`, null, `/q/${i}`, async () => true).id)
    await settled()
    const all = listJobs(1000)
    const listed = new Set(all.map((j) => j.id))
    expect(all.filter((j) => j.status !== 'running')).toHaveLength(50)
    expect(listed.has(running.id)).toBe(true)
    // The newest finished jobs are the ones kept: by id, whatever another test left in the list.
    expect(quick.slice(10).every((id) => listed.has(id))).toBe(true)
    expect(quick.slice(0, 10).some((id) => listed.has(id))).toBe(false)
    say(running, 'still here')
    release(true)
    await settled()
  })
})

describe('the list and the guards', () => {
  it('always lists a running job, however many started after it', async () => {
    const { job: running, release } = heldJob('generate', '/skills/long')
    for (let i = 0; i < 20; i += 1) runJob('grade', `Later ${i}`, null, `/l/${i}`, async () => true)
    await settled()
    const listed = listJobs()
    expect(listed.some((j) => j.id === running.id)).toBe(true)
    // Beside the running ones, the newest twelve finished.
    expect(listed.filter((j) => j.status !== 'running')).toHaveLength(12)
    expect(anyRunning()).toBe(true)
    release(true)
    await settled()
    expect(anyRunning()).toBe(false)
  })

  it('stops every running job at once', async () => {
    const a = heldJob('generate', '/skills/x')
    const b = heldJob('grade', '/skills/x/run')
    stopAllJobs()
    await settled()
    expect([a.job.status, b.job.status]).toEqual(['stopped', 'stopped'])
    expect(a.job.log.at(-1)).toContain('Stopped.')
    expect(anyRunning()).toBe(false)
  })

  it('keeps the head and the latest lines of a long log', async () => {
    const { job, release } = heldJob('generate', '/skills/chatty')
    for (let i = 0; i < 1200; i += 1) say(job, `line ${i}`)
    expect(job.log).toHaveLength(500)
    expect(job.log[0]).toContain('line 0')
    expect(job.log[100]).toContain('earlier lines are not kept')
    expect(job.log.at(-1)).toContain('line 1199')
    release(true)
    await settled()
  })
})
