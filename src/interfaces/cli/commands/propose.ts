import {
  acceptEveryCase,
  acceptProposals,
  dropEveryCase,
  dropProposals,
  type EveryProposal,
  type ProposeResult,
  proposeChecks,
  type ReadAnswer,
} from '@application/proposing.ts'
import type { Tells } from '@domain/proposal.ts'
import type { StoredFact, StoredProposal } from '@infrastructure/proposals.ts'
import { Jev } from '@judges/jev.ts'
import { countOf } from '../input.ts'
import type { Command, FlagValues } from './command.ts'
import { shared } from './flags.ts'
import { held, padEnd, signalOf, skillOf, wantsJev, withCost } from './shared.ts'

const flags = {
  ...shared(
    'cases',
    'again',
    'model',
    'effort',
    'parallel',
    'deep',
    'all',
    'json',
    'no-jev',
    'jev-model',
  ),
  case: { type: 'string' },
  accept: { type: 'string' },
  drop: { type: 'string' },
} as const

/** An answer read, as a person tells it apart: the version that wrote it, or that it had no skill. */
const answerName = (answer: Pick<ReadAnswer, 'configuration' | 'version' | 'name'>): string =>
  answer.configuration === 'without_skill'
    ? 'without the skill'
    : `${answer.version || 'a version'}${answer.name ? ` "${answer.name}"` : ''}`

const capital = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1)

const listed = (items: readonly string[]): string =>
  items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : (items[0] ?? '')

/** Where a proposal's words are, as a person reads it. */
const basisSays = (basis: StoredProposal['basis']): string =>
  basis.in === 'request'
    ? 'The request says'
    : basis.in === 'note'
      ? 'The case\'s "A good answer" note says'
      : `${basis.file} says`

/** What a folded proposal is, by how it reads the answers. */
const FOLDED: Record<Exclude<Tells, 'apart'>, string> = {
  'all meet': 'that every answer read already meets',
  'none meet': 'that no answer read meets',
  unclear: 'that the answers read do not show either way',
}

/** "12 that every answer read already meets, and 1 that no answer read meets." */
function foldedCount(tells: readonly Tells[]): string {
  const parts = (Object.keys(FOLDED) as Array<keyof typeof FOLDED>)
    .map((kind) => ({ kind, n: tells.filter((t) => t === kind).length }))
    .filter((p) => p.n)
    .map((p) => `${p.n} ${FOLDED[p.kind]}`)
  return listed(parts)
}

/** One proposal of one case, as a person reads it: its id, words, why, what asks for it and which answers meet it. */
function printProposal(p: StoredProposal): void {
  console.log(`\n  ${p.id}  ${p.check}`)
  console.log(`            Why: ${p.why}`)
  console.log(`            ${basisSays(p.basis)}: "${p.basis.quote}"`)
  if (p.shownBy && p.fault)
    console.log(`            ${capital(answerName(p.shownBy))} has: "${p.fault.quote}"`)
  const by = (meets: string) => p.answers.filter((a) => a.meets === meets).map(answerName)
  const parts = [
    by('yes').length ? `met by ${listed(by('yes'))}` : '',
    by('no').length ? `missed by ${listed(by('no'))}` : '',
    by('cannot tell').length ? `not clear for ${listed(by('cannot tell'))}` : '',
  ].filter(Boolean)
  console.log(`            ${capital(parts.join('; '))}.`)
  if (p.basisCheck?.reading === 'not sure')
    console.log('            Jev is not sure those words ask for all of it.')
  if (p.scope === 'every case')
    console.log(
      '            Proposed for every case, but on this case alone: accepted, it is added to this case.',
    )
}

/** One proposal for every case: its id, words, why, the cases it was seen on, and which answers miss it there. */
function printEvery(e: EveryProposal): void {
  console.log(`\n  ${e.id}  ${e.check}`)
  console.log(`            Why: ${e.why}`)
  console.log(
    `            Proposed on ${e.cases.length === 1 ? 'one case' : `${e.cases.length} cases`}: ${listed(e.cases)}.`,
  )
  const missed = new Map<string, string[]>()
  for (const p of e.made)
    for (const a of p.answers)
      if (a.meets === 'no')
        missed.set(answerName(a), [...(missed.get(answerName(a)) ?? []), p.case])
  if (missed.size)
    console.log(
      `            Missed by ${listed([...missed].map(([name, on]) => `${name} on ${listed([...new Set(on)])}`))}. Every other answer read meets it.`,
    )
  else if (e.tells === 'all meet') console.log('            Every answer read meets it.')
  if (e.made.some((p) => p.basisCheck?.reading === 'not sure'))
    console.log('            Jev is not sure the words it stands on ask for all of it.')
}

/** A fact of the note and what covers it, in one line. */
function factLine(f: StoredFact, groupOf: (id: string) => string): string {
  if (f.by === 'check') return `"${f.fact}": the check "${f.check}"`
  if (f.by === 'proposal') return `"${f.fact}": proposal ${groupOf(f.proposal ?? '')}`
  if (f.by === 'reason') return `"${f.fact}": not a yes or no check. ${f.why}`
  return `"${f.fact}": nothing covers it.${f.why ? ` ${f.why}` : ''}`
}

/**
 * Print proposed checks: first those for every case, then each case's own.
 * What tells the answers read apart is shown in full; the rest are counted in
 * one line and listed with `all`. A fact of a case's note that nothing covers
 * is always shown.
 */
function printProposals(result: ProposeResult, skillArg: string, all: boolean): void {
  const folded: Tells[] = []
  const groupOf = (id: string) =>
    result.every.find((e) => e.made.some((p) => p.id === id))?.id ?? id
  if (!result.jevAsked)
    console.log(
      'Jev, the grader, was not asked: no TypeSafe key is set, or --no-jev was given. No proposal was checked against the words it stands on. Proposals of different cases were joined only in the same words: nearer matches were not looked for.',
    )
  if (result.every.length) {
    console.log('\nFor every case')
    const shown = result.every.filter((e) => all || e.tells === 'apart')
    for (const e of shown) printEvery(e)
    for (const e of result.every) if (e.tells !== 'apart') folded.push(e.tells)
    if (!shown.length) console.log('  None tells the answers read apart.')
  }
  for (const c of result.cases) {
    console.log(`\n${c.title && c.title !== c.case ? `${c.title} (${c.case})` : c.case}`)
    if (c.skipped) {
      console.log(`  ${c.skipped} Run the case first.`)
      continue
    }
    if (c.error) {
      console.log(`  Not read: ${c.error}`)
      continue
    }
    console.log(
      `  Answers read: ${listed(c.answers.map(answerName))}.${c.kept ? ' Read before, and nothing changed since.' : ''}`,
    )
    const apart = c.proposals.filter((p) => p.tells === 'apart')
    for (const p of c.proposals) if (p.tells !== 'apart') folded.push(p.tells)
    for (const p of apart) printProposal(p)
    if (!c.proposals.length) console.log('  Nothing of its own to propose.')
    else if (!apart.length) console.log('  None of its proposals tells the answers read apart.')
    if (all) {
      const rest = c.proposals.filter((p) => p.tells !== 'apart')
      if (rest.length) {
        console.log(`\n  ${capital(foldedCount(rest.map((p) => p.tells)))}:`)
        for (const p of rest) printProposal(p)
      }
    }
    const open = c.facts.filter((f) => f.by === 'nothing')
    for (const f of open)
      console.log(`  Nothing covers this part of the note: "${f.fact}".${f.why ? ` ${f.why}` : ''}`)
    for (const words of c.unlisted)
      console.log(`  The note also says "${words}", and no check or proposal was named for it.`)
    if (all && c.facts.length) {
      console.log('  The note, fact by fact:')
      for (const f of c.facts) console.log(`    ${factLine(f, groupOf)}`)
    }
    if (all)
      for (const o of c.overreach)
        console.log(
          `  Left out, as it asks for more than its words: "${o.check}", on "${o.basis.quote}"`,
        )
    const left = c.left.filter((l) => l.why !== 'past the most')
    if (all && left.length)
      console.log(`  Left out: ${left.map((l) => `"${l.check}" (${l.why})`).join('; ')}.`)
  }
  const shown =
    result.every.filter((e) => e.tells === 'apart').length +
    result.cases.reduce((n, c) => n + c.proposals.filter((p) => p.tells === 'apart').length, 0)
  console.log(`\n${shown} proposed that tell the answers read apart.`)
  if (folded.length)
    console.log(
      `${capital(foldedCount(folded))}. Each still guards the next version.${all ? '' : ' Add --all to list them.'}`,
    )
  const overreach = result.cases.reduce((n, c) => n + c.overreach.length, 0)
  if (overreach)
    console.log(
      `${overreach} left out, as Jev is sure each asks for more than the words it stands on.${all ? '' : ' Add --all to list them.'}`,
    )
  for (const l of result.joining.left)
    console.log(
      `Left out for every case, as a check for every case says it: "${l.check}" (${listed(l.cases)}).`,
    )
  const fresh = result.cases.filter((c) => !c.kept && !c.skipped && !c.error)
  const refused = fresh.reduce((n, c) => n + c.refusedOnce, 0)
  const twice = fresh.reduce((n, c) => n + c.refusedTwice, 0)
  if (refused)
    console.log(
      `${refused} did not fit at first and were asked for again; ${twice} did not fit again and were left out.`,
    )
  if (shown || folded.length)
    console.log(
      `To keep some: pnpm st propose ${skillArg} --case <case> --accept <id,id>, or --accept <id,id> alone for ones for every case. To turn some down: --drop <id,id> in the same way.`,
    )
  for (const c of fresh)
    console.log(
      `  ${padEnd(c.case, 22)}${c.usage.input.toLocaleString()} in, ${c.usage.output.toLocaleString()} out, ${c.seconds} s`,
    )
  console.log(
    `${result.model} on ${result.provider}, ${result.usage.input.toLocaleString()} input and ${result.usage.output.toLocaleString()} output tokens`,
  )
  console.log(
    `Jev: ${result.jev.questions} questions in ${result.jev.requests} requests, ${result.jev.kept} answers kept from before.${result.jev.error ? ` It could not be asked: ${result.jev.error}` : ''}`,
  )
}

export const propose: Command = {
  name: 'propose',
  help: [
    "  propose                     Have the assistant read each case's latest answers and propose",
    '                              checks a good answer meets. It changes no case: name the ones to',
    '                              keep with --accept. It keeps them in evals/proposals.json.',
    '    --cases <a,b>             Case ids; default every case.',
    '    --again                   Read a case again though nothing changed since it was read.',
    '    --model <id>              The model to ask (default sonnet), on Claude Code.',
    "    --effort <level>          Its effort; default the model's own.",
    '    --parallel <n>            Cases read at once (default 2).',
    "    --deep                    Have a session read each case's files in a folder, pages as",
    '                              drawn, instead of sending them in one message. Costs far more.',
    '    --all                     Also list the proposals every answer already meets, the note',
    '                              fact by fact, and what was left out.',
    "    --case <id> --accept <ids>  Add these proposals to the case's checks.",
    '    --accept <ids>            Without --case: add these proposals for every case, each as one',
    '                              check in evals/graders/.',
    '    --case <id> --drop <ids>    Turn these proposals down, so they are not proposed again.',
    '                              Without --case, the ones for every case.',
  ],
  flags,
  agents: true,
  async run(context) {
    const values = context.values as FlagValues<typeof flags>
    const { skill } = skillOf(context.args)
    const ids = (list: string) =>
      list
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
    if (values.accept || values.drop) {
      // With --case, a case's own proposals; without, the proposals for every case.
      if (values.accept && values.case) {
        const { added, had } = acceptProposals(skill, values.case, ids(values.accept))
        for (const p of added) console.log(`Added to ${values.case}: ${p.check}`)
        for (const p of had) console.log(`${values.case} has this check already: ${p.check}`)
      } else if (values.accept) {
        const { added, had } = acceptEveryCase(skill, ids(values.accept))
        for (const p of added) console.log(`Added for every case: ${p.check}`)
        for (const p of had) console.log(`A check for every case says this already: ${p.check}`)
      }
      if (values.drop && values.case)
        for (const p of dropProposals(skill, values.case, ids(values.drop)))
          console.log(`Turned down: ${p.check}`)
      else if (values.drop)
        for (const p of dropEveryCase(skill, ids(values.drop)))
          console.log(`Turned down for every case: ${p.check}`)
      return 0
    }
    const result = await held(
      context,
      proposeChecks(skill, {
        provider: 'claude-code',
        model: values.model ?? 'sonnet',
        effort: values.effort ?? '',
        cases: values.cases ? ids(values.cases) : [],
        again: Boolean(values.again),
        parallel: countOf(values.parallel, '--parallel') ?? 2,
        jev: wantsJev(context) && Jev.available() ? new Jev(values['jev-model'], 'propose') : null,
        inline: !values.deep,
        log: (line) => console.error(line),
        signal: signalOf(context),
      }),
    )
    if (values.json) console.log(JSON.stringify(withCost(result), null, 2))
    else printProposals(result, context.args[0] ?? '.', Boolean(values.all))
    return result.cases.some((c) => c.error) ? 1 : 0
  },
}
