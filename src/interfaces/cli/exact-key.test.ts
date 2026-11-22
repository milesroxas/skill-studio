/**
 * The closed set of exact checks against the answer key of the `launch-note`
 * test skill. Every rule and check of the skill is read as a `RuleReading`,
 * as the assistant is meant to read it (`scripts/reading-bench/gold.ts`), and
 * every exact one is answered by `answerExact` on every output of the five
 * stored runs. The key (`scripts/reading-bench/key.ts`) is code written apart
 * from the set, so where both answer they must agree. How many they answer
 * is pinned in one place, the reading gate (`reading-gate.test.ts`).
 */
import { resolve } from 'node:path'
import { answerExact, type ExactSubject } from '@domain/exact.ts'
import { type RuleReading, readRuleReading } from '@domain/rule-reading.ts'
import { describeReading } from '@domain/sorting.ts'
import { describe, expect, it } from 'vitest'
import { CHECKS, goldOf, RULES } from '../../../scripts/reading-bench/gold.ts'
import { answersOf, type KeyFact } from '../../../scripts/reading-bench/key.ts'
import { mutated } from '../../../scripts/reading-bench/mutations.ts'
import { storedOutputs } from '../../../scripts/reading-bench/outputs.ts'

const SKILL = resolve(import.meta.dirname, '../../../fixtures/launch-note')

// The runs, as the bench reads them.

interface Output {
  run: string
  sample: string
  version: 'v1' | 'v2'
  subject: ExactSubject
  facts: Array<KeyFact & { reading: RuleReading }>
}

function outputs(): Output[] {
  return storedOutputs(SKILL).map((stored) => ({
    run: stored.run,
    sample: stored.sample,
    version: stored.version,
    subject: stored.subject,
    facts: [
      ...stored.rules.map((rule) => ({
        id: rule.text,
        kind: 'rule' as const,
        text: rule.text,
        reading: goldOf(RULES[stored.version], rule.text),
      })),
      ...stored.testCase.graders.map((grader) => ({
        id: grader.statement,
        kind: 'check' as const,
        text: grader.statement,
        reading: goldOf(CHECKS, grader.statement),
      })),
    ],
  }))
}

type Truth = boolean | null

interface Row {
  run: string
  sample: string
  fact: string
  key: Truth
  ours: Truth
  why: string | null
}

function rows(list: readonly Output[]): Row[] {
  return list.flatMap((output) => {
    const key = answersOf(
      {
        raw: output.subject.output,
        page: output.subject.kind === 'html',
        inputs: output.subject.files,
      },
      output.facts,
    )
    return output.facts.map((fact) => {
      const answer =
        fact.reading.reading === 'exact' ? answerExact(fact.reading, output.subject) : null
      return {
        run: output.run,
        sample: output.sample,
        fact: fact.text.slice(0, 60),
        key: Object.hasOwn(key, fact.id) ? key[fact.id] : null,
        ours: answer && answer.answer !== 'none' ? answer.answer === 'met' : null,
        why: answer ? (answer.answer === 'none' ? answer.why : null) : fact.reading.reading,
      }
    })
  })
}

interface Summary {
  facts: number
  agreed: number
  /** Of those agreed, how many both call missed. */
  agreedMissed: number
  disagreed: string[]
  keyOnly: Array<[string, number]>
  oursOnly: string[]
}

function summary(table: readonly Row[]): Summary {
  const both = table.filter((r) => r.key !== null && r.ours !== null)
  const disagreed = both.filter((r) => r.key !== r.ours)
  const tally = (list: readonly Row[]) =>
    Object.entries(
      list.reduce<Record<string, number>>((by, r) => {
        const name = `${r.fact} (${r.why})`
        by[name] = (by[name] ?? 0) + 1
        return by
      }, {}),
    ).sort()
  return {
    facts: table.length,
    agreed: both.length - disagreed.length,
    agreedMissed: both.filter((r) => r.key === false && r.ours === false).length,
    disagreed: disagreed.map((r) => `${r.run} ${r.sample}: ${r.fact} key ${r.key} ours ${r.ours}`),
    keyOnly: tally(table.filter((r) => r.key !== null && r.ours === null)),
    oursOnly: table
      .filter((r) => r.key === null && r.ours !== null)
      .map((r) => `${r.run} ${r.sample}: ${r.fact} ours ${r.ours}`),
  }
}

describe('the exact readings of launch-note', () => {
  const stored = outputs()

  it('says every reading in plain words, a line for each test', () => {
    const all = [...RULES.v1, ...RULES.v2, ...CHECKS].map(([, reading]) => reading)
    for (const reading of all) {
      const lines = describeReading(reading)
      expect(lines.length).toBeGreaterThan(0)
      if (reading.reading === 'exact') expect(lines).toHaveLength(reading.tests.length + 1)
      for (const line of lines) expect(line).not.toMatch(/undefined|null|\[object/)
    }
  })

  it('holds every reading to its shape', () => {
    const all = [...RULES.v1, ...RULES.v2, ...CHECKS].map(([, reading]) => reading)
    for (const reading of all) expect(readRuleReading(reading)).toEqual({ reading })
  })

  it('agrees with the key wherever both answer, on every stored output', () => {
    const found = summary(rows(stored))
    if (process.env.EXACT_KEY_REPORT) console.log(JSON.stringify(found, null, 2))
    expect(found.disagreed).toEqual([])
    expect(found.oursOnly).toEqual([])
    expect(found.agreed).toBeGreaterThan(0)
  })

  it('agrees with the key on the same outputs changed to miss', () => {
    const found = summary(rows(mutated(stored)))
    if (process.env.EXACT_KEY_REPORT) console.log(JSON.stringify(found, null, 2))
    expect(found.disagreed).toEqual([])
    expect(found.agreedMissed).toBeGreaterThan(0)
    // The key leaves a count within 5% of its limit open; the set answers it when every way of counting agrees.
    expect(found.oursOnly.every((row) => row.includes('Write no more than 120 words'))).toBe(true)
    expect(found.oursOnly).toHaveLength(5)
  })
})
