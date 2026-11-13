/**
 * Starting points: templates over a blank file, examples over a blank case, a
 * folded guide beside a form. They sit on the page like any other section;
 * only an opened guide sinks onto the muted surface, so it reads as help.
 */
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../lib/utils.ts'
import { Disclosure } from './Disclosure.tsx'
import { Rows } from './layout.tsx'
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

/**
 * An offer at the top of a screen, for someone who has not started yet: what it
 * is, what it asks of them, and the one button that takes it. It sits on the
 * muted surface, as help does, and goes once it is taken.
 */
export function Invitation({
  title,
  action,
  children,
  className,
  ...props
}: Omit<ComponentProps<'section'>, 'title'> & { title: ReactNode; action: ReactNode }) {
  return (
    <section
      className={cn(
        'flex flex-wrap items-center gap-x-8 gap-y-3 rounded-md bg-muted px-5 py-4',
        className,
      )}
      {...props}
    >
      <div className="flex min-w-0 flex-1 basis-80 flex-col gap-1">
        <Heading level={2}>{title}</Heading>
        <Text as="p" size="ui" tone="muted" className="max-w-[68ch] text-pretty">
          {children}
        </Text>
      </div>
      {action}
    </section>
  )
}

export interface Example {
  key: string
  title: ReactNode
  sub?: ReactNode
  onPick: () => void
}

/**
 * Finished examples to start from: a row per example, divided by hairlines.
 * Picking one fills the form in place, so the row ends in "Use", not in a
 * chevron that would promise another page.
 */
export function ExampleList({ items }: { items: Example[] }) {
  return (
    <Rows as="ul">
      {items.map((item) => (
        <li key={item.key}>
          <button
            type="button"
            className="group/example flex min-h-12 w-full items-center gap-3 py-2.5 text-left focus-ring-inset"
            onClick={item.onPick}
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <Text weight="medium">{item.title}</Text>
              {item.sub ? (
                <Text tone="muted" size="xs">
                  {item.sub}
                </Text>
              ) : null}
            </span>
            <span
              aria-hidden="true"
              className="shrink-0 text-ui text-muted-foreground transition-colors duration-150 ease-out group-hover/example:text-foreground group-focus-visible/example:not-in-data-[input=pointer]:text-foreground"
            >
              Use
            </span>
          </button>
        </li>
      ))}
    </Rows>
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

/**
 * Vague next to markable: what cannot be checked, then what can. `marks` names
 * the two lines, five letters at most so they fit the tag column.
 */
export function PairList({
  pairs,
  marks = ['vague', 'check'],
}: {
  pairs: readonly Pair[]
  marks?: readonly [string, string]
}) {
  return (
    <ul className="m-0 flex flex-col gap-3 p-0 text-xs">
      {pairs.map((pair) => (
        <li key={pair.good} className="flex flex-col gap-0.5">
          <span className="flex items-baseline gap-2 text-muted-foreground">
            <PairMark>{marks[0]}</PairMark>
            <s className="decoration-input">{pair.bad}</s>
          </span>
          <span className="flex items-baseline gap-2">
            <PairMark>{marks[1]}</PairMark>
            {pair.good}
          </span>
          <Hint as="span">{pair.why}</Hint>
        </li>
      ))}
    </ul>
  )
}

/** A caps tag before a line. The string stays lowercase: `caps` sets the case. */
function PairMark({ children }: { children: ReactNode }) {
  return (
    <Text caps tone="faint" className="w-10 shrink-0">
      {children}
    </Text>
  )
}
