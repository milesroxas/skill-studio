/**
 * The page grammar every screen is built from. There are three page types:
 *
 * - A scrolling page (`Screen`): tables, reading and settings forms, left
 *   aligned to the same edge as the top bar's first control.
 * - A workbench (`Workbench`): full-height columns that scroll on their own,
 *   for a list beside the item picked from it. Columns are divided by a
 *   hairline, never boxed.
 * - Form sections (`FormSection`): a heading and its note beside the fields,
 *   one section under the next with a rule between them.
 *
 * Regions are never cards. A card is kept for an object the reader handles,
 * such as one output. Each primitive carries its own spacing, so screens
 * compose these and never reach for a utility class.
 */
import { cva, type VariantProps } from 'class-variance-authority'
import { PlusIcon, RotateCwIcon } from 'lucide-react'
import { Toolbar as ToolbarPrimitive } from 'radix-ui'
import { type ComponentProps, type HTMLAttributes, type ReactNode, useState } from 'react'
import { cn } from '../lib/utils.ts'
import { Heading, Hint, Text } from './text.tsx'
import { Button } from './ui/button.tsx'

const screenVariants = cva('flex w-full flex-col gap-10', {
  variants: {
    width: {
      /** Tables and side-by-side reading. */
      wide: 'max-w-[1200px]',
      /** A form of sections, a heading column beside the fields. */
      form: 'max-w-[880px]',
    },
  },
  defaultVariants: { width: 'wide' },
})

/** A scrolling page. Every width starts at the same left edge, so screens never shift sideways. */
export function Screen({
  width,
  className,
  ...props
}: ComponentProps<'div'> & VariantProps<typeof screenVariants>) {
  return <div className={cn(screenVariants({ width }), className)} {...props} />
}

export function Section({ className, ...props }: ComponentProps<'section'>) {
  return <section className={cn('flex flex-col gap-3', className)} {...props} />
}

/** A heading with what sits beside it: a count, a hint, an action at the far end. */
export function SectionHead({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div className={cn('flex flex-wrap items-baseline gap-x-3 gap-y-1', className)} {...props} />
  )
}

/**
 * A rule above every section but the first. A section right after an `Alert`
 * takes none either: the alert's own edge already divides, and a rule under it
 * would read as a second one.
 */
const formSectionVariants = cva(
  'grid gap-x-10 gap-y-4 border-t pt-7 first:border-t-0 first:pt-0 [[data-slot=alert]+&]:border-t-0 [[data-slot=alert]+&]:pt-0',
  {
    variants: {
      layout: {
        /** The heading and its note in a 200px column, the fields beside it. */
        split: 'md:grid-cols-[200px_minmax(0,1fr)] md:items-baseline',
        /** The heading over the fields, for wide fields such as a prompt. */
        stacked: '',
      },
    },
    defaultVariants: { layout: 'split' },
  },
)

/** One part of a form: what it is about, then its fields. Sections are divided by a rule. */
export function FormSection({
  title,
  hint,
  action,
  layout,
  children,
  className,
  ...props
}: Omit<ComponentProps<'section'>, 'title'> &
  VariantProps<typeof formSectionVariants> & {
    title: ReactNode
    hint?: ReactNode
    /** A control beside the heading, such as an add button. */
    action?: ReactNode
  }) {
  return (
    <section className={cn(formSectionVariants({ layout }), className)} {...props}>
      <div className="flex flex-col gap-1">
        <div className="flex min-h-6 items-center gap-3">
          <Heading level={3}>{title}</Heading>
          {action ? <span className="ml-auto">{action}</span> : null}
        </div>
        {/* Beside the fields a note keeps to the narrow column; over them it takes the fields' width. */}
        {hint ? <Hint measure={layout === 'stacked' ? 'default' : 'narrow'}>{hint}</Hint> : null}
      </div>
      <div className="flex min-w-0 flex-col gap-5">{children}</div>
    </section>
  )
}

/** The actions at the end of a form, aligned with its fields: primary first. */
export function FormActions({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex flex-wrap items-center gap-3 border-t pt-6 md:pl-[240px]', className)}
      {...props}
    />
  )
}

const workbenchVariants = cva(
  'grid min-h-0 flex-1 grid-cols-1 lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden',
  {
    variants: {
      layout: {
        /** One column: a workbench screen with nothing to list yet. */
        single: '',
        /** A list to pick from on the left, the picked item beside it. */
        list: 'lg:grid-cols-[260px_minmax(0,1fr)]',
      },
    },
    defaultVariants: { layout: 'list' },
  },
)

/**
 * Full-height columns that each scroll on their own, for a `flush` pane. Below
 * the large breakpoint the columns stack and the pane scrolls instead.
 */
export function Workbench({
  layout,
  className,
  ...props
}: ComponentProps<'div'> & VariantProps<typeof workbenchVariants>) {
  return <div className={cn(workbenchVariants({ layout }), className)} {...props} />
}

const columnVariants = cva(
  'flex min-w-0 flex-col bg-background lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain',
  {
    variants: {
      kind: {
        list: 'border-b lg:border-r lg:border-b-0',
        /**
         * A list beside an item that is the screen's point, such as the Skill
         * screen's files and versions beside the document: on the left on a wide
         * window, after the item once the columns stack.
         */
        side: 'border-t max-lg:order-last lg:border-t-0 lg:border-r',
        main: '',
      },
      /** A picture is held over the column, and dropping it adds it to what the column edits. */
      over: {
        true: 'bg-accent/60',
        false: '',
      },
    },
    defaultVariants: { kind: 'main', over: false },
  },
)

/** One column of a workbench. */
export function Column({
  kind,
  over,
  className,
  ...props
}: ComponentProps<'div'> & VariantProps<typeof columnVariants>) {
  return <div className={cn(columnVariants({ kind, over }), className)} {...props} />
}

const insetVariants = cva('', {
  variants: {
    inset: {
      list: 'px-4',
      main: 'px-6',
    },
  },
  defaultVariants: { inset: 'main' },
})

/**
 * What a column header names, beside its actions: the title, then quieter
 * details. It takes the spare width and truncates, so the actions never wrap.
 */
export function ColumnTitle({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-1 items-baseline gap-x-3 overflow-hidden whitespace-nowrap *:min-w-0 *:truncate',
        className,
      )}
      {...props}
    />
  )
}

/** A list column's header: what the list holds, how many, and the button that adds one. */
export function ListHeader({
  title,
  count,
  addLabel,
  onAdd,
  addDisabled,
}: {
  title: string
  count: number
  addLabel: string
  onAdd: () => void
  addDisabled?: boolean
}) {
  return (
    <ColumnHeader inset="list">
      <Heading level={3} as="h2">
        {title}
      </Heading>
      <Text tone="muted" size="xs" tabular>
        {count}
      </Text>
      <Spacer />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={addLabel}
        title={addLabel}
        disabled={addDisabled}
        onClick={onAdd}
      >
        <PlusIcon aria-hidden="true" />
      </Button>
    </ColumnHeader>
  )
}

/**
 * A column's title row: what is open and its actions. It stays put while the
 * column scrolls. Under a finger its padding gives way to the taller controls,
 * so the row keeps its 48px and the toolbar below still meets it.
 */
export function ColumnHeader({
  inset,
  className,
  ...props
}: ComponentProps<'header'> & VariantProps<typeof insetVariants>) {
  return (
    <header
      className={cn(
        'sticky top-0 z-10 flex min-h-12 shrink-0 items-center gap-2 border-b bg-background py-2 pointer-coarse:py-0.5',
        insetVariants({ inset }),
        className,
      )}
      {...props}
    />
  )
}

/**
 * Tools that act on the column's body, such as formatting, in a row under the
 * header. It covers the header's rule, so the two read as one bar with one
 * rule under it, and from the large breakpoint it sticks just below the header
 * (48px). Once the columns stack it scrolls with the document: a short window
 * keeps the room for the text, and a header that wraps is taller than 48px. The bar is one Tab stop:
 * the arrow keys, Home and End move between its `ToolbarItem`s.
 *
 * Its tools are ghost icons, so it starts 8px left of the header's text and
 * the first icon lands on that text's edge. Its far end holds a button's box,
 * which stops where the header's last button does.
 */
export function ColumnToolbar({
  className,
  ...props
}: ComponentProps<typeof ToolbarPrimitive.Root>) {
  return (
    <ToolbarPrimitive.Root
      className={cn(
        'top-12 z-10 -mt-px flex shrink-0 flex-wrap lg:sticky items-center gap-x-3 gap-y-1 border-b bg-background py-1 pr-6 pl-4 pointer-coarse:gap-y-3',
        className,
      )}
      {...props}
    />
  )
}

/** One control of a `ColumnToolbar`, wrapped round its button. A disabled one is passed over. */
export function ToolbarItem(
  props: Omit<ComponentProps<typeof ToolbarPrimitive.Button>, 'asChild'>,
) {
  return <ToolbarPrimitive.Button asChild {...props} />
}

/** Tools that belong together, such as the three list styles. Under a finger they stand a hit area apart. */
export function ToolbarGroup({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div className={cn('flex items-center gap-0.5 pointer-coarse:gap-3', className)} {...props} />
  )
}

const columnBodyVariants = cva('flex flex-col', {
  variants: {
    inset: {
      /** Rows that reach the column edge, with their own padding. */
      list: 'gap-px px-2 py-2',
      main: 'gap-8 px-6 pt-6 pb-16',
      /** Content that fills the column edge to edge, such as an editor. */
      none: 'flex-1',
    },
    width: {
      full: '',
      /** A form: never wider than reads well. */
      form: 'max-w-[808px]',
    },
  },
  defaultVariants: { inset: 'main', width: 'full' },
})

export function ColumnBody({
  inset,
  width,
  className,
  ...props
}: ComponentProps<'div'> & VariantProps<typeof columnBodyVariants>) {
  return <div className={cn(columnBodyVariants({ inset, width }), className)} {...props} />
}

/** A titled part of a list column, divided from the next by a rule. */
export function ColumnSection({
  title,
  hint,
  action,
  inset,
  children,
}: VariantProps<typeof insetVariants> & {
  title?: ReactNode
  hint?: ReactNode
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section
      className={cn('flex flex-col gap-3 border-b py-5 last:border-b-0', insetVariants({ inset }))}
    >
      {title ? (
        <div className="flex flex-col gap-1">
          <div className="flex min-h-6 items-center gap-3">
            <Heading level={3}>{title}</Heading>
            {action ? <span className="ml-auto">{action}</span> : null}
          </div>
          {hint ? <Hint>{hint}</Hint> : null}
        </div>
      ) : null}
      {children}
    </section>
  )
}

/** Equal columns, one per item. */
const columnsVariants = cva('grid grid-cols-1 items-start gap-4', {
  variants: {
    count: {
      1: '',
      2: 'md:grid-cols-2',
    },
  },
  defaultVariants: { count: 1 },
})

export function Columns({
  count,
  className,
  ...props
}: ComponentProps<'div'> & VariantProps<typeof columnsVariants>) {
  return <div className={cn(columnsVariants({ count }), className)} {...props} />
}

const toolbarVariants = cva('flex items-center', {
  variants: {
    gap: {
      xs: 'gap-1',
      sm: 'gap-2',
      md: 'gap-3',
    },
    justify: {
      start: '',
      end: 'justify-end',
    },
    wrap: {
      true: 'flex-wrap',
      false: 'flex-nowrap',
    },
    /** Takes the width its row has to spare, and wraps inside it rather than push a neighbour down. */
    grow: {
      true: 'min-w-0 flex-1',
      false: '',
    },
    /**
     * In a row set on its first line, such as a table row: keeps a button's
     * text baseline even when the toolbar holds only an icon, which has none.
     */
    line: {
      true: 'strut before:text-sm',
      false: '',
    },
  },
  defaultVariants: { gap: 'sm', justify: 'start', wrap: true, grow: false, line: false },
})

/** Controls in a row: a toolbar, or the actions under a form. */
export function Toolbar({
  gap,
  justify,
  wrap,
  grow,
  line,
  className,
  ...props
}: ComponentProps<'div'> & VariantProps<typeof toolbarVariants>) {
  return (
    <div
      className={cn(toolbarVariants({ gap, justify, wrap, grow, line }), className)}
      {...props}
    />
  )
}

/**
 * The bar over a list: what narrows it on the left, what acts on it on the
 * right. The filters wrap among themselves when the pane is narrow, so the
 * actions keep the top right corner at every width.
 */
export function ListBar({
  filters,
  actions,
  className,
  ...props
}: Omit<ComponentProps<'div'>, 'children'> & { filters: ReactNode; actions: ReactNode }) {
  return (
    <div className={cn('flex items-start gap-x-6 gap-y-3', className)} {...props}>
      <Toolbar gap="md" grow>
        {filters}
      </Toolbar>
      <Toolbar wrap={false}>{actions}</Toolbar>
    </div>
  )
}

/**
 * Reads a list again from where it lives, such as the disk. The icon turns
 * once on each press, so a read too quick to see still answers the click.
 */
export function RefreshButton({ label, onRefresh }: { label: string; onRefresh: () => void }) {
  const [turn, setTurn] = useState(0)
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      onClick={() => {
        setTurn((t) => t + 1)
        onRefresh()
      }}
    >
      {/* A new key on each press, so a second press starts the turn over. */}
      <RotateCwIcon key={turn} aria-hidden="true" className={turn ? 'animate-turn' : undefined} />
    </Button>
  )
}

export function Spacer() {
  return <span className="flex-1" />
}

const stackVariants = cva('flex flex-col', {
  variants: {
    gap: {
      xs: 'gap-1',
      sm: 'gap-1.5',
      md: 'gap-2.5',
      lg: 'gap-5',
    },
  },
  defaultVariants: { gap: 'sm' },
})

export function Stack({
  gap,
  className,
  ...props
}: ComponentProps<'div'> & VariantProps<typeof stackVariants>) {
  return <div className={cn(stackVariants({ gap }), className)} {...props} />
}

/** A label, its control and a hint, stacked. */
export function Field({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-2', className)} {...props} />
}

/** A group of controls under one legend. */
export function Fieldset({
  legend,
  hint,
  children,
  className,
  ...props
}: ComponentProps<'fieldset'> & { legend: ReactNode; hint?: ReactNode }) {
  return (
    <fieldset className={cn('flex min-w-0 flex-col gap-2', className)} {...props}>
      <Heading level={3} as="legend">
        {legend}
      </Heading>
      {hint ? <Hint>{hint}</Hint> : null}
      {children}
    </fieldset>
  )
}

const emptyVariants = cva('flex flex-col items-center px-4 text-center', {
  variants: {
    size: {
      /**
       * The whole screen has nothing to show. It fills the pane and sits a little
       * above its middle, so it lands in the same place in a padded page and in a
       * flush workbench. Return it in place of the screen, never inside one.
       */
      screen: 'min-h-full flex-1 justify-center gap-2 pt-10 pb-[calc(2.5rem+8vh)]',
      /** A part of a screen, such as a column or a section, is empty. */
      default: 'gap-2 py-14',
      compact: 'gap-2 py-8',
    },
  },
  defaultVariants: { size: 'default' },
})

/**
 * Nothing here yet: say why, and offer the step that fills it. The step that
 * fills it is the default button; a second way out is outline.
 */
export function EmptyState({
  size,
  title,
  actions,
  more,
  children,
  className,
  ...props
}: ComponentProps<'div'> &
  VariantProps<typeof emptyVariants> & {
    title?: ReactNode
    actions?: ReactNode
    /** Anything under the actions, such as a list of what was already done. */
    more?: ReactNode
  }) {
  return (
    <div className={cn(emptyVariants({ size }), className)} {...props}>
      {title ? <Heading level={2}>{title}</Heading> : null}
      {children ? (
        <Text as="p" size="ui" tone="muted" className="max-w-[46ch] text-pretty">
          {children}
        </Text>
      ) : null}
      {actions ? <Toolbar className="mt-3 justify-center">{actions}</Toolbar> : null}
      {more ? <div className="mt-6 w-full max-w-sm text-left">{more}</div> : null}
    </div>
  )
}

/** A read that failed, in the place of what it would have shown, with a way to ask again. */
export function ReadFailed({
  size,
  title,
  onRetry,
  retrying = false,
  children,
}: Pick<VariantProps<typeof emptyVariants>, 'size'> & {
  title: string
  onRetry: () => void
  /** The retry is on its way: the button stays busy until it answers. */
  retrying?: boolean
  /** Why it failed. */
  children: ReactNode
}) {
  return (
    <EmptyState
      size={size}
      title={title}
      actions={
        <Button
          type="button"
          variant="outline"
          busy={retrying}
          busyLabel="Trying again…"
          onClick={onRetry}
        >
          Try again
        </Button>
      }
    >
      {children}
    </EmptyState>
  )
}

/**
 * Something is on its way. `screen` stands in for a whole screen, in the same
 * place as a screen-sized `EmptyState`; `inline` stands in for one part of it.
 */
export function Loading({ size = 'inline' }: { size?: 'screen' | 'inline' }) {
  return size === 'screen' ? (
    <EmptyState size="screen" role="status">
      Loading…
    </EmptyState>
  ) : (
    <Hint inset role="status">
      Loading…
    </Hint>
  )
}

/**
 * Records in a column, such as the steps of a transcript: divided by hairlines
 * and ruled above and below, never boxed. Each row brings its own padding.
 */
export function Rows({
  as: Comp = 'ol',
  className,
  ...props
}: HTMLAttributes<HTMLElement> & { as?: 'ol' | 'ul' | 'div' }) {
  return <Comp className={cn('m-0 flex flex-col divide-y border-y p-0', className)} {...props} />
}

const plainListVariants = cva('flex flex-col p-0', {
  variants: {
    gap: {
      none: 'gap-px',
      xs: 'gap-0.5',
      sm: 'gap-1',
      md: 'gap-1.5',
    },
    /** Rows whose hover reaches past the text, so the text lines up with the heading above. */
    bleed: {
      true: '-mx-2',
      false: '',
    },
  },
  defaultVariants: { gap: 'sm', bleed: false },
})

/** A list with no bullets, its items stacked. */
export function PlainList({
  gap,
  bleed,
  as: Comp = 'ul',
  className,
  ...props
}: HTMLAttributes<HTMLElement> & VariantProps<typeof plainListVariants> & { as?: 'ul' | 'ol' }) {
  return <Comp className={cn(plainListVariants({ gap, bleed }), className)} {...props} />
}

const listVariants = cva('list-outside', {
  variants: {
    variant: {
      bullet: 'list-disc pl-4.5',
      /** Rules and other counted items: "01" in mono, hanging in the margin. */
      number: 'list-[index] pl-6 marker:font-mono marker:text-muted-foreground',
    },
    size: {
      inherit: '',
      xs: 'text-xs',
    },
    font: {
      sans: '',
      mono: 'font-mono',
    },
    gap: {
      none: '',
      sm: 'flex flex-col gap-1.5',
    },
  },
  defaultVariants: { variant: 'bullet', size: 'inherit', font: 'sans', gap: 'none' },
})

/** A bulleted or numbered list of short items. */
export function List({
  variant,
  size,
  font,
  gap,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & VariantProps<typeof listVariants>) {
  const Comp = variant === 'number' ? 'ol' : 'ul'
  return <Comp className={cn(listVariants({ variant, size, font, gap }), className)} {...props} />
}
