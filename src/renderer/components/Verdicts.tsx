/**
 * What an output missed, and what it met: the facts its score is counted
 * from, a row each. Missed comes first and stays open: each miss is a rule
 * of the skill or a check of the case that the output did not follow. Then
 * what Jev was not sure of, open too, since each waits for the reader and is
 * in no score until they answer. Met folds away under its count, and so does
 * what does not apply: a rule for another kind of work than this output, or
 * one that does not come up for what its case asks.
 *
 * Two outputs read together share one list (`PairVerdicts`): a row a fact,
 * with A's mark and B's side by side, so a fact is read once and a
 * difference between the two is seen in its row. A fact stands in the first
 * group either output puts it in, and in Missed the facts only one of them
 * missed come first: they are what moved the score.
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
import type { Verdict } from '@domain/pack.ts'
import { factKey } from '@domain/verdict.ts'
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
import {
  ContextActions,
  MoreActions,
  PartActions,
  RowAction,
  RowActionGroup,
} from './RowActions.tsx'
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
  inapplicable: {
    said: 'Does not apply',
    chip: 'secondary',
    icon: <MinusIcon aria-hidden="true" />,
  },
} as const

/** A mark's box: 20px square, the height of the line of text it stands on and 2px a side. */
const MARK = 'size-5 p-0'

/**
 * A mark the reader can answer: the ring a score's chip takes when pointed at
 * or open says it is pressed at. Its 20px box reaches 2px past itself, so two
 * side by side are 24px each to press and never overlap.
 */
const MARK_BUTTON =
  'relative cursor-default duration-150 ease-out before:absolute before:-inset-0.5 hover:ring-2 hover:ring-border data-[state=open]:ring-2 data-[state=open]:ring-border pointer-coarse:before:-inset-y-3'

type Standing = keyof typeof STANDING

const standingOf = (verdict: Verdict): Standing => verdict.aside ?? (verdict.met ? 'met' : 'missed')

/** One output's answers on the facts of a list. */
interface Side {
  verdicts: Verdict[]
  /** Say the fact is met, or missed, whatever Jev said; null takes the answer back. */
  onCorrect?: (verdict: Verdict, met: boolean | null) => void
  /** The id of the fact whose answer is being saved: every answer waits. */
  pending?: string | null
}

/** A fact as one output stands on it; `verdict` is null for a fact the output was not marked on. */
interface Stand {
  /** The output's letter, where two share the list. */
  letter: string | null
  verdict: Verdict | null
  side: Side
}

/** One row: a fact, and how each output in the list stands on it. */
interface Fact {
  key: string
  /** The fact as the first output that holds it words it. */
  verdict: Verdict
  stands: Stand[]
}

interface Actions {
  /** A rule that still stands in SKILL.md as it is written here: open it in the editor. */
  onOpenRule?: (text: string) => void
  /** Whether a rule's text is one SKILL.md still holds. */
  ruleStands?: (text: string) => boolean
}

/** The group a fact stands in: the first, in the list's order, that any output puts it in. */
type GroupId = 'missed' | 'unsure' | 'marked' | 'met' | 'elsewhere'

function groupOf(fact: Fact): GroupId {
  const held = fact.stands.flatMap((stand) => stand.verdict ?? [])
  const stands = held.map(standingOf)
  if (stands.includes('missed')) return 'missed'
  if (stands.includes('unsure')) return 'unsure'
  // A fact the reader marked as met stays in view, with the way to take the answer back:
  // folded away with the rest, their own correction would be the one thing they could not find.
  if (held.some((verdict) => verdict.met && verdict.corrected)) return 'marked'
  return stands.includes('met') ? 'met' : 'elsewhere'
}

/**
 * Where a missed fact comes among the missed of two outputs: what only the
 * later one missed, then what only the earlier one did, then the rest. The
 * first two are what moved the score, and a drop is read before a gain.
 */
function movedRank(fact: Fact): number {
  if (fact.stands.length < 2) return 0
  const [a, b] = fact.stands.map((stand) => (stand.verdict ? standingOf(stand.verdict) : null))
  if (b === 'missed' && a === 'met') return 0
  if (a === 'missed' && b === 'met') return 1
  return 2
}

/** The line under a fact: its kind where the list mixes kinds or it counts more than once, the part a kind of work adds, the reader's answer, a save on the way. */
function noteOf(fact: Fact, mixed: boolean): string {
  const { verdict } = fact
  const kind = KIND[verdict.kind]
  const parts: string[] = []
  if (kind && (mixed || verdict.weight))
    parts.push(verdict.weight ? `${kind} ${weightMark(verdict.weight)}` : kind)
  // A fact a kind of work adds, such as Look, always names its part: it is no rule or check of the reader's.
  if (!kind && verdict.layer && kindOfPart(verdict.layer)) parts.push(partLabel(verdict.layer))
  const answered = fact.stands.filter((stand) => stand.verdict?.corrected)
  if (answered.length) {
    // The answer is the reader's even where Jev, under the skill's threshold, now says the same.
    const agrees = answered.every((stand) => stand.verdict?.jev === stand.verdict?.met)
    const where =
      fact.stands.length < 2 ? '' : answered.length > 1 ? ' on both' : ` on ${answered[0].letter}`
    parts.push(`your answer${where}${agrees ? ', agrees with Jev' : ''}`)
  }
  if (fact.stands.some((stand) => stand.verdict && stand.side.pending === stand.verdict.id))
    parts.push('Saving…')
  return parts.join(' · ')
}

/** A fact by the first words of its text, so a screen reader hears which row a menu is for. */
const subjectOf = (text: string): string =>
  text.length > 48 ? `${text.slice(0, 47).trimEnd()}…` : text

/**
 * The answers the reader may give on one output's fact, as the menu's rows.
 * Beside another output's they stand under a heading that names the output
 * and how it stands now, so the rows read the same as in a list of one:
 * "Mark as met".
 */
function answersOf(stand: Stand, waiting: boolean): ReactNode {
  const { verdict, side, letter } = stand
  if (!verdict?.open || !side.onCorrect) return null
  const onCorrect = side.onCorrect
  const asMet = { label: 'Mark as met', icon: <CheckIcon aria-hidden="true" />, met: true }
  const asMissed = { label: 'Mark as missed', icon: <XIcon aria-hidden="true" />, met: false }
  // A fact set aside is neither met nor missed, so the reader may give either answer.
  const answers: Array<{ label: string; icon: ReactNode; met: boolean | null }> = verdict.corrected
    ? [{ label: 'Take back', icon: <Undo2Icon aria-hidden="true" />, met: null }]
    : verdict.aside
      ? [asMet, asMissed]
      : [verdict.met ? asMissed : asMet]
  const rows = answers.map((answer) => (
    <RowAction
      key={answer.label}
      icon={answer.icon}
      disabled={waiting}
      onSelect={() => onCorrect(verdict, answer.met)}
    >
      {answer.label}
    </RowAction>
  ))
  if (!letter) return rows
  const stands = `${STANDING[standingOf(verdict)].said}${verdict.corrected ? ', your answer' : ''}`
  return (
    <RowActionGroup key={letter} heading={`Output ${letter} · ${stands}`}>
      {rows}
    </RowActionGroup>
  )
}

/**
 * How one output stands on a fact: a chip in its column. Where the reader can
 * answer the fact the chip is the button that opens the answers, on this
 * output alone. A fact the output was not marked on keeps the chip's room
 * empty, so the columns hold.
 */
function Mark({ stand, subject, waiting }: { stand: Stand; subject: string; waiting: boolean }) {
  const { verdict, letter } = stand
  if (!verdict) return <span aria-hidden="true" className="size-5" />
  const { said, chip, icon } = STANDING[standingOf(verdict)]
  const look = cn(badgeVariants({ variant: chip }), MARK)
  const answers = answersOf(stand, waiting)
  if (!answers)
    return (
      <span aria-hidden="true" title={letter ? `${letter}: ${said}` : said} className={look}>
        {icon}
      </span>
    )
  const whose = letter ? `Output ${letter}, ${said.toLowerCase()}` : said
  return (
    <PartActions subject={letter ? `output ${letter} on ${subject}` : subject} actions={answers}>
      <button
        type="button"
        aria-label={`${whose}: change the answer on ${subject}`}
        title={letter ? `Change ${letter}’s answer` : 'Change the answer'}
        className={cn(look, MARK_BUTTON)}
      >
        {icon}
      </button>
    </PartActions>
  )
}

/** How one output stands on a fact, for a screen reader: "Missed", or "A missed" beside another. */
function saidOf(stand: Stand): string {
  const said = stand.verdict ? STANDING[standingOf(stand.verdict)].said : 'Not marked'
  return stand.letter ? `${stand.letter} ${said.toLowerCase()}` : said
}

function Row({
  fact,
  mixed,
  actions,
}: {
  fact: Fact
  /** The list holds both rules and checks, so each row names its kind. */
  mixed: boolean
  actions: Actions
}) {
  const { onOpenRule, ruleStands } = actions
  const { verdict, stands } = fact
  const waiting = stands.some((stand) => stand.side.pending != null)
  const note = noteOf(fact, mixed)
  const openable = verdict.kind === 'rule' && onOpenRule && (ruleStands?.(verdict.text) ?? false)
  const answers = stands.flatMap((stand) => answersOf(stand, waiting) ?? [])
  const answerAction = answers.length ? answers : null
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
      <li className="held grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2 py-1 [&:has([data-fold=text]:hover)_[data-fold=button]]:bg-accent [&:has([data-fold=text]:hover)_[data-fold=button]]:text-foreground">
        {/* The marks stand on the text's first line: a chip an output, in one column each, under
            the letter its group's head gives the column. */}
        <span className={MARKS}>
          {stands.map((stand) => (
            <Mark
              key={stand.letter ?? ''}
              stand={stand}
              subject={subjectOf(verdict.text)}
              waiting={waiting}
            />
          ))}
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
            <span className="sr-only">{stands.map(saidOf).join(', ')}: </span>
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

/** The marks of a row, and the letters over them: 20px columns, 4px apart, 2px down so a chip is centered on its line. */
const MARKS = 'mt-0.5 flex shrink-0 gap-1'

/**
 * The letters of the outputs a list is shared by, each over its column of
 * marks. Said once a group, never on every row: a letter read thirty times
 * is noise, and a column is found by its place.
 */
function Letters({ letters }: { letters: readonly string[] }) {
  return (
    <span aria-hidden="true" className="flex shrink-0 gap-1">
      {letters.map((letter) => (
        <span
          key={letter}
          className="w-5 text-center font-mono text-2xs leading-none font-semibold text-muted-foreground"
        >
          {letter}
        </span>
      ))}
    </span>
  )
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
  letters,
}: {
  title: ReactNode
  /** What the folded facts are, after their count: "9 more not sure". Under it stand Met and Does not apply, so "9 more" alone would not say of what. */
  rest: string
  rows: ReactNode[]
  /** The outputs the list is shared by: their letters head the columns of marks, and the name starts where the facts do. */
  letters: readonly string[]
}) {
  const first = rows.length > SHOWN + 1 ? rows.slice(0, SHOWN) : rows
  const rest = rows.slice(first.length)
  return (
    <div>
      <div className="flex items-center gap-2 pb-0.5">
        {letters.length ? <Letters letters={letters} /> : null}
        <Text as="p" weight="medium" className="m-0">
          {title}{' '}
          <Text tone="muted" tabular>
            {rows.length}
          </Text>
        </Text>
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

/** Each fact of one output as a row of its own. */
const factsOf = (side: Side, letter: string | null): Fact[] =>
  side.verdicts.map((verdict, index) => ({
    // Two rules of one skill may read the same, so a fact's place in the list is part of its key.
    key: `${factKey(verdict.layer, verdict.id)}#${index}`,
    verdict,
    stands: [{ letter, verdict, side }],
  }))

/**
 * The facts of two outputs as one list, a row each: the later output's in its
 * order, then what only the earlier one was marked on. Two facts are one when
 * they count in the same part of the score and read the same; two rules of one
 * output that read the same are told apart by which comes first.
 */
function pairedFacts(a: Side, b: Side): Fact[] {
  const keyed = (side: Side) => {
    const seen = new Map<string, number>()
    return side.verdicts.map((verdict) => {
      const name = factKey(verdict.layer, verdict.id)
      const nth = seen.get(name) ?? 0
      seen.set(name, nth + 1)
      return { key: `${name}#${nth}`, verdict }
    })
  }
  const inA = keyed(a)
  const inB = keyed(b)
  const earlier = new Map(inA.map((entry) => [entry.key, entry.verdict]))
  const later = new Set(inB.map((entry) => entry.key))
  const row = (key: string, ofA: Verdict | null, ofB: Verdict | null): Fact => ({
    key,
    verdict: (ofB ?? ofA) as Verdict,
    stands: [
      { letter: 'A', verdict: ofA, side: a },
      { letter: 'B', verdict: ofB, side: b },
    ],
  })
  return [
    ...inB.map((entry) => row(entry.key, earlier.get(entry.key) ?? null, entry.verdict)),
    ...inA
      .filter((entry) => !later.has(entry.key))
      .map((entry) => row(entry.key, entry.verdict, null)),
  ]
}

/** The groups of a list, in their order, from its facts. */
function Listed({ facts, actions }: { facts: Fact[]; actions: Actions }) {
  if (!facts.length) return null
  const mixed =
    new Set(
      facts
        .flatMap((fact) => fact.stands.flatMap((stand) => stand.verdict ?? []))
        .map((verdict) => KIND[verdict.kind])
        .filter(Boolean),
    ).size > 1
  const rows = (group: GroupId) => {
    const of = facts.filter((fact) => groupOf(fact) === group)
    // Sorting keeps the order of facts that rank the same, so one output's list stays as graded.
    const ordered = group === 'missed' ? [...of].sort((x, y) => movedRank(x) - movedRank(y)) : of
    return ordered.map((fact) => <Row key={fact.key} fact={fact} mixed={mixed} actions={actions} />)
  }
  const missed = rows('missed')
  const unsure = rows('unsure')
  const marked = rows('marked')
  const met = rows('met')
  const elsewhere = rows('elsewhere')
  /** The letters of a shared list's outputs, in the order of their columns; none for a list of one. */
  const letters = (facts[0]?.stands ?? []).flatMap((stand) => stand.letter ?? [])
  // A folded group has no head to give its columns their letters, so it opens with them.
  const folded = (list: ReactNode[]) => (
    <>
      {letters.length ? (
        <div className="pt-1">
          <Letters letters={letters} />
        </div>
      ) : null}
      <List>{list}</List>
    </>
  )
  return (
    <div className="flex flex-col gap-2 border-b px-4 py-2.5 text-xs">
      {missed.length ? (
        <Group
          title={<Term id="missed">Missed</Term>}
          rest="missed"
          rows={missed}
          letters={letters}
        />
      ) : (
        <Text as="p" tone="muted" className="m-0">
          Nothing missed.
        </Text>
      )}
      {unsure.length ? (
        <Group
          title={<Term id="unsure">Not sure</Term>}
          rest="not sure"
          rows={unsure}
          letters={letters}
        />
      ) : null}
      {marked.length ? (
        <Group title="Marked as met by you" rest="marked as met" rows={marked} letters={letters} />
      ) : null}
      {met.length ? <Disclosure summary={`Met ${met.length}`}>{folded(met)}</Disclosure> : null}
      {elsewhere.length ? (
        <Disclosure summary={`Does not apply ${elsewhere.length}`}>{folded(elsewhere)}</Disclosure>
      ) : null}
    </div>
  )
}

/** What one output missed and met. */
export function Verdicts({ onOpenRule, ruleStands, ...side }: Side & Actions) {
  return <Listed facts={factsOf(side, null)} actions={{ onOpenRule, ruleStands }} />
}

/** What two outputs missed and met, each fact once with a mark a side. */
export function PairVerdicts({ a, b, ...actions }: { a: Side; b: Side } & Actions) {
  return <Listed facts={pairedFacts(a, b)} actions={actions} />
}
