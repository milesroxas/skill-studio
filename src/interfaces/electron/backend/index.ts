/**
 * The backend utility process: hosts the operations table so file reads,
 * hashing and agent processes never block the main process. Speaks to main
 * over `process.parentPort` only.
 */
import { createOperations, invoke, isOperation } from '@application/api/operations.ts'
import { watchJobs } from '@application/jobs.ts'
import type { FromBackend, ToBackend } from '../channels.ts'

const port = process.parentPort
const post = (message: FromBackend): void => port.postMessage(message)

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
  else if (message.type === 'env')
    for (const [key, value] of Object.entries(message.env))
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
})

watchJobs((jobs) => post({ type: 'jobs', jobs }))
post({ type: 'ready' })
