/**
 * Help that stays within reach and out of the way. Nothing is taught ahead of
 * time: a screen is explained when it is opened, a word when it is met. A hint
 * under the top bar says what a screen is for, in one line, the first time it
 * opens. A button in the top bar says it again whenever asked, with the
 * screen's words, and leads on to the guide, the welcome and the assistant. A
 * word in running text opens its meaning where it stands. All three read the
 * same help and the same glossary.
 */
import { GLOSSARY, type TermId } from '@domain/glossary.ts'
import {
  BookOpenIcon,
  CircleQuestionMarkIcon,
  LightbulbIcon,
  MessageCircleQuestionIcon,
  RotateCcwIcon,
} from 'lucide-react'
import { type ReactNode, useRef, useState } from 'react'
import type { ScreenHelp } from '../help.ts'
import { shortcut } from '../keys.ts'
import { WELCOME } from '../places.ts'
import { Heading, Text } from './text.tsx'
import { Button } from './ui/button.tsx'
import {
  Popover,
  PopoverAction,
  PopoverContent,
  PopoverLabel,
  PopoverSection,
  PopoverTrigger,
} from './ui/popover.tsx'

/** Words from the glossary, each with what it means. */
function TermList({ terms }: { terms: readonly TermId[] }) {
  return (
    <dl className="m-0 grid gap-2.5">
      {terms.map((id) => (
        <div key={id} className="flex flex-col gap-px">
          <dt className="text-ui font-medium">{GLOSSARY[id].term}</dt>
          <dd className="m-0 text-xs text-pretty text-muted-foreground">{GLOSSARY[id].means}</dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * One of the app's own words where it is used, such as a section's title. A
 * dotted line under it says it can be asked about; a click opens what it means.
 */
export function Term({ id, children }: { id: TermId; children?: ReactNode }) {
  const { term, means } = GLOSSARY[id]
  return (
    <Popover>
      <PopoverTrigger
        title={`What “${term.toLowerCase()}” means`}
        className="cursor-help rounded-xs text-left underline decoration-muted-foreground/50 decoration-dotted underline-offset-4 outline-none transition-[text-decoration-color] duration-150 ease-out hover:decoration-current focus-visible:ring-2 focus-visible:ring-ring/50 data-[state=open]:decoration-current"
      >
        {children ?? term}
      </PopoverTrigger>
      <PopoverContent size="note" align="start">
        <Text size="ui" weight="medium">
          {term}
        </Text>
        <Text as="p" size="xs" tone="muted" className="text-pretty">
          {means}
        </Text>
      </PopoverContent>
    </Popover>
  )
}

/**
 * The help button, at the end of the top bar on every screen. It answers the
 * three questions a newcomer has, in the order they come up: what is this
 * screen for, what do its words mean, and where can I learn more.
 */
export function HelpButton({
  label,
  help,
  hintsOff,
  onGuide,
  onWelcome,
  onAsk,
  onShowHints,
}: {
  /** The name of the screen in view. */
  label: string
  /** The screen's help; null on a screen that explains itself, such as the guide. */
  help: ScreenHelp | null
  /** Some hints were put away, or all of them turned off: offer them back. */
  hintsOff: boolean
  /** Open the guide, at a section when the screen has one. */
  onGuide: (section?: string) => void
  onWelcome: () => void
  onAsk: () => void
  onShowHints: () => void
}) {
  const [open, setOpen] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  const then = (step: () => void) => () => {
    setOpen(false)
    step()
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Help"
          title="Help with this screen"
        >
          <CircleQuestionMarkIcon aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      {/* Focus lands on the panel itself: it is read first, and Tab reaches its links. */}
      <PopoverContent
        align="end"
        size="help"
        aria-label="Help"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          panel.current?.focus()
        }}
        ref={panel}
      >
        {help ? (
          <>
            <PopoverSection pad="text">
              <Heading level={3} as="h2">
                {label}
              </Heading>
              <Text as="p" size="ui" tone="muted" className="text-pretty">
                {help.what}
              </Text>
            </PopoverSection>
            <PopoverSection pad="text">
              <PopoverLabel className="p-0">Words on this screen</PopoverLabel>
              <TermList terms={help.terms} />
            </PopoverSection>
          </>
        ) : null}
        <PopoverSection>
          <PopoverAction
            icon={<BookOpenIcon aria-hidden="true" />}
            onClick={then(() => onGuide(help?.guide))}
          >
            {help ? 'Read this step in the guide' : 'Open the guide'}
          </PopoverAction>
          <PopoverAction icon={<WELCOME.icon aria-hidden="true" />} onClick={then(onWelcome)}>
            How Skill Studio works
          </PopoverAction>
          <PopoverAction
            icon={<MessageCircleQuestionIcon aria-hidden="true" />}
            hint={shortcut('J')}
            onClick={then(onAsk)}
          >
            Ask the assistant
          </PopoverAction>
          {hintsOff ? (
            <PopoverAction icon={<RotateCcwIcon aria-hidden="true" />} onClick={then(onShowHints)}>
              Show the hints again
            </PopoverAction>
          ) : null}
        </PopoverSection>
      </PopoverContent>
    </Popover>
  )
}

/**
 * What a screen is for, in one line under the top bar, the first time it
 * opens. It sits beside the work and never over it, and goes for good once
 * read. The help button says the same afterwards.
 */
export function ScreenHint({
  children,
  onDismiss,
}: {
  children: ReactNode
  onDismiss: () => void
}) {
  return (
    <aside
      aria-label="About this screen"
      className="flex shrink-0 items-center gap-3 border-b bg-muted/60 px-4 py-2 sm:px-6"
    >
      <LightbulbIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      <Text as="p" size="ui" className="m-0 min-w-0 flex-1 text-pretty">
        {children}
      </Text>
      <Button type="button" variant="outline" size="sm" onClick={onDismiss}>
        Got it
      </Button>
    </aside>
  )
}
