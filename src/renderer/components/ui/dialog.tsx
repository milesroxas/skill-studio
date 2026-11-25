import { cn } from '@renderer/lib/utils.ts'
import { cva, type VariantProps } from 'class-variance-authority'
import { Dialog as DialogPrimitive } from 'radix-ui'
import type * as React from 'react'

/**
 * A dialog that stops the page to show something, not to ask: the keyboard
 * shortcuts. A question before an action is `AlertDialog`. The two share one
 * sheet: the page's ground over the scrim, a container's corners and the
 * popover's depth, scaling in from 97% in 200ms and out faster.
 */
function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

/** As wide as two columns of short rows, side by side from `sm`. */
const DIALOG_SHEET =
  'fixed top-[50%] left-[50%] z-50 flex max-h-[calc(100dvh-4rem)] w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] flex-col rounded-md bg-background shadow-popover outline-none transition-none duration-200 ease-out-strong sm:max-w-2xl data-[state=closed]:duration-150 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-[0.97] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.97]'

function DialogContent({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-scrim transition-none duration-200 ease-out-strong data-[state=closed]:duration-150 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(DIALOG_SHEET, className)}
        {...props}
      />
    </DialogPrimitive.Portal>
  )
}

/** The dialog's head, body and foot: the body scrolls, the head and foot hold still, divided by hairlines. */
const dialogPartVariants = cva('flex px-6', {
  variants: {
    part: {
      head: 'flex-col gap-1.5 border-b pt-6 pb-4',
      body: 'min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain py-5',
      foot: 'flex-col-reverse gap-2 border-t py-4 sm:flex-row sm:items-center sm:justify-end',
    },
  },
})

function DialogPart({
  className,
  part,
  ...props
}: React.ComponentProps<'div'> & Required<VariantProps<typeof dialogPartVariants>>) {
  return <div className={cn(dialogPartVariants({ part }), className)} {...props} />
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('m-0 text-lg font-semibold text-balance', className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('m-0 text-sm text-pretty text-muted-foreground', className)}
      {...props}
    />
  )
}

export { Dialog, DialogClose, DialogContent, DialogDescription, DialogPart, DialogTitle }
