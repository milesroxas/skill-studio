/**
 * The answer key of the `launch-note` test skill, for one of its graded runs:
 *
 *   tsx scripts/reading-bench/index.ts <skill> --run <name> [--out <file>]
 *
 * It prints each rule and check of each output with the key's answer beside
 * the grading's, then how often the grading was right where it was sure.
 * `--out` writes the key's answers as JSON, by output and by fact, for
 * `st read --answers`.
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { realPath } from '@infrastructure/fs.ts'
import { gradeRows, tallyRows } from './count.ts'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { run: { type: 'string' }, out: { type: 'string' } },
})
const [skillArg] = positionals
if (!skillArg || !values.run) {
  console.error('Usage: tsx scripts/reading-bench/index.ts <skill> --run <name> [--out <file>]')
  process.exit(2)
}
const skill = realPath(resolve(skillArg))
let rows: ReturnType<typeof gradeRows>['rows']
let unknown: number
try {
  ;({ rows, unknown } = gradeRows(skill, values.run))
} catch (error) {
  console.error((error as Error).message)
  process.exit(1)
}

const pad = (value: string, width: number): string => value.slice(0, width - 1).padEnd(width)
const SAID: Record<string, string> = {
  inapplicable: 'does not apply',
  unread: 'not read',
  unsure: 'not sure',
  unmarkable: 'not markable',
}
const answers: Record<string, Record<string, boolean>> = {}
let sample = ''
for (const row of rows) {
  if (row.sample !== sample) {
    sample = row.sample
    console.log(`\n${sample}`)
  }
  if (row.key !== null) {
    answers[row.sample] ??= {}
    answers[row.sample][row.fact.id] = row.key
  }
  const truth = row.key === null ? '-' : row.key ? 'met' : 'missed'
  const by = row.fact.by === 'code' ? ' (code)' : ''
  const shown = row.fact.aside ? SAID[row.fact.aside] : `${row.fact.met ? 'met' : 'missed'}${by}`
  console.log(
    `  ${pad(truth, 8)}${pad(shown, 16)}${row.fact.text.slice(0, 90)}${row.wrong ? '  <- wrong' : ''}`,
  )
}

const tally = tallyRows(rows)
console.log(
  `\nWhere the key has an answer: the grading was sure of ${tally.right + tally.wrong} and right on ${tally.right} (code gave ${tally.byCode}, wrong on ${tally.byCodeWrong}), not sure of ${tally.unsure}, did not read ${tally.unread}, set ${tally.inapplicable} aside as not applying, and held ${tally.unmarkable} not markable.`,
)
if (unknown) console.log(`${unknown} rule(s) or check(s) the key has no code for.`)
if (values.out) {
  writeFileSync(resolve(values.out), `${JSON.stringify(answers, null, 2)}\n`)
  console.log(`Wrote the key's answers to ${resolve(values.out)}.`)
}
