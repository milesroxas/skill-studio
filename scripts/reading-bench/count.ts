/**
 * The counts the reading bench and its gate are made of, over a copy of the
 * `launch-note` test skill:
 *
 * - `countGrading`: each run's grading, as the scoring code reads its stored
 *   answers now (`runVerdicts`), against the answer key (`key.ts`): sure and
 *   right, sure and wrong, not sure, not read, does not apply, answered by
 *   code, cannot be marked.
 * - `countMarked`: the same gradings with every fact set aside as not sure,
 *   not read or cannot be marked answered as the key answers it, as a reader
 *   would mark it: each such mark must count, and as the reader's.
 * - `countSorted`: the readings `st sort` kept, each exact one answered by
 *   code on every stored output and on each one changed to miss
 *   (`mutations.ts`), against the key and against gold (`gold.ts`).
 * - `countGold`: the gold readings answered the same way.
 *
 * Shared by `sorted.ts`, `index.ts`, `gate.ts` and the tests under
 * `src/interfaces/cli/`. Nothing here writes a file.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runVerdicts } from '@application/grade.ts'
import { answerExact } from '@domain/exact.ts'
import type { Corrections, Verdict } from '@domain/pack.ts'
import type { RuleReading } from '@domain/rule-reading.ts'
import type { SortedReading } from '@domain/sorting.ts'
import { checkIds, verdictId } from '@domain/verdict.ts'
import { textOf, treeFiles } from '@infrastructure/fs.ts'
import { currentReadings } from '@infrastructure/rule-readings.ts'
import { listRuns, readRun, runDir } from '@infrastructure/runs.ts'
import { CHECKS, goldOf, RULES } from './gold.ts'
import { answersOf, type KeyFact, known } from './key.ts'
import { mutated } from './mutations.ts'
import { type StoredOutput, storedOutputs } from './outputs.ts'

type Truth = boolean | null

// ---------------------------------------------------------------- a grading against the key

/** How a grading's answers on the facts the key answers fall. */
export interface GradeTally {
  /** A sure answer, Jev's or code's, that the key shares. */
  right: number
  /** A sure answer the key does not share. */
  wrong: number
  unsure: number
  unread: number
  /** Set aside as for another kind of work. */
  inapplicable: number
  /** A rule or check nobody can mark as written, in no score. */
  unmarkable: number
  /** Of the sure answers, those code gave, and of them those the key does not share. */
  byCode: number
  byCodeWrong: number
}

const NO_TALLY: GradeTally = {
  right: 0,
  wrong: 0,
  unsure: 0,
  unread: 0,
  inapplicable: 0,
  unmarkable: 0,
  byCode: 0,
  byCodeWrong: 0,
}

const addTallies = (a: GradeTally, b: GradeTally): GradeTally =>
  Object.fromEntries(
    Object.keys(a).map((k) => [k, a[k as keyof GradeTally] + b[k as keyof GradeTally]]),
  ) as unknown as GradeTally

/** One rule or check of one graded output, with the key's answer beside the grading's. */
export interface GradeRow {
  sample: string
  fact: Verdict & KeyFact
  /** The key's answer; null where it has none. */
  key: Truth
  /** How the grading stands on it, as the tally counts it, or `no key`. */
  said: 'met' | 'missed' | 'unsure' | 'unread' | 'inapplicable' | 'unmarkable' | 'no key'
  /** A sure answer the key does not share. */
  wrong: boolean
}

/** A run's input files that read as text, by name, as its agents got them. */
function inputsOf(dir: string, caseId: string): Record<string, string> {
  const inputs: Record<string, string> = {}
  for (const { rel, real } of treeFiles(join(dir, '_inputs', caseId), { hidden: true })) {
    const text = textOf(readFileSync(real))
    if (text !== null) inputs[rel] = text
  }
  return inputs
}

/**
 * Every rule and check of every graded output of `run`, as the scoring code
 * reads the stored answers now, beside the key. The grading's own answers,
 * with no reader's corrections: the key is held against those.
 */
export function gradeRows(
  skill: string,
  run: string,
  corrections: Readonly<Record<string, Corrections>> = {},
): { rows: GradeRow[]; unknown: number } {
  const view = readRun(skill, run)
  if (!view.report) throw new Error(`${run} is not graded. Run: st grade --run ${run}`)
  const dir = runDir(skill, run)
  const verdicts = runVerdicts(skill, view.report, view.cases, corrections)
  const rows: GradeRow[] = []
  let unknown = 0
  for (const result of view.report.results) {
    const sample = view.samples.find((s) => s.name === result.sample)
    if (!sample || sample.cut || !result.case || !result.primary) continue
    const facts = (verdicts[result.sample] ?? []).filter(
      (v): v is Verdict & KeyFact => v.kind === 'rule' || v.kind === 'check',
    )
    const key = answersOf(
      {
        raw: readFileSync(join(sample.path, result.primary.file), 'utf8'),
        page: result.primary.kind === 'html',
        inputs: inputsOf(dir, result.case),
      },
      facts,
    )
    for (const fact of facts) {
      if (!known(fact)) unknown += 1
      const truth = Object.hasOwn(key, fact.id) ? key[fact.id] : null
      const said: GradeRow['said'] =
        truth === null ? 'no key' : (fact.aside ?? (fact.met ? 'met' : 'missed'))
      rows.push({
        sample: result.sample,
        fact,
        key: truth,
        said,
        wrong: (said === 'met' || said === 'missed') && (said === 'met') !== truth,
      })
    }
  }
  return { rows, unknown }
}

/** The tally of `gradeRows`. */
export function tallyRows(rows: readonly GradeRow[]): GradeTally {
  const tally = { ...NO_TALLY }
  for (const row of rows) {
    if (row.said === 'no key') continue
    if (row.said !== 'met' && row.said !== 'missed') {
      tally[row.said] += 1
      continue
    }
    tally[row.wrong ? 'wrong' : 'right'] += 1
    if (row.fact.by === 'code') {
      tally.byCode += 1
      if (row.wrong) tally.byCodeWrong += 1
    }
  }
  return tally
}

/** Every run of `skill` graded, counted against the key, each and all together. */
export function countGrading(skill: string): {
  runs: Array<{ run: string; tally: GradeTally }>
  total: GradeTally
  unknown: number
} {
  let unknown = 0
  const runs = listRuns(skill).map(({ name }) => {
    const found = gradeRows(skill, name)
    unknown += found.unknown
    return { run: name, tally: tallyRows(found.rows) }
  })
  return { runs, total: runs.reduce((sum, r) => addTallies(sum, r.tally), NO_TALLY), unknown }
}

/** What the reader's marks on the facts set aside came to (`countMarked`). */
export interface MarkedTally {
  /** Facts set aside that the key answers, each marked as the key answers it. */
  marked: number
  /** Of them, by why they were set aside. */
  unsure: number
  unread: number
  unmarkable: number
  /** Marked, those that then count, as the reader's answer. Every one should. */
  counted: number
  /** Marked, those that count with an answer the key does not share, or are still set aside. */
  wrong: number
}

/**
 * Every run graded, with each fact set aside as not sure, not read or cannot
 * be marked, and answered by the key, marked by the key's answer as a reader
 * would mark it: the reader's own answer is the last word on every fact, so
 * each one marked must then count, as the reader's, and agree with the key.
 */
export function countMarked(skill: string): MarkedTally {
  const tally: MarkedTally = {
    marked: 0,
    unsure: 0,
    unread: 0,
    unmarkable: 0,
    counted: 0,
    wrong: 0,
  }
  for (const { name } of listRuns(skill)) {
    const marks: Record<string, Record<string, boolean>> = {}
    for (const row of gradeRows(skill, name).rows) {
      if (row.key === null || !['unsure', 'unread', 'unmarkable'].includes(row.said)) continue
      tally.marked += 1
      tally[row.said as 'unsure' | 'unread' | 'unmarkable'] += 1
      marks[row.sample] = { ...marks[row.sample], [row.fact.id]: row.key }
    }
    const marked = gradeRows(skill, name, marks).rows
    for (const row of marked) {
      if (!Object.hasOwn(marks[row.sample] ?? {}, row.fact.id)) continue
      const counts = (row.said === 'met' || row.said === 'missed') && row.fact.by === 'reader'
      if (counts && !row.wrong) tally.counted += 1
      else tally.wrong += 1
    }
  }
  return tally
}

// ---------------------------------------------------------------- readings answered by code

/** What one reading said on one output: an answer, or why it gave none. */
export interface Said {
  answer: Truth
  /** `judged`, `unmarkable`, `missing` (no current reading), or why code gave no answer. */
  why: string | null
}

function saidBy(
  reading: SortedReading | RuleReading | null,
  output: StoredOutput['subject'],
): Said {
  if (!reading) return { answer: null, why: 'missing' }
  if (reading.reading !== 'exact') return { answer: null, why: reading.reading }
  const answer = answerExact(reading, output)
  return answer.answer === 'none'
    ? { answer: null, why: `no answer: ${answer.why}` }
    : { answer: answer.answer === 'met', why: null }
}

export interface ReadingRow {
  run: string
  sample: string
  /** `v1 r3 ...` for a rule, `<case> c1 ...` for a check. */
  fact: string
  key: Truth
  gold: Said
  model: Said
}

/** How each rule and check was read, by fact. */
export type ReadingsByFact = Map<string, { model: SortedReading | null; gold: RuleReading }>

/** A rule's reading on one case alone: in conflict with one of that case's checks (`c2`). */
const onOneCase = (reading: SortedReading | null): boolean =>
  reading?.reading === 'unmarkable' &&
  reading.why === 'conflict' &&
  /^c\d+$/.test(reading.with ?? '')

/**
 * Each rule and check of each output, as the readings kept in `skill` read
 * it (for the SKILL.md its run was made with and the case as it asked it)
 * and as gold reads it, beside the key.
 */
function readingRows(
  skill: string,
  outputs: readonly StoredOutput[],
  readings: ReadingsByFact = new Map(),
): ReadingRow[] {
  const rows: ReadingRow[] = []
  for (const output of outputs) {
    const current = currentReadings(skill, output.skillMd, output.testCase, {
      ask: output.ask ?? undefined,
    })
    const ids = checkIds(output.testCase.graders.map((g) => ({ id: g.id, text: g.statement })))
    const facts = [
      ...output.rules.map((rule) => ({
        name: `${output.version} ${rule.id} ${rule.text}`,
        keyId: rule.text,
        kind: 'rule' as const,
        text: rule.text,
        model: current.rules.get(verdictId('rule', rule.text))?.reading ?? null,
        gold: goldOf(RULES[output.version], rule.text),
      })),
      ...output.testCase.graders.map((grader, i) => ({
        name: `${output.testCase.id} c${i + 1} ${grader.statement}`,
        keyId: grader.statement,
        kind: 'check' as const,
        text: grader.statement,
        model: current.checks.get(ids[i])?.reading ?? null,
        gold: goldOf(CHECKS, grader.statement),
      })),
    ]
    const key = answersOf(
      {
        raw: output.subject.output,
        page: output.subject.kind === 'html',
        inputs: output.subject.files,
      },
      facts.map((f) => ({ id: f.keyId, kind: f.kind, text: f.text })),
    )
    for (const fact of facts) {
      // A rule set aside on one case for a check it cannot hold beside is read so on that case
      // alone: the table of how each fact was read keeps the rule's own reading.
      if (!onOneCase(fact.model) || !readings.has(fact.name))
        readings.set(fact.name, { model: fact.model, gold: fact.gold })
      rows.push({
        run: output.run,
        sample: output.sample,
        fact: fact.name,
        key: Object.hasOwn(key, fact.keyId) ? key[fact.keyId] : null,
        gold: saidBy(fact.gold, output.subject),
        model: saidBy(fact.model, output.subject),
      })
    }
  }
  return rows
}

/** One side's answers against another's. */
export interface Against {
  agreed: number
  disagreed: number
  /** Answered by the side counted, not by the other. */
  modelOnly: number
  /** Answered by the other, not by the side counted. */
  otherOnly: number
  disagreements: string[]
}

/** `answer`'s answers against `other`'s over `rows`. */
export function against(
  rows: readonly ReadingRow[],
  other: (row: ReadingRow) => Truth,
  answer: (row: ReadingRow) => Truth = (row) => row.model.answer,
): Against {
  const both = rows.filter((r) => other(r) !== null && answer(r) !== null)
  const disagreed = both.filter((r) => other(r) !== answer(r))
  return {
    agreed: both.length - disagreed.length,
    disagreed: disagreed.length,
    modelOnly: rows.filter((r) => other(r) === null && answer(r) !== null).length,
    otherOnly: rows.filter((r) => other(r) !== null && answer(r) === null).length,
    disagreements: disagreed.map(
      (r) =>
        `${r.run} ${r.sample}: ${r.fact.slice(0, 70)}: other ${other(r) ? 'met' : 'missed'}, this ${answer(r) ? 'met' : 'missed'}`,
    ),
  }
}

/** How many rules and checks each reading kind holds, over the facts of `readings`. */
export function kindsOf(
  readings: ReadingsByFact,
  pick: (v: {
    model: SortedReading | null
    gold: RuleReading
  }) => SortedReading | RuleReading | null,
): Record<string, number> {
  const by: Record<string, number> = {}
  for (const v of readings.values()) {
    const kind = pick(v)?.reading ?? 'missing'
    by[kind] = (by[kind] ?? 0) + 1
  }
  return by
}

/** The readings `st sort` kept in `skill`, on its stored outputs and on them changed to miss. */
export function countSorted(skill: string) {
  const stored = storedOutputs(skill)
  const readings: ReadingsByFact = new Map()
  const rows = readingRows(skill, stored, readings)
  const changed = readingRows(skill, mutated(stored))
  return {
    rows,
    changed,
    readings,
    stored: against(rows, (r) => r.key),
    mutated: against(changed, (r) => r.key),
    kinds: kindsOf(readings, (v) => v.model),
  }
}

/** The gold readings, answered by code on the stored outputs of `skill` and on them changed to miss. */
export function countGold(skill: string) {
  const stored = storedOutputs(skill)
  const readings: ReadingsByFact = new Map()
  const rows = readingRows(skill, stored, readings)
  const changed = readingRows(skill, mutated(stored))
  const gold = (r: ReadingRow) => r.gold.answer
  const missed = (list: readonly ReadingRow[]) =>
    list.filter((r) => r.key === false && r.gold.answer === false).length
  return {
    facts: rows.length,
    changedFacts: changed.length,
    stored: { ...against(rows, (r) => r.key, gold), missed: missed(rows) },
    mutated: { ...against(changed, (r) => r.key, gold), missed: missed(changed) },
    kinds: kindsOf(readings, (v) => v.gold),
    rows,
    changed,
  }
}
