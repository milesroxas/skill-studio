/**
 * The loop, told one step at a time on the welcome screen. One step is in view
 * and nothing else: its name, one sentence, a picture, and the button to the
 * next. Six facts in a row are easy; six at once are a wall.
 *
 * Every picture is the same example carried forward: the practice skill, one
 * of its cases and one note an agent might write for it. So the tour previews
 * the practice it ends on, and nothing in it has to be imagined.
 *
 * The frame holds still from step to step, so Next stays under the pointer and
 * only the step itself changes. Seen once or twice, so the step may move as it
 * changes: it comes in from the side the reader is heading to.
 */
import { PRACTICE, PRACTICE_EDIT } from '@domain/practice.ts'
import { rulesFromSkill } from '@domain/rules.ts'
import { cva } from 'class-variance-authority'
import { ArrowRightIcon, CheckIcon, EyeOffIcon, XIcon } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { LOOP_STEPS } from '../help.ts'
import { type Place, placeFor } from '../places.ts'
import { Spacer } from './layout.tsx'
import { Heading, Hint, Text } from './text.tsx'
import { Button } from './ui/button.tsx'

/** The first sentence of a rule or a check: the instruction, without its why. */
const lead = (text: string): string => text.split(/(?<=[.!?])\s/)[0]

const KASE = PRACTICE.cases[0]
const RULES = rulesFromSkill(PRACTICE.body).map((rule) => lead(rule.text))
const CHECKS = KASE.graders.map((g) => g.statement)
/** What the agent writes while the rule is still vague: kind, and twice too long. */
const NOTE =
  'Priya, thank you so much for covering my on-call shift on Saturday. I know giving up a weekend is a lot to ask. Because you stepped in, I could be at my sister’s wedding without checking my phone once. I owe you one.'
/** Which checks that note passes, in the order of `CHECKS`, and what the judge says of one it fails. */
const PASSED = [true, true, false]
const FAILED_WHY = 'It has four.'
const SCORE = { before: 58, after: 96 }
const RATING = 2

/** One step of the tour: reached, or still to come. */
const segmentVariants = cva(
  'h-1 flex-1 rounded-full transition-[background-color] duration-300 ease-out',
  {
    variants: {
      reached: {
        true: 'bg-foreground/70',
        false: 'bg-foreground/10',
      },
    },
  },
)

/** How far through the tour the reader is, as a row of marks and, for a screen reader, in words. */
function Progress({ index }: { index: number }) {
  return (
    <div className="flex flex-1 items-center gap-1">
      {LOOP_STEPS.map((step, i) => (
        <span
          key={step.screen}
          aria-hidden="true"
          className={segmentVariants({ reached: i <= index })}
        />
      ))}
      <span className="sr-only">
        Step {index + 1} of {LOOP_STEPS.length}
      </span>
    </div>
  )
}

/** The picture of a step: a sheet headed like the screen it stands for. */
function Sheet({ place, children }: { place: Place; children: ReactNode }) {
  return (
    <div className="pointer-events-none flex h-72 flex-col overflow-hidden rounded-xl bg-card shadow-raised select-none">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b px-4 text-ui font-medium">
        <place.icon aria-hidden="true" className="size-4 text-muted-foreground" />
        {place.label}
      </div>
      <div className="flex flex-1 flex-col gap-4 px-4 py-4">{children}</div>
    </div>
  )
}

/** A small label over a part of a picture. */
function Caption({ children }: { children: ReactNode }) {
  return (
    <Text as="p" size="xs" tone="muted" weight="medium" className="m-0">
      {children}
    </Text>
  )
}

function Part({ caption, children }: { caption: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Caption>{caption}</Caption>
      {children}
    </div>
  )
}

/** Something said: the request to the agent, or the note it wrote back. */
function Quote({ children }: { children: ReactNode }) {
  return <p className="m-0 border-l-2 border-input pl-3 text-ui text-pretty">{children}</p>
}

const markVariants = cva('mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-xs', {
  variants: {
    state: {
      open: 'border border-input',
      yes: 'bg-success/15 text-success',
      no: 'bg-destructive/15 text-destructive',
    },
  },
})

/** The checks of the case: still open, or marked by the judge. */
function Checks({ marks }: { marks?: boolean[] }) {
  return (
    <ul className="m-0 flex flex-col gap-1.5 p-0">
      {CHECKS.map((check, i) => {
        const state = marks ? (marks[i] ? 'yes' : 'no') : 'open'
        return (
          <li key={check} className="flex gap-2 text-ui">
            <span className={markVariants({ state })}>
              {state === 'yes' ? <CheckIcon aria-hidden="true" className="size-3" /> : null}
              {state === 'no' ? <XIcon aria-hidden="true" className="size-3" /> : null}
            </span>
            <span className="min-w-0 flex-1">
              {state === 'open' ? null : (
                <span className="sr-only">{state === 'yes' ? 'Passed: ' : 'Failed: '}</span>
              )}
              {check}
              {state === 'no' ? <Text tone="muted"> {FAILED_WHY}</Text> : null}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/** A score out of 100, as a number and as a length. */
function Score({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <Text size="xs" tone="muted">
          out of 100
        </Text>
        <span className="h-1 overflow-hidden rounded-full bg-foreground/10" aria-hidden="true">
          <span
            className="block h-full origin-left rounded-full bg-foreground/70"
            style={{ transform: `scaleX(${value / 100})` }}
          />
        </span>
      </span>
    </div>
  )
}

const ratingVariants = cva(
  'flex size-7 items-center justify-center rounded-md border text-ui font-medium tabular-nums',
  {
    variants: {
      picked: {
        true: 'border-transparent bg-primary text-primary-foreground',
        false: 'text-muted-foreground',
      },
    },
  },
)

/** One picture per step, by the screen the step happens on. */
const PICTURES: Record<string, ReactNode> = {
  edit: (
    <>
      <Part caption="SKILL.md">
        <Text weight="semibold">Thank-you note</Text>
      </Part>
      <Part caption="Rules">
        <ul className="m-0 flex list-disc flex-col gap-1.5 pl-4.5 text-ui marker:text-muted-foreground/70">
          {RULES.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </Part>
    </>
  ),
  cases: (
    <>
      <Part caption="The request">
        <Quote>{KASE.prompt}</Quote>
      </Part>
      <Part caption="A good answer passes these checks">
        <Checks />
      </Part>
    </>
  ),
  generate: (
    <Part caption="What the agent wrote, with the skill installed">
      <p className="m-0 rounded-lg bg-muted px-3 py-2.5 text-ui text-pretty">{NOTE}</p>
    </Part>
  ),
  overview: (
    <>
      <Part caption="The judge marked each check">
        <Checks marks={PASSED} />
      </Part>
      <Part caption="The judge’s score">
        <Score value={SCORE.before} />
      </Part>
    </>
  ),
  blind: (
    <>
      <Part caption="The judge’s score">
        <span className="inline-flex items-center gap-1.5 text-ui text-muted-foreground">
          <EyeOffIcon aria-hidden="true" className="size-4" />
          Hidden until you rate
        </span>
      </Part>
      <Part caption="Your rating, from 1 to 5">
        <span className="flex gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <span key={n} className={ratingVariants({ picked: n === RATING })}>
              {n}
              {n === RATING ? <span className="sr-only"> (picked)</span> : null}
            </span>
          ))}
        </span>
        <Text size="ui" tone="muted">
          “Kind, but twice as long as it should be.”
        </Text>
      </Part>
    </>
  ),
  insights: (
    <>
      <Part caption="You and the judge agree">
        <Text size="ui" className="text-pretty">
          You rated it {RATING} of 5. The judge scored it {SCORE.before}. The note falls short.
        </Text>
      </Part>
      <Part caption="So one rule is made exact">
        <p className="m-0 flex flex-col gap-1 text-ui">
          <del className="rounded-xs bg-destructive/10 px-1.5 py-0.5 text-destructive">
            {lead(PRACTICE_EDIT.bad)}
          </del>
          <ins className="rounded-xs bg-success/10 px-1.5 py-0.5 text-success no-underline">
            {lead(PRACTICE_EDIT.good)}
          </ins>
        </p>
      </Part>
      <Part caption="Run again">
        <span className="flex items-center gap-2 text-ui tabular-nums">
          <Text tone="muted">{SCORE.before}</Text>
          <ArrowRightIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
          <span className="sr-only">then</span>
          <Text weight="semibold">{SCORE.after}</Text>
          <Text tone="muted">out of 100</Text>
        </span>
      </Part>
    </>
  ),
}

export function LoopTour({
  starting,
  onStart,
  onBack,
  onSkip,
}: {
  /** The practice skill is being written and opened. */
  starting: boolean
  /** The last step's button: go and do it. */
  onStart: () => void
  /** Back from the first step. */
  onBack: () => void
  onSkip: () => void
}) {
  /** The step in view and the one before it, which says which side the step arrives from. */
  const [{ index, from }, setAt] = useState({ index: 0, from: 0 })
  const show = (next: number) => setAt({ index: next, from: index })
  const step = LOOP_STEPS[index]
  const place = placeFor(step.screen)
  const last = index === LOOP_STEPS.length - 1

  return (
    <section aria-label="How it works" className="flex w-full max-w-[520px] flex-col gap-6">
      <div className="flex items-center gap-4">
        <Progress index={index} />
        {/* The quiet way out, in the same place on every step. Its text ends on the column's edge. */}
        <Button type="button" variant="ghost" size="sm" className="-mr-3" onClick={onSkip}>
          Skip
        </Button>
      </div>

      <div
        key={step.screen}
        aria-live="polite"
        data-from={from > index ? 'before' : 'after'}
        className="flex animate-in flex-col gap-5 duration-200 ease-out-strong fade-in-0 data-[from=after]:slide-in-from-right-3 data-[from=before]:slide-in-from-left-3"
      >
        {/* Room for two lines under the title, so a longer sentence moves nothing below it. */}
        <div className="flex min-h-19 flex-col gap-1.5">
          <Heading level={2} className="text-xl">
            {step.title}
          </Heading>
          <Text as="p" tone="muted" className="m-0 text-pretty">
            {step.say}
          </Text>
        </div>
        {place ? <Sheet place={place}>{PICTURES[step.screen]}</Sheet> : null}
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => (index === 0 ? onBack() : show(index - 1))}
        >
          Back
        </Button>
        <Spacer />
        {/* One button for both, so it keeps the focus and its place from the first step to the last. */}
        <Button
          type="button"
          autoFocus
          disabled={starting}
          onClick={() => (last ? onStart() : show(index + 1))}
        >
          {last ? (
            starting ? (
              'Starting…'
            ) : (
              'Start practice'
            )
          ) : (
            <>
              Next
              <ArrowRightIcon aria-hidden="true" />
            </>
          )}
        </Button>
      </div>
      {/* Its line is held on every step, so the frame is the same height throughout. */}
      <Hint className="min-h-9">
        {last
          ? 'Practice is this same skill, for real. About five minutes, nothing to type, and it changes nothing your agents use.'
          : null}
      </Hint>
    </section>
  )
}
