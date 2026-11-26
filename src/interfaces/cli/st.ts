#!/usr/bin/env node
/**
 * `st`: the Skill Studio command line. Every command takes a skill directory
 * (default: the current directory) and works on its `evals/`.
 *
 *   st cases [skill]
 *   st case add [skill] --prompt <text> | --prompt-file <file> [--title <text>] [--check <text>]... [--file <path>]... [--artifact html|image] [--size WxH]
 *   st case check [skill]
 *   st run [skill] --engine claude --model sonnet --cases a,b --samples 2
 *   st grade [skill] --run <name> | --all   [--no-jev]
 *   st report [skill] --run <name>
 *   st compare [skill] <runA> <runB>
 *   st read [skill] --run <name> [--blind] [--model sonnet] [--out <file>] [--answers <file>]
 *   st read [skill] --recount <file>
 *   st sort [skill] [--again] [--model <id>]
 *   st propose [skill] [--cases a,b] [--again] [--all] [--deep] | [--case <id>] --accept <ids> | --drop <ids>
 *   st self-test [skill] [--no-jev]
 *   st versions [skill]
 *   st serve [skill...] [--port 4400] [--tailscale [--tailscale-port 8443]]
 *   st open [skill] [--case <id>] [--a <run>] [--b <run>] | --stop
 *   st new <dir> [--name <id>] [--description <text>]
 *
 * Each command is a module in `commands/`; this file reads the flags, picks
 * the command and exits with its code. Every model call the command makes is
 * counted to its meter, and with `ST_AI_REPLAY` one that had no saved reply
 * ends it with code 2. The ones that start agents end them
 * before they go: on Ctrl-C, and when asked to stop. A run or a grading cut
 * off that way stops as one stopped in the app does: no report is written
 * from part of it.
 */
import { parseArgs } from 'node:util'
import { withMeter } from '@judges/meter.ts'
import { loadEnv } from '../host.ts'
import { agentLifecycle } from '../lifecycle.ts'
import type { Values } from './commands/command.ts'
import { commandOf, HELP, OPTIONS } from './commands/index.ts'
import { contextOf, skillOf } from './commands/shared.ts'
import { withHint } from './input.ts'

async function main(): Promise<number> {
  loadEnv()
  const { values, positionals } = parseArgs({ allowPositionals: true, options: OPTIONS })
  if (values.help || !positionals[0]) {
    console.log(HELP)
    // Asking for the help succeeds; running with no command is a usage error.
    return values.help ? 0 : 2
  }
  const found = commandOf(positionals)
  // These start agents: the ones an earlier copy left are ended first, and Ctrl-C ends this copy's.
  const lifecycle = found?.command.agents ? agentLifecycle({ signals: true }) : null
  // Only a flag that takes text is given once for each value (`--check`), so a list holds text.
  const context = contextOf(found?.args ?? positionals.slice(1), values as Values, lifecycle)
  if (found)
    return withMeter(async (meter) => {
      const code = await found.command.run(context)
      // A replay that had no saved reply for a call did not do what was asked, whatever else came of it.
      for (const missing of new Set(meter.missing)) console.error(missing)
      return meter.missing.length ? 2 : code
    })
  // An unknown command is named only once a skill is found, as for every command but new and serve.
  skillOf(context.args)
  throw new Error(`Unknown command ${positionals[0]}.\n\n${HELP}`)
}

main().then(
  (code) => {
    process.exitCode = code
  },
  (error: Error) => {
    // The flag that would fix it is the command line's to name.
    console.error(withHint(error.message))
    process.exitCode = 2
  },
)
