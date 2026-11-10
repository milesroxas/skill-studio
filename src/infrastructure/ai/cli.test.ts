import { describe, expect, it } from 'vitest'
import { runJsonLines } from './cli.ts'

const node = process.execPath
const request = () => ({ signal: new AbortController().signal })

describe('runJsonLines', () => {
  it('hands on each JSON object a CLI prints, and nothing else', async () => {
    const script = `for (const line of ['{"type":"a"}', 'null', '7', 'text', '{"type":"b"}']) console.log(line)`
    const seen: string[] = []
    await runJsonLines<{ type: string }>(node, ['-e', script], '', request(), (e) =>
      seen.push(e.type),
    )
    expect(seen).toEqual(['a', 'b'])
  })

  it.skipIf(process.platform === 'win32')(
    'says in plain words when the conversation is too long for a command',
    async () => {
      const brief = 'x'.repeat(3 * 1024 * 1024)
      const run = runJsonLines(node, ['-e', '', '--system-prompt', brief], '', request(), () => {})
      await expect(run).rejects.toThrow(/too long to send to .* as a command/)
      await expect(run).rejects.not.toThrow(/E2BIG/)
    },
  )
})
