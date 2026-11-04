/**
 * The main-process side of the backend: forks the utility process, matches
 * replies to calls by id, relays job pushes, and starts it again if it dies.
 */

import type { OperationName, Reply } from '@application/api/contract.ts'
import type { Job } from '@domain/views.ts'
import { type UtilityProcess, utilityProcess } from 'electron'
import backendPath from '../backend/index.ts?modulePath'
import type { FromBackend, ToBackend } from '../channels.ts'

type Settle = (reply: Reply<unknown>) => void

export class Backend {
  private child: UtilityProcess | null = null
  private readonly pending = new Map<number, Settle>()
  private readonly jobListeners = new Set<(jobs: Job[]) => void>()
  private env: Record<string, string | undefined>
  private seq = 0

  constructor(env: Record<string, string | undefined>) {
    this.env = env
  }

  private spawn(): UtilityProcess {
    const child = utilityProcess.fork(backendPath, [], {
      env: this.env as Record<string, string>,
      serviceName: 'Skill Studio backend',
      stdio: 'inherit',
    })
    child.on('message', (message: FromBackend) => {
      if (message.type === 'reply') {
        this.pending.get(message.id)?.(message.reply)
        this.pending.delete(message.id)
      } else if (message.type === 'jobs') for (const l of this.jobListeners) l(message.jobs)
    })
    child.on('exit', (code) => {
      if (this.child === child) this.child = null
      for (const settle of this.pending.values())
        settle({ ok: false, error: `The backend stopped (code ${code}). Try again.` })
      this.pending.clear()
    })
    return child
  }

  private process(): UtilityProcess {
    this.child ??= this.spawn()
    return this.child
  }

  private send(message: ToBackend): void {
    this.process().postMessage(message)
  }

  call(name: OperationName, input: unknown): Promise<Reply<unknown>> {
    const id = ++this.seq
    return new Promise((settle) => {
      this.pending.set(id, settle)
      this.send({ type: 'call', id, name, input })
    })
  }

  /** Change the backend's environment; the same values go to a restarted backend. */
  setEnv(patch: Record<string, string | undefined>): void {
    this.env = { ...this.env, ...patch }
    if (this.child) this.send({ type: 'env', env: patch })
  }

  onJobs(listener: (jobs: Job[]) => void): () => void {
    this.jobListeners.add(listener)
    return () => {
      this.jobListeners.delete(listener)
    }
  }

  start(): void {
    this.process()
  }

  stop(): void {
    this.child?.kill()
    this.child = null
  }
}
