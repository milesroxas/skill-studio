/**
 * The checks the assistant suggests for a case, under the case's own checks
 * on Cases: one bordered object, its head a band on the muted surface with
 * the turning ribbon at its start, a label, the count and how many an answer
 * missed, and Show. Show opens the suggestions under the band, one row each:
 * its words, Add and the cross that turns it down on its first line, and
 * Why, which opens the reason and the words it stands on. See
 * docs/design/layout.md.
 *
 * Add puts one in the case's checks as a typed check, unsaved, so the case's
 * Save and Discard hold it. Turn down is written at once, and its Undo on the
 * status line proposes it again.
 */
import type { ProposedCheck } from '@domain/proposal.ts'
import { ChevronRightIcon, PlusIcon, XIcon } from 'lucide-react'
import { type ReactNode, useId, useState } from 'react'
import { api } from '../api.ts'
import type { Ctx } from '../ctx.ts'
import { useFetch } from '../hooks.ts'
import { inSkill } from '../in-skill.ts'
import { readParams } from '../model.ts'
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
import { Button } from './ui/button.tsx'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible.tsx'

interface Suggested {
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
function useSuggestedChecks(ctx: Ctx, caseId: string, statements: readonly string[]): Suggested {
  const { data, reload } = useFetch(() => api.proposals(), [ctx.state])
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
    waiting: waitingFor(data?.proposals ?? [], caseId, statements),
    pending,
    turnDown: (check) => void turnDown(check),
  }
}

export function SuggestedChecks({
  ctx,
  caseId,
  statements,
  onAdd,
}: {
  ctx: Ctx
  caseId: string
  /** What the case's checks say now, as typed: a suggestion they say already is not shown. */
  statements: readonly string[]
  /** Put a check with these words in the case's checks, unsaved. */
  onAdd: (statement: string) => void
}) {
  const suggested = useSuggestedChecks(ctx, caseId, statements)
  const [open, setOpen] = useState(false)
  const { waiting } = suggested
  if (!waiting.length) return null
  const count = waiting.length
  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <section
        aria-label="Checks the assistant suggests"
        className="@container/suggest overflow-hidden rounded-md border text-sm"
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-stretch bg-muted @lg/suggest:grid-cols-[7rem_minmax(0,1fr)_auto]">
          {/* Laid over its column, so the words set the band's height and the lines fill it. On a
              narrow call-out it gives way to the words. */}
          <span className="relative hidden overflow-hidden @lg/suggest:block">
            <TurningRibbon className="absolute inset-y-0 left-0 h-full w-28" />
          </span>
          {/* A label and its facts, as Run size and Last run are said beside it: no sentence. */}
          <div className="flex min-w-0 flex-col justify-center gap-1 py-2 pl-4">
            <Text caps tone="muted">
              Suggested by the assistant
            </Text>
            <span className="flex flex-wrap items-baseline gap-x-1.5">
              <Text weight="medium" tabular>
                {count} {count === 1 ? 'check' : 'checks'}
              </Text>
              <Text tone="muted" aria-hidden="true">
                ·
              </Text>
              <Text tone="muted" tabular>
                {missedFact(waiting)}
              </Text>
            </span>
          </div>
          <span className="flex items-center py-2 pr-4 pl-3">
            <CollapsibleTrigger asChild>
              <Button type="button" size="sm">
                {open ? 'Hide' : 'Show'}
              </Button>
            </CollapsibleTrigger>
          </span>
        </div>
        {/* Faded in, as a row of a `Disclosure` is: the sheet grows at once and its rows arrive on it. */}
        <CollapsibleContent className="border-t bg-card data-[state=open]:animate-ink">
          {/* 4px more at the sheet's top and foot: a band weighs more than a hairline, so the first
              row needs more room under it than a row needs under the line before it. */}
          <PlainList gap="none" className="divide-y py-1">
            {waiting.map((check) => (
              <SuggestedRow
                key={check.id}
                ctx={ctx}
                check={check}
                suggested={suggested}
                onAdd={onAdd}
              />
            ))}
          </PlainList>
        </CollapsibleContent>
      </section>
    </Collapsible>
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
}: {
  ctx: Ctx
  check: ProposedCheck
  suggested: Suggested
  onAdd: (statement: string) => void
}) {
  const [open, setOpen] = useState(false)
  const more = useId()
  const waiting = suggested.pending !== null
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 px-4 py-3">
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
        {open ? (
          <div id={more} className="flex animate-ink flex-col gap-3 pt-1.5 pb-1">
            <Text size="ui" tone="muted" className="text-pretty">
              {check.why}
            </Text>
            <Evidence ctx={ctx} check={check} />
          </div>
        ) : null}
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
        {/* Its 24px box reaches 6px past the edge, which puts the cross itself under the band's button's edge. */}
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
    </li>
  )
}
