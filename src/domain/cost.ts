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

/** `records` added up by operation, provider, model and source, and sorted by the same, so two sums of the same calls are equal. */
export function sumCalls(records: readonly CallRecord[]): CallTotal[] {
  const totals = new Map<string, CallTotal>()
  for (const r of records) {
    const key = JSON.stringify([r.operation, r.provider, r.model, r.source])
    const total = totals.get(key) ?? {
      operation: r.operation,
      provider: r.provider,
      model: r.model,
      source: r.source,
      calls: 0,
      input: 0,
      output: 0,
      seconds: 0,
    }
    total.calls += 1
    total.input += r.input
    total.output += r.output
    total.seconds = Math.round((total.seconds + r.seconds) * 100) / 100
    totals.set(key, total)
  }
  return [...totals.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, total]) => total)
}
