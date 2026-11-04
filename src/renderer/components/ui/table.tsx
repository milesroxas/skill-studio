import { cn } from '@renderer/lib/utils.ts'
import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'

function Table({ className, ...props }: React.ComponentProps<'table'>) {
  return (
    <div data-slot="table-container" className="relative w-full overflow-x-auto">
      <table
        data-slot="table"
        className={cn('w-full caption-bottom text-sm', className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return <thead data-slot="table-header" className={cn('[&_tr]:border-b', className)} {...props} />
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return (
    <tbody
      data-slot="table-body"
      className={cn('[&_tr:last-child]:border-0', className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn('border-t bg-muted/50 font-medium [&>tr]:last:border-b-0', className)}
      {...props}
    />
  )
}

const tableRowVariants = cva(
  'group border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted',
  {
    variants: {
      align: {
        middle: '',
        /** Rows whose first cell wraps to two lines. */
        top: 'align-top',
      },
      /** A row the reader must notice: a sample that failed, a check that broke. */
      variant: {
        default: '',
        destructive: 'bg-destructive/10 hover:bg-destructive/15 dark:bg-destructive/20',
      },
    },
    defaultVariants: { variant: 'default', align: 'middle' },
  },
)

function TableRow({
  className,
  variant,
  align,
  ...props
}: React.ComponentProps<'tr'> & VariantProps<typeof tableRowVariants>) {
  return (
    <tr
      data-slot="table-row"
      data-variant={variant}
      className={cn(tableRowVariants({ variant, align }), className)}
      {...props}
    />
  )
}

/** Numbers sit right and tabular, in a column no wider than they need. */
const tableCellVariants = cva('', {
  variants: {
    numeric: {
      true: 'w-px text-right tabular-nums whitespace-nowrap',
      false: '',
    },
    /** Long text that may wrap, such as a description or a flag list. */
    wrap: {
      true: 'whitespace-normal',
      false: '',
    },
    /** The column the row is about: never squeezed below a readable width. */
    wide: {
      true: 'min-w-[260px]',
      false: '',
    },
  },
  defaultVariants: { numeric: false, wrap: false, wide: false },
})

function TableHead({
  className,
  numeric,
  wrap,
  wide,
  ...props
}: React.ComponentProps<'th'> & VariantProps<typeof tableCellVariants>) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        'h-10 px-2 text-left align-middle text-xs font-medium whitespace-nowrap text-muted-foreground first:pl-0 last:pr-0 [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
        tableCellVariants({ numeric, wrap, wide }),
        className,
      )}
      {...props}
    />
  )
}

function TableCell({
  className,
  numeric,
  wrap,
  wide,
  ...props
}: React.ComponentProps<'td'> & VariantProps<typeof tableCellVariants>) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        'p-2 align-middle whitespace-nowrap first:pl-0 last:pr-0 [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
        tableCellVariants({ numeric, wrap, wide }),
        className,
      )}
      {...props}
    />
  )
}

function TableCaption({ className, ...props }: React.ComponentProps<'caption'>) {
  return (
    <caption
      data-slot="table-caption"
      className={cn('mt-4 text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

export {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
  tableCellVariants,
  tableRowVariants,
}
