import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { sampleShown } from '@domain/pairs.ts'
import { type AddressRun, resultsAddress } from '@domain/results-address.ts'
import { loadCases } from '@infrastructure/cases.ts'
import { isDir } from '@infrastructure/fs.ts'
import { readRun, runDir } from '@infrastructure/runs.ts'
import { RENDERER_DIST } from '../../host.ts'
import { runNameOf } from '../input.ts'
import { OPEN_HOST, openServer, stopServer, ticketAddress } from '../open-server.ts'
import type { Command, FlagValues } from './command.ts'
import { shared } from './flags.ts'
import { skillOf } from './shared.ts'

const flags = {
  ...shared('case'),
  a: { type: 'string' },
  b: { type: 'string' },
  stop: { type: 'boolean' },
} as const

/**
 * A run as the address reads it: each sample with the case its grading names,
 * none for a sample grading leaves out, and whether it has an output to show,
 * as Results reads them (`sampleCut`, `sampleShown`).
 */
function addressRun(skill: string, name: string | undefined): AddressRun | null {
  if (name === undefined) return null
  const run = runNameOf(name, '`st open`')
  if (!isDir(runDir(skill, run))) throw new Error(`${skill} has no run named ${run}.`)
  const view = readRun(skill, run)
  const graded = new Map((view.report?.results ?? []).map((r) => [r.sample, r.case]))
  return {
    name: run,
    samples: view.samples.map((s) => ({
      name: s.name,
      graded: s.cut ? null : (graded.get(s.name) ?? null),
      ...sampleShown(view, s),
    })),
  }
}

export const open: Command = {
  name: 'open',
  help: [
    '  open                        Print an address that opens Results in a browser, good for one',
    '                              load within a minute. It starts the app for this checkout when',
    '                              it is not running; that stops after an hour with no use.',
    '    --case <id>               The case to show; default the first one the runs answered.',
    '    --a <run>                 The run shown as A.',
    '    --b <run>                 The run shown as B.',
    "    --stop                    Stop this checkout's app now.",
  ],
  flags,
  agents: false,
  async run(context) {
    const values = context.values as FlagValues<typeof flags>
    if (values.stop) {
      const stopped = await stopServer()
      console.log(
        stopped
          ? `Stopped the app at http://${OPEN_HOST}:${stopped.port}.`
          : 'The app is not running for this checkout.',
      )
      return 0
    }
    if (!existsSync(join(RENDERER_DIST, 'index.html'))) {
      console.error('Run pnpm build first.')
      return 2
    }
    const { skill } = skillOf(context.args)
    // Built before a server is started, so a run or case it cannot name starts none.
    const address = resultsAddress({
      skill,
      cases: loadCases(skill).map((c) => c.id),
      case: values.case ?? null,
      a: addressRun(skill, values.a),
      b: addressRun(skill, values.b),
    })
    const { server, ticket, started } = await openServer()
    if (started)
      console.error(
        `Started the app for this checkout. It stops after an hour with no use, or with pnpm st open --stop.`,
      )
    console.log(ticketAddress(server.port, ticket, address))
    return 0
  },
}
