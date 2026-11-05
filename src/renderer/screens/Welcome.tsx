/**
 * The welcome: what a first visit sees, and one click from the help ever
 * after. It asks one thing of the reader at a time. First the mark, what the
 * app gives you in a headline and one sentence, one button and, under it, the
 * way out.
 * Then, only if asked for, the loop in six steps, each alone in view. The last
 * step leads into the practice skill. Through the tour the way out keeps to
 * one corner, and nothing here has to be remembered: every screen explains
 * itself again when it is opened.
 *
 * It is never part of the app's own frame. The desktop app gives it a small
 * window of its own, laid out for exactly this size; a browser shows the same
 * frame in the middle of the page. So it reads as the one thing to do, with
 * nothing of the app around it to wonder about yet.
 */
import { ArrowRightIcon } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { api } from '../api.ts'
import { LoopTour, TourProgress } from '../components/LoopTour.tsx'
import { Highlight, Mark } from '../components/Mark.tsx'
import { Heading, Text } from '../components/text.tsx'
import { Button } from '../components/ui/button.tsx'
import { LOOP_STEPS } from '../help.ts'
import { after, useSwap } from '../motion.ts'

interface Props {
  /** A first visit: the way out skips ahead to the app. Later it only closes the welcome. */
  first: boolean
  /** The practice skill is being written and opened. */
  starting: boolean
  /** The welcome is on its way out: it fades while the app comes up behind it. */
  leaving?: boolean
  onStart: () => void
  onLeave: () => void
}

/**
 * The welcome's frame, the size of its window. The top strip moves the window
 * on macOS, where the window buttons sit at its left; it holds how far the
 * tour has come and, at its right end, the way out.
 */
function Frame({
  progress,
  exit,
  leaving,
  children,
}: {
  progress: ReactNode
  exit: ReactNode
  leaving: boolean
  children: ReactNode
}) {
  return (
    <div
      data-platform={api.platform}
      className="grid h-dvh place-items-center overflow-hidden bg-background"
    >
      <div className="flex size-full max-h-[600px] max-w-[760px] flex-col">
        <header data-drag className="grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center px-3">
          <span />
          {progress}
          <span className="flex justify-end">{exit}</span>
        </header>
        {/* A margin, not centering, holds the view in the middle: when it is taller than a small page it scrolls from its top. */}
        <main
          data-leaving={leaving || undefined}
          className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-8 pt-3 pb-8 transition-[opacity,translate] duration-150 ease-out *:my-auto data-leaving:-translate-y-1.5 data-leaving:opacity-0"
        >
          {children}
        </main>
      </div>
    </div>
  )
}

/**
 * What the app is for, and the one step to take. It arrives in the order it is
 * read: the mark, the headline, its one sentence, the button and the way out
 * under it. Then the highlighter crosses the one word the app is about. The
 * words say what the reader gets, not what a skill is: the tour's first step
 * says that, where the word is first needed.
 */
function Opening({ onTour, exit }: { onTour: () => void; exit: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-7 pb-6 text-center">
      <Mark className="size-18" />
      <div className="flex flex-col items-center gap-3">
        <Heading level={1} className="animate-rise" style={after(140)}>
          Know your skill <Highlight delay={820}>works</Highlight>
        </Heading>
        <Text
          as="p"
          tone="muted"
          className="m-0 max-w-[44ch] animate-rise text-md text-balance"
          style={after(210)}
        >
          Run it on real tasks, score the results, and see what each change improves.
        </Text>
      </div>
      <div className="flex animate-rise flex-col items-center gap-2" style={after(280)}>
        <Button type="button" size="lg" autoFocus onClick={onTour}>
          See how it works
          <ArrowRightIcon aria-hidden="true" />
        </Button>
        {exit}
      </div>
    </div>
  )
}

export function Welcome({ first, starting, leaving = false, onStart, onLeave }: Props) {
  const { view, leaving: swapping, swap } = useSwap<'opening' | 'tour'>('opening')
  /** The step in view and the one before it, which says which side the step arrives from. */
  const [step, setStep] = useState({ index: 0, from: 0 })
  const show = (index: number) => setStep((current) => ({ index, from: current.index }))
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
        return index < 0 || index >= LOOP_STEPS.length ? current : { index, from: current.index }
      })
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [touring, busy])

  const exit = (size: 'sm' | 'default') => (
    <Button type="button" variant="ghost" size={size} disabled={busy} onClick={onLeave}>
      {first ? 'Skip' : 'Close'}
    </Button>
  )

  return (
    <Frame
      leaving={leaving || swapping}
      progress={touring ? <TourProgress index={step.index} /> : <span />}
      // The quiet way out keeps to this corner on every step. The opening holds it under its button.
      exit={touring ? exit('sm') : null}
    >
      {touring ? (
        <LoopTour
          index={step.index}
          from={step.from}
          starting={busy}
          onShow={show}
          onStart={onStart}
          onBack={() => swap('opening')}
        />
      ) : (
        <Opening
          exit={exit('default')}
          onTour={() => {
            setStep({ index: 0, from: 0 })
            swap('tour')
          }}
        />
      )}
    </Frame>
  )
}
