import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { type RunReading, readingOfRun, recountReading } from '@application/reading.ts'
import type { AgainState, Agreed, CheckedMark } from '@domain/reading.ts'
import { Jev } from '@judges/jev.ts'
import { countOf, runNameOf } from '../input.ts'
import type { Command, FlagValues } from './command.ts'
import { shared } from './flags.ts'
import { held, oneRun, padEnd, signalOf, skillOf, wantsJev, withCost } from './shared.ts'

const flags = {
  ...shared(
    'run',
    'cases',
    'model',
    'effort',
    'parallel',
    'deep',
    'json',
    'out',
    'no-jev',
    'jev-model',
  ),
  blind: { type: 'boolean' },
  answers: { type: 'string' },
  recount: { type: 'string' },
} as const

const agreed = ({ agree, total }: Agreed): string =>
  total ? `${agree} of ${total} agree` : 'none to compare'

/** What Jev was shown when it was asked again, as a mark's line says it. */
const AGAIN: Record<AgainState, string> = {
  whole: 'the whole output',
  part: 'the part of the output it is joined at',
  code: 'what code saw',
  layout: 'the measured layout',
}

/** Who gave an answer, and what Jev and the reader said beside it. */
function besideOf(mark: CheckedMark): string {
  const yours = mark.fact.yours === null ? '' : `, answer: ${mark.fact.yours ? 'met' : 'missed'}`
  return mark.jev
    ? `(Jev, asked again with ${AGAIN[mark.jev.state]}: ${mark.jev.noul}; first: ${mark.fact.jev}${yours})`
    : `(Jev: ${mark.fact.jev}${yours})`
}

/** Print a reading: each answer on its fact, beside Jev's and the reader's, then how they agree. */
function printReading(reading: RunReading, against: string): void {
  for (const read of reading.cases) {
    console.log(`\n${read.case}`)
    if (read.error) {
      console.log(`  ${read.error}`)
      continue
    }
    for (const mark of read.marks) {
      const quote =
        mark.evidence === 'quoted'
          ? ''
          : mark.evidence === 'unquoted'
            ? ' [no quote]'
            : ` [its quote is not in ${mark.file || 'any file'}${mark.said ? `, it said ${mark.said}` : ''}]`
      console.log(
        `  ${padEnd(mark.output, 28)}${padEnd(mark.fact.ref, 5)}${padEnd(mark.answer, 12)}${besideOf(mark)}${mark.jev ? '' : quote}`,
      )
      console.log(`      ${mark.fact.text.slice(0, 110)}`)
      if (mark.why) console.log(`      ${mark.why}`)
    }
    for (const finding of read.findings)
      console.log(`  ${padEnd(finding.output, 28)}found: ${finding.text}`)
    if (read.note) console.log(`  ${read.note}`)
    if (read.again && read.asked && read.again.settled === read.asked)
      console.log(
        '  Jev was sure of all of it when asked again, so the assistant was asked nothing here.',
      )
  }
  const { agreement: a, usage } = reading
  console.log(
    `\n${a.asked} asked, ${a.answered} answered, ${a.cannotTell} cannot tell, ${a.skipped} not answered, ${a.unfound} with a quote that was not found`,
  )
  console.log(
    `Settled ${a.settled.agree} of the ${a.settled.total} Jev was not sure of or did not read.`,
  )
  console.log(`Against ${against}: ${agreed(a.yours)} (with a quote: ${agreed(a.yoursQuoted)}).`)
  if (reading.blind) console.log(`Against Jev where it was sure: ${agreed(a.jev)}.`)
  const again = reading.again
  if (again?.asked)
    console.log(
      `Jev was asked ${again.asked} of the ${a.asked} again first and was sure of ${again.settled}, so the assistant was asked ${a.asked - again.settled}.`,
    )
  for (const why of new Set(again?.failed ?? []))
    console.log(`Jev could not be asked some of them again, so the assistant was: ${why}`)
  if (reading.split) {
    const { jev, assistant } = reading.split
    console.log(
      `Jev, asked again: ${jev.answered} answered; against ${against}: ${agreed(jev.yours)}.`,
    )
    console.log(
      `The assistant: ${assistant.asked} asked, ${assistant.answered} answered; against ${against}: ${agreed(assistant.yours)} (with a quote: ${agreed(assistant.yoursQuoted)}).`,
    )
  }
  console.log(
    `${reading.model} on ${reading.provider}, ${usage.input.toLocaleString()} input and ${usage.output.toLocaleString()} output tokens`,
  )
}

export const read: Command = {
  name: 'read',
  help: [
    '  read                        Have the assistant read a graded run: --run <name>. It answers',
    '                              what Jev was not sure of, and prints how often its answers',
    '                              agree with yours. Jev is first asked those again, shown more',
    '                              of what each is about, and the assistant gets only what it is',
    '                              still not sure of. It writes nothing to the skill.',
    "    --blind                   Ask every rule and check and show it none of Jev's answers,",
    '                              to see how often the two agree.',
    '    --cases <a,b>             Case ids; default every case the run answered.',
    '    --model <id>              The model to ask (default sonnet), on Claude Code.',
    "    --effort <level>          Its effort; default the model's own.",
    '    --parallel <n>            Cases read at once (default 2).',
    "    --deep                    Have a session read each case's files in a folder, pages as",
    '                              drawn, instead of sending them in one message. Costs far more.',
    '    --out <file>              Also write the reading to this file, as JSON.',
    '    --answers <file>          Count its answers against the ones in this file, not against',
    '                              yours: JSON by output, then by rule or check.',
    '    --recount <file>          Count a reading saved with --out again, against your answers',
    '                              as they are now. Asks nothing, and needs no --run.',
    '    --no-jev                  Do not ask Jev again first: the assistant answers all Jev left.',
  ],
  flags,
  agents: true,
  async run(context) {
    const values = context.values as FlagValues<typeof flags>
    const { skill } = skillOf(context.args)
    if (values.recount) {
      const saved = JSON.parse(readFileSync(resolve(values.recount), 'utf8')) as RunReading
      const reading = recountReading(skill, saved)
      if (values.out) writeFileSync(resolve(values.out), `${JSON.stringify(reading, null, 2)}\n`)
      if (values.json) console.log(JSON.stringify(reading, null, 2))
      else printReading(reading, 'your answers')
      return 0
    }
    const run = oneRun(context.values)
    if (!run) throw new Error('Pass --run <name>.')
    if (!values.blind && wantsJev(context) && !Jev.available())
      console.error(
        'TYPESAFE_API_KEY is not set: Jev is not asked again, so the assistant answers all Jev left.',
      )
    const reading = await held(
      context,
      readingOfRun(skill, runNameOf(run, '--run'), {
        provider: 'claude-code',
        model: values.model ?? 'sonnet',
        effort: values.effort ?? '',
        cases: values.cases ? values.cases.split(',').map((id) => id.trim()) : [],
        blind: Boolean(values.blind),
        ...(values.answers
          ? { answers: JSON.parse(readFileSync(resolve(values.answers), 'utf8')) }
          : {}),
        parallel: countOf(values.parallel, '--parallel') ?? 2,
        inline: !values.deep,
        jev:
          !values.blind && wantsJev(context) && Jev.available()
            ? new Jev(values['jev-model'], 'read')
            : null,
        log: (line) => console.error(line),
        signal: signalOf(context),
      }),
    )
    if (values.out) writeFileSync(resolve(values.out), `${JSON.stringify(reading, null, 2)}\n`)
    if (values.json) console.log(JSON.stringify(withCost(reading), null, 2))
    else printReading(reading, values.answers ? 'the answers given' : 'your answers')
    return reading.cases.some((c) => c.error) ? 1 : 0
  },
}
