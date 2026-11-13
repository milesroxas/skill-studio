/**
 * The main-process side of the backend: forks the utility process, matches
 * replies to calls by id, relays job pushes, and starts it again if it dies.
 */

import type { OperationName, Reply } from '@application/api/contract.ts'
import type { DrawnPage, PageRenderer } from '@domain/artifact-address.ts'
import { type UtilityProcess, utilityProcess } from 'electron'
import backendPath from '../backend/index.ts?modulePath'
import type { FromBackend, Pushes, PushTopic, ToBackend } from '../channels.ts'

type Settle = (reply: Reply<unknown>) => void

/** How long the backend has to end its processes and exit: longer than it gives them. */
const STOP_GRACE_MS = 4000

export class Backend {
  private child: UtilityProcess | null = null
  private readonly pending = new Map<number, Settle>()
  private readonly listeners: { [K in PushTopic]: Set<(value: Pushes[K]) => void> } = {
    jobs: new Set(),
    ai: new Set(),
  }
  private env: Record<string, string | undefined>
  private seq = 0
  /** Draws a page the backend asks for; set once the app is ready to open windows. */
  private renderer: PageRenderer | null = null

  constructor(env: Record<string, string | undefined>) {
    this.env = env
  }

  /** Answer the backend's requests to draw a page with `render`. */
  drawWith(render: PageRenderer): void {
    this.renderer = render
  }

  /** Draw the page the backend asked for and send it back to the process that asked. */
  private async draw(
    child: UtilityProcess,
    message: Extract<FromBackend, { type: 'render' }>,
  ): Promise<void> {
    let reply: Reply<DrawnPage>
    try {
      if (!this.renderer) throw new Error('The app cannot draw pages yet.')
      reply = { ok: true, value: await this.renderer(message.page, message) }
    } catch (error) {
      reply = { ok: false, error: (error as Error).message }
    }
    // A backend that stopped meanwhile asked for nothing any more.
    if (this.child === child) child.postMessage({ type: 'rendered', id: message.id, reply })
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
      } else if (message.type === 'push') this.tell(message.topic, message.value)
      else if (message.type === 'render') void this.draw(child, message)
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
    // A cleared variable is left out: a process cannot be started with an unset value.
    const env = { ...this.env, ...patch }
    this.env = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== undefined))
    if (this.child) this.send({ type: 'env', env: patch })
  }

  private tell<K extends PushTopic>(topic: K, value: Pushes[K]): void {
    for (const listener of this.listeners[topic]) listener(value)
  }

  /** Be told what the backend pushes on a topic; returns the unsubscribe. */
  on<K extends PushTopic>(topic: K, listener: (value: Pushes[K]) => void): () => void {
    this.listeners[topic].add(listener)
    return () => {
      this.listeners[topic].delete(listener)
    }
  }

  start(): void {
    this.process()
  }

  /**
   * Stop the backend. It is asked first, so that it ends the agent processes it
   * started; one that does not answer in time is killed. Resolves once its
   * process is gone, so nothing it was writing lands after.
   */
  stop(): Promise<void> {
    const child = this.child
    this.child = null
    if (!child) return Promise.resolve()
    return new Promise((resolve) => {
      const kill = setTimeout(() => {
        // A process that never came up has no exit to wait for.
        if (!child.kill()) resolve()
      }, STOP_GRACE_MS)
      child.once('exit', () => {
        clearTimeout(kill)
        resolve()
      })
      child.postMessage({ type: 'stop' } satisfies ToBackend)
    })
  }
}
