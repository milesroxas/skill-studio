/**
 * What one output missed, and what it met: the facts its score is counted
 * from, a line each. Missed comes first and stays open, because each miss
 * names the rule or the check to change. Met folds away under its count.
 *
 * Jev read each fact, and a reader may read it differently. Their answer
 * stands: it moves the fact to the other list and the score follows. A fact
 * code measured, such as a word count, has no answer to give.
 */
import { weightMark } from '@domain/case-draft.ts'
import type { Verdict } from '@domain/pack.ts'
import { CheckIcon, XIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Disclosure } from './Disclosure.tsx'
import { Term } from './Help.tsx'
import { Text } from './text.tsx'
import { Button } from './ui/button.tsx'

const KIND = { rule: 'Rule', check: 'Check', other: null } as const

/** How the reader's answer stands: it is theirs even where Jev, under the skill's threshold, now says the same. */
const answerNote = (verdict: Verdict): string =>
  verdict.corrected
    ? verdict.jev === verdict.met
      ? ' · your answer, agrees with Jev'
      : ' · your answer'
    : ''

interface Actions {
  /** A rule that still stands in SKILL.md as it is written here: open it in the editor. */
  onOpenRule?: (text: string) => void
  /** Whether a rule's text is one SKILL.md still holds. */
  ruleStands?: (text: string) => boolean
  /** Say the fact is met, or missed, whatever Jev said; null takes the answer back. */
  onCorrect?: (verdict: Verdict, met: boolean | null) => void
  /** The id of the fact whose answer is being saved: its buttons wait. */
  pending?: string | null
}

function Row({ verdict, actions }: { verdict: Verdict; actions: Actions }) {
  const { onOpenRule, ruleStands, onCorrect, pending } = actions
  const kind = KIND[verdict.kind]
  const waiting = pending !== null && pending !== undefined
  const stands = verdict.kind === 'rule' && (ruleStands?.(verdict.text) ?? false)
  return (
    <li className="grid grid-cols-[14px_minmax(0,1fr)] gap-x-2 gap-y-0.5 py-1.5">
      {verdict.met ? (
        <CheckIcon aria-hidden="true" className="mt-0.5 size-3.5 text-success" />
      ) : (
        <XIcon aria-hidden="true" className="mt-0.5 size-3.5 text-destructive" />
      )}
      <span className="min-w-0 text-pretty text-foreground">
        <span className="sr-only">{verdict.met ? 'Met: ' : 'Missed: '}</span>
        {verdict.text}
      </span>
      <span className="col-start-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        {kind ? (
          <Text tone="faint">
            {kind}
            {verdict.weight ? ` ${weightMark(verdict.weight)}` : ''}
            {answerNote(verdict)}
          </Text>
        ) : null}
        {stands && onOpenRule ? (
          <Button
            type="button"
            variant="link-muted"
            size="inline-sm"
            onClick={() => onOpenRule(verdict.text)}
          >
            Open rule
          </Button>
        ) : null}
        {verdict.open && onCorrect ? (
          <Button
            type="button"
            variant="link-muted"
            size="inline-sm"
            disabled={waiting}
            busy={pending === verdict.id}
            busyLabel="Saving…"
            onClick={() => onCorrect(verdict, verdict.corrected ? null : !verdict.met)}
          >
            {verdict.corrected ? 'Take back' : verdict.met ? 'Mark as missed' : 'Mark as met'}
          </Button>
        ) : null}
      </span>
    </li>
  )
}

function List({ children }: { children: ReactNode }) {
  return <ul className="m-0 flex list-none flex-col divide-y p-0">{children}</ul>
}

export function Verdicts({ verdicts, ...actions }: { verdicts: Verdict[] } & Actions) {
  if (!verdicts.length) return null
  const missed = verdicts.filter((v) => !v.met)
  // A fact the reader marked as met stays in view, with the way to take the answer back:
  // folded away with the rest, their own correction would be the one thing they could not find.
  const marked = verdicts.filter((v) => v.met && v.corrected)
  const met = verdicts.filter((v) => v.met && !v.corrected)
  // Two rules of one skill may read the same, so a fact's place in the list is part of its key.
  const rows = (list: Verdict[]) =>
    list.map((verdict) => (
      <Row key={`${verdict.id}#${verdicts.indexOf(verdict)}`} verdict={verdict} actions={actions} />
    ))
  return (
    <div className="flex flex-col gap-2 border-b px-4 py-2.5 text-xs">
      {missed.length ? (
        <div>
          <Text as="p" weight="medium" className="m-0 pb-0.5">
            <Term id="missed">Missed</Term>{' '}
            <Text tone="muted" tabular>
              {missed.length}
            </Text>
          </Text>
          <List>{rows(missed)}</List>
        </div>
      ) : (
        <Text as="p" tone="muted" className="m-0">
          Nothing missed.
        </Text>
      )}
      {marked.length ? (
        <div>
          <Text as="p" weight="medium" className="m-0 pb-0.5">
            Marked as met by you{' '}
            <Text tone="muted" tabular>
              {marked.length}
            </Text>
          </Text>
          <List>{rows(marked)}</List>
        </div>
      ) : null}
      {met.length ? (
        <Disclosure summary={`Met ${met.length}`}>
          <List>{rows(met)}</List>
        </Disclosure>
      ) : null}
    </div>
  )
}
