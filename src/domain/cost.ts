/**
 * What one model call cost: Claude's, Jev's, or the answer under test's. Each
 * call made is one record, taken where the call is made, and a command sums
 * its records at its end.
 */
import type { AiProviderId, AiRunKind } from './ai.ts'

/** The work a call was made for, named by whoever asked. */
export type Operation = 'run' | 'grade' | 'sort' | 'propose' | 'read' | AiRunKind

export interface CallRecord {
  operation: Operation
  provider: AiProviderId | 'jev' | 'engine'
  /** The model that answered, as the provider names it. */
  model: string
  input: number
  /** 0 for Jev, whose output is not counted. */
  output: number
  seconds: number
  /** `replayed` came from a file under `ST_AI_REPLAY` and cost nothing. */
  source: 'asked' | 'replayed'
}

/** The calls of one operation, to one model, asked or replayed, added up. */
export interface CallTotal extends Omit<CallRecord, 'seconds'> {
  calls: number
  seconds: number
}

/** `totals` added up by operation, provider, model and source, and sorted by the same, so two sums of the same calls are equal. */
export function addTotals(...totals: ReadonlyArray<readonly CallTotal[]>): CallTotal[] {
  const sums = new Map<string, CallTotal>()
  for (const t of totals.flat()) {
    const key = JSON.stringify([t.operation, t.provider, t.model, t.source])
    const sum = sums.get(key) ?? {
      operation: t.operation,
      provider: t.provider,
      model: t.model,
      source: t.source,
      calls: 0,
      input: 0,
      output: 0,
      seconds: 0,
    }
    sum.calls += t.calls
    sum.input += t.input
    sum.output += t.output
    sum.seconds = Math.round((sum.seconds + t.seconds) * 100) / 100
    sums.set(key, sum)
  }
  return [...sums.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, sum]) => sum)
}

/** `records` added up by operation, provider, model and source, and sorted by the same, so two sums of the same calls are equal. */
export const sumCalls = (records: readonly CallRecord[]): CallTotal[] =>
  addTotals(records.map((r) => ({ ...r, calls: 1 })))

/**
 * What the gradings of a run cost, as the run keeps it: every model call
 * each made, added up. `whole` is false where an earlier grading of the run
 * kept no cost, so it is not among them.
 */
export interface GradingCost {
  calls: CallTotal[]
  whole: boolean
}

/** A count as a file keeps one: a whole number, not below nought. */
const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0
/** An amount as a file keeps one: a finite number, not below nought. */
const isAmount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

/** One sum of calls as a file anyone may have written holds it; null for one in another shape. */
function callTotalIn(raw: unknown): CallTotal | null {
  if (!raw || typeof raw !== 'object') return null
  const t = raw as Partial<Record<keyof CallTotal, unknown>>
  const named = [t.operation, t.provider, t.model].every((v) => typeof v === 'string' && v)
  const source = t.source === 'asked' || t.source === 'replayed'
  if (!named || !source || ![t.calls, t.input, t.output].every(isCount) || !isAmount(t.seconds))
    return null
  const { operation, provider, model, calls, input, output, seconds } = t as CallTotal
  return {
    operation,
    provider,
    model,
    source: t.source as CallTotal['source'],
    calls,
    input,
    output,
    seconds,
  }
}

/**
 * What the gradings of a run cost, as a file anyone may have written keeps
 * it, checked whole: `calls` a list of sums of calls in their shape, counts
 * whole and not below nought, and `whole` true or false. Null for anything
 * else, which reads as a cost not kept: never a wrong number.
 */
export function gradingCostIn(raw: unknown): GradingCost | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const { calls, whole } = raw as Partial<Record<keyof GradingCost, unknown>>
  if (!Array.isArray(calls) || typeof whole !== 'boolean') return null
  const read = calls.map(callTotalIn)
  return read.every((c) => c !== null) ? { calls: read as CallTotal[], whole } : null
}

/**
 * What one attempt's answer cost, as its `timing.json` keeps it: how long its
 * agent took, its tokens and its price, each null where it kept none. Input
 * counts the tokens read from the cache and written to it.
 */
export interface AnswerCost {
  seconds: number
  tokens: { input: number; output: number } | null
  usd: number | null
}

/**
 * What a run cost in all, as its files keep it: each attempt's answer, from
 * its `timing.json`, and its gradings, from its report. Each figure says how
 * many attempts it is added up over, since an attempt cut off keeps none and
 * an engine may keep no tokens or no price.
 */
export interface RunSpent {
  /** The run's attempts: each sample folder it has. */
  attempts: number
  answering: {
    /** Added up over the attempts with a `timing.json`. */
    seconds: { attempts: number; total: number }
    /** Added up over the attempts that kept their tokens. Input counts tokens read from the cache and written to it. */
    tokens: { attempts: number; input: number; output: number }
    /** In US dollars, added up over the attempts that kept a price. */
    usd: { attempts: number; total: number }
  }
  /** Whether the run was graded: it has a report, kept answers or a kept cost. */
  graded: boolean
  /** What its gradings cost, as it keeps it; null where it keeps none, as one graded before gradings kept their cost. */
  grading: GradingCost | null
}

/** What a run spent: `answers` holds each attempt's answer, null for one with no `timing.json`. */
export function runSpent(
  answers: ReadonlyArray<AnswerCost | null>,
  grading: { cost: GradingCost | null; graded: boolean },
): RunSpent {
  const timed = answers.filter((a): a is AnswerCost => a !== null)
  const tokened = timed.flatMap((a) => (a.tokens ? [a.tokens] : []))
  const priced = timed.flatMap((a) => (a.usd === null ? [] : [a.usd]))
  return {
    attempts: answers.length,
    answering: {
      seconds: {
        attempts: timed.length,
        total: Math.round(timed.reduce((sum, a) => sum + a.seconds, 0) * 100) / 100,
      },
      tokens: {
        attempts: tokened.length,
        input: tokened.reduce((sum, t) => sum + t.input, 0),
        output: tokened.reduce((sum, t) => sum + t.output, 0),
      },
      usd: {
        attempts: priced.length,
        total: Math.round(priced.reduce((sum, usd) => sum + usd, 0) * 1e6) / 1e6,
      },
    },
    graded: grading.graded,
    grading: grading.cost,
  }
}

/** A price as the run's log writes one: four places under ten cents ("$0.0985"), two from there ("$1.23"). */
export const dollars = (usd: number): string => `$${usd.toFixed(usd < 0.1 ? 4 : 2)}`
