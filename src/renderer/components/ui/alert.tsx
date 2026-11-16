import { Dot } from '@renderer/components/Status.tsx'
import { cn } from '@renderer/lib/utils.ts'
import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'

/**
 * The box. It is a size container, so the grid inside can put the actions
 * beside the words once there is room, and under them when there is not.
 * A verdict is said by the dot before the heading, as `Status` says one;
 * the words stay ink. See docs/design/data.md.
 */
const alertVariants = cva('@container/alert relative w-full rounded-md border px-4 py-3 text-sm', {
  variants: {
    variant: {
      default: 'bg-card text-card-foreground',
      destructive: 'bg-card text-card-foreground',
      success: 'bg-card text-card-foreground',
      warning: 'bg-card text-card-foreground',
      /** A quiet note on the muted surface, for a remark that is not a verdict. */
      muted: 'border-transparent bg-muted text-card-foreground',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
})

/** Dot, words, actions. The dot column is there only for a verdict; the actions column only once an `AlertAction` takes it. */
const alertGrid = cva('grid items-start gap-y-0.5', {
  variants: {
    marked: {
      true: 'grid-cols-[--spacing(2)_1fr] gap-x-2.5 @xl/alert:grid-cols-[--spacing(2)_1fr_auto]',
      false: 'grid-cols-[0_1fr] @xl/alert:grid-cols-[0_1fr_auto]',
    },
  },
})

const VERDICTS = { destructive: 'destructive', success: 'success', warning: 'warning' } as const

function Alert({
  className,
  variant,
  children,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  const tone = variant && variant in VERDICTS ? VERDICTS[variant as keyof typeof VERDICTS] : null
  return (
    <div data-slot="alert" className={cn(alertVariants({ variant }), className)} {...props}>
      <div className={alertGrid({ marked: tone !== null })}>
        {tone ? (
          // On the heading's first line, whatever the heading wraps to.
          <span className="col-start-1 row-start-1 flex h-5 items-center">
            <Dot tone={tone} />
          </span>
        ) : null}
        {children}
      </div>
    </div>
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-title"
      className={cn('col-start-2 row-start-1 min-h-4 font-medium text-pretty', className)}
      {...props}
    />
  )
}

function AlertDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        'col-start-2 grid justify-items-start gap-1 text-sm text-muted-foreground [&_p]:leading-relaxed',
        className,
      )}
      {...props}
    />
  )
}

/**
 * What the reader can do about it: one button or two. Beside the words,
 * centred on them, when the alert is wide; under them when it is narrow.
 */
function AlertAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-action"
      className={cn(
        'col-start-2 mt-2.5 flex flex-wrap items-center gap-2 @xl/alert:col-start-3 @xl/alert:row-span-2 @xl/alert:row-start-1 @xl/alert:mt-0 @xl/alert:ml-6 @xl/alert:self-center @xl/alert:flex-nowrap',
        className,
      )}
      {...props}
    />
  )
}

export { Alert, AlertAction, AlertDescription, AlertTitle }
