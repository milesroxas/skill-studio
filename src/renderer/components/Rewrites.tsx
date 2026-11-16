/**
 * Suggest changes, inside the selection popout: three rewrites of the
 * selection, each a card to pick. The first two are always Best practice and
 * More direct; the third is Shorter, or Split up for a rule that asks for
 * several things (`kindsFor`). A click, or its number key, puts it in the
 * file. A card offers only what its label holds: code withholds a Shorter
 * that is no shorter and a Split up still in one piece, and says why
 * (`withheld`). Jev's reading is a line on the card, never a lock: the writer
 * reads both and their pick stands. The cards hold their place while the
 * rewrites are written, so the popout does not jump when they land.
 */
import type { AiRun } from '@domain/ai.ts'
import {
  dropsFact,
  kindsFor,
  measured,
  needsOf,
  offerable,
  REWRITE_LABELS,
  type RewriteKind,
  type RewritesResult,
  rewritesResult,
  withheld,
} from '@domain/improve.ts'
import type { RuleScene } from '@domain/lint.ts'
import { cva } from 'class-variance-authority'
import { type KeyboardEvent, type Ref, useEffect, useMemo, useRef, useState } from 'react'
import { startRewrites, stopRun } from '../ai.ts'
import { listLine } from '../model.ts'
import { after } from '../motion.ts'
import { useStartedRun } from '../started-run.ts'
import { Toolbar } from './layout.tsx'
import { Unjudged } from './Refine.tsx'
import { Hint, Text } from './text.tsx'
import { Button } from './ui/button.tsx'
import { PopoverSection } from './ui/popover.tsx'

/** A rewrite as an object to pick: a card that is a button. */
const rewriteCard = cva(
  'group flex w-full flex-col gap-1.5 rounded-md bg-card px-3.5 py-3 text-left text-card-foreground shadow-raised focus-ring transition-[background-color,box-shadow,scale] duration-150 ease-out',
  {
    variants: {
      state: {
        ready: 'hover:bg-accent active:scale-[0.99]',
        /** Nothing to pick: the rewrite is the selection again, or does not do what its label says. */
        same: 'cursor-default opacity-70',
        /** Still being written: holds the card's place. */
        pending: 'cursor-default',
      },
    },
  },
)

/** What the card says it does, and the key that does it. */
function PickCue({ index, ready }: { index: number; ready: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="ml-auto flex shrink-0 items-baseline gap-1.5 text-xs text-muted-foreground transition-colors duration-150 ease-out group-hover:text-foreground group-focus-visible:text-foreground"
    >
      {ready ? 'Replace' : null}
      <kbd className="font-sans tabular-nums">{index + 1}</kbd>
    </span>
  )
}

function RewriteCard({
  kind,
  index,
  text,
  stopped,
  result,
  scene,
  onPick,
  ref,
}: {
  kind: RewriteKind
  index: number
  /** Null while it is written. */
  text: string | null
  /** The run was stopped before the text came. */
  stopped: boolean
  result: RewritesResult | null
  scene: RuleScene
  onPick: () => void
  ref?: Ref<HTMLButtonElement>
}) {
  const { label, means } = REWRITE_LABELS[kind]
  const verdict = result?.verdicts[kind]
  // Code decides what is offered: a card never holds less than its label says.
  const why = text === null ? null : withheld(scene, kind, text)
  const ready = text !== null && why === null
  const state = text === null ? 'pending' : ready ? 'ready' : 'same'
  const count = ready ? measured(scene, kind, text) : null
  const needs = ready && verdict ? needsOf(verdict.open) : []
  return (
    <li>
      <button
        ref={ref}
        type="button"
        data-rewrite={kind}
        className={rewriteCard({ state })}
        disabled={!ready}
        onClick={onPick}
      >
        <span className="flex w-full items-baseline gap-2">
          <Text size="xs" caps tone="muted">
            {label}
          </Text>
          <Text size="xs" tone="faint" truncate>
            {means}
          </Text>
          <PickCue index={index} ready={ready} />
        </span>
        {text === null ? (
          <Text as="p" size="ui" tone="faint">
            {stopped ? 'Stopped.' : 'Writing…'}
          </Text>
        ) : ready ? (
          <Text as="p" size="ui" wrap="pre" className="animate-ink" style={after(index * 50)}>
            {text}
          </Text>
        ) : (
          <Text as="p" size="ui" tone="muted">
            {why}
          </Text>
        )}
        {count ? (
          <Text size="xs" tone="muted" tabular>
            {count}
          </Text>
        ) : null}
        {verdict && ready && dropsFact(verdict) ? (
          <Text size="xs" tone="warning">
            May drop a fact. Read it before you replace.
          </Text>
        ) : null}
        {needs.length ? (
          <Text size="xs" tone="muted">
            Still needs {listLine(needs)}. Help me improve asks you for it.
          </Text>
        ) : null}
      </button>
    </li>
  )
}

/** The run that writes the rewrites is what the request answers. */
const itself = (run: AiRun): AiRun => run

export function RewritesBody({
  scene,
  onApply,
  onImprove,
}: {
  scene: RuleScene
  onApply: (text: string) => void
  /** Open Help me improve on the rule: offered once a rewrite needs something only the writer knows. */
  onImprove: () => void
}) {
  /** Bumped by Try again: the same selection, asked once more. */
  const [attempt, setAttempt] = useState(0)
  // Asked as the popout opens; closing it on rewrites still being written stops the writing.
  const { run, error } = useStartedRun(() => startRewrites(scene), itself, [scene, attempt])
  const first = useRef<HTMLButtonElement>(null)
  // Known from the selection alone, so the three cards stand from the first frame.
  const kinds = useMemo(() => kindsFor(scene), [scene])

  const result = useMemo(() => {
    if (run?.status !== 'done') return null
    try {
      return rewritesResult(run.text)
    } catch (e) {
      return (e as Error).message
    }
  }, [run?.status, run?.text])
  const rewrites = result && typeof result !== 'string' ? result : null

  // The rewrites are in: the keys 1 to 3 and Return now pick one.
  useEffect(() => {
    if (rewrites) first.current?.focus()
  }, [rewrites])

  const problem = error ?? (typeof result === 'string' ? result : null)
  const stopped = run?.status === 'stopped'
  const running = !problem && !rewrites && !stopped

  const pick = (kind: RewriteKind) => {
    const text = rewrites?.rewrites[kind]
    if (text !== undefined && offerable(scene, kind, text)) onApply(text)
  }

  // 1, 2 and 3 pick a card; the arrows walk them.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return
    const kind = kinds[Number(event.key) - 1]
    if (kind) {
      event.preventDefault()
      pick(kind)
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const cards = [
      ...event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-rewrite]:enabled'),
    ]
    const at = cards.indexOf(document.activeElement as HTMLButtonElement)
    const next = cards[at + (event.key === 'ArrowDown' ? 1 : -1)]
    if (next) {
      event.preventDefault()
      next.focus()
    }
  }

  /** A rewrite could not supply something: the way to give it is one press away. */
  const asks = rewrites
    ? kinds.some((kind) => {
        const text = rewrites.rewrites[kind]
        const open = rewrites.verdicts[kind]?.open ?? []
        return text !== undefined && offerable(scene, kind, text) && needsOf(open).length > 0
      })
    : false

  const firstReady = rewrites
    ? kinds.find((kind) => {
        const text = rewrites.rewrites[kind]
        return text !== undefined && offerable(scene, kind, text)
      })
    : undefined

  return (
    <>
      {problem ? (
        <PopoverSection pad="text">
          <Hint tone="destructive" role="alert">
            {problem}
          </Hint>
        </PopoverSection>
      ) : (
        <PopoverSection pad="text" scroll className="max-h-[70dvh]" onKeyDown={onKeyDown}>
          <ul
            className="m-0 flex list-none flex-col gap-2.5 p-0"
            aria-label="Rewrites"
            aria-busy={running}
          >
            {kinds.map((kind, index) => (
              <RewriteCard
                key={kind}
                ref={kind === firstReady ? first : undefined}
                kind={kind}
                index={index}
                text={rewrites?.rewrites[kind] ?? null}
                stopped={stopped}
                result={rewrites}
                scene={scene}
                onPick={() => pick(kind)}
              />
            ))}
          </ul>
        </PopoverSection>
      )}
      <PopoverSection pad="text">
        <Toolbar justify="end">
          <span className="mr-auto" role="status">
            {running ? (
              <Text size="xs" tone="muted">
                Writing three rewrites…
              </Text>
            ) : stopped ? (
              <Text size="xs" tone="muted">
                Stopped.
              </Text>
            ) : rewrites && !rewrites.judged ? (
              <Unjudged />
            ) : null}
          </span>
          {running ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!run}
              onClick={() => run && stopRun(run.id)}
            >
              Stop
            </Button>
          ) : (
            <>
              {asks ? (
                <Button type="button" variant="ghost" size="sm" onClick={onImprove}>
                  Help me improve
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setAttempt((n) => n + 1)}
              >
                Try again
              </Button>
            </>
          )}
        </Toolbar>
      </PopoverSection>
    </>
  )
}
