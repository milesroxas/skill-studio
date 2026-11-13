/**
 * What every surface that floats over the page shares, a popover or a menu,
 * written once so the two never drift apart: the sheet itself, how it comes
 * and goes, and the look of a row that does something.
 */

/** The sheet: porcelain over the page, the container's corners, the popover shadow. */
export const floatingSheet =
  'z-popover rounded-md bg-popover text-popover-foreground shadow-popover outline-hidden'

/**
 * In from where it opened in 150ms, a touch under its size, and out faster
 * than it came. The origin is set by each surface, from its trigger or the pointer.
 */
export const floatingMotion =
  'duration-150 ease-out-strong data-[state=closed]:duration-100 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.97]'

/** A row that does something: an icon, then what it does. 4px inside its sheet, so its corners are the sheet's less 4: `rounded-xs`. */
export const floatingRow =
  'flex min-h-8 items-center gap-2 rounded-xs px-2 text-left text-ui pointer-coarse:min-h-11 [&_svg]:size-4 [&_svg]:shrink-0'

/** A row's tone. `destructive` deletes something the reader made: red, its icon too. */
export const floatingRowTone = {
  default: '[&_svg]:text-muted-foreground',
  destructive: 'text-destructive [&_svg]:text-destructive',
} as const
