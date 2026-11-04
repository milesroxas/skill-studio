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
  'group border-b transition-colors has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted',
  {
    variants: {
      /** A row that opens something: it lights under the pointer. Plain rows stay still. */
      interactive: {
        true: 'hover:bg-muted/50',
        false: '',
      },
      align: {
        middle: '',
        /** Rows whose first cell wraps to two lines. */
        top: 'align-top',
      },
      /** A row the reader must notice: a sample that failed, a check that broke. */
      variant: {
        default: '',
        destructive: 'bg-destructive/10 dark:bg-destructive/20',
        /** The detail opened under a row: one cell across the table, padded, on the sunken surface. */
        detail: 'bg-muted/40 [&>td]:px-4 [&>td]:py-4 [&>td]:whitespace-normal',
      },
    },
    defaultVariants: { variant: 'default', align: 'middle', interactive: false },
  },
)

function TableRow({
  className,
  variant,
  align,
  interactive,
  ...props
}: React.ComponentProps<'tr'> & VariantProps<typeof tableRowVariants>) {
  return (
    <tr
      data-slot="table-row"
      data-variant={variant}
      className={cn(tableRowVariants({ variant, align, interactive }), className)}
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
      true: 'min-w-[160px] lg:min-w-[260px]',
      false: '',
    },
    /** A column the row reads fine without: hidden when the window is narrow, so the table fits. */
    optional: {
      true: 'max-lg:hidden',
      false: '',
    },
    /** An empty last column that takes the spare width, so the others sit together on the left. */
    filler: {
      true: 'w-full p-0',
      false: '',
    },
  },
  defaultVariants: { numeric: false, wrap: false, wide: false, optional: false, filler: false },
})

function TableHead({
  className,
  numeric,
  wrap,
  wide,
  optional,
  filler,
  ...props
}: React.ComponentProps<'th'> & VariantProps<typeof tableCellVariants>) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        'h-10 px-2 text-left align-middle text-xs font-medium whitespace-nowrap text-muted-foreground first:pl-0 last:pr-0 [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
        tableCellVariants({ numeric, wrap, wide, optional, filler }),
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
  optional,
  filler,
  ...props
}: React.ComponentProps<'td'> & VariantProps<typeof tableCellVariants>) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        'p-2 align-middle whitespace-nowrap first:pl-0 last:pr-0 [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
        tableCellVariants({ numeric, wrap, wide, optional, filler }),
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
