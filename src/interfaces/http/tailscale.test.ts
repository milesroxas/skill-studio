import { spawn } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

const ROOT = resolve(import.meta.dirname, '../../..')
const dir = mkdtempSync(join(tmpdir(), 'st-tailscale-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

/** Wait until `met` holds, asking every few milliseconds, ten seconds at most. Says whether it did. */
async function until(met: () => boolean, withinMs = 10_000): Promise<boolean> {
  const deadline = Date.now() + withinMs
  while (!met()) {
    if (Date.now() > deadline) return false
    await new Promise((wait) => setTimeout(wait, 20))
  }
  return true
}

describe('serveOnTailnet', () => {
  it.skipIf(process.platform === 'win32')(
    'takes the tailnet address down when the terminal closes',
    async () => {
      // A stand-in for the Tailscale CLI: `serve` stays up, maps the port while it does, and
      // says when it was asked to stop.
      const bin = join(dir, 'tailscale')
      writeFileSync(
        bin,
        `#!/bin/sh
if [ "$2" = status ]; then
  if [ -f "${dir}/up" ]; then echo '{"TCP":{"8443":{}}}'; else echo '{}'; fi
  exit 0
fi
trap 'rm -f "${dir}/up"; touch "${dir}/stopped"; exit 0' TERM
touch "${dir}/up"
# Gone with the host if it is ever left behind.
while kill -0 $PPID 2>/dev/null; do sleep 0.05; done
`,
      )
      chmodSync(bin, 0o755)
      // A host as \`st serve --tailscale\` is: the lifecycle's signals, then the mapping.
      const host = join(dir, 'host.mts')
      writeFileSync(
        host,
        `import { agentLifecycle } from '${join(ROOT, 'src/interfaces/lifecycle.ts')}'
import { serveOnTailnet } from '${join(ROOT, 'src/interfaces/http/tailscale.ts')}'
agentLifecycle({ signals: true, log: () => {} })
await serveOnTailnet(4400, 'mac.tail1234.ts.net', 8443, '${bin}')
console.log('up')
setInterval(() => {}, 1000)
`,
      )
      const child = spawn(process.execPath, ['--import', 'tsx', host], {
        cwd: ROOT,
        env: { ...process.env, SKILL_STUDIO_HOME: join(dir, 'home') },
        stdio: ['ignore', 'pipe', 'inherit'],
      })
      const exited = new Promise<number | null>((done) => child.once('exit', done))
      let out = ''
      child.stdout?.on('data', (chunk) => {
        out += chunk
      })
      try {
        expect(await until(() => out.includes('up'))).toBe(true)
        expect(existsSync(join(dir, 'up'))).toBe(true)
        child.kill('SIGHUP')
        expect(await exited).toBe(129)
        expect(await until(() => existsSync(join(dir, 'stopped')))).toBe(true)
        expect(existsSync(join(dir, 'up'))).toBe(false)
      } finally {
        child.kill('SIGKILL')
      }
    },
    30_000,
  )
})
