import { type ClassValue, clsx } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * tailwind-merge only knows the default scales, so the theme's own steps are
 * taught here.
 *
 * - Shadows (`shadow-raised`, `shadow-popover`): `shadow-none` from a variant
 *   replaces them instead of both landing in the class list.
 * - Type sizes (`text-ui`, `text-code`, and the rest of the scale in
 *   styles.css): an unknown `text-*` reads as a color, so a size beside a color
 *   dropped whichever came first. `text-ui text-muted-foreground` lost its
 *   size and `text-muted-foreground text-code` lost its color. `display`
 *   too, for the counts at the head of All cases.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: { shadow: ['raised', 'popover'], text: ['2xs', 'ui', 'md', 'code', 'display'] },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
