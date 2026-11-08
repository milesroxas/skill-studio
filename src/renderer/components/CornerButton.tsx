/**
 * An icon action in the corner of a text field, about the field's own content:
 * "write with AI", or the picture a check is about. A setting of the row the
 * field is in, such as a check's weight, and the row's removal sit outside the
 * field, not here.
 */
import type { ComponentProps } from 'react'
import { cn } from '../lib/utils.ts'
import { Button } from './ui/button.tsx'

export function CornerButton({ className, ...props }: ComponentProps<typeof Button>) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      className={cn(
        // 24px to look at, 36px to hit: as far as it reaches without covering the field's text.
        'relative text-muted-foreground/80 before:absolute before:-inset-1.5 hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground [&_svg]:size-3.5',
        className,
      )}
      {...props}
    />
  )
}
