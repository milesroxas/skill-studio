/**
 * The readings `st sort` keeps: how each rule of a skill and each check of a
 * case is read (`SortedReading` in `domain/sorting.ts`), in
 * `evals/rule-readings.json`, written whole as the app's other JSON is.
 *
 * Each reading is filed under a stamp of what it was made from, so one that
 * no longer fits is never found:
 * - a rule's: the version of the prompt, the exact SKILL.md text and the rule's words;
 * - a check's: the version of the prompt, the exact SKILL.md, what its case
 *   asks (the request and each input file by name and bytes, `askOf`) and the
 *   check's words.
 * Editing SKILL.md, a case's request or files, or a check's words, or raising
 * `SORT_PROMPT_VERSION`, leaves the old readings unfound. A sort shows the
 * model the last reading of the same words beside them (`sortSkill`), so an
 * edit elsewhere in SKILL.md does not move a reading for no reason. They stay in the
 * file, so a run of an older version of the skill finds its own, until the
 * file holds more than `KEPT_MAX`, when the oldest go.
 *
 * A check's entry also keeps the rules that cannot hold beside it on its
 * case (`against`), by their words. Its stamp holds the whole SKILL.md, so
 * the rule reworded, the check reworded or the case's request changed
 * leaves it unfound, and the rule is read as usual there again.
 *
 * `currentReadings` is what grading reads.
 */
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { readRuleReading } from '@domain/rule-reading.ts'
import { type Rule, rulesFromSkill } from '@domain/rules.ts'
import type { Case } from '@domain/schemas.ts'
import { SORT_PROMPT_VERSION, type SortedReading } from '@domain/sorting.ts'
import { normalizeNewlines } from '@domain/text.ts'
import { checkIds, verdictId } from '@domain/verdict.ts'
import { readJson, writeJson } from './fs.ts'
import { askOf } from './run-cases.ts'

const READINGS_FILE = 'rule-readings.json'

export const readingsPath = (skillDir: string): string => join(skillDir, 'evals', READINGS_FILE)

/** One reading as it is kept. */
export interface StoredReading {
  /** What it was made from (`ruleStamp`, `checkStamp`): the key it is found by. */
  stamp: string
  kind: 'rule' | 'check'
  /** The rule's or the check's words, for a person reading the file. */
  text: string
  /** For a check, the case it belongs to. */
  case: string | null
  reading: SortedReading
  /**
   * For a check, the rules that cannot hold beside it on its case, each by
   * its words, with the rule rewritten so it could, or null: each is left
   * out of that case's score alone. Absent for a rule.
   */
  against?: Array<{ rule: string; fix: string | null }>
  /** The model's one sentence on why; empty for the fallback. */
  reason: string
  /** Why the parser refused each reading the model gave before this one, in order: none, one, or two. */
  refused: string[]
  provider: string
  /** The model that made it, as its provider names it. */
  model: string
  /** When it was made, as an ISO time. */
  at: string
  /** The `SORT_PROMPT_VERSION` it was made under. */
  prompt: number
}

interface ReadingsFile {
  readings: StoredReading[]
}

/** The most readings the file keeps; past it, the oldest go. */
const KEPT_MAX = 2000

const sha = (value: string): string => createHash('sha256').update(value).digest('hex')

/** A rule's stamp: the prompt's version, the whole SKILL.md and the rule's words. */
export const ruleStamp = (skillMd: string, ruleText: string): string =>
  sha(JSON.stringify(['rule', SORT_PROMPT_VERSION, normalizeNewlines(skillMd), ruleText.trim()]))

/**
 * What a case asks, as its readings are stamped by: the request and its input
 * files by name and bytes, the first part of `askOf` (its settings, the tools
 * and the time an agent gets, change no reading). `kept`, a run's own `ask`
 * from `_cases.json`, stands for the case as the run asked it.
 */
export function askStamp(skillDir: string, testCase: Case, kept?: string): string {
  return (kept ?? askOf(skillDir, testCase)).split(':')[0]
}

/**
 * A check's stamp: the prompt's version, the whole SKILL.md (a check is read
 * beside the skill's rules, to find one it cannot hold beside), what its case
 * asks and the check's words.
 */
export const checkStamp = (skillMd: string, ask: string, statement: string): string =>
  sha(
    JSON.stringify([
      'check',
      SORT_PROMPT_VERSION,
      normalizeNewlines(skillMd),
      ask,
      statement.trim(),
    ]),
  )

/**
 * Every reading in the file that still holds to its shape. A file that cannot
 * be read throws, naming it, as the app's other JSON does; an entry that is
 * not a reading, or holds one the parser now refuses, is left out.
 */
export function readStored(skillDir: string): StoredReading[] {
  const file = readJson<Partial<ReadingsFile>>(readingsPath(skillDir), { readings: [] })
  const list = Array.isArray(file?.readings) ? file.readings : []
  return list.filter((entry): entry is StoredReading => {
    if (!entry || typeof entry !== 'object' || typeof entry.stamp !== 'string') return false
    if (entry.kind !== 'rule' && entry.kind !== 'check') return false
    if (entry.prompt !== SORT_PROMPT_VERSION) return true
    return isReading(entry.reading, entry.kind) && isAgainst(entry.against, entry.kind)
  })
}

/** A reading the parser takes for a rule or a check, or the fallback. */
const isReading = (value: unknown, kind: 'rule' | 'check'): value is SortedReading => {
  if (
    value &&
    typeof value === 'object' &&
    (value as { reading?: unknown }).reading === 'judged' &&
    (value as { span?: unknown }).span === null &&
    Object.keys(value).length === 2
  )
    return true
  return 'reading' in readRuleReading(value, { for: kind })
}

/** A check's `against`, as it is kept: absent, or a list of rules by their words, each with a fix or null. */
const isAgainst = (value: unknown, kind: 'rule' | 'check'): boolean =>
  value === undefined ||
  (kind === 'check' &&
    Array.isArray(value) &&
    value.every(
      (a) =>
        a &&
        typeof a === 'object' &&
        typeof a.rule === 'string' &&
        a.rule.trim() !== '' &&
        (a.fix === null || typeof a.fix === 'string'),
    ))

/**
 * Keep `fresh` with what the file holds: one entry per stamp, the new one in
 * place of an old, the oldest going past `KEPT_MAX`. Written whole.
 */
export function storeReadings(skillDir: string, fresh: readonly StoredReading[]): void {
  const byStamp = new Map<string, StoredReading>()
  for (const entry of readStored(skillDir)) byStamp.set(entry.stamp, entry)
  for (const entry of fresh) {
    byStamp.delete(entry.stamp)
    byStamp.set(entry.stamp, entry)
  }
  const kept = [...byStamp.values()]
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
    .slice(-KEPT_MAX)
  writeJson(readingsPath(skillDir), { readings: kept } satisfies ReadingsFile)
}

/** One current reading, as grading takes it. */
export interface CurrentReading {
  reading: SortedReading
  model: string
  at: string
}

/** A case's current readings: its rules' and its checks', each by the id its verdict carries. */
export interface CurrentReadings {
  /**
   * By `verdictId('rule', text)`: the id a rule's verdict carries. A rule that
   * cannot hold beside one of this case's checks reads, on this case alone,
   * as one that cannot be marked: in conflict `with` that check (`c2`).
   */
  rules: Map<string, CurrentReading>
  /** By the id `checkIds` gives the check: the id its verdict carries. */
  checks: Map<string, CurrentReading>
}

/**
 * The readings that fit what is graded now: every rule of `skillMd` (or of
 * `options.rules`, when `bench.json` lists them) and every check of
 * `testCase`, each by the id its verdict carries. A rule or a check with no
 * reading made from this exact text, under the current prompt, is absent:
 * grade it as before. `options.ask` is a run's kept `ask` for the case, so a
 * run is read against the case as it asked it, not as it is now.
 *
 * A reading of `{ reading: 'judged', span: null }` is one the model could not
 * fill in the shape twice: Jev is asked, as before sorting.
 *
 * A current check that names a rule it cannot hold beside (`against`) sets
 * that rule aside on this case: the rule reads `unmarkable`, `conflict`,
 * `with` the check by its place in the case (`c2`) and with the check's fix
 * for it. A rule that cannot be marked anyway keeps its own reading. On every
 * other case the rule is read as its own reading says.
 */
export function currentReadings(
  skillDir: string,
  skillMd: string,
  testCase: Case,
  options: { rules?: readonly Rule[]; ask?: string } = {},
): CurrentReadings {
  const stored = new Map(
    readStored(skillDir)
      .filter((entry) => entry.prompt === SORT_PROMPT_VERSION)
      .map((entry) => [entry.stamp, entry]),
  )
  const current = (stamp: string): CurrentReading | null => {
    const entry = stored.get(stamp)
    return entry ? { reading: entry.reading, model: entry.model, at: entry.at } : null
  }
  const ruleList = options.rules ?? rulesFromSkill(skillMd)
  const rules = new Map<string, CurrentReading>()
  for (const rule of ruleList) {
    const found = current(ruleStamp(skillMd, rule.text))
    if (found) rules.set(verdictId('rule', rule.text), found)
  }
  const checks = new Map<string, CurrentReading>()
  const ask = askStamp(skillDir, testCase, options.ask)
  const ids = checkIds(testCase.graders.map((g) => ({ id: g.id, text: g.statement })))
  const ruleTexts = new Set(ruleList.map((r) => r.text.trim()))
  testCase.graders.forEach((grader, i) => {
    const entry = stored.get(checkStamp(skillMd, ask, grader.statement))
    if (!entry) return
    checks.set(ids[i], { reading: entry.reading, model: entry.model, at: entry.at })
    for (const against of entry.against ?? []) {
      const text = against.rule.trim()
      if (!ruleTexts.has(text)) continue
      const id = verdictId('rule', text)
      if (rules.get(id)?.reading.reading === 'unmarkable') continue
      rules.set(id, {
        reading: { reading: 'unmarkable', why: 'conflict', with: `c${i + 1}`, fix: against.fix },
        model: entry.model,
        at: entry.at,
      })
    }
  })
  return { rules, checks }
}
