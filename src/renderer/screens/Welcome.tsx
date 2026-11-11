/**
 * The welcome: what a first visit sees, and one click from the help ever
 * after. It asks one thing of the reader at a time. First the ink cover: the
 * mark, what the app gives you in a headline and one sentence, and two ways
 * in. The first opens the sample skill, whose walkthrough teaches the loop by
 * doing it. The second, for a reader who wants to see before doing, tells the
 * loop in three steps, each alone in view, and ends at the same sample skill.
 * If Jev's key is missing, one setup step asks for it on the way: the
 * walkthrough's first run is graded by Jev. The way out keeps to one corner
 * throughout, and nothing here has to be remembered: every screen explains
 * itself again when it is opened, and Settings keeps every connection for
 * later.
 *
 * It is never part of the app's own frame. The desktop app gives it a small
 * window of its own, laid out for exactly this size; a browser shows the same
 * frame in the middle of the page. So it reads as the one thing to do, with
 * nothing of the app around it to wonder about yet.
 */
import { ArrowRightIcon } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { api } from '../api.ts'
import { useKeys } from '../components/Connections.tsx'
import { LoopTour } from '../components/LoopTour.tsx'
import { Mark, Slab } from '../components/Mark.tsx'
import { Setup } from '../components/Setup.tsx'
import { StatusLine } from '../components/StatusLine.tsx'
import { Heading, Text } from '../components/text.tsx'
import { Button } from '../components/ui/button.tsx'
import { StepProgress, TRY_SAMPLE } from '../components/WelcomeStep.tsx'
import { LOOP_STEPS } from '../help.ts'
import type { Notice, Reporter } from '../hooks.ts'
import { after, useSwap } from '../motion.ts'
import { APP_VERSION } from '../updates.ts'

interface Props {
  /** A first visit: the way out skips ahead to the app. Later it only closes the welcome. */
  first: boolean
  /** The practice skill is being written and opened. */
  starting: boolean
  /** The welcome is on its way out: it fades while the app comes up behind it. */
  leaving?: boolean
  onStart: () => void
  onLeave: () => void
  report: Reporter
  /** What the status line in the title strip says, and how it is cleared. */
  notice: Notice | null
  onDismiss: () => void
}

/** A step in view and the one before it, which says which side the step arrives from. */
interface At {
  index: number
  from: number
}

/** Show `index` next, remembering where the reader came from. */
const to =
  (index: number) =>
  (current: At): At => ({ index, from: current.index })

/**
 * The welcome's frame, the size of its window. The top strip moves the window
 * on macOS, where the window buttons sit at its left. Through the tour it holds
 * how far the reader has come over a rule, and on every frame, at its right
 * end, the way out. The opening is ink: the strip has no rule and the frame is
 * the cover. Its 36px sides plus the way out's own 12px put that word's last
 * letter on the 48px column edge the steps and their buttons keep.
 */
function Frame({
  ink,
  status,
  progress,
  exit,
  leaving,
  children,
}: {
  ink: boolean
  /** The status line, in the strip's first cell. */
  status: ReactNode
  progress: ReactNode
  exit: ReactNode
  leaving: boolean
  children: ReactNode
}) {
  return (
    <div
      data-platform={api.platform}
      data-surface={ink ? 'ink' : undefined}
      className="grid h-dvh place-items-center overflow-hidden bg-background"
    >
      <div className="relative flex size-full max-h-[600px] max-w-[760px] flex-col overflow-hidden">
        <header
          data-drag
          data-rule={!ink || undefined}
          className="relative z-10 grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center px-9 data-rule:border-b"
        >
          {status}
          {progress}
          <span className="flex justify-end">{exit}</span>
        </header>
        <main
          data-leaving={leaving || undefined}
          className="flex min-h-0 flex-1 flex-col transition-[opacity,translate] duration-150 ease-out data-leaving:-translate-y-1.5 data-leaving:opacity-0"
        >
          {children}
        </main>
      </div>
    </div>
  )
}

/**
 * What the app is for, and the way in, on the ink cover. It arrives in the
 * order it is read: the mark draws, the headline, its one sentence, then the
 * two ways in. Then the slab crosses the one word the app is about. The words
 * say what the reader gets, not what a skill is: the walkthrough and the tour
 * each say that where the word is first needed.
 */
function Opening({
  starting,
  busy,
  onTry,
  onTour,
}: {
  /** Its own press is opening the sample skill. */
  starting: boolean
  busy: boolean
  onTry: () => void
  onTour: () => void
}) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col px-12 pb-14">
      <Mark size="cover" />
      <div className="relative flex items-baseline justify-between border-b pt-4.5 pb-3">
        <Text size="ui" weight="medium">
          Skill Studio
        </Text>
        {/* A browser serving the app has no version of its own to show. */}
        {APP_VERSION ? (
          <Text font="mono" size="xs" tone="muted">
            v{APP_VERSION}
          </Text>
        ) : null}
      </div>
      <div className="relative my-auto flex flex-col items-start gap-6 pt-8">
        <Heading level="display" className="animate-rise" style={after(140)}>
          Know
          <br />
          your skill
          <br />
          <Slab delay={820}>works</Slab>
        </Heading>
        <Text
          as="p"
          tone="muted"
          className="max-w-[40ch] animate-rise text-pretty"
          style={after(210)}
        >
          Run it on real tasks, compare each version’s results, and see what a change improves.
        </Text>
        <div className="flex animate-rise items-center gap-3 pt-1.5" style={after(280)}>
          {/* Doing teaches more than watching: the sample skill is the way in, the tour the second. */}
          <Button
            type="button"
            size="lg"
            disabled={busy}
            busy={starting}
            busyLabel="Starting…"
            onClick={onTry}
          >
            {TRY_SAMPLE}
            <ArrowRightIcon aria-hidden="true" />
          </Button>
          <Button type="button" variant="ghost" size="lg" disabled={busy} onClick={onTour}>
            See how it works
          </Button>
        </div>
      </div>
    </div>
  )
}

export function Welcome({
  first,
  starting,
  leaving = false,
  onStart,
  onLeave,
  report,
  notice,
  onDismiss,
}: Props) {
  const { view, leaving: swapping, swap } = useSwap<'opening' | 'tour' | 'setup'>('opening')
  const [step, setStep] = useState<At>({ index: 0, from: 0 })
  /** Where the setup was reached from, which its Back returns to. */
  const [setupFrom, setSetupFrom] = useState<'opening' | 'tour'>('opening')
  const jev = useKeys()
  const touring = view === 'tour'
  const busy = starting || leaving

  // The arrow keys step through the tour, as they would through slides.
  useEffect(() => {
    if (!touring || busy) return
    const handle = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
      const by = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
      if (!by) return
      setStep((current) => {
        const index = current.index + by
        return index < 0 || index >= LOOP_STEPS.length ? current : to(index)(current)
      })
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [touring, busy])

  /** On to the sample skill, by way of Jev's key while it is missing. */
  const begin = (from: 'opening' | 'tour') => {
    if (jev.keys.data?.keys.jev.set) return onStart()
    setSetupFrom(from)
    swap('setup')
  }

  return (
    <Frame
      ink={view === 'opening'}
      status={<StatusLine place="head" notice={notice} onDismiss={onDismiss} />}
      leaving={leaving || swapping}
      progress={touring ? <StepProgress count={LOOP_STEPS.length} index={step.index} /> : <span />}
      // The quiet way out keeps to this corner on every frame.
      exit={
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onLeave}>
          {first ? 'Skip' : 'Close'}
        </Button>
      }
    >
      {view === 'tour' ? (
        <LoopTour
          index={step.index}
          from={step.from}
          busy={busy}
          onShow={(index) => setStep(to(index))}
          onBack={() => swap('opening')}
          onDone={() => begin('tour')}
        />
      ) : view === 'setup' ? (
        <Setup
          {...jev}
          busy={busy}
          report={report}
          onBack={() => swap(setupFrom)}
          onStart={onStart}
        />
      ) : (
        <Opening
          starting={starting}
          busy={busy}
          onTry={() => begin('opening')}
          onTour={() => {
            setStep({ index: 0, from: 0 })
            swap('tour')
          }}
        />
      )}
    </Frame>
  )
}
