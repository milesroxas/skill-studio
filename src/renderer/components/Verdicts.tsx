/**
 * What one output missed, and what it met: the facts its score is counted
 * from, a row each. Missed comes first and stays open: each miss is a rule
 * of the skill or a check of the case that the output did not follow. Then
 * what Jev was not sure of, open too, since each waits for the reader and is
 * in no score until they answer. Met folds away under its count, and so does
 * what does not apply: a rule for another kind of work than this output, or
 * one that does not come up for what its case asks.
 *
 * A rule carries its reason, so it runs to 400 characters and more, and a
 * list of thirty of them is a wall. A row shows two lines, enough to say
 * which rule it is, and opens in place to the whole of it. An open group
 * shows its first three rows and folds the rest under one line.
 *
 * Jev read each fact, and a reader may read it differently. Their answer
 * stands: it moves the fact to the other list and the score follows. A fact
 * code measured, such as a word count, has no answer to give. Each action
 * has one place on every row, whatever the row says: Open rule is a button
 * under every rule SKILL.md still holds, the fold is at the end of a row
 * that is cut, and the answer, which is rare, waits alone in the row's menu.
 * A right-click on a row offers Open rule and the answer.
 */
import { weightMark } from '@domain/case-draft.ts'
import { isMissed, type Verdict } from '@domain/pack.ts'
import {
  CheckIcon,
  ChevronRightIcon,
  FileTextIcon,
  MinusIcon,
  Undo2Icon,
  XIcon,
} from 'lucide-react'
import { type ReactNode, useId, useLayoutEffect, useRef, useState } from 'react'
import { cn } from '../lib/utils.ts'
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
  const fold = useFold()
  const textId = useId()
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
      {/* While the pointer rests on the cut text, the fold's button lights as if pointed at
          itself: a press on either does the same. */}
      <li className="held grid grid-cols-[14px_minmax(0,1fr)_auto] items-start gap-x-2 py-1 [&:has([data-fold=text]:hover)_[data-fold=button]]:bg-accent [&:has([data-fold=text]:hover)_[data-fold=button]]:text-foreground">
        {stands.mark}
        <span className="flex min-w-0 flex-col gap-0.5 py-1">
          {/* A press on the cut text opens it, as the button at the row's end does. Open, the
              text is only text, so it can be selected and copied. */}
          {/* biome-ignore lint/a11y/noStaticElementInteractions: the fold's button is the control; this is the pointer's shortcut to it. */}
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: the keyboard uses the button. */}
          <span
            ref={fold.text}
            id={textId}
            data-fold={fold.long && !fold.open ? 'text' : undefined}
            className={cn(
              'text-pretty text-foreground',
              !fold.open && 'line-clamp-2',
              fold.long && !fold.open && 'cursor-pointer',
            )}
            onClick={fold.long && !fold.open ? fold.toggle : undefined}
          >
            <span className="sr-only">{stands.said}: </span>
            {verdict.text}
          </span>
          {note || openable ? (
            <span className="flex min-h-4 items-center gap-1.5">
              {note ? <Text tone="faint">{note}</Text> : null}
              {openable ? (
                // Lifted out of the line's height and pulled back by its own padding, so the
                // line stays 16px and the label starts where the text does.
                <span className={cn('-my-1 flex', !note && '-ml-2')}>
                  <Button
                    type="button"
                    variant="ghost-muted"
                    size="xs"
                    onClick={() => onOpenRule(verdict.text)}
                  >
                    Open rule
                  </Button>
                </span>
              ) : null}
            </span>
          ) : null}
        </span>
        {/* Two 24px buttons side by side: under a finger each reaches 10px past its box, so they part. */}
        <span className="flex items-center pointer-coarse:gap-5">
          {fold.long ? (
            <Button
              type="button"
              variant="ghost-muted"
              size="icon-xs"
              aria-expanded={fold.open}
              aria-controls={textId}
              data-fold="button"
              aria-label={`${fold.open ? 'Show less' : 'Show all'} of ${subjectOf(verdict.text)}`}
              title={fold.open ? 'Show less' : 'Show all'}
              onClick={fold.toggle}
            >
              <ChevronRightIcon
                aria-hidden="true"
                className={cn(
                  'transition-transform duration-150 ease-out-strong motion-reduce:transition-none',
                  fold.open && 'rotate-90',
                )}
              />
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

/**
 * Whether a fact's text runs past the two lines it shows, and whether the
 * reader opened it. Read from the text as it is laid out, at every width the
 * card takes, so a short check has no fold and a rule that fits a wide card
 * loses its own.
 */
function useFold() {
  const text = useRef<HTMLSpanElement>(null)
  const [long, setLong] = useState(false)
  const [open, setOpen] = useState(false)
  useLayoutEffect(() => {
    const el = text.current
    if (!el) return
    // Open, the text is whole and says nothing of whether it would be cut: the last answer stands.
    const measure = () => {
      if (el.classList.contains('line-clamp-2')) setLong(el.scrollHeight > el.clientHeight + 1)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return { text, long, open: open && long, toggle: () => setOpen((was) => !was) }
}

function List({ children }: { children: ReactNode }) {
  return <ul className="m-0 flex list-none flex-col divide-y p-0">{children}</ul>
}

/** How many facts of a group show before the rest fold: three rows and their head fill a third of a window. */
const SHOWN = 3

/**
 * One group of facts under its name and count. A long group shows its first
 * three and folds the rest under one line that says how many, as the versions
 * list folds its older ones. A line that hid one row would save nothing, so a
 * group of four shows all four.
 */
function Group({
  title,
  rest: named,
  rows,
}: {
  title: ReactNode
  /** What the folded facts are, after their count: "9 more not sure". Under it stand Met and Does not apply, so "9 more" alone would not say of what. */
  rest: string
  rows: ReactNode[]
}) {
  const first = rows.length > SHOWN + 1 ? rows.slice(0, SHOWN) : rows
  const rest = rows.slice(first.length)
  return (
    <div>
      <Text as="p" weight="medium" className="m-0 pb-0.5">
        {title}{' '}
        <Text tone="muted" tabular>
          {rows.length}
        </Text>
      </Text>
      <List>{first}</List>
      {rest.length ? (
        // The rule over the line is the one the fourth row would have drawn.
        <div className="border-t">
          <Disclosure summary={`${rest.length} more ${named}`}>
            <List>{rest}</List>
          </Disclosure>
        </div>
      ) : null}
    </div>
  )
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
        <Group title={<Term id="missed">Missed</Term>} rest="missed" rows={rows(missed)} />
      ) : (
        <Text as="p" tone="muted" className="m-0">
          Nothing missed.
        </Text>
      )}
      {unsure.length ? (
        <Group title={<Term id="unsure">Not sure</Term>} rest="not sure" rows={rows(unsure)} />
      ) : null}
      {marked.length ? (
        <Group title="Marked as met by you" rest="marked as met" rows={rows(marked)} />
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
