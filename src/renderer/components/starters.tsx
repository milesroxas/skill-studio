/**
 * Starting points: templates over a blank file, examples over a blank case, a
 * folded guide beside a form. They sit on the page like any other section;
 * only an opened guide sinks onto the muted surface, so it reads as help.
 */
import { ChevronRightIcon } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../lib/utils.ts'
import { Disclosure } from './Disclosure.tsx'
import { Heading, Hint, Text } from './text.tsx'

export function Starter({
  title,
  hint,
  children,
  className,
  ...props
}: ComponentProps<'section'> & { title: ReactNode; hint: ReactNode }) {
  return (
    <section className={cn('flex flex-col gap-3', className)} {...props}>
      <div className="flex flex-col gap-1">
        <Heading level={3} as="span">
          {title}
        </Heading>
        <Hint as="span">{hint}</Hint>
      </div>
      {children}
    </section>
  )
}

export interface Example {
  key: string
  title: ReactNode
  sub?: ReactNode
  onPick: () => void
}

/** Finished examples to start from: one bordered list, a row per example. */
export function ExampleList({ items }: { items: Example[] }) {
  return (
    <ul className="flex flex-col divide-y overflow-hidden rounded-lg border p-0">
      {items.map((item) => (
        <li key={item.key}>
          <button
            type="button"
            className="group/example flex min-h-12 w-full items-center gap-3 px-3.5 py-2.5 text-left outline-none transition-colors duration-150 hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
            onClick={item.onPick}
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm font-medium">{item.title}</span>
              {item.sub ? (
                <Text tone="muted" size="xs">
                  {item.sub}
                </Text>
              ) : null}
            </span>
            <ChevronRightIcon
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground/60 group-hover/example:text-foreground"
            />
          </button>
        </li>
      ))}
    </ul>
  )
}

/** A folded guide: one line with a chevron, the advice on the muted surface when opened. */
export function GuideBox({
  summary,
  children,
  defaultOpen,
}: {
  summary: ReactNode
  children: ReactNode
  defaultOpen?: boolean
}) {
  return (
    <Disclosure summary={summary} defaultOpen={defaultOpen}>
      <div className="rounded-md bg-muted px-3.5 py-3 text-xs">{children}</div>
    </Disclosure>
  )
}

/** Numbered advice; a bold lead on each item. */
export function GuideList({ className, ...props }: ComponentProps<'ol'>) {
  return (
    <ol
      className={cn(
        'flex list-decimal flex-col gap-2 pl-4 text-xs text-muted-foreground [&_b]:font-semibold [&_b]:text-foreground',
        className,
      )}
      {...props}
    />
  )
}

export interface Pair {
  bad: string
  good: string
  why: string
}

/** Vague next to markable: what the judge cannot check, then what it can. */
export function PairList({ pairs }: { pairs: readonly Pair[] }) {
  return (
    <ul className="flex flex-col gap-3 p-0 text-xs">
      {pairs.map((pair) => (
        <li key={pair.good} className="flex flex-col gap-0.5">
          <span className="flex items-baseline gap-2 text-muted-foreground line-through decoration-input">
            <PairMark>vague</PairMark>
            {pair.bad}
          </span>
          <span className="flex items-baseline gap-2">
            <PairMark>check</PairMark>
            {pair.good}
          </span>
          <Hint as="span">{pair.why}</Hint>
        </li>
      ))}
    </ul>
  )
}

function PairMark({ children }: { children: ReactNode }) {
  return (
    <span className="w-10 shrink-0 font-mono text-[10.5px] leading-relaxed font-medium tracking-[0.04em] uppercase text-muted-foreground/70 no-underline">
      {children}
    </span>
  )
}
