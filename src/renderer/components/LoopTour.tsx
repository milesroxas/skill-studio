/**
 * The loop, told one step at a time in the welcome: write, run, compare. One
 * step is in view and nothing else: its name, one sentence, a picture, and the
 * button to the next. Three facts in a row are easy; three at once are a wall.
 * It is the welcome's second way in, for a reader who wants to see before
 * doing: its last step leads to the same sample skill the opening offers.
 *
 * Every picture is the same example carried forward: the practice skill, one
 * of its cases and one note an agent might write for it. So the tour previews
 * the practice it ends on, and nothing in it has to be imagined.
 *
 * Each step sits in the welcome's step frame (`WelcomeStep.tsx`). Seen once or
 * twice, so the step may move: its picture plays what the sentence says, in
 * the order it happens. Rules are written, the note is written, its checks are
 * stamped, the rule is tightened, the score counts up. Nothing waits on
 * the movement: Next works from the first frame.
 */
import { PRACTICE, PRACTICE_EDIT } from '@domain/practice.ts'
import { rulesFromSkill } from '@domain/rules.ts'
import { cva } from 'class-variance-authority'
import { ArrowRightIcon, CheckIcon, XIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { LOOP_STEPS, type LoopStep } from '../help.ts'
import { after, useCountUp } from '../motion.ts'
import { type Place, placeFor, RUN } from '../places.ts'
import { List } from './layout.tsx'
import { Slab } from './Mark.tsx'
import { Text } from './text.tsx'
import { STEP_BEAT, StepFrame, TRY_SAMPLE } from './WelcomeStep.tsx'

/** The first sentence of a rule or a check: the instruction, without its why. */
const lead = (text: string): string => text.split(/(?<=[.!?])\s/)[0]

const KASE = PRACTICE.cases[0]
const RULES = rulesFromSkill(PRACTICE.body).map((rule) => lead(rule.text))
const CHECKS = KASE.graders.map((g) => g.statement)
/** What the agent writes while the rule is still vague: kind, and twice too long. */
const NOTE =
  'Priya, thank you so much for covering my on-call shift on Saturday. I know giving up a weekend is a lot to ask. Because you stepped in, I could be at my sister’s wedding without checking my phone once. I owe you one.'
/** Which checks that note passes, in the order of `CHECKS`, and what Jev says of one it fails. */
const PASSED = [true, true, false]
const FAILED_WHY = 'It has four.'
const SCORE = { before: 58, after: 96 }
/** The note a word at a time, each with its place in the line. */
const WORDS = NOTE.split(' ').map((word, at) => ({ word, at }))

/**
 * When the parts of a picture move, in milliseconds from the step coming into
 * view. `start` is the first beat: the step has slid in and the eye has
 * reached the picture. `row` is the wait between the rows of a list, `stamp`
 * between Jev's marks, which land slower because each is a verdict.
 */
const BEAT = { start: STEP_BEAT, row: 90, stamp: 220, word: 20 }
/** When the note's last word has landed, and a breath after it: the checks follow the writing. */
const WRITTEN = BEAT.start + WORDS.length * BEAT.word + 240

/**
 * The picture of a step: a sheet with a printed edge, headed like what it
 * stands for. That is a screen, or for the run the button that starts one.
 */
function Sheet({ place, children }: { place: Pick<Place, 'label' | 'icon'>; children: ReactNode }) {
  return (
    <div className="pointer-events-none flex h-105 max-h-full min-w-0 flex-1 animate-in flex-col overflow-hidden rounded-md border border-foreground bg-card delay-75 duration-300 ease-out-strong fill-mode-backwards select-none fade-in-0 in-data-[from=after]:slide-in-from-right-4 in-data-[from=before]:slide-in-from-left-4">
      <div className="flex h-9.5 shrink-0 items-center gap-2 border-b px-4 text-ui font-medium">
        <place.icon aria-hidden="true" className="size-3.5 text-muted-foreground" />
        {place.label}
      </div>
      <div className="flex flex-1 flex-col gap-5 px-4 py-4.5">{children}</div>
    </div>
  )
}

/**
 * A part of a picture under its label: a caps label, or a file's name in mono,
 * which keeps its own case.
 */
function Part({
  caption,
  file = false,
  children,
}: {
  caption: string
  file?: boolean
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      {file ? (
        <Text as="p" font="mono" size="xs" tone="muted" className="m-0">
          {caption}
        </Text>
      ) : (
        <Text as="p" caps tone="muted" className="m-0">
          {caption}
        </Text>
      )}
      {children}
    </div>
  )
}

/** Something said: the request to the agent, or the note it wrote back. */
function Quote({ children }: { children: ReactNode }) {
  return <p className="m-0 border-l-2 border-input pl-3 text-ui text-pretty">{children}</p>
}

const stampVariants = cva(
  'absolute -inset-px flex animate-pop items-center justify-center rounded-sm',
  {
    variants: {
      passed: {
        true: 'bg-success/15 text-success',
        false: 'bg-destructive/15 text-destructive',
      },
    },
  },
)

/**
 * The checks of the case, which Jev stamps in turn once the note is written:
 * each open box gives way to its verdict. `from` is when the first one lands.
 */
function Checks({ marks, from }: { marks: boolean[]; from: number }) {
  return (
    <ul className="m-0 flex flex-col gap-1.5 p-0">
      {CHECKS.map((check, i) => {
        const passed = marks[i]
        const at = from + i * BEAT.stamp
        return (
          <li key={check} className="flex gap-2 text-ui">
            <span className="relative mt-0.5 size-4 shrink-0">
              <span
                className="absolute inset-0 animate-vanish rounded-sm border border-input"
                style={after(at)}
              />
              <span className={stampVariants({ passed })} style={after(at)}>
                {passed ? (
                  <CheckIcon aria-hidden="true" className="size-3" />
                ) : (
                  <XIcon aria-hidden="true" className="size-3" />
                )}
              </span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="sr-only">{passed ? 'Met: ' : 'Missed: '}</span>
              {check}
              {passed === false ? (
                <Text tone="muted" className="animate-ink" style={after(at + 120)}>
                  {' '}
                  {FAILED_WHY}
                </Text>
              ) : null}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/** The note as the agent writes it: a word at a time. A screen reader gets it whole. */
function Written() {
  return (
    <>
      <span className="sr-only">{NOTE}</span>
      <span aria-hidden="true">
        {WORDS.map(({ word, at }) => (
          <span key={at} className="animate-ink" style={after(BEAT.start + at * BEAT.word)}>
            {word}{' '}
          </span>
        ))}
      </span>
    </>
  )
}

/** The loop closing: the same case run again, its score counting up to the new one. */
function Rerun({ at }: { at: number }) {
  const shown = useCountUp(SCORE.after, { from: SCORE.before, delay: at, duration: 900 })
  return (
    <span className="flex items-baseline gap-3 tabular-nums">
      <span className="flex items-baseline gap-3 text-3xl font-semibold">
        <Text tone="muted">{SCORE.before}</Text>
        <ArrowRightIcon aria-hidden="true" className="size-4 self-center text-muted-foreground" />
        <span className="sr-only">then {SCORE.after}</span>
        {/* The new score is the point of the whole tour: the slab marks it once it lands. */}
        <Slab delay={at + 900}>
          <span aria-hidden="true">{shown}</span>
        </Slab>
      </span>
      <Text font="mono" size="xs" tone="muted" className="pl-1">
        out of 100
      </Text>
    </span>
  )
}

/** One picture per step, by where the step happens. */
const PICTURES: Record<LoopStep['at'], ReactNode> = {
  editor: (
    <>
      <Part caption="SKILL.md" file>
        <Text weight="semibold">Thank-you note</Text>
      </Part>
      <Part caption="Rules">
        <List variant="number" gap="sm">
          {RULES.map((rule, i) => (
            <li
              key={rule}
              className="animate-rise text-ui"
              style={after(BEAT.start + i * BEAT.row)}
            >
              {rule}
            </li>
          ))}
        </List>
      </Part>
    </>
  ),
  run: (
    <>
      <Part caption="The request">
        <Quote>{KASE.prompt}</Quote>
      </Part>
      <Part caption="What the agent wrote, with the skill installed">
        <p className="m-0 rounded-md bg-muted px-3 py-2.5 text-ui text-pretty">
          <Written />
        </p>
      </Part>
      <Part caption="Jev marked each check">
        <Checks marks={PASSED} from={WRITTEN} />
      </Part>
    </>
  ),
  results: (
    <>
      <Part caption="The edit">
        <p className="m-0 flex flex-col gap-1 text-ui">
          <del
            className="animate-rise rounded-xs bg-destructive/10 px-1.5 py-0.5 text-destructive"
            style={after(BEAT.start)}
          >
            {lead(PRACTICE_EDIT.bad)}
          </del>
          <ins
            className="animate-rise rounded-xs bg-success/10 px-1.5 py-0.5 text-success no-underline"
            style={after(BEAT.start + 320)}
          >
            {lead(PRACTICE_EDIT.good)}
          </ins>
        </p>
      </Part>
      <Part caption="Run again">
        <Rerun at={BEAT.start + 900} />
      </Part>
    </>
  ),
}

export function LoopTour({
  index,
  from,
  busy,
  onShow,
  onBack,
  onDone,
}: {
  /** The step in view. */
  index: number
  /** The step before it, which says which side this one arrives from. */
  from: number
  /** The welcome is on its way out. */
  busy: boolean
  onShow: (index: number) => void
  /** Back from the first step. */
  onBack: () => void
  /** On from the last step, to the sample skill. */
  onDone: () => void
}) {
  const step = LOOP_STEPS[index]
  const place = step.at === 'run' ? RUN : placeFor(step.at)
  const last = index === LOOP_STEPS.length - 1

  return (
    <StepFrame
      label="How it works"
      id={step.at}
      index={index}
      from={from}
      title={step.title}
      say={step.say}
      busy={busy}
      onBack={() => (index === 0 ? onBack() : onShow(index - 1))}
      next={{
        label: (
          <>
            {last ? TRY_SAMPLE : 'Next'}
            <ArrowRightIcon aria-hidden="true" />
          </>
        ),
        onClick: () => (last ? onDone() : onShow(index + 1)),
        // The last press may open the sample skill straight away.
        busyLabel: last ? 'Starting…' : undefined,
      }}
    >
      {place ? <Sheet place={place}>{PICTURES[step.at]}</Sheet> : null}
    </StepFrame>
  )
}
