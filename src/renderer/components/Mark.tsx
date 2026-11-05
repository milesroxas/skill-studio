/**
 * The brand, where the welcome shows it: the app icon's yellow tile with its
 * three stepped bars, and the same yellow as a highlighter's stroke. Both are
 * drawn as they arrive, the way a pen would: the tile is set down, each bar is
 * drawn from left to right, lowest first, and the highlighter crosses its word
 * once. Nowhere else in the app uses the yellow.
 */
import type { ReactNode } from 'react'
import { cn } from '../lib/utils.ts'
import { after } from '../motion.ts'

/** The icon's three bars, in its own units, top to bottom. */
const BARS = [
  'M2 12H22L34 0H62V12H38L26 24H2Z',
  'M2 34H22L34 22H62V34H38L26 46H2Z',
  'M2 56H22L34 44H62V56H38L26 68H2Z',
]
/** When the lowest bar starts, and how long each one after it waits for the one below. */
const DRAW = { start: 180, step: 90 }

/** The app's mark. It draws itself once when it appears. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      className={cn('size-16 animate-settle overflow-visible', className)}
    >
      <rect width="64" height="64" rx="14.4" className="fill-brand" />
      {/* The bars sit where the icon has them: 44% of the tile wide, half of it high. */}
      <g transform="translate(16.94 16) scale(0.4707)" className="fill-brand-ink">
        {BARS.map((d, i) => (
          <path
            key={d}
            d={d}
            className="animate-draw"
            style={after(DRAW.start + (BARS.length - 1 - i) * DRAW.step)}
          />
        ))}
      </g>
    </svg>
  )
}

/**
 * A highlighter over the one word or number that matters. The stroke crosses
 * from the left after `delay`. On paper it is the icon's yellow under ink; in
 * the dark theme it is a wash of the same yellow, so the words stay readable
 * before the stroke reaches them and after.
 */
export function Highlight({ delay = 0, children }: { delay?: number; children: ReactNode }) {
  return (
    <span className="relative isolate inline-block">
      <span
        aria-hidden="true"
        className="absolute -inset-x-[0.14em] inset-y-[0.06em] -z-10 origin-left -rotate-1 animate-swipe rounded-[0.14em] bg-brand dark:bg-brand/30"
        style={after(delay)}
      />
      {children}
    </span>
  )
}
