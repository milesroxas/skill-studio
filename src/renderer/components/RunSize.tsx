/**
 * How big a run of a case is, shown while the case is written: the scale the
 * file size meter uses, a word for the level, and behind one line what adds
 * to it. A larger run takes longer and costs more; the reader is told the
 * size, since the time and the money also turn on the model picked at the run.
 * The level and its parts come from `caseWeight()` in `domain/case-weight.ts`;
 * this file gives them their words.
 *
 * It shows in one of three places, by the room the case's column has: in the
 * header as the meter (`RunSizeMeter`), beside the form (`RunSizeRail`), or over the
 * last answer (`RunSizeStrip`). Never two at once.
 *
 * A large run is worth a look, never broken: the top of the scale is amber,
 * where the file size meter's is red.
 */
import { type CaseWeight, caseWeight, type WeightPart } from '@domain/case-weight.ts'
import type { InputEntry } from '@domain/inputs.ts'
import type { CaseDraft } from '@domain/schemas.ts'
import { useState } from 'react'
import { type AttemptCost, duration, money, plural } from '../model.ts'
import { Disclosure } from './Disclosure.tsx'
import { SplitSection } from './layout.tsx'
import { LevelBars } from './Meter.tsx'
import { Text, VisuallyHidden } from './text.tsx'
import { Button } from './ui/button.tsx'
import {
  HoverCard,
  HoverCardContent,
  HoverCardSection,
  HoverCardTrigger,
} from './ui/hover-card.tsx'

const WORD = ['Small', 'Small', 'Medium', 'Large', 'Very large'] as const

/** One thing that adds to the size, in the reader's words. */
interface SizeLine {
  part: WeightPart
  label: string
  /** Why it adds. */
  why: string
  points: number
}

/** The size of a case's run as it is shown. */
export interface RunSize {
  weight: CaseWeight
  /** "Large" */
  word: string
  /** Heaviest first. */
  lines: SizeLine[]
  /** The two things the writer added that count most, said only once the run is past small. */
  mostly: string | null
}

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)

/** The size of a case's run as its form stands, saved or not. */
export function runSize(
  draft: CaseDraft,
  inputs: InputEntry[],
  /** Whether the answer is a page or a picture, and which when the case says. */
  answer: { drawn: boolean; work: 'html' | 'image' | null },
): RunSize {
  const files = inputs.reduce((n, entry) => n + entry.files, 0)
  const pictures = draft.images.length
  const weight = caseWeight({ prompt: draft.prompt, pictures, files, drawn: answer.drawn })
  const folder = inputs.length === 1 && inputs[0]?.folder
  const said: Record<WeightPart, Omit<SizeLine, 'part' | 'points'>> = {
    base: { label: 'Writing the answer', why: 'Every case reads the skill and writes an answer.' },
    prompt: { label: 'The prompt', why: 'A long request takes longer to read.' },
    pictures: {
      label: plural(pictures, 'picture'),
      why: 'Each is looked at while the answer is written.',
    },
    files: {
      label: folder ? `A folder of ${plural(files, 'file')}` : plural(files, 'file'),
      why: 'Read while the answer is written.',
    },
    drawn: {
      label:
        answer.work === 'image'
          ? 'A picture as the answer'
          : answer.work === 'html'
            ? 'A page as the answer'
            : 'A page or picture as the answer',
      why: 'It takes several times the writing a note does.',
    },
  }
  const lines = weight.parts.map((p) => ({ ...p, ...said[p.part] }))
  const top = lines.filter((line) => line.part !== 'base').slice(0, 2)
  return {
    weight,
    word: WORD[weight.level - 1] ?? 'Small',
    lines,
    mostly:
      weight.level >= 3 && top.length
        ? `Mostly ${top.map((line) => lowerFirst(line.label)).join(' and ')}.`
        : null,
  }
}

const toneOf = (size: RunSize) => (size.weight.band === 'fine' ? undefined : 'warning')
const fillOf = (size: RunSize) => (size.weight.band === 'fine' ? 'fine' : 'warning')

/** The whole of it in a sentence, for a screen reader. */
const spoken = (size: RunSize) =>
  `Run size: ${size.word}, ${size.weight.level} of 5.${size.mostly ? ` ${size.mostly}` : ''}`

/** The bars and the word for the level. */
function SizeLevel({ size }: { size: RunSize }) {
  return (
    <div className="flex items-center gap-2.5" role="img" aria-label={spoken(size)}>
      <span className="text-muted-foreground">
        <LevelBars level={size.weight.level} fill={fillOf(size)} />
      </span>
      <Text size="ui" weight="medium" tone={toneOf(size)}>
        {size.word}
      </Text>
    </div>
  )
}

/** Everything that adds to the size, the most first, each with its share of the largest. */
function SizeReasons({ size }: { size: RunSize }) {
  const most = Math.max(...size.lines.map((line) => line.points))
  return (
    <div className="flex max-w-60 flex-col gap-2.5">
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {size.lines.map((line) => (
          <li
            key={line.part}
            title={line.why}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3"
          >
            <Text size="xs">
              {line.label}
              <VisuallyHidden>. {line.why}</VisuallyHidden>
            </Text>
            <span
              aria-hidden="true"
              className="block h-1 w-16 overflow-hidden rounded-xs bg-input text-muted-foreground"
            >
              <span
                className="block h-full rounded-xs bg-current transition-[width] duration-200 ease-out motion-reduce:transition-none"
                style={{ width: `${Math.max(8, (line.points / most) * 100)}%` }}
              />
            </span>
          </li>
        ))}
      </ul>
      <Text size="xs" tone="faint">
        A larger run takes longer and costs more. Checks and a good answer add almost nothing.
      </Text>
    </div>
  )
}

/** What an attempt cost the last time the case ran. */
function LastRun({ last }: { last: AttemptCost }) {
  return (
    <>
      <Text caps tone="muted">
        Last run
      </Text>
      <Text size="ui" tabular>
        {money(last.usd)} an attempt
      </Text>
      <Text size="xs" tone="muted" tabular>
        {duration(last.seconds)}, {last.model}
      </Text>
    </>
  )
}

/** Beside the form: the size, then the last run once there is one. */
export function RunSizeRail({ size, last }: { size: RunSize; last: AttemptCost | null }) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <Text caps tone="muted">
          Run size
        </Text>
        <SizeLevel size={size} />
        {size.mostly ? (
          <Text size="xs" tone="muted">
            {size.mostly}
          </Text>
        ) : null}
        <Disclosure summary="What adds to it">
          <SizeReasons size={size} />
        </Disclosure>
      </div>
      {last ? (
        <div className="flex flex-col gap-1 border-t pt-4">
          <LastRun last={last} />
        </div>
      ) : null}
    </>
  )
}

/** Over the last answer, which says what its run cost itself: the size in one strip. */
export function RunSizeStrip({ size }: { size: RunSize }) {
  return (
    <SplitSection part="lead" aria-label="Run size">
      <Text caps tone="muted">
        Run size
      </Text>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <SizeLevel size={size} />
        {size.mostly ? (
          <Text size="xs" tone="muted">
            {size.mostly}
          </Text>
        ) : null}
      </div>
      <Disclosure summary="What adds to it">
        <SizeReasons size={size} />
      </Disclosure>
    </SplitSection>
  )
}

/** The writer's last choice of bars or words, for as long as the window is open, so it holds across cases. */
let wordsShown = false

/**
 * In the case's header, where the column has no room beside the form: the
 * bars alone, as the editor's size meter stands in its toolbar. Pointing at
 * it shows what adds to the size; clicking puts the words in place of the bars.
 */
export function RunSizeMeter({ size, last }: { size: RunSize; last: AttemptCost | null }) {
  const [shown, setShown] = useState(wordsShown)
  // The card steps aside for a click, so it never covers what the click brings.
  const [peeking, setPeeking] = useState(false)
  return (
    <HoverCard open={!shown && peeking} onOpenChange={setPeeking}>
      <HoverCardTrigger asChild>
        <Button
          type="button"
          variant="ghost-muted"
          size="sm"
          aria-pressed={shown}
          aria-label={spoken(size)}
          onClick={() => {
            wordsShown = !shown
            setShown(wordsShown)
            setPeeking(false)
          }}
        >
          {shown ? (
            <Text
              key="word"
              size="xs"
              tone={toneOf(size)}
              className="animate-in duration-150 ease-out fade-in-0"
            >
              {size.word} run
            </Text>
          ) : (
            <span key="bars" className="flex animate-in duration-150 ease-out fade-in-0">
              <LevelBars level={size.weight.level} fill={fillOf(size)} />
            </span>
          )}
        </Button>
      </HoverCardTrigger>
      <HoverCardContent align="end">
        <HoverCardSection part="head">
          <Text size="ui">
            Run size:{' '}
            <Text weight="medium" tone={toneOf(size)}>
              {size.word}
            </Text>
          </Text>
          {size.mostly ? (
            <Text size="xs" tone="muted">
              {size.mostly}
            </Text>
          ) : null}
        </HoverCardSection>
        <HoverCardSection>
          <SizeReasons size={size} />
        </HoverCardSection>
        {last ? (
          <HoverCardSection part="foot" className="flex-col gap-0.5">
            <LastRun last={last} />
          </HoverCardSection>
        ) : null}
      </HoverCardContent>
    </HoverCard>
  )
}
