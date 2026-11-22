/**
 * What an answer missed, in the order to fix it, then what waits for the
 * reader's mark, then what it met: the facts its score is counted from, a row
 * each, on one card under the stage.
 *
 * What to fix comes first, grouped by why it was missed (`placeMisses` in
 * `domain/fix-order.ts`), and the reason is said once, as the group's name:
 * the skill never opened, a check missed with no rule broken, a check missed
 * beside a broken rule, a rule broken. A group whose fix is the skill as a
 * whole has one action on its head, Open skill, and none on its rows. Then
 * what Jev was not sure of, did not read, or nobody can mark: each waits for
 * the reader and is in no score until they answer. Met folds away under its
 * count, and so does what does not apply.
 *
 * Where both answers are in view the list is the later one's, and a row names
 * the other only where it stands otherwise ("A met this"), and on rules only
 * where that answer was held to them.
 *
 * A rule carries its reason, so it runs to 400 characters and more, and a
 * list of thirty of them is a wall. A row shows two lines, enough to say
 * which rule it is, and opens in place to the whole of it. An open group
 * shows its first three rows and folds the rest under one line.
 *
 * Each row has one action in the line under its text, named by what it does:
 * a row waiting for the reader's mark offers the mark, "Mark as met" and
 * "Mark as missed"; any other offers where its fix is, "Open rule" or "Edit
 * case". Everything a row can do is in its menu too, and on a right-click.
 */
import { weightMark } from '@domain/case-draft.ts'
import { FIX_ORDER, type MissReason, placeMisses } from '@domain/fix-order.ts'
import { isMissed, packAnswer, type Verdict } from '@domain/pack.ts'
import { factKey } from '@domain/verdict.ts'
import {
  CheckIcon,
  ChevronRightIcon,
  FileTextIcon,
  MinusIcon,
  PencilIcon,
  Undo2Icon,
  XIcon,
} from 'lucide-react'
import { type ReactNode, useId, useLayoutEffect, useRef, useState } from 'react'
import { cn } from '../lib/utils.ts'
import { kindOfPart, partLabel } from '../model.ts'
import { answerNote } from '../verdict-notes.ts'
import { Disclosure } from './Disclosure.tsx'
import { Term } from './Help.tsx'
import { ContextActions, MoreActions, PartActions, RowAction } from './RowActions.tsx'
import { Text } from './text.tsx'
import { badgeVariants } from './ui/badge.tsx'
import { Button } from './ui/button.tsx'

const KIND = { rule: 'Rule', check: 'Check', other: null } as const

/**
 * How a fact stands, as its row's mark and the words the mark repeats. The
 * mark is a chip: met and missed are verdicts and take their tint, and a fact
 * set aside is no verdict, so its chip is plain.
 */
const STANDING = {
  met: { said: 'Met', chip: 'success', icon: <CheckIcon aria-hidden="true" /> },
  missed: { said: 'Missed', chip: 'danger', icon: <XIcon aria-hidden="true" /> },
  unsure: { said: 'Not sure', chip: 'secondary', icon: <MinusIcon aria-hidden="true" /> },
  unread: { said: 'Not read', chip: 'secondary', icon: <MinusIcon aria-hidden="true" /> },
  unmarkable: {
    said: 'Cannot be marked',
    chip: 'secondary',
    icon: <MinusIcon aria-hidden="true" />,
  },
  inapplicable: {
    said: 'Does not apply',
    chip: 'secondary',
    icon: <MinusIcon aria-hidden="true" />,
  },
} as const

/**
 * A mark the reader can answer: the ring a score's chip takes when pointed at
 * or open says it is pressed at. Its 20px box reaches 2px past itself.
 */
const MARK_BUTTON =
  'relative cursor-default duration-150 ease-out before:absolute before:-inset-0.5 hover:ring-2 hover:ring-border data-[state=open]:ring-2 data-[state=open]:ring-border pointer-coarse:before:-inset-y-3'

type Standing = keyof typeof STANDING

const standingOf = (verdict: Verdict): Standing => verdict.aside ?? (verdict.met ? 'met' : 'missed')

/** What a group of misses is called, by why they were missed; `many` where it holds more than one row. */
const REASON: Record<MissReason, (many: boolean) => string> = {
  unopened: () => 'The skill was never opened',
  followed: (many) =>
    many
      ? 'No rule was broken, and checks were still missed'
      : 'No rule was broken, and a check was still missed',
  'also-broken': () => 'A rule was broken on this answer too',
  broken: (many) => (many ? 'Rules were broken' : 'A rule was broken'),
}

/** A group whose fix is the skill as a whole: Open skill on its head, nothing on its rows. */
const WHOLE_SKILL: ReadonlySet<MissReason> = new Set(['unopened', 'followed'])

/** The other answer in view, set beside this one's rows. */
export interface OtherAnswer {
  letter: string
  verdicts: readonly Verdict[]
  /** It was held to the skill's rules: written with the skill, and the skill was opened. */
  heldToRules: boolean
}

export interface VerdictsProps {
  verdicts: readonly Verdict[]
  /** Say the fact is met, or missed, whatever Jev said; null takes the answer back. */
  onCorrect: (verdict: Verdict, met: boolean | null) => void
  /** The id of the fact whose answer is being saved: every answer waits. */
  pending: string | null
  /** Written with the skill: an answer without it was held to no rule, so its list has none. */
  withSkill: boolean
  /** Its transcript shows the skill read; null where that is not known. */
  opened: boolean | null
  other: OtherAnswer | null
  /** Whether a rule's text is one SKILL.md still holds, and the way to it. */
  ruleStands: (text: string) => boolean
  onOpenRule: (text: string) => void
  onOpenSkill: () => void
  /** The case's own screen; null for a case since deleted. */
  onEditCase: (() => void) | null
}

/** Where a row's fix is: the one action it shows, besides an answer. */
interface Go {
  label: string
  icon: ReactNode
  run: () => void
}

/** A fact by the first words of its text, so a screen reader hears which row a menu is for. */
const subjectOf = (text: string): string =>
  text.length > 48 ? `${text.slice(0, 47).trimEnd()}…` : text

interface Answer {
  label: string
  icon: ReactNode
  met: boolean | null
}

/** The answers the reader may give on a fact: either, on one set aside; the other one, on one Jev or code answered. */
function answersOf(verdict: Verdict): Answer[] {
  if (!verdict.open) return []
  const asMet = { label: 'Mark as met', icon: <CheckIcon aria-hidden="true" />, met: true }
  const asMissed = { label: 'Mark as missed', icon: <XIcon aria-hidden="true" />, met: false }
  if (verdict.corrected)
    return [{ label: 'Take back', icon: <Undo2Icon aria-hidden="true" />, met: null }]
  return verdict.aside ? [asMet, asMissed] : [verdict.met ? asMissed : asMet]
}

/**
 * The line under a fact: its kind where the list mixes kinds or it counts more
 * than once, the part a kind of work adds, how the app checked it or why
 * nobody can mark it, the reader's answer, how the other answer stands where
 * it stands otherwise, and a save on the way.
 */
function noteOf(
  verdict: Verdict,
  mixed: boolean,
  other: { letter: string; verdict: Verdict } | null,
  saving: boolean,
): string {
  const kind = KIND[verdict.kind]
  const parts: string[] = []
  if (kind && (mixed || verdict.weight))
    parts.push(verdict.weight ? `${kind} ${weightMark(verdict.weight)}` : kind)
  // A fact a kind of work adds, such as Look, always names its part: it is no rule or check of the reader's.
  if (!kind && verdict.layer && kindOfPart(verdict.layer)) parts.push(partLabel(verdict.layer))
  const answered = answerNote(verdict)
  if (answered) parts.push(answered)
  if (verdict.corrected) {
    // The answer is the reader's even where Jev or the app, under the skill's threshold, now says the same.
    const agrees = packAnswer(verdict) === verdict.met
    parts.push(
      `your answer${agrees ? (verdict.code?.stands ? ', agrees with the app' : ', agrees with Jev') : ''}`,
    )
  }
  if (other) {
    const s = standingOf(other.verdict)
    parts.push(
      s === 'met'
        ? `${other.letter} met this`
        : s === 'missed'
          ? `${other.letter} missed this`
          : `${STANDING[s].said} on ${other.letter}`,
    )
  }
  if (saving) parts.push('Saving…')
  return parts.join(' · ')
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

function Row({
  verdict,
  mixed,
  other,
  go,
  marks,
  pending,
  onCorrect,
}: {
  verdict: Verdict
  /** The list holds both rules and checks, so each row names its kind. */
  mixed: boolean
  /** The other answer's letter and how it stands, where it stands otherwise. */
  other: { letter: string; verdict: Verdict } | null
  /** Where the fix is; null where the group's head says, or there is nowhere to go. */
  go: Go | null
  /** The row waits for the reader's mark, so the mark is its action. */
  marks: boolean
  pending: string | null
  onCorrect: (verdict: Verdict, met: boolean | null) => void
}) {
  const waiting = pending != null
  const subject = subjectOf(verdict.text)
  const answers = answersOf(verdict)
  const answerRows = answers.map((answer) => (
    <RowAction
      key={answer.label}
      icon={answer.icon}
      disabled={waiting}
      onSelect={() => onCorrect(verdict, answer.met)}
    >
      {answer.label}
    </RowAction>
  ))
  const goRow = go ? (
    <RowAction icon={go.icon} onSelect={go.run}>
      {go.label}
    </RowAction>
  ) : null
  const { said, chip, icon } = STANDING[standingOf(verdict)]
  const look = cn(badgeVariants({ variant: chip }), 'size-5 p-0')
  const note = noteOf(verdict, mixed, other, pending === verdict.id)
  // The line's one action: the mark on a row that waits for one, else where the fix is.
  const inline: Array<{ label: string; run: () => void; disabled?: boolean }> =
    marks && answers.length
      ? answers.map((answer) => ({
          label: answer.label,
          run: () => onCorrect(verdict, answer.met),
          disabled: waiting,
        }))
      : go
        ? [{ label: go.label, run: go.run }]
        : []
  const fold = useFold()
  const textId = useId()
  const menu =
    goRow || answerRows.length ? (
      <>
        {goRow}
        {answerRows}
      </>
    ) : null
  return (
    <ContextActions subject={subject} actions={menu}>
      {/* While the pointer rests on the cut text, the fold's button lights as if pointed at
          itself: a press on either does the same. */}
      <li className="held grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2 py-1 [&:has([data-fold=text]:hover)_[data-fold=button]]:bg-accent [&:has([data-fold=text]:hover)_[data-fold=button]]:text-foreground">
        {/* The mark stands on the text's first line, 2px down so the chip is centered on it. */}
        <span className="mt-0.5 flex shrink-0">
          {answerRows.length ? (
            <PartActions subject={subject} actions={answerRows}>
              <button
                type="button"
                aria-label={`${said}: change the answer on ${subject}`}
                title="Change the answer"
                className={cn(look, MARK_BUTTON)}
              >
                {icon}
              </button>
            </PartActions>
          ) : (
            <span aria-hidden="true" title={said} className={look}>
              {icon}
            </span>
          )}
        </span>
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
            <span className="sr-only">{said}: </span>
            {verdict.text}
          </span>
          {note || inline.length ? (
            // A button is lifted out of the line's height and pulled back by its own padding, so
            // the line stays 16px and a label that wraps starts where the text does.
            <span className="flex min-h-4 flex-wrap items-center gap-x-3.5">
              {note ? <Text tone="faint">{note}</Text> : null}
              {inline.length ? (
                <span className="-my-1 -ml-2 flex">
                  {inline.map((action) => (
                    <Button
                      key={action.label}
                      type="button"
                      variant="ghost-muted"
                      size="xs"
                      disabled={action.disabled}
                      onClick={action.run}
                    >
                      {action.label}
                    </Button>
                  ))}
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
              aria-label={`${fold.open ? 'Show less' : 'Show all'} of ${subject}`}
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
          <MoreActions subject={subject} size="xs">
            {menu}
          </MoreActions>
        </span>
      </li>
    </ContextActions>
  )
}

function List({ children }: { children: ReactNode }) {
  return <ul className="m-0 flex list-none flex-col divide-y p-0">{children}</ul>
}

/** How many facts of a group show before the rest fold: three rows and their head fill a third of a window. */
const SHOWN = 3

/**
 * One group of facts under its name. A long group shows its first three and
 * folds the rest under one line that says how many, as the versions list
 * folds its older ones. A line that hid one row would save nothing, so a
 * group of four shows all four.
 */
function Group({
  title,
  rest: named,
  rows,
  action,
}: {
  title: ReactNode
  /** What the folded facts are, after their count: "9 more not sure". Met and Does not apply stand under it, so "9 more" alone would not say of what. */
  rest: string
  rows: ReactNode[]
  /** The group's one action, where every row in it is fixed in the same place. */
  action?: Go | null
}) {
  const first = rows.length > SHOWN + 1 ? rows.slice(0, SHOWN) : rows
  const rest = rows.slice(first.length)
  return (
    <div>
      <div className="flex items-center gap-2 pb-0.5">
        <Text as="p" weight="medium" className="m-0">
          {title}
        </Text>
        {action ? (
          <span className="-my-1 ml-auto flex">
            <Button type="button" variant="ghost-muted" size="xs" onClick={action.run}>
              {action.label}
            </Button>
          </span>
        ) : null}
      </div>
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

/** Where a fact stands in the list after what to fix. */
type Rest = 'unsure' | 'unread' | 'unmarkable' | 'marked' | 'met' | 'elsewhere'

function restOf(verdict: Verdict): Rest | null {
  if (isMissed(verdict)) return null
  if (verdict.aside === 'inapplicable') return 'elsewhere'
  if (verdict.aside) return verdict.aside
  // A fact the reader marked as met stays in view, with the way to take the answer back:
  // folded away with the rest, their own correction would be the one thing they could not find.
  return verdict.corrected ? 'marked' : 'met'
}

/** What one answer missed, in the order to fix it, and the rest of its facts after. */
export function Verdicts({
  verdicts: all,
  onCorrect,
  pending,
  withSkill,
  opened,
  other,
  ruleStands,
  onOpenRule,
  onOpenSkill,
  onEditCase,
}: VerdictsProps) {
  // An answer without the skill never saw the rules: they are not in its list.
  const verdicts = withSkill ? all : all.filter((v) => v.kind !== 'rule')
  if (!verdicts.length) return null
  const mixed = new Set(verdicts.map((v) => KIND[v.kind]).filter(Boolean)).size > 1
  const openSkill: Go = {
    label: 'Open skill',
    icon: <FileTextIcon aria-hidden="true" />,
    run: onOpenSkill,
  }
  const goOf = (v: Verdict): Go | null =>
    v.kind === 'rule' && ruleStands(v.text)
      ? {
          label: 'Open rule',
          icon: <FileTextIcon aria-hidden="true" />,
          run: () => onOpenRule(v.text),
        }
      : v.kind === 'check' && onEditCase
        ? { label: 'Edit case', icon: <PencilIcon aria-hidden="true" />, run: onEditCase }
        : null
  // The other answer is named on a row only where it stands otherwise, and on a rule only where it was held to rules.
  const otherOf = (v: Verdict) => {
    if (!other || (v.kind === 'rule' && !other.heldToRules)) return null
    const key = factKey(v.layer, v.id)
    const theirs = other.verdicts.find((o) => factKey(o.layer, o.id) === key)
    return theirs && standingOf(theirs) !== standingOf(v)
      ? { letter: other.letter, verdict: theirs }
      : null
  }
  const row = (v: Verdict, i: number, go: Go | null, marks = false) => (
    <Row
      // Two rules of one skill may read the same, so a fact's place in the list is part of its key.
      key={`${factKey(v.layer, v.id)}#${i}`}
      verdict={v}
      mixed={mixed}
      other={otherOf(v)}
      go={go}
      marks={marks}
      pending={pending}
      onCorrect={onCorrect}
    />
  )

  const placed = withSkill ? placeMisses(verdicts, opened) : []
  const placedIds = new Set(placed.map((m) => m.verdict.id))
  // Misses no reason places: an answer without the skill's, and a part a kind of work adds.
  const loose = verdicts.filter((v) => isMissed(v) && !placedIds.has(v.id))
  const fix = FIX_ORDER.map((why) => ({
    why,
    rows: placed.filter((m) => m.why === why).map((m) => m.verdict),
  })).filter((g) => g.rows.length)
  const rest = (kind: Rest) => verdicts.filter((v) => restOf(v) === kind)
  const unsure = rest('unsure')
  const unread = rest('unread')
  const unmarkable = rest('unmarkable')
  const marked = rest('marked')
  const met = rest('met')
  const elsewhere = rest('elsewhere')
  const toDo = fix.length + loose.length + unsure.length + unread.length + unmarkable.length

  return (
    <div className="flex flex-col gap-2 border-b px-4 py-2.5 text-xs">
      {fix.map((g) => {
        const whole = WHOLE_SKILL.has(g.why)
        return (
          <Group
            key={g.why}
            title={REASON[g.why](g.rows.length > 1)}
            rest="to fix"
            action={whole ? openSkill : null}
            rows={g.rows.map((v, i) => row(v, i, whole ? null : goOf(v)))}
          />
        )
      })}
      {loose.length ? (
        <Group
          title={<Term id="missed">Missed</Term>}
          rest="missed"
          rows={loose.map((v, i) => row(v, i, goOf(v)))}
        />
      ) : null}
      {unsure.length ? (
        <Group
          title={<Term id="unsure">Not sure</Term>}
          rest="not sure"
          rows={unsure.map((v, i) => row(v, i, goOf(v), true))}
        />
      ) : null}
      {unread.length ? (
        <Group
          title={<Term id="unread">Not read</Term>}
          rest="not read"
          rows={unread.map((v, i) => row(v, i, goOf(v), true))}
        />
      ) : null}
      {unmarkable.length ? (
        // Its fix is the words of the rule or check, so its action is where they are, and the mark waits in the menu.
        <Group
          title={<Term id="unmarkable">Cannot be marked</Term>}
          rest="cannot be marked"
          rows={unmarkable.map((v, i) => row(v, i, goOf(v)))}
        />
      ) : null}
      {toDo ? null : (
        <Text as="p" tone="muted" className="m-0">
          Nothing to fix.
        </Text>
      )}
      {marked.length ? (
        <Group
          title="Marked as met by you"
          rest="marked as met"
          rows={marked.map((v, i) => row(v, i, goOf(v)))}
        />
      ) : null}
      {met.length ? (
        <Disclosure summary={`Met ${met.length}`}>
          <List>{met.map((v, i) => row(v, i, goOf(v)))}</List>
        </Disclosure>
      ) : null}
      {elsewhere.length ? (
        <Disclosure summary={`Does not apply ${elsewhere.length}`}>
          <List>{elsewhere.map((v, i) => row(v, i, goOf(v)))}</List>
        </Disclosure>
      ) : null}
    </div>
  )
}
