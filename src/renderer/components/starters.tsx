/**
 * Starting points: a template strip over a blank file, examples over a blank
 * case, a folded guide beside a form. Sunken on the muted surface so they read
 * as help, not content.
 */
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../lib/utils.ts'
import { Heading, Hint, Text } from './text.tsx'
import { Button } from './ui/button.tsx'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible.tsx'

export function Starter({
  title,
  hint,
  children,
  className,
  ...props
}: ComponentProps<'section'> & { title: ReactNode; hint: ReactNode }) {
  return (
    <section
      className={cn('flex flex-col gap-3 rounded-lg bg-muted px-4 py-3.5', className)}
      {...props}
    >
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

/** Finished examples to start from, as cards in a grid. */
export function ExampleList({ items }: { items: Example[] }) {
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2 p-0">
      {items.map((item) => (
        <li key={item.key}>
          <Button
            type="button"
            variant="outline"
            className="h-auto min-h-14 w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left whitespace-normal"
            onClick={item.onPick}
          >
            <span>{item.title}</span>
            {item.sub ? (
              <Text tone="muted" size="xs" weight="normal">
                {item.sub}
              </Text>
            ) : null}
          </Button>
        </li>
      ))}
    </ul>
  )
}

/** A folded guide: one line closed, the advice when opened. */
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
    <Collapsible defaultOpen={defaultOpen} className="rounded-md bg-muted px-3 py-2 text-xs">
      <CollapsibleTrigger className="cursor-pointer font-medium text-muted-foreground hover:text-foreground data-[state=open]:text-foreground">
        {summary}
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2.5">{children}</CollapsibleContent>
    </Collapsible>
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
