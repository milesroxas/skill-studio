/**
 * The readings `st sort` kept in sorted copies of the `launch-note` test
 * skill: put together into one copy, so the bench can read both versions'
 * runs from it, and set against another sort of the same version, so two
 * sorts can be told apart.
 *
 *   tsx scripts/reading-bench/readings.ts merge <into> <from>...
 *   tsx scripts/reading-bench/readings.ts differ <a> <b>
 *
 * `merge` writes into `<into>`'s `evals/rule-readings.json` and nowhere else.
 */
import { resolve } from 'node:path'
import type { SortedReading } from '@domain/sorting.ts'
import { readStored, type StoredReading, storeReadings } from '@infrastructure/rule-readings.ts'

/** Every reading of each copy in `from` kept in `into` too, one per stamp; a stamp `into` holds stays its own. */
export function mergeReadings(into: string, from: readonly string[]): number {
  const held = new Set(readStored(into).map((entry) => entry.stamp))
  const fresh: StoredReading[] = []
  for (const dir of from)
    for (const entry of readStored(dir))
      if (!held.has(entry.stamp)) {
        held.add(entry.stamp)
        fresh.push(entry)
      }
  storeReadings(into, fresh)
  return fresh.length
}

/**
 * A reading's kind, as the tables print it: `exact`, `judged any`,
 * `unmarkable vague`; with `tests`, an exact one's join and tests too
 * (`exact all count+has`).
 */
export function kindOf(reading: SortedReading | null | undefined, tests = false): string {
  if (!reading) return 'missing'
  if (reading.reading === 'judged') return `judged ${reading.span ?? 'no span'}`
  if (reading.reading === 'unmarkable') return `unmarkable ${reading.why}`
  return tests ? `exact ${reading.join} ${reading.tests.map((t) => t.test).join('+')}` : 'exact'
}

/** One rule or check two sorts read differently. */
export interface Difference {
  stamp: string
  text: string
  case: string | null
  a: string
  b: string
  /** Both exact, with other tests. */
  tests: boolean
}

/**
 * The rules and checks two sorts of the same skill read differently, by
 * stamp: one moved between code, Jev and not markable, Jev's span changed,
 * or code's tests did. A stamp only one of them holds is left out, and with
 * `only`, a stamp not in it.
 */
export function differences(
  a: string,
  b: string,
  only?: ReadonlySet<string>,
): { compared: number; differ: Difference[] } {
  const other = new Map(readStored(b).map((entry) => [entry.stamp, entry]))
  const differ: Difference[] = []
  let compared = 0
  for (const left of readStored(a)) {
    if (only && !only.has(left.stamp)) continue
    const right = other.get(left.stamp)
    if (!right) continue
    compared += 1
    const same = JSON.stringify(left.reading) === JSON.stringify(right.reading)
    if (same) continue
    const [ka, kb] = [kindOf(left.reading), kindOf(right.reading)]
    differ.push({
      stamp: left.stamp,
      text: left.text,
      case: left.case,
      a: ka,
      b: kb,
      tests: ka === kb,
    })
  }
  return { compared, differ }
}

if (import.meta.main) {
  const [command, ...dirs] = process.argv.slice(2)
  if (command === 'merge' && dirs.length >= 2) {
    const [into, ...from] = dirs.map((d) => resolve(d))
    console.log(`Kept ${mergeReadings(into, from)} reading(s) more in ${into}.`)
  } else if (command === 'differ' && dirs.length === 2) {
    const { compared, differ } = differences(resolve(dirs[0]), resolve(dirs[1]))
    console.log(`${differ.length} of ${compared} read differently.`)
    for (const d of differ)
      console.log(
        `  ${(d.case ? `${d.case}: ` : '') + d.text.slice(0, 70)}\n      ${d.a}${d.tests ? ' (other tests)' : ''}  |  ${d.b}`,
      )
  } else {
    console.error(
      'Usage: tsx scripts/reading-bench/readings.ts merge <into> <from>... | differ <a> <b>',
    )
    process.exit(2)
  }
}
