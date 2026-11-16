/**
 * Auto refine, inside the selection popout. The checks run first and cost
 * nothing; Jev reads the rule when a TypeSafe key is set; a model is asked to
 * rewrite only when new words can fix what was found. The revision is held to
 * the same checks before it is shown, so what is offered clears them, or says
 * what it could not supply. A rule that already complies gets told so, and one
 * whose trouble is not its wording says that: both are offered the longer
 * way, Help me improve.
 */
import { drifts, needsOf, type RefineResult, revisionOf } from '@domain/improve.ts'
import type { Finding, RuleScene } from '@domain/lint.ts'
import { useEffect, useMemo, useRef } from 'react'
import { startRefine, stopRun } from '../ai.ts'
import { lineDiff } from '../diff.ts'
import { listLine } from '../model.ts'
import { useStartedRun } from '../started-run.ts'
import { DiffLines } from './DiffLines.tsx'
import { Loading, Toolbar } from './layout.tsx'
import { Excerpt, Hint, Text } from './text.tsx'
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
  return <Hint>Wording checks only. Add a Jev key in Settings for a fuller check.</Hint>
}

/** The run a check starts, when a rewrite can fix what it found. */
const runOf = (result: RefineResult) => result.run

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
  // Asked as the popout opens on a rule; closing it on a revision still being written stops the writing.
  const work = useStartedRun(() => startRefine(scene), runOf, [scene])
  const { result, run } = work
  // Once the checks have answered, a failure is the revision's, said in its place under them.
  const error = result ? null : work.error
  const accept = useRef<HTMLButtonElement>(null)

  // The reply is ready: Return now accepts it.
  useEffect(() => {
    if (run?.status === 'done') accept.current?.focus()
  }, [run?.status])

  // The finished run carries the revision and what the checks still find in it.
  const done = useMemo(() => {
    if (run?.status !== 'done') return null
    try {
      return revisionOf(run.text)
    } catch (e) {
      return (e as Error).message
    }
  }, [run?.status, run?.text])
  const unread = typeof done === 'string' ? done : null
  const revision = done && typeof done !== 'string' ? done.text : null
  const needs = done && typeof done !== 'string' ? needsOf(done.open) : []
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
  // Something is wrong, and not with the wording: a line that changes nothing, or belongs elsewhere.
  if (!result.run && drifts(result.findings))
    return (
      <>
        <PopoverSection pad="text">
          <Text size="xs" caps tone="muted">
            What drifts
          </Text>
          <FindingList findings={result.findings} />
          {result.judged ? null : <Unjudged />}
        </PopoverSection>
        <PopoverSection pad="text">
          <Text as="p" size="ui" tone="muted">
            New words will not fix this. To decide what to do with the line, answer a few questions.
          </Text>
          <Toolbar>
            <Button type="button" variant="outline" size="sm" onClick={onImprove}>
              Help me improve
            </Button>
          </Toolbar>
        </PopoverSection>
      </>
    )
  if (!result.run)
    return (
      <>
        <PopoverSection pad="text">
          <Text as="p" size="ui">
            Nothing to fix. The rule names a step, says why, and leaves nothing to guess.
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
            To push it further, answer a few questions and get a draft.
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
        <Excerpt holds="writing" aria-live="polite">
          {changes ? (
            <DiffLines lines={changes} />
          ) : run?.status === 'failed' || unread ? (
            <Hint tone="destructive" role="alert">
              {unread ?? run?.error}
            </Hint>
          ) : run?.text ? (
            <Text as="p" wrap="pre">
              {run.text}
            </Text>
          ) : (
            <Text tone="muted">{run?.status === 'stopped' ? 'Stopped.' : 'Writing…'}</Text>
          )}
        </Excerpt>
        {needs.length ? (
          <Hint>Still needs {listLine(needs)}. Help me improve asks you for it.</Hint>
        ) : null}
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
              {needs.length ? (
                <Button type="button" variant="ghost" size="sm" onClick={onImprove}>
                  Help me improve
                </Button>
              ) : null}
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
