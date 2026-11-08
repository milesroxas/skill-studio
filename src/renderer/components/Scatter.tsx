/**
 * Your 1 to 5 against the judge's total, one dot per rated output. A figure:
 * the dots are the thing measured, in foreground; the axes and their marks are
 * references, in muted and input tones, labelled in mono 2xs as every figure is.
 */
export interface ScatterPoint {
  key: string
  /** Your rating, 1 to 5. */
  rating: number
  /** The judge's total, 0 to 100. */
  total: number
}

export function Scatter({ points }: { points: ScatterPoint[] }) {
  return (
    <svg
      className="h-auto w-full max-w-[420px] fill-muted-foreground text-2xs"
      viewBox="0 0 320 170"
      role="img"
      aria-label="Your rating against the judge’s total"
    >
      <line className="stroke-input" x1="40" y1="150" x2="310" y2="150" />
      <line className="stroke-input" x1="40" y1="10" x2="40" y2="150" />
      {[1, 2, 3, 4, 5].map((n) => (
        <text key={n} x={40 + (n - 1) * 66} y="165" textAnchor="middle">
          {n}
        </text>
      ))}
      {[0, 50, 100].map((v) => (
        <text key={v} x="34" y={150 - v * 1.4 + 3} textAnchor="end">
          {v}
        </text>
      ))}
      {points.map((p, i) => (
        <circle
          key={p.key}
          className="fill-foreground opacity-70"
          cx={40 + (p.rating - 1) * 66 + ((i * 7) % 15) - 7}
          cy={150 - p.total * 1.4}
          r="4.5"
        >
          <title>
            {p.key}: you {p.rating}, judge {p.total}
          </title>
        </circle>
      ))}
    </svg>
  )
}
