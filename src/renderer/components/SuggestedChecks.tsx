/**
 * The checks the assistant suggests for a case, under the case's own checks
 * on Cases: one bordered object, its head a band on the muted surface with
 * the turning ribbon at its start, a label, the count and how many an answer
 * missed. The suggestions are always listed under the band, one row each:
 * its words, Add and the cross that turns it down on its first line, and
 * Why, which opens the reason and the words it stands on. Nothing opens or
 * closes, so the page changes height only when something the reader caused
 * arrives or leaves. See docs/design/layout.md.
 *
 * Add puts one in the case's checks as a typed check, unsaved, so the case's
 * Save and Discard hold it. Turn down is written at once, and its Undo on the
 * status line proposes it again.
 */
import { largeReading, type ProposedCheck, readingTimes } from '@domain/proposal.ts'
import { ChevronRightIcon, PenLineIcon, PlusIcon, XIcon } from 'lucide-react'
import { type ReactNode, useEffect, useId, useState } from 'react'
import { api } from '../api.ts'
import type { Ctx } from '../ctx.ts'
import { useFetch } from '../hooks.ts'
import { inSkill } from '../in-skill.ts'
import { cn } from '../lib/utils.ts'
import { lastAnswer, readParams } from '../model.ts'
import { useArrived, usePresence, useStaying } from '../motion.ts'
import {
  answerName,
  askedIn,
  faultOutput,
  missedFact,
  standsLine,
  waitingFor,
} from '../suggested.ts'
import { PlainList } from './layout.tsx'
import { TurningRibbon } from './TurningRibbon.tsx'
import { Excerpt, Text } from './text.tsx'
import { UNFOLD_CHILD, UNFOLDING, unfoldVariants } from './Unfold.tsx'
import { Button } from './ui/button.tsx'
import { Collapsible, CollapsibleContent } from './ui/collapsible.tsx'

interface Suggested {
  /** The suggestions were read at least once: before that, none showing says nothing. */
  loaded: boolean
  /** The suggestions are being read again, as after a reading lands. */
  loading: boolean
  /** The checks still suggested for the case, those an answer missed first. */
  waiting: ProposedCheck[]
  /** The id of the one being turned down: the other rows wait. */
  pending: string | null
  turnDown: (check: ProposedCheck) => void
}

/**
 * The suggestions for the case in view. They are read again whenever the
 * skill is, so a `st propose` run outside the app shows on the next reload.
 */
function useSuggestedChecks(
  ctx: Ctx,
  caseId: string,
  statements: readonly string[],
  reading: boolean,
): Suggested {
  // Read again when a reading of the case lands, as when the skill is.
  const { data, reload, loading } = useFetch(() => api.proposals(), [ctx.state, reading])
  const [pending, setPending] = useState<string | null>(null)
  const turnDown = async (check: ProposedCheck) => {
    setPending(check.id)
    try {
      await api.decideProposal(check.case, check.id, 'dropped')
      reload()
      ctx.report('Turned down', {
        // Taken once another skill is open, it would look for the suggestion there.
        undo: inSkill(ctx, async () => {
          await api.decideProposal(check.case, check.id, 'proposed')
          ctx.report('Suggested again')
        }),
      })
    } catch (e) {
      ctx.report(e as Error)
    } finally {
      setPending(null)
    }
  }
  return {
    loaded: data !== null,
    loading,
    waiting: waitingFor(data?.proposals ?? [], caseId, statements),
    pending,
    turnDown: (check) => void turnDown(check),
  }
}

/** Asked before a case whose answers are long is read. */
const longAnswers = (characters: number) => ({
  title: 'Read these long answers?',
  description: `Its answers are long, so reading them counts about ${readingTimes(characters)} times as much toward your usage as a usual case.`,
  action: 'Read',
})

export interface ReadRuns {
  /** In place of Write checks with AI once the case has runs; undefined before a first run keeps it. */
  writeWithAi?: ReactNode
  /** The assistant is reading what the case's latest runs wrote. */
  reading: boolean
}

/**
 * Write checks with AI, once the case has runs: the assistant reads what the
 * latest runs wrote and suggests checks in the call-out. Before a first run
 * there is nothing to read, and the button writes from the prompt, as it
 * always has. The reading is a job, as a run is: while it reads, the button
 * waits and Stop beside it ends the reading, as Stop in the list of jobs does.
 * The call-out's band says what is happening, once, and the status line says
 * how it went when it ends.
 */
export function useReadRuns(ctx: Ctx, caseId: string | null): ReadRuns {
  const { jobs, report } = ctx
  /** The reading this screen started, and the case it reads. */
  const [started, setStarted] = useState<{ job: number; caseId: string } | null>(null)
  const [asking, setAsking] = useState<string | null>(null)
  /** Stop was pressed on this reading: it waits for the job to end, so a second press does nothing. */
  const [stopping, setStopping] = useState<number | null>(null)
  const job = started ? (jobs.find((j) => j.id === started.job) ?? null) : null
  // The job has ended: say how it went, from its last line, and let the button go.
  useEffect(() => {
    if (!job || job.status === 'running') return
    const last = job.log.at(-1)?.replace(/^\d\d:\d\d:\d\d\s+/, '') ?? null
    if (job.status === 'failed' && last) report(last, { tone: 'destructive' })
    else if (job.status === 'stopped') report('Stopped reading the answers')
    else if (last) report(last)
    setStarted(null)
  }, [job, report])
  if (!caseId || lastAnswer(ctx.outputs, caseId) === null) return { reading: false }
  const mine = started?.caseId === caseId
  const busy = asking === caseId || (mine && (job === null || job.status === 'running'))
  const elsewhere = (asking !== null || started !== null) && !busy
  const read = async () => {
    setAsking(caseId)
    try {
      // A case whose answers are long pages is said before it is read: it uses several times as much.
      const { characters } = await api.readingSize(caseId)
      if (largeReading(characters) && !(await ctx.confirm(longAnswers(characters)))) return
      const { job: id } = await api.suggestChecks([caseId])
      setStarted({ job: id, caseId })
    } catch (e) {
      report(e as Error)
    } finally {
      setAsking(null)
    }
  }
  const stop = () => {
    if (!started) return
    setStopping(started.job)
    api.stopJob(started.job).catch((e: Error) => {
      setStopping(null)
      report(e)
    })
  }
  return {
    writeWithAi: (
      <>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          busy={busy}
          disabled={elsewhere}
          onClick={() => void read()}
        >
          <PenLineIcon aria-hidden="true" />
          Write checks with AI
        </Button>
        {busy && started ? (
          <Button
            type="button"
            variant="ghost-muted"
            size="sm"
            busy={stopping === started.job}
            busyLabel="Stopping…"
            onClick={stop}
          >
            Stop
          </Button>
        ) : null}
      </>
    ),
    reading: busy,
  }
}

export function SuggestedChecks({
  ctx,
  caseId,
  statements,
  onAdd,
  reading = false,
}: {
  ctx: Ctx
  caseId: string
  /** What the case's checks say now, as typed: a suggestion they say already is not shown. */
  statements: readonly string[]
  /** Put a check with these words in the case's checks, unsaved. */
  onAdd: (statement: string) => void
  /** The assistant is reading what the case's latest runs wrote: the band says so, and shows what it suggests. */
  reading?: boolean
}) {
  const suggested = useSuggestedChecks(ctx, caseId, statements, reading)
  const { waiting, loaded } = suggested
  // A reading ended: what it found is shown once it is read, and not before.
  const [wasReading, setWasReading] = useState(reading)
  const [landing, setLanding] = useState(false)
  if (wasReading !== reading) {
    setWasReading(reading)
    if (!reading) setLanding(true)
  }
  if (landing && !suggested.loading) setLanding(false)
  // From the reading's start until what it found is read, the band says it is reading: one place, one message.
  const busy = reading || landing
  const present = busy || waiting.length > 0
  // What there is when the case opens rests; a call-out the reader caused unfolds in, and folds away.
  const [atOpen, setAtOpen] = useState<boolean | null>(loaded ? present : null)
  if (atOpen === null && loaded) setAtOpen(present)
  const drawn = useStaying(present)
  const count = waiting.length
  const line = busy ? 'reading' : `${count}/${missedFact(waiting)}`
  const ticked = useArrived(line)
  const rows = usePresence(waiting, (check) => check.id)
  // The list comes with what the reading found, in the same movement as the band's new line.
  const listed = !busy && waiting.length > 0
  const listDrawn = useStaying(listed)
  const listCame = useArrived(listed ? 'listed' : 'not')
  if (!drawn) return null

  const list = (
    <PlainList gap="none" className="divide-y py-1">
      {rows.map((row) => (
        <SuggestedRow
          key={row.key}
          ctx={ctx}
          check={row.item}
          suggested={suggested}
          onAdd={onAdd}
          motion={row.leaving ? 'out' : row.arrived ? 'in' : 'rest'}
        />
      ))}
    </PlainList>
  )
  const band = (
    <div className="grid grid-cols-[minmax(0,1fr)] items-stretch bg-muted @lg/suggest:grid-cols-[7rem_minmax(0,1fr)]">
      {/* Laid over its column, so the words set the band's height and the lines fill it. On a
          narrow call-out it gives way to the words. */}
      <span className="relative hidden overflow-hidden @lg/suggest:block">
        <TurningRibbon className="absolute inset-y-0 left-0 h-full w-28" />
      </span>
      {/* A label and its facts, as Run size and Last run are said beside it: no sentence. */}
      <div className="flex min-w-0 flex-col justify-center gap-1 px-4 py-2">
        <Text caps tone="muted">
          Suggested by the assistant
        </Text>
        {/* One line that changes in place: reading, then what was found. */}
        <span
          key={line}
          role="status"
          className={cn('flex flex-wrap items-baseline gap-x-1.5', ticked && 'animate-tick')}
        >
          {busy ? (
            <Text weight="medium">Reading the latest runs</Text>
          ) : (
            <>
              <Text weight="medium" tabular>
                {count} {count === 1 ? 'check' : 'checks'}
              </Text>
              <Text tone="muted" aria-hidden="true">
                ·
              </Text>
              <Text tone="muted" tabular>
                {missedFact(waiting)}
              </Text>
            </>
          )}
        </span>
      </div>
    </div>
  )
  const callout = (
    <section
      aria-label="Checks the assistant suggests"
      className="@container/suggest overflow-hidden rounded-md border text-sm"
    >
      {band}
      {listDrawn ? (
        // Comes with the reading's result and goes with the last row: the list is part of the band's change.
        <div className={unfoldVariants({ motion: !listed ? 'out' : listCame ? 'in' : 'rest' })}>
          <div className={UNFOLD_CHILD}>
            <div className="border-t bg-card">{list}</div>
          </div>
        </div>
      ) : null}
    </section>
  )
  return (
    // The 20px over it are the section's gap, folded with it, so nothing under it jumps when it goes.
    <div
      className={cn(
        unfoldVariants({ motion: !present ? 'out' : atOpen === false ? 'in' : 'rest' }),
        '-mt-5',
      )}
    >
      <div className={UNFOLD_CHILD}>
        <div className="pt-5">{callout}</div>
      </div>
    </div>
  )
}

/** The words a check stands on, and the words of the answer that missed it. */
function Evidence({ ctx, check }: { ctx: Ctx; check: ProposedCheck }) {
  const output = faultOutput(ctx.outputs, check)
  const open = output
    ? () => ctx.go('results', readParams(ctx.outputs, output.caseId, output))
    : null
  return (
    <>
      <Quote label={`Asked for in ${askedIn(check)}`}>{check.basis.quote}</Quote>
      {check.fault?.quote ? (
        <Quote
          label={`${answerName(output)} wrote`}
          action={
            open ? (
              <Button type="button" variant="ghost-muted" size="xs" onClick={open}>
                Open that answer
              </Button>
            ) : null
          }
        >
          {check.fault.quote}
        </Quote>
      ) : check.fault ? (
        <Text tone="muted" size="xs">
          {answerName(output)} leaves it out.
        </Text>
      ) : null}
    </>
  )
}

/** Where some words come from, over the words. */
function Quote({
  label,
  action,
  children,
}: {
  label: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex min-h-4 items-center justify-between gap-2">
        <Text tone="muted" size="xs">
          {label}
        </Text>
        {/* Pulled out by its own padding, so its words end on the quote's edge. */}
        {action ? <span className="-my-1 -mr-2 flex">{action}</span> : null}
      </span>
      <Excerpt>{children}</Excerpt>
    </div>
  )
}

/**
 * A suggested check as a row of the call-out: its words, and its two answers
 * on the words' first line, at the size of the meta under them. Under its words, Why
 * and how the answers stand on it. No number: the case's own checks just
 * above are numbered, and a second count beside them would read as theirs.
 *
 *   The email describes two-way reminders ...        [+ Add]  ×
 *   › Why  Missed by 2 of 3 answers
 */
function SuggestedRow({
  ctx,
  check,
  suggested,
  onAdd,
  motion,
}: {
  ctx: Ctx
  check: ProposedCheck
  suggested: Suggested
  onAdd: (statement: string) => void
  /** How it moves now: unfolding in, as on Undo; folding out, as on Add and Turn down; or at rest. */
  motion: 'in' | 'out' | 'rest'
}) {
  const [open, setOpen] = useState(false)
  const more = useId()
  const waiting = suggested.pending !== null || motion === 'out'
  // Mounted later than the list, as on Undo, it unfolds; mounted with it, it comes as part of it.
  const [entry] = useState<'in' | 'rest'>(motion === 'in' ? 'in' : 'rest')
  return (
    <li
      className={unfoldVariants({ motion: motion === 'out' ? 'out' : entry })}
      aria-hidden={motion === 'out' || undefined}
    >
      <div className={UNFOLD_CHILD}>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 px-4 py-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <Text size="ui" className="text-pretty">
              {check.check}
            </Text>
            {/* Why's own padding is pulled back, so its chevron starts on the words' edge. */}
            <span className="-ml-2 flex min-h-6 flex-wrap items-center">
              <Button
                type="button"
                variant="ghost-muted"
                size="xs"
                aria-expanded={open}
                aria-controls={open ? more : undefined}
                onClick={() => setOpen((was) => !was)}
              >
                <ChevronRightIcon
                  aria-hidden="true"
                  data-open={open || undefined}
                  className="transition-transform duration-150 ease-out-strong data-[open]:rotate-90"
                />
                Why
              </Button>
              <Text tone="muted" size="xs" tabular>
                {standsLine(check)}
              </Text>
            </span>
            <Collapsible open={open}>
              <CollapsibleContent id={more} className={UNFOLDING}>
                <div className={UNFOLD_CHILD}>
                  <div className="flex flex-col gap-3 pt-1.5 pb-1">
                    <Text size="ui" tone="muted" className="text-pretty">
                      {check.why}
                    </Text>
                    <Evidence ctx={ctx} check={check} />
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
          {/* On the words' first line: 24px controls in its 20px, 2px over at each edge. */}
          <span className="-my-0.5 flex h-6 items-center gap-0.5">
            <Button
              type="button"
              variant="outline"
              size="xs"
              disabled={waiting}
              onClick={() => onAdd(check.check)}
            >
              <PlusIcon aria-hidden="true" />
              Add
            </Button>
            {/* Its 24px box reaches 6px past the edge, which puts the cross itself on the band's 16px inset. */}
            <span className="-mr-1.5 flex">
              <Button
                type="button"
                variant="ghost-muted"
                size="icon-xs"
                aria-label={`Turn down: ${check.check}`}
                title="Turn down"
                disabled={waiting}
                busy={suggested.pending === check.id}
                onClick={() => suggested.turnDown(check)}
              >
                <XIcon aria-hidden="true" />
              </Button>
            </span>
          </span>
        </div>
      </div>
    </li>
  )
}
