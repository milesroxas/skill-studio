/**
 * All cases read on checks (`case-checks.ts`): the head that counts the cases
 * better, the same and worse, a case's change in its row, and its line in the
 * case list.
 *
 * The head is an eyebrow, three counts of cases as display numerals with a
 * word each, and one line under them: the checks the cases moved by, and the
 * count of cases compared, dotted, which opens everything else. The switch at
 * its right sets what each case's newest answer is read against, kept in the
 * address (`against`). See docs/design/layout.md.
 */
import { useRef } from 'react'
import {
  type Against,
  type CaseRead,
  casesNotes,
  checksMoved,
  compared,
  MOVE_WORD,
  moveLine,
  outcomeCounts,
} from '../case-checks.ts'
import { plural } from '../model.ts'
import { EXPLAINED, Explained } from './Help.tsx'
import { Delta, TotalDetailSection } from './Scores.tsx'
import { Segmented } from './Segmented.tsx'
import { Text } from './text.tsx'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover.tsx'

const AGAINST_OPTIONS = [
  { value: 'without', label: 'Without the skill' },
  { value: 'before', label: 'The version before' },
] as const satisfies ReadonlyArray<{ value: Against; label: string }>

const COUNTS = ['better', 'same', 'worse'] as const

/** A count's numeral: worse in red when there is one, same quieter than the news, a zero quietest. */
const countTone = (outcome: (typeof COUNTS)[number], n: number): string =>
  n === 0
    ? 'text-muted-foreground/35'
    : outcome === 'worse'
      ? 'text-destructive'
      : outcome === 'same'
        ? 'text-muted-foreground'
        : ''

/**
 * The count of cases compared, dotted: a click opens what stands behind the
 * counts. Opened by a pointer it keeps the focus off what it holds; opened
 * from the keyboard, the focus goes in.
 */
function CasesNote({ reads, against }: { reads: CaseRead[]; against: Against }) {
  const pointed = useRef(false)
  const cases = plural(reads.filter(compared).length, 'case')
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`${cases} compared: how they are counted`}
        onPointerDown={() => {
          pointed.current = true
        }}
        onKeyDown={() => {
          pointed.current = false
        }}
        className={EXPLAINED}
      >
        <Text size="xs" tone="muted" tabular>
          {cases}
        </Text>
      </PopoverTrigger>
      <PopoverContent
        size="help"
        align="start"
        onOpenAutoFocus={(event) => {
          if (pointed.current) event.preventDefault()
        }}
      >
        {casesNotes(reads, against).map((note) => (
          <TotalDetailSection key={note.title} title={note.title}>
            <Text as="p" size="xs" tone="muted" className="m-0 text-pretty">
              {note.text}
            </Text>
          </TotalDetailSection>
        ))}
      </PopoverContent>
    </Popover>
  )
}

/** The head of All cases for a skill whose cases are read on their checks. */
export function ChecksHead({
  reads,
  against,
  onAgainst,
}: {
  reads: CaseRead[]
  against: Against
  onAgainst: (against: Against) => void
}) {
  const moved = checksMoved(reads)
  const counts = outcomeCounts(reads)
  const said = COUNTS.map((c) => `${counts[c]} ${c}`).join(', ')
  return (
    <div className="flex flex-col gap-1.5 pb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Text caps tone="muted">
          Cases by checks met
        </Text>
        <Segmented
          aria-label="Read against"
          options={AGAINST_OPTIONS}
          value={against}
          onChange={onAgainst}
        />
      </div>
      <figure aria-label={`Cases by checks met: ${said}.`} className="m-0 flex">
        <div aria-hidden="true" className="flex flex-wrap items-baseline gap-x-8">
          {COUNTS.map((c) => (
            <span key={c} className="flex items-baseline gap-2">
              {/* A round digit overhangs a straight edge to look flush with the eyebrow over it. */}
              <span className={`-ml-0.5 text-display tabular-nums ${countTone(c, counts[c])}`}>
                {counts[c]}
              </span>
              <Text tone={counts[c] ? 'muted' : 'faint'}>{c}</Text>
            </span>
          ))}
        </div>
      </figure>
      <div className="flex items-baseline gap-1.5">
        <span aria-hidden="true" className="flex items-baseline gap-1.5">
          {moved ? (
            <>
              <Delta value={moved} lead={false} />
              <Text size="xs" tone="muted">
                {Math.abs(moved) === 1 ? 'check' : 'checks'}
              </Text>
            </>
          ) : (
            <Text size="xs" tone="muted">
              No change
            </Text>
          )}
          <Text size="xs" tone="faint">
            ·
          </Text>
        </span>
        <CasesNote reads={reads} against={against} />
      </div>
    </div>
  )
}

/** How a case moved, as one word: worse in red, the same quieter than a move. */
function MoveWord({ read }: { read: CaseRead }) {
  if (read.move === 'none') return null
  return (
    <Text
      size="xs"
      weight={read.move === 'same' ? undefined : 'semibold'}
      tone={read.move === 'worse' ? 'destructive' : read.move === 'same' ? 'faint' : undefined}
    >
      {MOVE_WORD[read.move]}
    </Text>
  )
}

/**
 * A compared case's change, in its row: Better, Same or Worse. A move that
 * may be chance has a dotted line that opens why.
 */
export function ChecksChange({ read }: { read: CaseRead }) {
  if (read.move === 'same' || !read.chance) return <MoveWord read={read} />
  return (
    // The row opens its case; the note is its own press.
    // biome-ignore lint/a11y/noStaticElementInteractions: only stops the row's click from reaching the row
    // biome-ignore lint/a11y/useKeyWithClickEvents: the trigger inside is a button
    <span onClick={(e) => e.stopPropagation()}>
      <Explained
        label={<MoveWord read={read} />}
        title="May be chance"
        means="This case ran once on each side and one check moved. Run it again to see if it holds."
      />
    </span>
  )
}

/**
 * A case's line in the case list: how its newest answer moved against the
 * one it is read against, in words, "Better than without the skill", worse in
 * red. A case with nothing to compare says why in a few words.
 */
export function CaseChecksLine({ read }: { read: CaseRead }) {
  const line = moveLine(read)
  if (!line) return read.why
  return read.move === 'worse' ? <Text tone="destructive">{line}</Text> : line
}
