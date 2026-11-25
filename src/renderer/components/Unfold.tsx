/**
 * A block that grows into the flow or shrinks out of it while the reader
 * watches (`animate-unfold`, `animate-fold`): its height goes from nothing to
 * its own on a spring, or quickly back, as it fades, so what is round it
 * moves with it and never jumps. `rest` is there at once. It clips what it
 * holds only while it moves, so a focus ring at its edge shows once it has
 * come. The clip is `overflow: clip`, never a scroll box, so a focus put in
 * it while it moves cannot scroll what it holds. See docs/design/brand.md.
 *
 * `unfoldVariants`, `UNFOLD_CHILD` and `UNFOLDING` are the same block for a
 * place that must be another element (a list's row) or that Radix opens.
 */
import { cva } from 'class-variance-authority'
import { type ReactNode, useState } from 'react'

/** The block: `display: grid` round one child, growing in or shrinking out. */
export const unfoldVariants = cva('grid', {
  variants: {
    motion: { in: 'animate-unfold', out: 'pointer-events-none animate-fold', rest: '' },
  },
})

/** Its one child, clipped: no higher than the block, and showing no more. */
export const UNFOLD_CHILD = 'min-h-0 overflow-clip'

/** What a `Collapsible` opens: it unfolds as it opens and folds as it closes, and stays until it has. */
export const UNFOLDING = 'grid data-[state=closed]:animate-fold data-[state=open]:animate-unfold'

/** The one child, clipped only while it moves. */
const childVariants = cva('min-h-0', {
  variants: { moving: { true: 'overflow-clip', false: '' } },
})

export function Unfold({
  motion,
  children,
}: {
  motion: 'in' | 'out' | 'rest'
  children: ReactNode
}) {
  const [came, setCame] = useState({ motion, done: false })
  if (came.motion !== motion) setCame({ motion, done: false })
  const moving = motion !== 'rest' && !(motion === 'in' && came.done)
  return (
    <div
      className={unfoldVariants({ motion })}
      onAnimationEnd={(event) => {
        // Only its own unfolding: what it holds writes itself in on its own time.
        if (event.target === event.currentTarget && motion === 'in') setCame({ motion, done: true })
      }}
    >
      <div className={childVariants({ moving })}>{children}</div>
    </div>
  )
}
