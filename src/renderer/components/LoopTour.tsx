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
 * marked, the rule is tightened, the new version's score counts up. Nothing
 * waits on the movement: Next works from the first frame.
 *
 * A picture uses the app's own parts where the app has one: a mark is drawn
 * as a row of Missed is, a score is the chip Results shows, a side is the
 * letter Results gives it. So the tour shows what the reader will see.
 */
import { PRACTICE, PRACTICE_EDIT, practiceVersionName } from '@domain/practice.ts'
import { rulesFromSkill } from '@domain/rules.ts'
import { ArrowRightIcon, CheckIcon, XIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { LOOP_STEPS, type LoopStep } from '../help.ts'
import { after, useCountUp } from '../motion.ts'
import { type Place, placeFor, RUN } from '../places.ts'
import { List } from './layout.tsx'
import { Slot } from './OutputCard.tsx'
import { Delta, TotalChip } from './Scores.tsx'
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
/** Which checks that note passes, in the order of `CHECKS`. */
const PASSED = [true, true, false]
/** The two versions as Results names them, and each one's score. Made up, as the note is. */
const VERSIONS = [
  { slot: 'A', name: `v0 · ${practiceVersionName(0)}`, score: 58 },
  { slot: 'B', name: `v1 · ${practiceVersionName(1)}`, score: 96 },
] as const
/** The note a word at a time, each with its place in the line. */
const WORDS = NOTE.split(' ').map((word, at) => ({ word, at }))

/**
 * When the parts of a picture move, in milliseconds from the step coming into
 * view. `start` is the first beat: the step has slid in and the eye has
 * reached the picture. `row` is the wait between the rows of a list, `stamp`
 * between Jev's marks, which land slower because each is a verdict.
 */
const BEAT = { start: STEP_BEAT, row: 90, part: 180, stamp: 220, word: 20 }
/** When the note starts: its part has risen into view, after the request it answers. */
const WRITING = BEAT.start + BEAT.part * 2
/** When the note's last word has landed, and a breath after it: the checks follow the writing. */
const WRITTEN = WRITING + WORDS.length * BEAT.word + 240
/** When step 3's new rule comes in, under the vague one it replaces. */
const INSERTED = BEAT.start + 320
/** When the new rule has landed, and the two versions follow it. */
const EDITED = INSERTED + BEAT.part

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
 * which keeps its own case. It rises into view at `at`, in reading order, so
 * nothing in a picture stands still while the rest of it moves.
 */
function Part({
  caption,
  at,
  file = false,
  children,
}: {
  caption: string
  at: number
  file?: boolean
  children: ReactNode
}) {
  return (
    <div className="flex animate-rise flex-col gap-2" style={after(at)}>
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

/** Something said: the request to the agent. */
function Quote({ children }: { children: ReactNode }) {
  return <p className="m-0 border-l-2 border-input pl-3 text-ui text-pretty">{children}</p>
}

/**
 * The checks of the case, which Jev marks in turn once the note is written,
 * each with the mark a row of Missed or Met has on Results. Each check comes
 * into view just before its mark lands on it. `from` is when the first mark
 * lands.
 */
function Checks({ marks, from }: { marks: boolean[]; from: number }) {
  return (
    <ul className="m-0 flex flex-col gap-1.5 p-0">
      {CHECKS.map((check, i) => {
        const passed = marks[i]
        const at = from + i * BEAT.stamp
        return (
          <li
            key={check}
            className="grid animate-rise grid-cols-[14px_minmax(0,1fr)] items-start gap-x-2 text-ui"
            style={after(at - BEAT.stamp)}
          >
            <span className="mt-1 size-3.5 animate-pop" style={after(at)}>
              {passed ? (
                <CheckIcon aria-hidden="true" className="size-3.5 text-success" />
              ) : (
                <XIcon aria-hidden="true" className="size-3.5 text-destructive" />
              )}
            </span>
            <span className="min-w-0">
              <span className="sr-only">{passed ? 'Met: ' : 'Missed: '}</span>
              {check}
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
          <span key={at} className="animate-ink" style={after(WRITING + at * BEAT.word)}>
            {word}{' '}
          </span>
        ))}
      </span>
    </>
  )
}

/**
 * The loop closing: the two versions as Results sets them side by side, each
 * by its letter, its name and its score. The rows come in one after the
 * other from `at`. The new version's score then counts up from the old one's,
 * and its gain comes up once the count lands, as a changed count does in the
 * app.
 */
function SideBySide({ at }: { at: number }) {
  const [before, latest] = VERSIONS
  const counting = at + BEAT.row + BEAT.part
  const shown = useCountUp(latest.score, { from: before.score, delay: counting, duration: 900 })
  const rows = [
    { ...before, total: before.score, delta: null },
    { ...latest, total: shown, delta: shown === latest.score ? latest.score - before.score : null },
  ]
  return (
    <ul className="m-0 flex flex-col divide-y rounded-md border p-0">
      {rows.map((row, i) => (
        <li
          key={row.slot}
          className="flex animate-rise items-center gap-2.5 px-3 py-2.5 text-ui"
          style={after(at + i * BEAT.row)}
        >
          <Slot variant="letter">{row.slot}</Slot>
          <span className="min-w-0 flex-1 font-semibold">{row.name}</span>
          <span className="flex items-center tabular-nums">
            <span className="sr-only">Score {row.score}</span>
            <span aria-hidden="true">
              <TotalChip total={row.total} />
            </span>
            {row.delta ? (
              <span className="animate-tick">
                <Delta value={row.delta} />
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** One picture per step, by where the step happens. */
const PICTURES: Record<LoopStep['at'], ReactNode> = {
  editor: (
    <>
      <Part caption="SKILL.md" file at={BEAT.start}>
        <Text weight="semibold">Thank-you note</Text>
      </Part>
      <Part caption="Rules" at={BEAT.start + BEAT.part}>
        <List variant="number" gap="sm">
          {RULES.map((rule, i) => (
            <li
              key={rule}
              className="animate-rise text-ui"
              style={after(BEAT.start + BEAT.part * 2 + i * BEAT.row)}
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
      <Part caption="The request" at={BEAT.start}>
        <Quote>{KASE.prompt}</Quote>
      </Part>
      <Part caption="What the agent wrote" at={BEAT.start + BEAT.part}>
        <p className="m-0 rounded-md bg-muted px-3 py-2.5 text-ui text-pretty">
          <Written />
        </p>
      </Part>
      <Part caption="Jev marked each check" at={WRITTEN - BEAT.stamp - BEAT.part}>
        <Checks marks={PASSED} from={WRITTEN} />
      </Part>
    </>
  ),
  results: (
    <>
      <Part caption="Your edit" at={BEAT.start}>
        <p className="m-0 flex flex-col gap-1 text-ui">
          <del
            className="animate-rise rounded-xs bg-destructive/10 px-1.5 py-0.5 text-destructive"
            style={after(BEAT.start + BEAT.row)}
          >
            {lead(PRACTICE_EDIT.bad)}
          </del>
          <ins
            className="animate-rise rounded-xs bg-success/10 px-1.5 py-0.5 text-success no-underline"
            style={after(INSERTED)}
          >
            {lead(PRACTICE_EDIT.good)}
          </ins>
        </p>
      </Part>
      <Part caption="Run again, side by side" at={EDITED}>
        <SideBySide at={EDITED} />
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
