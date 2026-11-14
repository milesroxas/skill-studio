/**
 * A stepped scale: five bars in a row that fill as a measure grows, so it
 * reads at a glance without a number to parse. The file size meter and a
 * case's cost to run both show through it.
 */
import { cva } from 'class-variance-authority'

/** A step of the scale, 14 by 6 with 2px corners: tall enough for the corners to read as corners, so a printed scale and not a row of beads. */
const segment = cva('h-1.5 w-3.5 rounded-xs transition-colors duration-150 ease-out', {
  variants: {
    fill: {
      empty: 'bg-input',
      /** The text color around it: as quiet as its neighbours until pointed at. */
      fine: 'bg-current',
      warning: 'bg-warning',
      destructive: 'bg-destructive',
    },
  },
})

export type LevelFill = 'fine' | 'warning' | 'destructive'

const STEPS = [1, 2, 3, 4, 5] as const

/** The bars alone. What they measure is said by the control or the label that holds them. */
export function LevelBars({ level, fill }: { level: number; fill: LevelFill }) {
  return (
    <span aria-hidden="true" className="flex items-center gap-0.5">
      {STEPS.map((step) => (
        <span key={step} className={segment({ fill: step <= level ? fill : 'empty' })} />
      ))}
    </span>
  )
}
