/** Layer bars, the total chip and the flag list for one scored output. */
import type { Scored } from '@domain/scoring.ts'
import { capital, chipClass } from '../model.ts'

export function TotalChip({ total }: { total: number | null | undefined }) {
  return <span className={`chip ${chipClass(total)}`}>{total ?? '–'}</span>
}

export function Delta({ value }: { value: number | null }) {
  if (!value) return null
  return (
    <span className={`delta ${value > 0 ? 'up' : 'down'}`}>
      {value > 0 ? '+' : '−'}
      {Math.abs(value)}
    </span>
  )
}

/** Each layer's score with a bar. Bars stay grey until a layer is weak, so the eye lands on problems. */
export function Layers({
  scored,
  layers,
  other,
}: {
  scored: Scored
  layers: string[]
  other?: Scored | null
}) {
  return (
    <div className="layers">
      {layers.map((layer) => {
        const value = scored.scores[layer] ?? null
        const o = other?.scores[layer] ?? null
        const delta = value !== null && o !== null ? value - o : null
        return (
          <div key={layer} className={`layer ${value === null ? 'na' : chipClass(value)}`}>
            {capital(layer)}
            <b>
              {value ?? '–'}
              <Delta value={delta} />
            </b>
            <div className="bar">
              <span style={{ width: `${value ?? 0}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function Flags({ flags }: { flags: string[] }) {
  if (!flags.length) return null
  return (
    <details className="flags" open={flags.length <= 3}>
      <summary>
        {flags.length} flag{flags.length > 1 ? 's' : ''}
      </summary>
      <ul>
        {flags.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
    </details>
  )
}
