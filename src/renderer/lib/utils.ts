import { type ClassValue, clsx } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * tailwind-merge only knows the default scales. The theme's own shadows
 * (`shadow-raised`, `shadow-popover`) are taught here, so `shadow-none` from a
 * variant replaces them instead of both landing in the class list.
 */
const twMerge = extendTailwindMerge({
  extend: { theme: { shadow: ['raised', 'popover'] } },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
