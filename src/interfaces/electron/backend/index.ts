/**
 * The backend utility process: hosts the operations table so file reads,
 * hashing and agent processes never block the main process. Speaks to main
 * over `process.parentPort` only.
 */
import { watchRuns } from '@application/ai.ts'
import { createOperations, invoke, isOperation } from '@application/api/operations.ts'
import { watchJobs } from '@application/jobs.ts'
import { agentLifecycle, keepRunning } from '../../lifecycle.ts'
import type { FromBackend, ToBackend } from '../channels.ts'

const port = process.parentPort
const post = (message: FromBackend): void => port.postMessage(message)

// One reply that throws with nothing to catch it must not end every job in flight.
keepRunning((line) => console.error(line))
// The app tells this process when to stop, so it listens for no signal itself.
const agents = agentLifecycle({ log: (line) => console.warn(line) })

const operations = createOperations({ skills: [] })

async function call(id: number, name: string, input: unknown): Promise<void> {
  try {
    if (!isOperation(name)) throw new Error(`No operation ${name}.`)
    const value = await invoke(operations, name, input)
    post({ type: 'reply', id, reply: { ok: true, value } })
  } catch (error) {
    post({ type: 'reply', id, reply: { ok: false, error: (error as Error).message } })
  }
}

port.on('message', (event) => {
  const message = event.data as ToBackend
  if (message.type === 'call') void call(message.id, message.name, message.input)
  else if (message.type === 'env') {
    for (const [key, value] of Object.entries(message.env))
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
  } else
    void agents
      .stop()
      .catch((error: unknown) => console.error('Could not stop cleanly:', error))
      .finally(() => process.exit(0))
})

watchJobs((jobs) => post({ type: 'push', topic: 'jobs', value: jobs }))
watchRuns((run) => post({ type: 'push', topic: 'ai', value: run }))
post({ type: 'ready' })
