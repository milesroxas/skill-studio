/** Small statistics, pure. */

export const mean = (values: number[]): number | null =>
  values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null

export const stddev = (values: number[]): number | null => {
  const m = mean(values)
  if (m === null || values.length < 2) return values.length ? 0 : null
  return Math.sqrt(values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1))
}

export const spread = (values: number[]): number | null =>
  values.length ? Math.max(...values) - Math.min(...values) : null

/** Weighted mean of [value, weight] pairs; null when no weight. */
export const weighted = (parts: Array<[number, number]>): number | null => {
  const weight = parts.reduce((sum, [, w]) => sum + w, 0)
  return weight ? parts.reduce((sum, [v, w]) => sum + v * w, 0) / weight : null
}

/** How far a probability sits from 0.5, scaled to 0..1. */
export const certainty = (p: number): number => Math.min(1, Math.abs(p - 0.5) * 2)

const ranks = (values: number[]): number[] => {
  const order = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0])
  const out = new Array<number>(values.length)
  let i = 0
  while (i < order.length) {
    let j = i
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j += 1
    const rank = (i + j) / 2 + 1
    for (let k = i; k <= j; k += 1) out[order[k][1]] = rank
    i = j + 1
  }
  return out
}

/** Spearman rank correlation between two equal-length lists; null under 3 pairs. */
export function spearman(a: number[], b: number[]): number | null {
  if (a.length !== b.length || a.length < 3) return null
  const ra = ranks(a)
  const rb = ranks(b)
  const ma = mean(ra) ?? 0
  const mb = mean(rb) ?? 0
  let num = 0
  let da = 0
  let db = 0
  for (let i = 0; i < a.length; i += 1) {
    num += (ra[i] - ma) * (rb[i] - mb)
    da += (ra[i] - ma) ** 2
    db += (rb[i] - mb) ** 2
  }
  return da && db ? num / Math.sqrt(da * db) : null
}

/**
 * Share of pairs where two voters agree. Each list holds votes keyed the same
 * way (for example `${a}|${b}|${criterion}`); only keys both voted on count.
 */
export function agreement(
  jev: Record<string, string>,
  human: Record<string, string>,
): { agreed: number; compared: number; share: number | null } {
  let agreed = 0
  let compared = 0
  for (const [key, vote] of Object.entries(human)) {
    if (!(key in jev)) continue
    compared += 1
    if (jev[key] === vote) agreed += 1
  }
  return { agreed, compared, share: compared ? agreed / compared : null }
}
