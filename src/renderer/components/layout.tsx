/**
 * The page grammar every screen is built from: a screen of sections, a split
 * with an aside, toolbars, stacks and fields. Each carries its own spacing, so
 * screens compose these and never reach for a utility class.
 */
import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps, HTMLAttributes, ReactNode } from 'react'
import { cn } from '../lib/utils.ts'
import { Heading, Hint } from './text.tsx'
import { Card } from './ui/card.tsx'

const screenVariants = cva('flex flex-col gap-9', {
  variants: {
    width: {
      default: 'max-w-[1200px]',
      narrow: 'max-w-[880px]',
    },
  },
  defaultVariants: { width: 'default' },
})

export function Screen({
  width,
  className,
  ...props
}: ComponentProps<'div'> & VariantProps<typeof screenVariants>) {
  return <div className={cn(screenVariants({ width }), className)} {...props} />
}

export function Section({ className, ...props }: ComponentProps<'section'>) {
  return <section className={cn('flex flex-col gap-2.5', className)} {...props} />
}

/** A heading with what sits beside it: a count, a hint, an action at the far end. */
export function SectionHead({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-wrap items-baseline gap-3', className)} {...props} />
}

const splitVariants = cva('grid max-w-[1440px] grid-cols-1 items-start gap-5', {
  variants: {
    layout: {
      /** Content with a 320px aside. */
      aside: 'md:grid-cols-[minmax(0,1fr)_320px]',
      even: 'md:grid-cols-2',
      single: 'md:grid-cols-[minmax(0,720px)]',
      /** A form with a 300px list beside it. */
      form: 'lg:grid-cols-[minmax(0,720px)_300px]',
      /** An editor with a 300px aside. */
      editor: 'lg:grid-cols-[minmax(0,1fr)_300px]',
      /** 400px of controls with the result beside them. */
      controls: 'lg:grid-cols-[400px_minmax(0,1fr)]',
    },
  },
  defaultVariants: { layout: 'aside' },
})

export function Split({
  layout,
  className,
  ...props
}: ComponentProps<'div'> & VariantProps<typeof splitVariants>) {
  return <div className={cn(splitVariants({ layout }), className)} {...props} />
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

/** The actions under a form, with a rule above them. */
export function FormFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2 border-t pt-4', className)} {...props} />
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

const formGridVariants = cva('grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-2.5', {
  variants: {
    align: {
      center: 'items-center',
      start: 'items-start [&>:is(label,span):nth-child(odd)]:pt-[5px]',
    },
  },
  defaultVariants: { align: 'center' },
})

/** Labels in one column, controls in the next. */
export function FormGrid({
  align,
  className,
  ...props
}: ComponentProps<'div'> & VariantProps<typeof formGridVariants>) {
  return <div className={cn(formGridVariants({ align }), className)} {...props} />
}

const panelVariants = cva('px-4 py-4', {
  variants: {
    sticky: {
      true: 'md:sticky md:top-[104px]',
      false: '',
    },
    gap: {
      sm: 'gap-3',
      md: 'gap-4',
      lg: 'gap-5',
    },
    width: {
      auto: '',
      /** A form: never wider than reads well. */
      form: 'max-w-[720px]',
    },
  },
  defaultVariants: { sticky: false, gap: 'lg', width: 'auto' },
})

/** A card that holds controls or an aside, at the tool's own density. */
export function Panel({
  sticky,
  gap,
  width,
  className,
  ...props
}: ComponentProps<typeof Card> & VariantProps<typeof panelVariants>) {
  return <Card className={cn(panelVariants({ sticky, gap, width }), className)} {...props} />
}

const emptyVariants = cva('flex flex-col items-center gap-2 px-4 text-center', {
  variants: {
    size: {
      default: 'py-14',
      compact: 'py-8',
    },
  },
  defaultVariants: { size: 'default' },
})

/** Nothing here yet: say why, and offer the step that fills it. */
export function EmptyState({
  size,
  title,
  actions,
  children,
  className,
  ...props
}: ComponentProps<'div'> &
  VariantProps<typeof emptyVariants> & { title?: ReactNode; actions?: ReactNode }) {
  return (
    <div className={cn(emptyVariants({ size }), className)} {...props}>
      {title ? <Heading level={2}>{title}</Heading> : null}
      <Hint measure="narrow">{children}</Hint>
      {actions ? <Toolbar className="mt-2 justify-center">{actions}</Toolbar> : null}
    </div>
  )
}

const plainListVariants = cva('flex flex-col p-0', {
  variants: {
    gap: {
      xs: 'gap-0.5',
      sm: 'gap-1',
      md: 'gap-1.5',
    },
  },
  defaultVariants: { gap: 'sm' },
})

/** A list with no bullets, its items stacked. */
export function PlainList({
  gap,
  as: Comp = 'ul',
  className,
  ...props
}: HTMLAttributes<HTMLElement> & VariantProps<typeof plainListVariants> & { as?: 'ul' | 'ol' }) {
  return <Comp className={cn(plainListVariants({ gap }), className)} {...props} />
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
