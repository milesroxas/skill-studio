import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { TOKEN_PARAM } from '../../http/guard.ts'
import { DEFAULT_PORT, startServer } from '../../http/server.ts'
import { DEFAULT_TAILSCALE_PORT, serveOnTailnet, tailnetIdentity } from '../../http/tailscale.ts'
import { keepRunning } from '../../lifecycle.ts'
import { openCommand, portOf } from '../input.ts'
import { openedServe } from '../open-server.ts'
import type { Command, FlagValues } from './command.ts'

const flags = {
  port: { type: 'string' },
  open: { type: 'boolean' },
  tailscale: { type: 'boolean' },
  'tailscale-port': { type: 'string' },
} as const

export const serve: Command = {
  name: 'serve',
  help: [
    `  serve [skill...]            Start the app (--port ${DEFAULT_PORT}; --open opens a browser).`,
    "                              It prints the address to open, which carries this start's token.",
    '                              With no skill it opens on the library of skills on this machine.',
    "                              --tailscale also serves it on this machine's tailnet name",
    `                              (--tailscale-port ${DEFAULT_TAILSCALE_PORT}), for your own Tailscale login only.`,
  ],
  flags,
  agents: true,
  async run(context) {
    const values = context.values as FlagValues<typeof flags>
    const { args } = context
    // A server outlives any one request: an error nothing caught is logged, not the end of every job.
    keepRunning()
    const here = existsSync(join(process.cwd(), 'SKILL.md')) ? [process.cwd()] : []
    const skills = args.length ? args.map((p) => resolve(p)) : here
    const port = portOf(values.port, '--port')
    const httpsPort = portOf(values['tailscale-port'], '--tailscale-port')
    if (httpsPort && !values.tailscale) throw new Error('--tailscale-port needs --tailscale.')
    const remote = values.tailscale ? await tailnetIdentity() : null
    // Started by `st open`: on a port the system picks, found by its file, and stopped when unused.
    const opened = openedServe()
    const server = await startServer({
      skills,
      port: opened ? 0 : port,
      remote,
      onRequest: opened?.onRequest,
    })
    const stop = () => {
      void (context.lifecycle?.stop() ?? Promise.resolve()).finally(() => process.exit(0))
    }
    if (opened && !opened.host(server, stop)) {
      // Another `st open` started this checkout's server at the same time, and it serves.
      await server.close()
      process.exit(0)
    }
    // The address carries the token every request needs, from this machine or the tailnet.
    console.log(`Skill Studio: ${server.url}${skills.length ? `  (${skills.join(', ')})` : ''}`)
    if (remote) {
      try {
        const tailnet = await serveOnTailnet(
          server.port,
          remote.host,
          httpsPort ?? DEFAULT_TAILSCALE_PORT,
        )
        // The tailnet asks for the token too: the login alone can be forged from this machine.
        console.log(
          `tailnet:      ${tailnet.url}/?${TOKEN_PARAM}=${server.token}  (${remote.users.join(', ')} only)`,
        )
      } catch (error) {
        // The local server is already listening and would keep the process alive.
        console.error((error as Error).message)
        process.exit(2)
      }
    }
    if (values.open) {
      // The opener's command line is anyone's to list: it gets a ticket good for one load, never the token.
      const {
        command: opener,
        args: openerArgs,
        verbatim,
      } = openCommand(process.platform, server.ticketUrl())
      const child = spawn(opener, openerArgs, {
        stdio: 'ignore',
        detached: true,
        windowsVerbatimArguments: verbatim,
      })
      // A system with no opener: the server is up all the same, and its address is printed.
      child.on('error', (error) =>
        console.error(`Could not open a browser (${error.message}). Open the address above.`),
      )
      child.unref()
    }
    return 0
  },
}
