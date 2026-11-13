/**
 * What one output missed, and what it met: the facts its score is counted
 * from, a line each. Missed comes first and stays open: each miss is a rule
 * of the skill or a check of the case that the output did not follow. Then
 * what Jev was not sure of, open too, since each waits for the reader and is
 * in no score until they answer. Met folds away under its count, and so does
 * what does not apply: a rule for another kind of work than this output.
 *
 * Jev read each fact, and a reader may read it differently. Their answer
 * stands: it moves the fact to the other list and the score follows. A fact
 * code measured, such as a word count, has no answer to give. Each action
 * has one place on every row, whatever the row says: Open rule is a button
 * on every rule SKILL.md still holds, and the answer, which is rare, waits
 * alone in the row's menu. A right-click on a row offers both.
 */
import { weightMark } from '@domain/case-draft.ts'
import { isMissed, type Verdict } from '@domain/pack.ts'
import { CheckIcon, FileTextIcon, MinusIcon, Undo2Icon, XIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { kindOfPart, partLabel } from '../model.ts'
import { Disclosure } from './Disclosure.tsx'
import { Term } from './Help.tsx'
import { ContextActions, MoreActions, RowAction } from './RowActions.tsx'
import { Text } from './text.tsx'
import { Button } from './ui/button.tsx'

const KIND = { rule: 'Rule', check: 'Check', other: null } as const

/**
 * How a fact stands, as its row's mark and the words the mark repeats. Met
 * and missed are verdicts and take their color; a fact set aside is no
 * verdict, so its mark is plain.
 */
const ASIDE_MARK = (
  <MinusIcon aria-hidden="true" className="mt-1.5 size-3.5 text-muted-foreground" />
)
const STANDING = {
  met: {
    said: 'Met',
    mark: <CheckIcon aria-hidden="true" className="mt-1.5 size-3.5 text-success" />,
  },
  missed: {
    said: 'Missed',
    mark: <XIcon aria-hidden="true" className="mt-1.5 size-3.5 text-destructive" />,
  },
  unsure: { said: 'Not sure', mark: ASIDE_MARK },
  inapplicable: { said: 'Does not apply', mark: ASIDE_MARK },
} as const

/** The line under a fact: its kind where the list mixes kinds or it counts more than once, the part a kind of work adds, the reader's answer, a save on the way. */
function noteOf(verdict: Verdict, mixed: boolean, saving: boolean): string {
  const kind = KIND[verdict.kind]
  const parts: string[] = []
  if (kind && (mixed || verdict.weight))
    parts.push(verdict.weight ? `${kind} ${weightMark(verdict.weight)}` : kind)
  // A fact a kind of work adds, such as Look, always names its part: it is no rule or check of the reader's.
  if (!kind && verdict.layer && kindOfPart(verdict.layer)) parts.push(partLabel(verdict.layer))
  // The answer is the reader's even where Jev, under the skill's threshold, now says the same.
  if (verdict.corrected)
    parts.push(verdict.jev === verdict.met ? 'your answer, agrees with Jev' : 'your answer')
  if (saving) parts.push('Saving…')
  return parts.join(' · ')
}

/** A fact by the first words of its text, so a screen reader hears which row a menu is for. */
const subjectOf = (text: string): string =>
  text.length > 48 ? `${text.slice(0, 47).trimEnd()}…` : text

interface Actions {
  /** A rule that still stands in SKILL.md as it is written here: open it in the editor. */
  onOpenRule?: (text: string) => void
  /** Whether a rule's text is one SKILL.md still holds. */
  ruleStands?: (text: string) => boolean
  /** Say the fact is met, or missed, whatever Jev said; null takes the answer back. */
  onCorrect?: (verdict: Verdict, met: boolean | null) => void
  /** The id of the fact whose answer is being saved: every answer waits. */
  pending?: string | null
}

function Row({
  verdict,
  mixed,
  actions,
}: {
  verdict: Verdict
  /** The list holds both rules and checks, so each row names its kind. */
  mixed: boolean
  actions: Actions
}) {
  const { onOpenRule, ruleStands, onCorrect, pending } = actions
  const waiting = pending !== null && pending !== undefined
  const note = noteOf(verdict, mixed, pending === verdict.id)
  const openable = verdict.kind === 'rule' && onOpenRule && (ruleStands?.(verdict.text) ?? false)
  const asMet = { label: 'Mark as met', icon: <CheckIcon aria-hidden="true" />, met: true }
  const asMissed = { label: 'Mark as missed', icon: <XIcon aria-hidden="true" />, met: false }
  // A fact set aside is neither met nor missed, so the reader may give either answer.
  const answers: Array<{ label: string; icon: ReactNode; met: boolean | null }> = verdict.corrected
    ? [{ label: 'Take back', icon: <Undo2Icon aria-hidden="true" />, met: null }]
    : verdict.aside
      ? [asMet, asMissed]
      : [verdict.met ? asMissed : asMet]
  const answerAction =
    verdict.open && onCorrect
      ? answers.map((answer) => (
          <RowAction
            key={answer.label}
            icon={answer.icon}
            disabled={waiting}
            onSelect={() => onCorrect(verdict, answer.met)}
          >
            {answer.label}
          </RowAction>
        ))
      : null
  const stands = STANDING[verdict.aside ?? (verdict.met ? 'met' : 'missed')]
  return (
    // A right-click on the row offers both of its actions, Open rule first, as the row shows them.
    <ContextActions
      subject={subjectOf(verdict.text)}
      actions={
        <>
          {openable ? (
            <RowAction
              icon={<FileTextIcon aria-hidden="true" />}
              onSelect={() => onOpenRule(verdict.text)}
            >
              Open rule
            </RowAction>
          ) : null}
          {answerAction}
        </>
      }
    >
      <li className="held grid grid-cols-[14px_minmax(0,1fr)_auto] items-start gap-x-2 py-1">
        {stands.mark}
        <span className="flex min-w-0 flex-col gap-0.5 py-1">
          <span className="text-pretty text-foreground">
            <span className="sr-only">{stands.said}: </span>
            {verdict.text}
          </span>
          {note ? <Text tone="faint">{note}</Text> : null}
        </span>
        <span className="flex items-center gap-1">
          {openable ? (
            <Button
              type="button"
              variant="ghost-muted"
              size="xs"
              onClick={() => onOpenRule(verdict.text)}
            >
              Open rule
            </Button>
          ) : null}
          <MoreActions subject={subjectOf(verdict.text)} size="xs">
            {answerAction}
          </MoreActions>
        </span>
      </li>
    </ContextActions>
  )
}

function List({ children }: { children: ReactNode }) {
  return <ul className="m-0 flex list-none flex-col divide-y p-0">{children}</ul>
}

export function Verdicts({ verdicts, ...actions }: { verdicts: Verdict[] } & Actions) {
  if (!verdicts.length) return null
  const missed = verdicts.filter(isMissed)
  const unsure = verdicts.filter((v) => v.aside === 'unsure')
  const elsewhere = verdicts.filter((v) => v.aside === 'inapplicable')
  // A fact the reader marked as met stays in view, with the way to take the answer back:
  // folded away with the rest, their own correction would be the one thing they could not find.
  const marked = verdicts.filter((v) => v.met && v.corrected)
  const met = verdicts.filter((v) => v.met && !v.corrected)
  const mixed = new Set(verdicts.map((v) => KIND[v.kind]).filter(Boolean)).size > 1
  // Two rules of one skill may read the same, so a fact's place in the list is part of its key.
  const rows = (list: Verdict[]) =>
    list.map((verdict) => (
      <Row
        key={`${verdict.id}#${verdicts.indexOf(verdict)}`}
        verdict={verdict}
        mixed={mixed}
        actions={actions}
      />
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
      {unsure.length ? (
        <div>
          <Text as="p" weight="medium" className="m-0 pb-0.5">
            <Term id="unsure">Not sure</Term>{' '}
            <Text tone="muted" tabular>
              {unsure.length}
            </Text>
          </Text>
          <List>{rows(unsure)}</List>
        </div>
      ) : null}
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
      {elsewhere.length ? (
        <Disclosure summary={`Does not apply ${elsewhere.length}`}>
          <List>{rows(elsewhere)}</List>
        </Disclosure>
      ) : null}
    </div>
  )
}
