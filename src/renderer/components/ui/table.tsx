import { cn } from '@renderer/lib/utils.ts'
import { cva, type VariantProps } from 'class-variance-authority'
import { ChevronRightIcon } from 'lucide-react'
import type * as React from 'react'

const tableContainerVariants = cva('relative overflow-x-auto', {
  variants: {
    bleed: {
      /* A size container, so a row's note can ask for a share of the table's width and a column can `fold` by it. */
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
    layout: {
      /** Each column as wide as its longest cell. */
      auto: '',
      /**
       * Columns hold the widths their head cells name with `col`, and the one
       * without a width takes the rest. For a list that is filtered or shown
       * twice on a page: the columns stay put as rows come and go, and two
       * tables with the same columns line up.
       */
      fixed: 'table-fixed',
    },
  },
  defaultVariants: { bleed: false, layout: 'auto' },
})

function Table({
  className,
  bleed,
  layout,
  ...props
}: React.ComponentProps<'table'> & VariantProps<typeof tableVariants>) {
  return (
    <div data-slot="table-container" className={tableContainerVariants({ bleed })}>
      <table
        data-slot="table"
        className={cn(tableVariants({ bleed, layout }), className)}
        {...props}
      />
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

const tableRowVariants = cva(
  'group held border-b transition-[color,background-color,border-color,opacity,translate] duration-150 ease-out has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted',
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
       * A row moving to another list: `leaving` fades and drops 4px while the
       * change is saved, and comes back if it fails, since it is a transition;
       * `arrived` writes itself in where it lands. Never on a list's first draw.
       */
      motion: {
        none: '',
        leaving: 'pointer-events-none translate-y-1 opacity-0 ease-in',
        arrived: 'animate-ink',
      },
    },
    defaultVariants: { variant: 'default', align: 'middle', interactive: false, motion: 'none' },
  },
)

function TableRow({
  className,
  variant,
  align,
  interactive,
  motion,
  ...props
}: React.ComponentProps<'tr'> & VariantProps<typeof tableRowVariants>) {
  return (
    <tr
      data-slot="table-row"
      data-variant={variant}
      className={cn(
        tableRowVariants({ variant, align, interactive, motion }),
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
          'flex w-fit items-start gap-2 rounded-xs text-left font-medium focus-ring',
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
    // A click in a menu the row opened reaches the row through React, though the menu is elsewhere on the page.
    if (!event.currentTarget.contains(target)) return
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
    /** A number. `TableCell` also sets it in mono; the head stays a word in sans. */
    numeric: {
      true: 'w-px text-right tabular-nums whitespace-nowrap',
      false: '',
    },
    /**
     * Not a number, but at the row's end: actions, a date, a short note.
     * Right-aligned and as narrow as it can be, in the row's own type.
     */
    trailing: {
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
    /** An empty last column that takes the spare width, so the others sit together on the left. */
    filler: {
      true: 'w-full p-0',
      false: '',
    },
    /**
     * The column's width in a `fixed` table, padding included. Set it on the
     * head cell; the body follows. After `numeric`, so it replaces that one's width.
     */
    col: {
      auto: '',
      /** A date. */
      xs: 'w-24',
      /** One short action. */
      sm: 'w-26',
      /** A count or two. */
      md: 'w-32',
      /** A name of a few words. */
      lg: 'w-40',
      /** A row of small controls. */
      xl: 'w-68',
    },
    /**
     * A column the row reads fine without, folded away when the table itself
     * is narrow: the pane's width decides, not the window's, so it holds with
     * the assistant open. `last` goes first and `first` holds out longest.
     * Needs a `bleed` table, which is the size container.
     */
    fold: {
      never: '',
      last: '@max-5xl:hidden',
      second: '@max-[50rem]:hidden',
      first: '@max-2xl:hidden',
      /** Stays, one icon wide, where `first` goes: its row's actions fold into a menu (`RowActions`). */
      menu: '@max-2xl:w-12',
    },
  },
  defaultVariants: {
    numeric: false,
    trailing: false,
    wrap: false,
    wide: false,
    filler: false,
    col: 'auto',
    fold: 'never',
  },
})

function TableHead({
  className,
  numeric,
  trailing,
  wrap,
  wide,
  filler,
  col,
  fold,
  ...props
}: React.ComponentProps<'th'> & VariantProps<typeof tableCellVariants>) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        'h-10 px-2 text-left align-middle text-xs font-medium whitespace-nowrap text-muted-foreground first:pl-0 last:pr-0 [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
        tableCellVariants({ numeric, trailing, wrap, wide, filler, col, fold }),
        className,
      )}
      {...props}
    />
  )
}

function TableCell({
  className,
  numeric,
  trailing,
  wrap,
  wide,
  filler,
  col,
  fold,
  ...props
}: React.ComponentProps<'td'> & VariantProps<typeof tableCellVariants>) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        'p-2 align-middle whitespace-nowrap first:pl-0 last:pr-0 [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
        tableCellVariants({ numeric, trailing, wrap, wide, filler, col, fold }),
        // A measurement is set in mono; its head stays a word in sans.
        numeric && 'font-mono text-code',
        className,
      )}
      {...props}
    />
  )
}

export {
  rowAction,
  Table,
  TableBody,
  TableCell,
  TableDetail,
  TableHead,
  TableHeader,
  TableRow,
  TableRowToggle,
  tableCellVariants,
  tableRowVariants,
}
