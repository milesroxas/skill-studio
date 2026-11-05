/**
 * The page grammar every screen is built from. There are three page types:
 *
 * - A scrolling page (`Screen`): tables, reading and settings forms, left
 *   aligned to the same edge as the top bar's first control.
 * - A workbench (`Workbench`): full-height columns that scroll on their own,
 *   for a list beside its detail or a result beside its controls. Columns are
 *   divided by a hairline, never boxed.
 * - Form sections (`FormSection`): a heading and its note beside the fields,
 *   one section under the next with a rule between them.
 *
 * Regions are never cards. A card is kept for an object the reader handles,
 * such as one output. Each primitive carries its own spacing, so screens
 * compose these and never reach for a utility class.
 */
import { cva, type VariantProps } from 'class-variance-authority'
import { PlusIcon } from 'lucide-react'
import type { ComponentProps, HTMLAttributes, ReactNode } from 'react'
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
      /** One column of prose and small tables. */
      reading: 'max-w-[760px]',
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

const sectionVariants = cva('flex flex-col gap-3', {
  variants: {
    /** Scrolled to from a link: lands with room above it rather than flush under the pane's edge. */
    anchor: { true: 'scroll-mt-6', false: '' },
  },
  defaultVariants: { anchor: false },
})

export function Section({
  anchor,
  className,
  ...props
}: ComponentProps<'section'> & VariantProps<typeof sectionVariants>) {
  return <section className={cn(sectionVariants({ anchor }), className)} {...props} />
}

/** A heading with what sits beside it: a count, a hint, an action at the far end. */
export function SectionHead({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div className={cn('flex flex-wrap items-baseline gap-x-3 gap-y-1', className)} {...props} />
  )
}

const formSectionVariants = cva('grid gap-x-10 gap-y-4 border-t pt-7 first:border-t-0 first:pt-0', {
  variants: {
    layout: {
      /** The heading and its note in a 200px column, the fields beside it. */
      split: 'md:grid-cols-[200px_minmax(0,1fr)] md:items-baseline',
      /** The heading over the fields, for wide fields such as a prompt. */
      stacked: '',
    },
  },
  defaultVariants: { layout: 'split' },
})

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
        {hint ? <Hint measure="narrow">{hint}</Hint> : null}
      </div>
      <div className="flex min-w-0 flex-col gap-5">{children}</div>
    </section>
  )
}

const formActionsVariants = cva('flex flex-wrap items-center gap-3 border-t pt-6 md:pl-[240px]', {
  variants: {
    /**
     * Kept in view at the foot of the pane while the form scrolls, for a form
     * whose one action would otherwise wait below the fold. The offset and
     * padding cover the pane's own padding, as `ActionBar` does.
     */
    pinned: {
      true: 'sticky -bottom-6 z-10 -mb-6 bg-background pb-6',
      false: '',
    },
  },
  defaultVariants: { pinned: false },
})

/** The actions at the end of a form, aligned with its fields. */
export function FormActions({
  pinned,
  className,
  ...props
}: ComponentProps<'div'> & VariantProps<typeof formActionsVariants>) {
  return <div className={cn(formActionsVariants({ pinned }), className)} {...props} />
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
        /** The work in front, its controls in an inspector on the right. */
        inspector: 'lg:grid-cols-[minmax(0,1fr)_340px]',
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
        main: '',
        inspector: 'border-t lg:border-t-0 lg:border-l',
      },
    },
    defaultVariants: { kind: 'main' },
  },
)

/** One column of a workbench. */
export function Column({
  kind,
  className,
  ...props
}: ComponentProps<'div'> & VariantProps<typeof columnVariants>) {
  return <div className={cn(columnVariants({ kind }), className)} {...props} />
}

const insetVariants = cva('', {
  variants: {
    inset: {
      list: 'px-4',
      main: 'px-6',
      inspector: 'px-5',
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

/** A column's title row: what is open and its actions. It stays put while the column scrolls. */
export function ColumnHeader({
  inset,
  className,
  ...props
}: ComponentProps<'header'> & VariantProps<typeof insetVariants>) {
  return (
    <header
      className={cn(
        'sticky top-0 z-10 flex min-h-12 shrink-0 items-center gap-2 border-b bg-background py-2',
        insetVariants({ inset }),
        className,
      )}
      {...props}
    />
  )
}

/**
 * Tools that act on the column's body, such as formatting, in a row under the
 * header. It sticks just below the header (48px) and covers the header's rule,
 * so the two read as one bar with one rule under it.
 */
export function ColumnToolbar({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      role="toolbar"
      className={cn(
        'sticky top-12 z-10 -mt-px flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b bg-background px-4 py-1',
        className,
      )}
      {...props}
    />
  )
}

const columnBodyVariants = cva('flex flex-col', {
  variants: {
    inset: {
      /** Rows that reach the column edge, with their own padding. */
      list: 'gap-px px-2 py-2',
      main: 'gap-8 px-6 pt-6 pb-16',
      inspector: 'gap-6 px-5 py-5',
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

/** A titled part of an inspector or list column, divided from the next by a rule. */
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

/** The actions of a column, held to its foot while it scrolls. */
export function ColumnFooter({
  inset,
  className,
  ...props
}: ComponentProps<'footer'> & VariantProps<typeof insetVariants>) {
  return (
    <footer
      className={cn(
        'sticky bottom-0 z-10 mt-auto flex flex-wrap items-center gap-2 border-t bg-background py-3',
        insetVariants({ inset }),
        className,
      )}
      {...props}
    />
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
  },
  defaultVariants: { gap: 'sm', justify: 'start', wrap: true },
})

/** Controls in a row: a toolbar, or the actions under a form. */
export function Toolbar({
  gap,
  justify,
  wrap,
  className,
  ...props
}: ComponentProps<'div'> & VariantProps<typeof toolbarVariants>) {
  return <div className={cn(toolbarVariants({ gap, justify, wrap }), className)} {...props} />
}

/**
 * Actions kept in view at the foot of a scrolling page. The negative offset and
 * matching padding cover the pane's own padding, so nothing scrolls by below it.
 */
export function ActionBar({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'sticky -bottom-6 z-10 -mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 border-t bg-background pt-3 pb-6',
        className,
      )}
      {...props}
    />
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
    align: {
      stretch: '',
      /** Items take their own width, such as a column of links. */
      start: 'items-start',
    },
  },
  defaultVariants: { gap: 'sm', align: 'stretch' },
})

export function Stack({
  gap,
  align,
  className,
  ...props
}: ComponentProps<'div'> & VariantProps<typeof stackVariants>) {
  return <div className={cn(stackVariants({ gap, align }), className)} {...props} />
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
      number: 'list-decimal pl-5',
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
