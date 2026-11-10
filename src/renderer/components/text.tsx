/** Headings, hints and inline text roles, so screens name a role rather than a style. */
import { cva, type VariantProps } from 'class-variance-authority'
import type { AnchorHTMLAttributes, ComponentProps, HTMLAttributes, ReactNode } from 'react'
import { cn } from '../lib/utils.ts'

const headingVariants = cva('m-0 font-semibold text-balance', {
  variants: {
    level: {
      /** The screen's name in the top bar: the reading size, set firm. */
      page: 'text-md leading-tight',
      /** The welcome's headline, and nowhere else. */
      display: 'text-display',
      /** A welcome step's title, beside its numeral: the welcome only. */
      step: 'text-2xl',
      /** A screen's sections and its empty states. */
      2: 'text-base',
      /** A group of fields or a part of a column: a step above the labels inside it. */
      3: 'text-sm',
    },
    /** A heading that is a number, such as a version: digits keep one width down a list. */
    tabular: {
      true: 'tabular-nums',
      false: '',
    },
  },
  defaultVariants: { level: 2, tabular: false },
})

/** `level` sets the size; `as` the element, which defaults to the matching h tag. */
export function Heading({
  level = 2,
  tabular,
  as,
  className,
  ...props
}: HTMLAttributes<HTMLElement> &
  VariantProps<typeof headingVariants> & {
    as?: 'h1' | 'h2' | 'h3' | 'span' | 'legend' | 'p'
    children: ReactNode
  }) {
  const Comp =
    as ??
    (level === 'page' || level === 'display'
      ? 'h1'
      : level === 'step'
        ? 'h2'
        : (`h${level ?? 2}` as 'h2' | 'h3'))
  return <Comp className={cn(headingVariants({ level, tabular }), className)} {...props} />
}

const hintVariants = cva('m-0 text-xs text-pretty text-muted-foreground', {
  variants: {
    tone: {
      default: '',
      destructive: 'text-destructive',
    },
    measure: {
      default: 'max-w-[72ch]',
      narrow: 'max-w-[48ch]',
      none: '',
    },
    inset: {
      true: 'p-4',
      false: '',
    },
    /** A count that changes: digits keep their width as it updates. */
    tabular: {
      true: 'tabular-nums',
      false: '',
    },
  },
  defaultVariants: { tone: 'default', measure: 'default', inset: false, tabular: false },
})

/** Help under a control or a short explanation at the top of a section. */
export function Hint({
  tone,
  measure,
  inset,
  tabular,
  as: Comp = 'p',
  className,
  ...props
}: HTMLAttributes<HTMLElement> &
  VariantProps<typeof hintVariants> & {
    as?: 'p' | 'span' | 'div'
  }) {
  return (
    <Comp className={cn(hintVariants({ tone, measure, inset, tabular }), className)} {...props} />
  )
}

const textVariants = cva('', {
  variants: {
    tone: {
      default: '',
      muted: 'text-muted-foreground',
      faint: 'text-muted-foreground/70',
      destructive: 'text-destructive',
      success: 'text-success',
      warning: 'text-warning',
    },
    font: {
      sans: '',
      mono: 'font-mono text-code',
    },
    size: {
      inherit: '',
      ui: 'text-ui',
      xs: 'text-xs',
    },
    weight: {
      normal: '',
      medium: 'font-medium',
      semibold: 'font-semibold',
    },
    tabular: {
      true: 'tabular-nums',
      false: '',
    },
    block: {
      true: 'block',
      false: '',
    },
    /** At most two lines, then an ellipsis. */
    clamp: {
      true: 'line-clamp-2 max-w-[64ch]',
      false: '',
    },
    truncate: {
      true: 'overflow-hidden text-ellipsis whitespace-nowrap',
      false: '',
    },
    /** Wrapping text in a wide place, such as a table's spare column: held to a readable line. */
    measure: {
      true: 'max-w-[64ch] text-pretty',
      false: '',
    },
    align: {
      start: '',
      end: 'text-right',
    },
    /** A label over a group that is not a heading, such as a figure's. Keep it short. */
    caps: {
      true: 'text-2xs font-medium uppercase tracking-caps',
      false: '',
    },
    wrap: {
      normal: '',
      /** Keeps the line breaks of the source text. */
      pre: 'whitespace-pre-wrap',
      /** Breaks anywhere, for a path with no spaces. */
      anywhere: 'break-all',
    },
  },
  defaultVariants: {
    tone: 'default',
    font: 'sans',
    size: 'inherit',
    weight: 'normal',
    tabular: false,
    block: false,
    clamp: false,
    truncate: false,
    measure: false,
    align: 'start',
    caps: false,
    wrap: 'normal',
  },
})

/** A run of text with a role: muted, mono, small, tabular. */
export function Text({
  tone,
  font,
  size,
  weight,
  tabular,
  block,
  clamp,
  truncate,
  measure,
  align,
  caps,
  wrap,
  as: Comp = 'span',
  className,
  ...props
}: HTMLAttributes<HTMLElement> &
  VariantProps<typeof textVariants> & { as?: 'span' | 'p' | 'b' | 'small' | 'div' | 'li' }) {
  return (
    <Comp
      className={cn(
        textVariants({
          tone,
          font,
          size,
          weight,
          tabular,
          block,
          clamp,
          truncate,
          measure,
          align,
          caps,
          wrap,
        }),
        className,
      )}
      {...props}
    />
  )
}

const excerptVariants = cva('m-0 bg-muted px-3 py-2.5 text-ui', {
  variants: {
    /**
     * `inset`: a panel inside a section or a popout, its corners a container's.
     * `bleed`: across a side panel's full width, between hairlines.
     */
    edge: { inset: 'rounded-chin', bleed: 'border-y' },
    /**
     * `text`: a passage, its line breaks kept. `writing`: a rewrite as it is
     * written, held to 18rem and scrolled, holding whatever shows it (a diff,
     * a paragraph, a line saying where it stands).
     */
    holds: {
      text: 'whitespace-pre-wrap break-words',
      writing: 'max-h-72 overflow-y-auto overscroll-contain',
    },
  },
  defaultVariants: { edge: 'inset', holds: 'text' },
})

/**
 * A passage of the skill's own text set apart, on the muted panel: the
 * selection a tool works on, or the rewrite it writes. A passage is a
 * paragraph; a rewrite being written is a block, so its diff can sit inside.
 */
export function Excerpt({
  className,
  edge,
  holds,
  ...props
}: ComponentProps<'div'> & VariantProps<typeof excerptVariants>) {
  const Tag = holds === 'writing' ? 'div' : 'p'
  return <Tag className={cn(excerptVariants({ edge, holds }), className)} {...props} />
}

/** A monospace code span inside running text. */
export function Code({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <code className={cn('font-mono text-code', className)} {...props} />
}

/** Text for assistive technology only. */
export function VisuallyHidden({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('sr-only', className)} {...props} />
}

/** An outside link in running text: a hairline underline that darkens on hover. */
export function Link({ className, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      target="_blank"
      rel="noreferrer"
      className={cn(
        'underline decoration-input underline-offset-3 transition-colors hover:decoration-current',
        className,
      )}
      {...props}
    />
  )
}
