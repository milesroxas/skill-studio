import type { PackScoring } from './pack.ts'
import type { BenchConfig } from './schemas.ts'

export const DEFAULT_CONFIG: BenchConfig = {
  packs: ['generic'],
  rules: null,
  weights: {},
  yes: 0.5,
}

/** Keys a `bench.json` written by an earlier version may hold. Nothing reads them, so they are not carried on. */
const UNREAD = new Set(['sure', 'agreeAt', 'defaultCase'])

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

/**
 * Defaults, then each active pack's defaults, then the saved `bench.json`
 * laid over them one level of nesting deep. The active packs are the saved
 * list when it has one, else the default.
 */
export function mergeConfig(
  saved: Partial<BenchConfig> | null | undefined,
  scorers: PackScoring[],
): BenchConfig {
  const merged: BenchConfig = structuredClone(DEFAULT_CONFIG)
  const packs = Array.isArray(saved?.packs) && saved.packs.length ? saved.packs : merged.packs
  merged.packs = [...packs]
  for (const pack of scorers) {
    if (!packs.includes(pack.id)) continue
    for (const [key, value] of Object.entries(pack.defaults)) {
      if (key === 'packs') continue
      const current = merged[key]
      merged[key] = isObject(current) && isObject(value) ? { ...current, ...value } : value
    }
  }
  for (const [key, value] of Object.entries(saved ?? {})) {
    if (key === 'packs' || value === undefined || UNREAD.has(key)) continue
    const current = merged[key]
    merged[key] = isObject(current) && isObject(value) ? { ...current, ...value } : value
  }
  return merged
}
