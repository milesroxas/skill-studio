/**
 * The meter: every model call made inside `withMeter`'s work is counted to
 * it, wherever the call is made, so a command can sum what it cost. A call
 * made outside any meter, as in the app, is counted nowhere. A meter inside
 * another counts its calls to both.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import type { CallRecord } from '@domain/cost.ts'

export interface Meter {
  /** Every call counted to it, in the order each ended. */
  readonly calls: CallRecord[]
  /** Why each call a replay had no saved reply for was stopped. */
  readonly missing: string[]
}

const meters = new AsyncLocalStorage<readonly Meter[]>()

/** Run `work` with a meter of its own. */
export function withMeter<T>(work: (meter: Meter) => Promise<T>): Promise<T> {
  const meter: Meter = { calls: [], missing: [] }
  return meters.run([...(meters.getStore() ?? []), meter], () => work(meter))
}

/** The innermost meter the caller is running under, or null. */
export const meterNow = (): Meter | null => meters.getStore()?.at(-1) ?? null

/** Count one call to every meter it is made under. */
export function countCall(record: CallRecord): void {
  for (const meter of meters.getStore() ?? []) meter.calls.push(record)
}

/** Say that a replay had no reply for a call, to every meter it is made under. */
export function countMissing(message: string): void {
  for (const meter of meters.getStore() ?? []) meter.missing.push(message)
}
