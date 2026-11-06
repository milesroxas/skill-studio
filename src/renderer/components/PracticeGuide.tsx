/**
 * The practice skill's guide, at the foot of the sidebar: how far round the
 * loop the reader is and the one step in hand. The whole block goes to where
 * that step happens. It shows one step at a time on purpose: the sidebar above
 * it is already the map.
 */
import { cva } from 'class-variance-authority'
import { ArrowRightIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../lib/utils.ts'
import type { PracticeGuide as Guide } from '../practice.ts'
import { Text } from './text.tsx'
import { Button } from './ui/button.tsx'

/** One step of the loop: done, in hand, or still to come. */
const segment = cva('h-1 flex-1 rounded-full transition-[background-color] duration-300 ease-out', {
  variants: {
    state: {
      done: 'bg-sidebar-foreground/70',
      current: 'bg-sidebar-foreground/30',
      todo: 'bg-sidebar-foreground/10',
    },
  },
})

function Progress({ guide }: { guide: Guide }) {
  return (
    <span className="flex gap-1" aria-hidden="true">
      {guide.steps.map((step, i) => (
        <span
          key={step.id}
          className={segment({
            state: step.done ? 'done' : i + 1 === guide.number ? 'current' : 'todo',
          })}
        />
      ))}
    </span>
  )
}

function Head({ guide }: { guide: Guide }) {
  return (
    <span className="flex items-baseline justify-between gap-2">
      <Text size="xs" tone="faint" weight="medium">
        Practice
      </Text>
      <Text size="xs" tone="faint" tabular>
        {guide.number ? `${guide.number} of ${guide.steps.length}` : 'Done'}
      </Text>
    </span>
  )
}

function Step({ guide, mark }: { guide: Guide; mark?: ReactNode }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="flex items-center gap-1.5 text-ui font-medium text-sidebar-foreground">
        {guide.title}
        {mark}
      </span>
      <Text size="xs" tone="muted" className="text-pretty">
        {guide.hint}
      </Text>
    </span>
  )
}

const BLOCK = 'flex w-full flex-col gap-2 rounded-sm p-2 text-left'

export function PracticeGuide({
  guide,
  onGo,
  onNew,
}: {
  guide: Guide
  onGo: (screen: string, params?: Record<string, string>) => void
  /** Start a skill of one's own, offered once the loop is closed. */
  onNew: () => void
}) {
  const target = guide.target
  return (
    <section aria-label="Practice" className="border-t px-2 py-2">
      {target ? (
        <button
          type="button"
          className={cn(
            BLOCK,
            'group/practice outline-none transition-[background-color] duration-150 ease-out hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring/50',
          )}
          onClick={() => onGo(target.screen, target.params)}
        >
          <Head guide={guide} />
          <Progress guide={guide} />
          <Step
            guide={guide}
            mark={
              <ArrowRightIcon
                aria-hidden="true"
                className="size-3.5 shrink-0 text-sidebar-foreground/55 transition-transform duration-150 ease-out group-hover/practice:translate-x-0.5"
              />
            }
          />
        </button>
      ) : (
        <div className={BLOCK}>
          <Head guide={guide} />
          <Progress guide={guide} />
          <Step guide={guide} />
          <Button type="button" size="sm" className="mt-1 self-start" onClick={onNew}>
            New skill
          </Button>
        </div>
      )}
    </section>
  )
}
