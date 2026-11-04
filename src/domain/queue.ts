import type { ReportResult } from './schemas.ts'
import { spread } from './stats.ts'

export interface QueueItem {
  /** `<run>/<sample>` */
  key: string
  run: string
  result: ReportResult
  /** Spread of totals across samples of the same case in the same run. */
  caseSpread: number
  /** Sort key, lower first: least certain judge, widest spread. */
  priority: number
}

/**
 * The blind review queue: outputs the judge is least sure about first, then
 * the cases whose samples disagree most, so judging time goes where it tells
 * the most. Already-reviewed keys are left out.
 */
export function reviewQueue(
  runs: Array<{ name: string; results: ReportResult[] }>,
  reviewed: Set<string> = new Set(),
): QueueItem[] {
  const items: QueueItem[] = []
  for (const run of runs) {
    const byCase = new Map<string, number[]>()
    for (const r of run.results) {
      if (r.case && r.scores.total !== null)
        byCase.set(r.case, [...(byCase.get(r.case) ?? []), r.scores.total])
    }
    const maxSpread = Math.max(1, ...[...byCase.values()].map((v) => spread(v) ?? 0))
    for (const result of run.results) {
      const key = `${run.name}/${result.sample}`
      if (reviewed.has(key)) continue
      const caseSpread = result.case ? (spread(byCase.get(result.case) ?? []) ?? 0) : 0
      const confidence = result.confidence ?? 0.5
      items.push({
        key,
        run: run.name,
        result,
        caseSpread,
        priority: confidence - caseSpread / maxSpread,
      })
    }
  }
  return items.sort((a, b) => a.priority - b.priority)
}
