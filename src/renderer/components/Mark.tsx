/**
 * The brand, where the app shows it: the Flow mark (two identical ribbons) and
 * the yellow slab under the one word or number that matters. The mark is the
 * foreground color, never yellow: yellow means live, and a logo is not live. The
 * slab appears only in the welcome. See docs/design/brand.md.
 */
import { cva, type VariantProps } from 'class-variance-authority'
import type { ReactNode } from 'react'
import { after } from '../motion.ts'

/** The two ribbons in the mark's 184 x 152 box, top first. The second is the first moved down 64. */
const RIBBONS = [
  'M 0 56 H 64 C 104 56 104 0 144 0 H 184 V 32 H 144 C 104 32 104 88 64 88 H 0 Z',
  'M 0 120 H 64 C 104 120 104 64 144 64 H 184 V 96 H 144 C 104 96 104 152 64 152 H 0 Z',
]
/** When the lower ribbon starts drawing, and how long the upper one waits after it. */
const DRAW = { start: 120, step: 140 }

const markVariants = cva('h-auto shrink-0 fill-current', {
  variants: {
    size: {
      /** The sidebar's drag strip, on macOS only: other platforms have a title bar that names the app. */
      strip: 'hidden w-[23px] in-data-[platform=darwin]:block',
      /** The welcome's opening: cropped by the frame's right and bottom edges, behind the words. */
      cover: 'pointer-events-none absolute -right-[286px] -bottom-[9px] w-[626px]',
    },
  },
})

/** The app's mark. On the cover it draws itself once, lower ribbon first; in the strip it stands still. */
export function Mark({ size }: Required<VariantProps<typeof markVariants>>) {
  const draws = size === 'cover'
  return (
    <svg viewBox="0 0 184 152" aria-hidden="true" className={markVariants({ size })}>
      {RIBBONS.map((d, i) => (
        <path
          key={d}
          d={d}
          className={draws ? 'animate-draw' : undefined}
          style={draws ? after(DRAW.start + (RIBBONS.length - 1 - i) * DRAW.step) : undefined}
        />
      ))}
    </svg>
  )
}

/**
 * A yellow slab under ink: the one word or number that matters, once per
 * frame of the welcome. Square to the page, hanging 8px left of the text so
 * the letters stay on the column's edge. It is drawn across from the left
 * after `delay`; the word is readable in its own color before it lands.
 */
export function Slab({ delay = 0, children }: { delay?: number; children: ReactNode }) {
  return (
    <span className="relative inline-block">
      {children}
      <span
        aria-hidden="true"
        className="absolute top-0 -right-2.5 -bottom-1 -left-2 animate-draw bg-signal pl-2 whitespace-nowrap text-signal-foreground select-none"
        style={after(delay)}
      >
        {children}
      </span>
    </span>
  )
}
