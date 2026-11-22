/**
 * The readings `st sort` stored in a copy of the `launch-note` test skill,
 * counted on every output of its stored runs:
 *
 *   tsx scripts/reading-bench/sorted.ts <skill> [--json <file>]
 *
 * For each output, each rule and check is read as the stored readings say,
 * for the SKILL.md its run was made with and the case as it asked it
 * (`currentReadings`), and an exact one is answered by code (`answerExact`).
 * Those answers are counted against the answer key (`key.ts`) and against the
 * answers of the gold readings (`gold.ts`): agreed, disagreed, answered by
 * code alone, answered by the other side alone. Then each rule and check is
 * listed with how the model read it beside how gold reads it.
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { realPath } from '@infrastructure/fs.ts'
import { against, countSorted, kindsOf, type ReadingRow } from './count.ts'
import { kindOf } from './readings.ts'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { json: { type: 'string' } },
})
const [skillArg] = positionals
if (!skillArg) {
  console.error('Usage: tsx scripts/reading-bench/sorted.ts <skill> [--json <file>]')
  process.exit(2)
}
const skill = realPath(resolve(skillArg))

const short = (text: string, width = 70) =>
  text.length > width ? `${text.slice(0, width - 1)}…` : text

type Truth = boolean | null

/** The model's answers against another side's, printed with every disagreement and each side alone. */
function tally(rows: readonly ReadingRow[], name: string, other: (row: ReadingRow) => Truth) {
  const counted = against(rows, other)
  const modelOnly = rows.filter((r) => other(r) === null && r.model.answer !== null)
  const otherOnly = rows.filter((r) => other(r) !== null && r.model.answer === null)
  const count = (list: readonly ReadingRow[], by: (r: ReadingRow) => string) =>
    Object.entries(
      list.reduce<Record<string, number>>((all, r) => {
        all[by(r)] = (all[by(r)] ?? 0) + 1
        return all
      }, {}),
    )
  console.log(`\nAgainst ${name}`)
  console.log(
    `  ${counted.agreed} agreed, ${counted.disagreed} disagreed, ${counted.modelOnly} answered by the model's code alone, ${counted.otherOnly} by ${name} alone.`,
  )
  for (const line of counted.disagreements) console.log(`  disagreed  ${line}`)
  for (const [fact, n] of count(modelOnly, (r) => r.fact).sort())
    console.log(`  model alone ${n}x  ${short(fact)}`)
  console.log(`  ${name} alone, by why the model's reading gave no answer:`)
  const byWhy = count(otherOnly, (r) => r.model.why ?? '?').sort(([, a], [, b]) => b - a)
  for (const [why, n] of byWhy) console.log(`    ${n}  ${why}`)
  for (const [fact, n] of count(
    otherOnly.filter((r) => r.model.why !== 'judged'),
    (r) => r.fact,
  ).sort())
    console.log(`    ${n}x  ${short(fact)}`)
  return { ...counted, otherOnlyByWhy: Object.fromEntries(byWhy) }
}

const sorted = countSorted(skill)
const table = [...sorted.readings.entries()].sort(([a], [b]) => a.localeCompare(b))

console.log('How each rule and check was read: the model, then gold')
for (const [fact, { model, gold }] of table) {
  const same = JSON.stringify(model) === JSON.stringify(gold)
  console.log(
    `  ${short(fact, 60).padEnd(61)}${kindOf(model, true).padEnd(26)}${kindOf(gold, true).padEnd(26)}${same ? 'same' : ''}`,
  )
}

console.log('\nOn the stored outputs')
const key = tally(sorted.rows, 'the key', (r) => r.key)
const gold = tally(sorted.rows, 'gold', (r) => r.gold.answer)
console.log('\nOn the same outputs changed to miss (mutations.ts)')
const keyChanged = tally(sorted.changed, 'the key', (r) => r.key)
const goldChanged = tally(sorted.changed, 'gold', (r) => r.gold.answer)
console.log(
  `\nReadings: model ${JSON.stringify(sorted.kinds)}, gold ${JSON.stringify(kindsOf(sorted.readings, (v) => v.gold))}`,
)
if (values.json)
  writeFileSync(
    resolve(values.json),
    `${JSON.stringify({ key, gold, keyChanged, goldChanged, readings: Object.fromEntries(table) }, null, 2)}\n`,
  )
