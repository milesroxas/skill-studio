/**
 * Opt-in access from your other devices over Tailscale (`st serve --tailscale`).
 *
 * The server still listens on 127.0.0.1 only. `tailscale serve` runs in the
 * foreground as a child process and proxies one HTTPS port on this machine's
 * tailnet name to it, so the mapping goes away when the server stops. Only the
 * login that owns this machine is allowed through (see guard.ts).
 */
import { type ChildProcess, execFile, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { promisify } from 'node:util'
import type { Remote } from './guard.ts'

const run = promisify(execFile)

export const DEFAULT_TAILSCALE_PORT = 8443

/** The CLI on PATH, or the one inside the macOS app. */
function cli(): string {
  const app = '/Applications/Tailscale.app/Contents/MacOS/Tailscale'
  return process.platform === 'darwin' && existsSync(app) && !onPath('tailscale')
    ? app
    : 'tailscale'
}

function onPath(bin: string): boolean {
  return (process.env.PATH ?? '').split(':').some((dir) => existsSync(`${dir}/${bin}`))
}

async function json<T>(bin: string, args: string[]): Promise<T> {
  try {
    const { stdout } = await run(bin, args)
    return JSON.parse(stdout) as T
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT')
      throw new Error('Tailscale is not installed: https://tailscale.com/download')
    throw new Error(`\`tailscale ${args.join(' ')}\` failed: ${(error as Error).message}`)
  }
}

interface Status {
  BackendState: string
  Self: { DNSName: string; UserID: number; Tags?: string[] }
  User?: Record<string, { LoginName: string }>
}

interface ServeConfig {
  TCP?: Record<string, unknown>
}

/** `tailscale serve` run in the foreground files its config under Foreground, per session. */
interface ServeStatus extends ServeConfig {
  Foreground?: Record<string, ServeConfig>
}

const serves = (status: ServeStatus, port: number): boolean =>
  [status, ...Object.values(status.Foreground ?? {})].some((c) => c.TCP?.[String(port)])

/** This machine's tailnet name and owner, checked so the guard has something to trust. */
export async function tailnetIdentity(bin = cli()): Promise<Remote> {
  const status = await json<Status>(bin, ['status', '--json'])
  if (status.BackendState !== 'Running')
    throw new Error(`Tailscale is ${status.BackendState}. Run \`tailscale up\` first.`)
  if (status.Self.Tags?.length)
    throw new Error(
      'This machine is a tagged Tailscale device, so requests carry no user to check.',
    )
  const host = status.Self.DNSName.replace(/\.$/, '')
  const login = status.User?.[String(status.Self.UserID)]?.LoginName
  if (!host) throw new Error('Tailscale gave this machine no DNS name. Turn on MagicDNS.')
  if (!login) throw new Error('Tailscale did not say who owns this machine.')
  return { host, users: [login] }
}

/**
 * Proxy https://<host>:<httpsPort> on the tailnet to the local server. Resolves
 * once the mapping is live; stop() (or this process exiting) removes it.
 */
export async function serveOnTailnet(
  localPort: number,
  host: string,
  httpsPort = DEFAULT_TAILSCALE_PORT,
  bin = cli(),
): Promise<{ url: string; stop: () => void }> {
  const before = await json<ServeStatus>(bin, ['serve', 'status', '--json'])
  if (serves(before, httpsPort))
    throw new Error(
      `Tailscale already serves port ${httpsPort}. Pass --tailscale-port, or free it: tailscale serve --https=${httpsPort} off`,
    )
  const child: ChildProcess = spawn(
    bin,
    ['serve', '--yes', `--https=${httpsPort}`, `http://127.0.0.1:${localPort}`],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  )
  let stderr = ''
  child.stderr?.on('data', (chunk) => {
    stderr += chunk
  })
  const stop = () => {
    if (child.exitCode === null) child.kill('SIGTERM')
  }
  process.once('exit', stop)
  const codes = { SIGHUP: 129, SIGINT: 130, SIGTERM: 143 } as const
  for (const [signal, code] of Object.entries(codes))
    process.once(signal, () => {
      stop()
      process.exit(code)
    })

  for (let i = 0; i < 50; i++) {
    if (child.exitCode !== null)
      throw new Error(`tailscale serve exited: ${stderr.trim() || `code ${child.exitCode}`}`)
    const now = await json<ServeStatus>(bin, ['serve', 'status', '--json'])
    if (serves(now, httpsPort)) {
      child.once('exit', (code) => {
        console.error(
          `tailscale serve stopped (${stderr.trim() || `code ${code}`}). The tailnet address is gone; the local one still works.`,
        )
      })
      return { url: `https://${host}${httpsPort === 443 ? '' : `:${httpsPort}`}`, stop }
    }
    await new Promise((done) => setTimeout(done, 100))
  }
  stop()
  throw new Error(`tailscale serve did not come up: ${stderr.trim() || 'no output'}`)
}
