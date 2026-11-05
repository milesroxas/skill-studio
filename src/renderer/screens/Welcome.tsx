/**
 * The welcome: where a first visit lands, and one click from the help button
 * ever after. It asks one thing of the reader at a time. First two sentences
 * on what the app is for and one button. Then, only if asked for, the loop in
 * six steps, each alone on the screen. The last step leads into the practice
 * skill. Skip is always in reach, and nothing here has to be remembered: every
 * screen explains itself again when it is opened.
 *
 * It stands where an empty screen's message stands, a little above the middle
 * of the pane, so it reads as the one thing to do and not as a page to study.
 */
import { type ReactNode, useState } from 'react'
import { LoopTour } from '../components/LoopTour.tsx'
import { Toolbar } from '../components/layout.tsx'
import { Heading, Hint, Text } from '../components/text.tsx'
import { Button } from '../components/ui/button.tsx'
import { LOOP_STEPS } from '../help.ts'

interface Props {
  /** The practice skill is being written and opened. */
  starting: boolean
  onStart: () => void
  onLibrary: () => void
}

/** The one thing in the pane, where a whole-screen `EmptyState` stands. */
function Stage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center pt-4 pb-[calc(1rem+8vh)]">
      {children}
    </div>
  )
}

/** What the app is for, and the one step to take. */
function Opening({ onTour, onSkip }: { onTour: () => void; onSkip: () => void }) {
  return (
    <div className="flex animate-in flex-col items-center gap-5 text-center duration-200 ease-out-strong fade-in-0">
      <div className="flex flex-col items-center gap-3">
        <Heading level={1} className="max-w-[20ch]">
          See if a skill makes your agent better
        </Heading>
        <Text as="p" tone="muted" className="m-0 max-w-[46ch] text-md text-pretty">
          A skill is a page of instructions an AI agent reads before it works. Here you test it like
          a recipe: try it, judge the result, change one thing, try again.
        </Text>
      </div>
      <Toolbar gap="sm">
        <Button type="button" size="lg" autoFocus onClick={onTour}>
          See how it works
        </Button>
        <Button type="button" size="lg" variant="ghost" onClick={onSkip}>
          Skip
        </Button>
      </Toolbar>
      <Hint>{LOOP_STEPS.length} short steps. About a minute.</Hint>
    </div>
  )
}

export function Welcome({ starting, onStart, onLibrary }: Props) {
  const [touring, setTouring] = useState(false)
  return (
    <Stage>
      {touring ? (
        <LoopTour
          starting={starting}
          onStart={onStart}
          onBack={() => setTouring(false)}
          onSkip={onLibrary}
        />
      ) : (
        <Opening onTour={() => setTouring(true)} onSkip={onLibrary} />
      )}
    </Stage>
  )
}
