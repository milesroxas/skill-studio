/**
 * Auto refine, inside the selection popout. The checks run first and cost
 * nothing; Jev reads the rule when a TypeSafe key is set; a model is
 * asked to rewrite only when something drifts. A rule that already complies
 * gets told so, and offered the longer way: Help me improve.
 */
import { drifts, type RefineResult } from '@domain/improve.ts'
import type { Finding, RuleScene } from '@domain/lint.ts'
import { useEffect, useMemo, useRef, useState } from 'react'
import { startRefine, stopRun, useRun } from '../ai.ts'
import { lineDiff } from '../diff.ts'
import { DiffLines } from './DiffLines.tsx'
import { Loading, Toolbar } from './layout.tsx'
import { Hint, Text } from './text.tsx'
import { Button } from './ui/button.tsx'
import { PopoverSection } from './ui/popover.tsx'

/** One finding: the guide line it stands under, then what is wrong. */
function FindingLine({ finding }: { finding: Finding }) {
  return (
    <li className="flex flex-col gap-0.5">
      <Text size="xs" caps tone={finding.source === 'maybe' ? 'faint' : 'muted'}>
        {finding.lead}
      </Text>
      <Text as="p" size="ui" tone={finding.source === 'maybe' ? 'muted' : 'default'}>
        {finding.message}
      </Text>
    </li>
  )
}

export function FindingList({ findings }: { findings: Finding[] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
      {findings.map((finding) => (
        <FindingLine
          key={`${finding.principle ?? finding.dimension}:${finding.message}`}
          finding={finding}
        />
      ))}
    </ul>
  )
}

/** Jev did not read this: only code's checks ran. */
export function Unjudged() {
  return (
    <Hint>
      Only the word and count checks ran. Add a TypeSafe key in Settings and Jev reads the rule too.
    </Hint>
  )
}

export function RefineBody({
  scene,
  onApply,
  onImprove,
  onClose,
}: {
  scene: RuleScene
  onApply: (text: string) => void
  onImprove: () => void
  onClose: () => void
}) {
  const [result, setResult] = useState<RefineResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const run = useRun(result?.run?.id ?? null)
  const accept = useRef<HTMLButtonElement>(null)
  /** The request this body made, so a result arriving after it unmounts is let go. */
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    setResult(null)
    setError(null)
    startRefine(scene).then(
      (next) => {
        if (alive.current) setResult(next)
        else if (next.run) stopRun(next.run.id)
      },
      (e: Error) => {
        if (alive.current) setError(e.message)
      },
    )
    return () => {
      alive.current = false
    }
  }, [scene])

  // The reply is ready: Return now accepts it.
  useEffect(() => {
    if (run?.status === 'done') accept.current?.focus()
  }, [run?.status])

  const revision = run?.status === 'done' ? run.text : null
  const changes = useMemo(
    () => (revision ? lineDiff(scene.selection, revision) : null),
    [scene.selection, revision],
  )

  if (error)
    return (
      <PopoverSection pad="text">
        <Hint tone="destructive" role="alert">
          {error}
        </Hint>
      </PopoverSection>
    )
  if (!result)
    return (
      <PopoverSection pad="text">
        <Text size="ui" tone="muted">
          Checking the rule…
        </Text>
        <Loading />
      </PopoverSection>
    )

  const maybes = result.findings.filter((f) => f.source === 'maybe')
  if (!result.run)
    return (
      <>
        <PopoverSection pad="text">
          <Text as="p" size="ui">
            This already reads like a rule an agent can follow. It names a step, carries its why and
            leaves nothing to guess at.
          </Text>
          {maybes.length ? (
            <>
              <Text size="xs" caps tone="muted">
                Worth a look
              </Text>
              <FindingList findings={maybes} />
            </>
          ) : null}
          {result.judged ? null : <Unjudged />}
        </PopoverSection>
        <PopoverSection pad="text">
          <Text as="p" size="ui" tone="muted">
            Want to push it further anyway? Help me improve asks a few questions and drafts a
            stronger version.
          </Text>
          <Toolbar>
            <Button type="button" variant="outline" size="sm" onClick={onImprove}>
              Help me improve
            </Button>
          </Toolbar>
        </PopoverSection>
      </>
    )

  const running = run?.status === 'running' || run === null
  return (
    <>
      <PopoverSection pad="text">
        <Text size="xs" caps tone="muted">
          {drifts(result.findings) ? 'What drifts' : 'Worth a look'}
        </Text>
        <FindingList findings={result.findings} />
        {result.judged ? null : <Unjudged />}
      </PopoverSection>
      <PopoverSection pad="text">
        <Text size="xs" caps tone="muted">
          Revision
        </Text>
        <div
          aria-live="polite"
          className="max-h-72 overflow-y-auto overscroll-contain rounded-sm bg-muted/50 px-3 py-2.5 text-ui"
        >
          {changes ? (
            <DiffLines lines={changes} />
          ) : run?.status === 'failed' ? (
            <Hint tone="destructive" role="alert">
              {run.error}
            </Hint>
          ) : run?.text ? (
            <Text as="p" wrap="pre">
              {run.text}
            </Text>
          ) : (
            <Text tone="muted">{run?.status === 'stopped' ? 'Stopped.' : 'Writing…'}</Text>
          )}
        </div>
        <Toolbar justify="end">
          {running ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => run && stopRun(run.id)}
            >
              Stop
            </Button>
          ) : (
            <>
              <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                Discard
              </Button>
              <Button
                ref={accept}
                type="button"
                size="sm"
                disabled={!revision || revision === scene.selection}
                onClick={() => revision && onApply(revision)}
              >
                Replace
              </Button>
            </>
          )}
        </Toolbar>
      </PopoverSection>
    </>
  )
}
