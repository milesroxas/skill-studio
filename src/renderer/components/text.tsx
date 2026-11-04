/** Headings, hints and inline text roles, so screens name a role rather than a style. */
import { cva, type VariantProps } from 'class-variance-authority'
import type { AnchorHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import { cn } from '../lib/utils.ts'

const headingVariants = cva('m-0 font-semibold text-balance', {
  variants: {
    level: {
      /**
       * The screen's name in the top bar: set in the reading serif the outputs use,
       * the one place the tool's own chrome speaks in it.
       */
      page: 'font-serif text-[19px] leading-tight tracking-[-0.01em]',
      1: 'text-3xl leading-tight tracking-[-0.022em]',
      2: 'text-base tracking-[-0.012em]',
      3: 'text-[13px]',
    },
  },
  defaultVariants: { level: 2 },
})

/** `level` sets the size; `as` the element, which defaults to the matching h tag. */
export function Heading({
  level = 2,
  as,
  className,
  ...props
}: HTMLAttributes<HTMLElement> &
  VariantProps<typeof headingVariants> & {
    as?: 'h1' | 'h2' | 'h3' | 'span' | 'legend' | 'p'
    children: ReactNode
  }) {
  const Comp = as ?? (level === 'page' ? 'h1' : (`h${level ?? 2}` as 'h1' | 'h2' | 'h3'))
  return <Comp className={cn(headingVariants({ level }), className)} {...props} />
}

const hintVariants = cva('m-0 text-xs text-muted-foreground', {
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
  },
  defaultVariants: { tone: 'default', measure: 'default', inset: false },
})

/** Help under a control or a short explanation at the top of a section. */
export function Hint({
  tone,
  measure,
  inset,
  as: Comp = 'p',
  className,
  ...props
}: HTMLAttributes<HTMLElement> &
  VariantProps<typeof hintVariants> & {
    as?: 'p' | 'span' | 'label' | 'div'
    /** When rendered as a label, the control it names. */
    htmlFor?: string
  }) {
  return <Comp className={cn(hintVariants({ tone, measure, inset }), className)} {...props} />
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
      mono: 'font-mono text-[0.92em]',
    },
    size: {
      inherit: '',
      sm: 'text-[13px]',
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
    align: {
      start: '',
      end: 'text-right',
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
    align: 'start',
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
  align,
  wrap,
  as: Comp = 'span',
  className,
  ...props
}: HTMLAttributes<HTMLElement> &
  VariantProps<typeof textVariants> & { as?: 'span' | 'p' | 'b' | 'small' | 'div' | 'li' }) {
  return (
    <Comp
      className={cn(
        textVariants({ tone, font, size, weight, tabular, block, clamp, truncate, align, wrap }),
        className,
      )}
      {...props}
    />
  )
}

/** A monospace code span inside running text. */
export function Code({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <code className={cn('font-mono text-[0.92em]', className)} {...props} />
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
