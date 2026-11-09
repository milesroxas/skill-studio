/** Small statistics, pure. */

export const mean = (values: number[]): number | null =>
  values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null

export const stddev = (values: number[]): number | null => {
  const m = mean(values)
  if (m === null || values.length < 2) return values.length ? 0 : null
  return Math.sqrt(values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1))
}

/** Weighted mean of [value, weight] pairs; null when no weight. */
export const weighted = (parts: Array<[number, number]>): number | null => {
  const weight = parts.reduce((sum, [, w]) => sum + w, 0)
  return weight ? parts.reduce((sum, [v, w]) => sum + v * w, 0) / weight : null
}

/** How far a probability sits from 0.5, scaled to 0..1. */
export const certainty = (p: number): number => Math.min(1, Math.abs(p - 0.5) * 2)
