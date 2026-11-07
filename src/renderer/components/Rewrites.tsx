/**
 * Suggest changes, inside the selection popout: three rewrites of the
 * selection, always in the same order with the same labels, each an object to
 * pick up. One click puts it in the file. A rewrite the judge saw drop a fact
 * is shown greyed with the reason, not offered.
 */
import {
  DRIFTS,
  offerable,
  REWRITE_KINDS,
  REWRITE_LABELS,
  type RewriteKind,
  type RewritesResult,
  rewritesResult,
} from '@domain/improve.ts'
import type { RuleScene } from '@domain/lint.ts'
import { cva } from 'class-variance-authority'
import { useEffect, useMemo, useRef, useState } from 'react'
import { startRewrites, stopRun, useRun } from '../ai.ts'
import { Loading, Toolbar } from './layout.tsx'
import { Hint, Text } from './text.tsx'
import { Button } from './ui/button.tsx'
import { PopoverSection } from './ui/popover.tsx'

/** A rewrite as an object to pick up: a card that is a button. */
const rewriteCard = cva(
  'flex w-full flex-col gap-1.5 rounded-chin bg-card px-3.5 py-3 text-left text-card-foreground shadow-raised outline-none transition-[background-color,box-shadow] duration-150 ease-out focus-visible:ring-2 focus-visible:ring-ring/50',
  {
    variants: {
      offered: {
        true: 'hover:bg-accent active:scale-[0.99]',
        false: 'cursor-default opacity-70',
      },
    },
  },
)

function RewriteCard({
  kind,
  text,
  result,
  scene,
  onPick,
}: {
  kind: RewriteKind
  text: string
  result: RewritesResult
  scene: RuleScene
  onPick: () => void
}) {
  const verdict = result.verdicts[kind]
  const same = text.trim() === scene.selection.trim()
  const offered = offerable(scene, text, verdict)
  const notes: string[] = []
  if (same) notes.push('No change needed.')
  else if (verdict.kept !== null && verdict.kept < DRIFTS)
    notes.push('Lost a fact of the selection. Ask again.')
  if (kind === 'practice' && verdict.drift.length)
    notes.push(`Still misses: ${verdict.drift.map((f) => f.lead.replace(/\.$/, '')).join(', ')}.`)
  if (kind === 'shorter' && verdict.shorter === false) notes.push('Not shorter than the selection.')
  return (
    <li>
      <button
        type="button"
        className={rewriteCard({ offered })}
        disabled={!offered}
        aria-label={`Replace with the ${REWRITE_LABELS[kind].label.toLowerCase()} rewrite`}
        onClick={onPick}
      >
        <span className="flex items-baseline justify-between gap-3">
          <Text size="xs" caps tone="muted">
            {REWRITE_LABELS[kind].label}
          </Text>
          <Text size="xs" tone="faint">
            {REWRITE_LABELS[kind].means}
          </Text>
        </span>
        <Text as="p" size="ui" wrap="pre">
          {text}
        </Text>
        {notes.length ? <Hint>{notes.join(' ')}</Hint> : null}
      </button>
    </li>
  )
}

export function RewritesBody({
  scene,
  onApply,
}: {
  scene: RuleScene
  onApply: (text: string) => void
}) {
  const [runId, setRunId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const run = useRun(runId)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    setRunId(null)
    setError(null)
    startRewrites(scene).then(
      (started) => {
        if (alive.current) setRunId(started.id)
        else stopRun(started.id)
      },
      (e: Error) => {
        if (alive.current) setError(e.message)
      },
    )
    return () => {
      alive.current = false
    }
  }, [scene])

  const result = useMemo(() => {
    if (run?.status !== 'done') return null
    try {
      return rewritesResult(run.text)
    } catch (e) {
      return (e as Error).message
    }
  }, [run?.status, run?.text])

  const problem =
    error ??
    (run?.status === 'failed' ? run.error : null) ??
    (typeof result === 'string' ? result : null)
  if (problem)
    return (
      <PopoverSection pad="text">
        <Hint tone="destructive" role="alert">
          {problem}
        </Hint>
      </PopoverSection>
    )
  if (!result || typeof result === 'string')
    return (
      <PopoverSection pad="text">
        <Text size="ui" tone="muted">
          {run?.status === 'stopped' ? 'Stopped.' : 'Writing three rewrites…'}
        </Text>
        {run?.status === 'stopped' ? null : <Loading />}
        {run?.status === 'running' ? (
          <Toolbar justify="end">
            <Button type="button" variant="outline" size="sm" onClick={() => stopRun(run.id)}>
              Stop
            </Button>
          </Toolbar>
        ) : null}
      </PopoverSection>
    )

  return (
    <PopoverSection pad="text" scroll className="max-h-[70dvh]">
      <Hint>
        Click a rewrite to put it in place of the selection. Undo brings the selection back.
      </Hint>
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {REWRITE_KINDS.map((kind) => (
          <RewriteCard
            key={kind}
            kind={kind}
            text={result.rewrites[kind]}
            result={result}
            scene={scene}
            onPick={() => onApply(result.rewrites[kind])}
          />
        ))}
      </ul>
    </PopoverSection>
  )
}
