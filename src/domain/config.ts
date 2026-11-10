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

interface Range {
  min: number
  max: number
}

/**
 * The points the Scoring screen's slider offers one layer. A new edit is held
 * to it; a saved file is not, so points saved past it score as they were saved.
 */
export const WEIGHT_RANGE = { min: 0, max: 60 } as const
/** Where the Scoring screen's slider lets "Met at" sit, for a new edit. A saved threshold may sit anywhere from 0 to 1. */
export const YES_RANGE = { min: 0.3, max: 0.8 } as const

const AT_LEAST_NOTHING: Range = { min: 0, max: Number.POSITIVE_INFINITY }
const PROBABILITY: Range = { min: 0, max: 1 }

/** Settings that are a share or a cost: outside these a layer would score below 0 or above 100. */
const SETTING_RANGES: Readonly<Record<string, Range>> = {
  warningCost: AT_LEAST_NOTHING,
  groundingPrior: PROBABILITY,
  contradictionCap: PROBABILITY,
}

/**
 * Numbers inside a pack's own setting that are a share of a part's points.
 * Every other number one level down (points, seconds, characters, counts) is
 * held at 0 or more.
 */
const NESTED_RANGES: Readonly<Record<string, Range>> = {
  'structure.pointerCredit': PROBABILITY,
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const clamp = (value: number, { min, max }: Range): number => Math.min(max, Math.max(min, value))

/**
 * A pack's own setting that is an object, its numbers brought into range: a
 * share to 0 to 1, any other number to 0 or more, and one that is not finite
 * dropped. What is not a number passes through, for `laid` to check its kind.
 */
function nestedOf(key: string, value: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [inner, v] of Object.entries(value)) {
    if (typeof v !== 'number') out[inner] = v
    else if (Number.isFinite(v)) {
      const path = `${key}.${inner}`
      out[inner] = clamp(
        v,
        Object.hasOwn(NESTED_RANGES, path) ? NESTED_RANGES[path] : AT_LEAST_NOTHING,
      )
    }
  }
  return out
}

/** Strings from untrusted input, trimmed, each once, a blank one left out. */
const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? [
        ...new Set(
          value
            .filter((v): v is string => typeof v === 'string')
            .map((v) => v.trim())
            .filter(Boolean),
        ),
      ]
    : []

/**
 * A `bench.json` from untrusted input, such as a file written by hand, as a
 * config the scorers can read without a check of their own. What it holds
 * right is kept; what it holds wrong falls back or is brought into range:
 *
 * - `packs`: names, each once. Empty when it names none, which `mergeConfig`
 *   reads as the default list.
 * - `rules`: the rules that say something, each once; null when there are none.
 * - `weights`: a number per layer, held at 0 or more. Anything else is dropped.
 *   No top: points saved past the Scoring screen's slider score as saved.
 * - `yes`: held to 0 to 1; the default when it is not a number.
 * - A share or a cost (`warningCost`, `groundingPrior`, `contradictionCap`) is
 *   held to its range, and dropped when it is not a number.
 * - A number inside a pack's own setting is held at 0 or more, and a share
 *   there (`structure.pointerCredit`) to 0 to 1.
 *
 * Every other key is a pack's own setting and passes through as it is, for
 * `mergeConfig` to lay over that pack's default.
 */
export function benchOf(raw: unknown): BenchConfig {
  const source = isObject(raw) ? raw : {}
  const rules = strings(source.rules)
  const config: BenchConfig = {
    packs: strings(source.packs),
    rules: rules.length ? rules : null,
    weights: weightsOf(source.weights),
    yes: isNumber(source.yes) ? clamp(source.yes, PROBABILITY) : DEFAULT_CONFIG.yes,
  }
  for (const [key, value] of Object.entries(source)) {
    if (Object.hasOwn(config, key) || UNREAD.has(key) || value === undefined) continue
    const setting = settingOf(key, value)
    if (setting !== undefined) config[key] = setting
  }
  return config
}

/** Points per layer from untrusted input, each held at 0 or more; a layer whose points are not a number is dropped. */
function weightsOf(value: unknown): Record<string, number> {
  const weights: Record<string, number> = {}
  if (isObject(value))
    for (const [layer, points] of Object.entries(value))
      if (isNumber(points)) weights[layer] = clamp(points, AT_LEAST_NOTHING)
  return weights
}

/**
 * A pack's own setting as `benchOf` keeps it: a share or a cost held to its
 * range, an object with its numbers brought into range, anything else as it
 * is. Undefined for a share or a cost that is not a number, which is dropped.
 */
function settingOf(key: string, value: unknown): unknown {
  const range = Object.hasOwn(SETTING_RANGES, key) ? SETTING_RANGES[key] : null
  if (range) return isNumber(value) ? clamp(value, range) : undefined
  return isObject(value) ? nestedOf(key, value) : value
}

/** What kind of value a setting is, so a saved one of another kind does not take a default's place. */
const kindOf = (value: unknown): string =>
  Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value

/**
 * `saved` laid over `current`, one level of nesting deep. A saved value of
 * another kind than the default it would replace is left out: a number where
 * a pack reads an object, or a null where it reads a number, would break the
 * scorer that reads it. A default of null takes any value.
 */
function laid(current: unknown, saved: unknown): unknown {
  if (current === undefined || current === null) return saved
  if (kindOf(current) !== kindOf(saved)) return current
  if (!isObject(current) || !isObject(saved)) return saved
  const merged: Record<string, unknown> = { ...current }
  for (const [key, value] of Object.entries(saved)) {
    const under = current[key]
    const fits = under === undefined || under === null || kindOf(under) === kindOf(value)
    if (fits && (typeof value !== 'number' || isNumber(value))) merged[key] = value
  }
  return merged
}

/**
 * Defaults, then each active pack's defaults, then the saved `bench.json`
 * laid over them one level of nesting deep, read through `benchOf` first. The
 * active packs are the saved list when it has one, else the default.
 */
export function mergeConfig(
  saved: Partial<BenchConfig> | null | undefined,
  scorers: PackScoring[],
): BenchConfig {
  const read = benchOf(saved)
  const merged: BenchConfig = structuredClone(DEFAULT_CONFIG)
  const packs = read.packs.length ? read.packs : merged.packs
  merged.packs = [...packs]
  for (const pack of scorers) {
    if (!packs.includes(pack.id)) continue
    for (const [key, value] of Object.entries(pack.defaults)) {
      if (key === 'packs') continue
      const current = merged[key]
      merged[key] = isObject(current) && isObject(value) ? { ...current, ...value } : value
    }
  }
  // `benchOf` fills in a threshold the file did not give: only one it gave stands over a pack's own.
  const gaveYes = isObject(saved) && isNumber(saved.yes)
  for (const [key, value] of Object.entries(read)) {
    if (key === 'packs' || (key === 'yes' && !gaveYes)) continue
    merged[key] = key === 'rules' ? value : laid(merged[key], value)
  }
  return merged
}
