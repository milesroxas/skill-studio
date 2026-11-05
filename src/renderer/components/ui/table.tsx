import { cn } from '@renderer/lib/utils.ts'
import { cva, type VariantProps } from 'class-variance-authority'
import { ChevronRightIcon } from 'lucide-react'
import type * as React from 'react'

const tableContainerVariants = cva('relative overflow-x-auto', {
  variants: {
    bleed: {
      /* A size container, so a row's note can ask for a share of the table's width. */
      true: '@container -mx-3',
      /*
       * 4px of slack on each side. A `cell` button in the first or last column
       * reaches 4px past the text edge, and without the slack that starts a scrollbar.
       */
      false: '-mx-1 px-1',
    },
  },
  defaultVariants: { bleed: false },
})

/** Cells are the dense step of the type scale (13px), a step under the page's body text. */
const tableVariants = cva('w-full caption-bottom text-ui', {
  variants: {
    /**
     * For a table whose rows fill: one that lights under the pointer, opens a
     * detail or marks a failure. The rows reach 12px past the text on each
     * side, so the text keeps the page's edge and never touches the edge of
     * its own fill. Needs 12px of room beside the table.
     */
    bleed: {
      true: '[&>*>tr>*:first-child]:pl-3 [&>*>tr>*:last-child]:pr-3',
      false: '',
    },
  },
  defaultVariants: { bleed: false },
})

function Table({
  className,
  bleed,
  ...props
}: React.ComponentProps<'table'> & VariantProps<typeof tableVariants>) {
  return (
    <div data-slot="table-container" className={tableContainerVariants({ bleed })}>
      <table data-slot="table" className={cn(tableVariants({ bleed }), className)} {...props} />
    </div>
  )
}

/* Child selectors, so a table inside a detail keeps its own rules. */
function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return <thead data-slot="table-header" className={cn('[&>tr]:border-b', className)} {...props} />
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return (
    <tbody
      data-slot="table-body"
      className={cn('[&>tr:last-child]:border-0', className)}
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
  'group border-b transition-[color,background-color,border-color,opacity] duration-150 ease-out has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted',
  {
    variants: {
      /** A row that opens something: it lights under the pointer. Plain rows stay still. */
      interactive: {
        true: 'hover:bg-muted/50',
        false: '',
      },
      align: {
        middle: '',
        /**
         * Rows where one cell runs to several lines: every cell's first line sits
         * on one baseline, whether it holds text, a chip or a button. Set on the
         * cells, since each cell names its own alignment.
         */
        baseline: '[&>td]:align-baseline',
      },
      /** A row the reader must notice: a sample that failed, a check that broke. */
      variant: {
        default: '',
        destructive: 'bg-destructive/10 dark:bg-destructive/20',
      },
      /**
       * A row on its way out, such as one just deleted: it fades while the step
       * runs, so it leaves rather than blinks out. Pair it with `inert`.
       */
      leaving: {
        true: 'opacity-0',
        false: '',
      },
    },
    defaultVariants: { variant: 'default', align: 'middle', interactive: false, leaving: false },
  },
)

function TableRow({
  className,
  variant,
  align,
  interactive,
  leaving,
  ...props
}: React.ComponentProps<'tr'> & VariantProps<typeof tableRowVariants>) {
  return (
    <tr
      data-slot="table-row"
      data-variant={variant}
      className={cn(
        tableRowVariants({ variant, align, interactive, leaving }),
        // A row that answers a click anywhere says so. An open row and its detail are one surface, with no rule between.
        props.onClick ? 'cursor-pointer' : '',
        'has-[[data-slot=table-row-toggle][aria-expanded=true]]:border-transparent',
        className,
      )}
      {...props}
    />
  )
}

/**
 * Opens and closes a row's detail: a chevron, the row's name, and a quieter
 * line under it. The chevron's box has air on its left, so it is pulled 4px
 * out to sit on the column's edge, and the line under starts where the name
 * does (16 - 4 + 8). Keyboard and screen readers use the button; a pointer can
 * also take the whole row, through `rowAction`.
 */
function TableRowToggle({
  open,
  meta,
  className,
  children,
  ...props
}: React.ComponentProps<'button'> & {
  open: boolean
  /** What tells this row from the next, such as when it was made. */
  meta?: React.ReactNode
}) {
  return (
    <>
      <button
        type="button"
        data-slot="table-row-toggle"
        aria-expanded={open}
        className={cn(
          // A block, not inline: an inline button would sit on a text line and add 4px of slop under it.
          'flex w-fit items-start gap-2 rounded-xs text-left font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
          className,
        )}
        {...props}
      >
        <ChevronRightIcon
          aria-hidden="true"
          className="mt-0.5 -ml-1 size-4 shrink-0 text-muted-foreground transition-[rotate,color] duration-150 ease-out-strong group-hover:text-foreground in-aria-expanded:rotate-90 in-aria-expanded:text-foreground"
        />
        {children}
      </button>
      {/*
       * As wide as its text, up to 48ch or 36% of the table: the column grows to hold a short
       * note on one line, and a long note or a narrow window wraps it rather than widen the table.
       */}
      {meta ? (
        <span className="block w-max max-w-[min(48ch,36cqw)] pl-5 text-xs text-pretty text-muted-foreground">
          {meta}
        </span>
      ) : null}
    </>
  )
}

/**
 * A click handler for an `interactive` row: a click anywhere on the row does
 * what its first control does, such as open its detail. Clicks on the row's
 * own controls keep their meaning, and so does a drag that selected text. The
 * control stays in the row, for the keyboard and for screen readers.
 */
function rowAction(action: () => void): React.MouseEventHandler<HTMLTableRowElement> {
  return (event) => {
    const target = event.target as HTMLElement
    if (target.closest('button, a, input, select, textarea, label')) return
    if (window.getSelection()?.isCollapsed === false) return
    action()
  }
}

/**
 * The detail opened under a row: one cell across the table, on the same sunken
 * surface as the row that opened it. Its table takes `bleed`, which insets the
 * cell to the text edge. The content settles in from the row it came from;
 * closing is instant, since the eye has already moved on.
 */
function TableDetail({
  colSpan,
  className,
  children,
  ...props
}: React.ComponentProps<'tr'> & { colSpan: number }) {
  return (
    <tr data-slot="table-detail" className={cn('border-b bg-muted/50', className)} {...props}>
      <td colSpan={colSpan} className="pt-2 pb-3 whitespace-normal">
        <div className="animate-in duration-200 ease-out-strong fade-in-0 slide-in-from-top-1">
          {children}
        </div>
      </td>
    </tr>
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
  rowAction,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableDetail,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
  TableRowToggle,
  tableCellVariants,
  tableRowVariants,
}
