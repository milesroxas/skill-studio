/**
 * A block that grows into the flow or shrinks out of it while the reader
 * watches (`animate-unfold`, `animate-fold`): its height goes from nothing to
 * its own, or back, as it fades, so what is round it moves with it and never
 * jumps. `rest` is there at once. It clips what it holds only while it moves,
 * so a focus ring at its edge shows once it has come. See docs/design/brand.md.
 */
import { cva } from 'class-variance-authority'
import { type ReactNode, useState } from 'react'

const unfoldVariants = cva('grid', {
  variants: {
    motion: { in: 'animate-unfold', out: 'pointer-events-none animate-fold', rest: '' },
  },
})

/** The one child: no higher than the block, and showing no more while it moves. */
const childVariants = cva('min-h-0', {
  variants: { moving: { true: 'overflow-hidden', false: '' } },
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
