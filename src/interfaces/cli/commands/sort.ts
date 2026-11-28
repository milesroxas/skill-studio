import { type SortedItem, type SortResult, sortSkill } from '@application/sorting.ts'
import {
  type Decided,
  decidedLine,
  describeReading,
  flaggedLine,
  heldWords,
} from '@domain/sorting.ts'
import { countOf } from '../input.ts'
import type { Command, FlagValues } from './command.ts'
import { shared } from './flags.ts'
import { held, padEnd, signalOf, skillOf, withCost } from './shared.ts'

const flags = shared('model', 'effort', 'again', 'parallel', 'json')

/**
 * Print one sorted rule or check: its words, then how it will be marked. For
 * a check, each rule that cannot hold beside it, on its case alone, by the
 * rule's short name (`refOf`). Where code's word is kept over the
 * assistant's (`differs`), what code found, and what the assistant said.
 */
function printSorted(
  item: SortedItem,
  differs: readonly Decided[],
  refOf?: (rule: string) => string,
): void {
  console.log(
    `  ${padEnd(item.ref, 5)}${item.text}${item.every ? '  (a check for every case)' : ''}`,
  )
  if (!item.stored) {
    console.log('       Not read: the call failed, so it is marked as before.')
    return
  }
  const lines = describeReading(item.stored.reading)
  for (const line of lines) console.log(`       ${line}`)
  const { reading } = item.stored
  // The assistant's reason is for its own reading: under one code set aside, it is not why.
  if (reading.reading === 'unmarkable' && item.stored.reason && !item.stored.assistant?.reading)
    console.log(`       Why: ${item.stored.reason}`)
  if (item.stored.refused.length)
    console.log(
      `       Refused ${item.stored.refused.length === 1 ? 'once' : 'twice'}: ${item.stored.refused.join('; ')}`,
    )
  for (const against of item.stored.against ?? []) {
    const ref = refOf?.(against.rule)
    console.log(
      `       Rule ${ref ? `${ref} ` : ''}"${against.rule}" cannot hold beside this check on this case, so that rule counts in no score here.`,
    )
    if (against.fix) console.log(`       Fix for the rule: ${against.fix}`)
  }
  // Code's word, kept over the assistant's: what code found, then what the assistant said.
  const own = item.stored.assistant?.reading
  if (own) {
    const found = differs.find((d) => d.kind === 'rules' && !d.holds && d.ref === item.ref)
    const other = differs.find((d) => d.kind === 'rules' && !d.holds && d.rule === item.ref)
    const on = found?.on ?? other?.on
    if (on) console.log(`       Code found this, not the assistant: ${heldWords(on)}`)
    const [first, ...rest] = describeReading(own)
    console.log(`       The assistant's reading: ${first}`)
    for (const line of rest) console.log(`       ${line}`)
  }
  for (const d of differs)
    if (d.kind === 'check' && d.ref === item.ref)
      console.log(
        d.holds
          ? `       Code found rule ${d.rule} can hold beside this check, where the assistant said it cannot: ${heldWords(d.on)}`
          : `       Code found rule ${d.rule} cannot hold beside this check, where the assistant said it can: ${heldWords(d.on)}`,
      )
}

/** Print a sort: each rule, each case's checks, then the counts and what the calls spent. */
function printSort(result: SortResult): void {
  // Where code and the assistant said otherwise of a pair: code's word is kept, and both are shown.
  const differs = result.decided.filter((d) => d.holds !== d.assistant)
  console.log('\nRules')
  for (const item of result.rules)
    printSorted(
      item,
      differs.filter((d) => d.kind === 'rules'),
    )
  const refOf = (rule: string) => result.rules.find((r) => r.text.trim() === rule.trim())?.ref ?? ''
  for (const c of result.cases) {
    if (!c.checks.length) continue
    console.log(`\n${c.title || c.case} (${c.case})`)
    for (const item of c.checks)
      printSorted(
        item,
        differs.filter((d) => d.case === c.case),
        refOf,
      )
  }
  const all = [...result.rules, ...result.cases.flatMap((c) => c.checks)]
  const count = (kind: string) => all.filter((i) => i.stored?.reading.reading === kind).length
  const kept = all.filter((i) => i.kept).length
  const refused = all.filter((i) => i.stored && i.stored.refused.length > 1).length
  console.log(
    `\n${all.length} read: ${count('exact')} by code, ${count('judged')} by Jev, ${count('unmarkable')} not markable.${kept ? ` ${kept} kept from before.` : ''}${refused ? ` ${refused} refused twice, so marked as before.` : ''}`,
  )
  // A rule a check cannot hold beside counts in no score on that case alone: said once more, case by case.
  for (const c of result.cases)
    for (const check of c.checks)
      for (const against of check.stored?.against ?? [])
        console.log(
          `On ${c.case}, rule ${refOf(against.rule) || `"${against.rule}"`} cannot hold beside ${check.ref} "${check.text}": the rule counts in no score on that case.`,
        )
  // Code's word on pairs of exact readings, where it said otherwise than the assistant, and new readings that part from a sure answer kept.
  if (result.decided.length)
    console.log(
      `Code worked out ${result.decided.length} pair(s) of readings answered by code: ${differs.length ? `it said otherwise than the assistant on ${differs.length}, and its word is kept.` : 'it agreed with the assistant on each.'}`,
    )
  for (const d of differs) console.log(decidedLine(d))
  for (const flag of result.flagged) console.log(flaggedLine(flag))
  for (const call of result.calls) {
    const what = call.what === 'rules' ? 'rules' : call.what
    console.log(
      `  ${padEnd(what, 22)}${call.error ? `failed: ${call.error}` : `${call.asked} asked, ${call.refusedOnce} refused once, ${call.refusedTwice} twice, ${call.usage.input.toLocaleString()} in, ${call.usage.output.toLocaleString()} out, ${call.seconds} s`}`,
    )
  }
  console.log(
    `${result.model} on ${result.provider}${result.effort ? `, ${result.effort} effort` : ''}, ${result.usage.input.toLocaleString()} input and ${result.usage.output.toLocaleString()} output tokens`,
  )
}

export const sort: Command = {
  name: 'sort',
  help: [
    '  sort                        Have the assistant read each rule and check, and say how each',
    '                              will be marked: by code, by Jev, or not at all as written, with',
    '                              a fix. It keeps the readings in evals/rule-readings.json.',
    '    --again                   Ask again for readings that are still current.',
    '    --model <id>              The model to ask in place of the one set in Settings.',
    "    --effort <level>          Its effort; default the model's own.",
    '    --parallel <n>            Calls at once (default 3).',
  ],
  flags,
  agents: true,
  async run(context) {
    const values = context.values as FlagValues<typeof flags>
    const { skill } = skillOf(context.args)
    const result = await held(
      context,
      sortSkill(skill, {
        model: values.model,
        effort: values.effort,
        again: Boolean(values.again),
        parallel: countOf(values.parallel, '--parallel') ?? 3,
        log: (line) => console.error(line),
        signal: signalOf(context),
      }),
    )
    if (values.json) console.log(JSON.stringify(withCost(result), null, 2))
    else printSort(result)
    return result.calls.some((c) => c.error) ? 1 : 0
  },
}
