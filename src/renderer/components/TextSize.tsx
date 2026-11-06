/**
 * How big the file in the editor is, at the far end of its toolbar. At rest it
 * is five bars in a row that fill as the file grows, so size reads at a
 * glance without a number to parse. Pointing at it shows the lines and
 * tokens; clicking it puts those counts in place of the bars, and clicking
 * again brings the bars back.
 *
 * The filled bars are grey while the file is a fine size: they take the
 * button's text color, so they are as quiet as the other tools until pointed
 * at. They turn amber when the file is long and red past the guidance, and the
 * words say so too, so the color is never the only sign.
 */
import { SIZE_LEVELS, type SizeBand, sizeBand, textSize } from '@domain/size.ts'
import { cva } from 'class-variance-authority'
import { useDeferredValue, useMemo, useState } from 'react'
import { ToolbarItem } from './layout.tsx'
import { Text } from './text.tsx'
import { Button } from './ui/button.tsx'
import { HoverCard, HoverCardContent, HoverCardTrigger } from './ui/hover-card.tsx'

/** The writer's last choice, for as long as the window is open, so it holds across files. */
let countsShown = false

const count = new Intl.NumberFormat('en-US')

/** "980" or "1.2k": a token count is an estimate, so it never shows more digits than it has. */
const shortTokens = (tokens: number): string =>
  tokens < 1000 ? String(Math.round(tokens / 10) * 10 || tokens) : `${(tokens / 1000).toFixed(1)}k`

const plural = (n: number, word: string) => `${count.format(n)} ${word}${n === 1 ? '' : 's'}`

/** What a long or oversized file is told, beside the counts. */
const VERDICT: Record<SizeBand, string | null> = {
  fine: null,
  long: 'Long. Move rarely needed parts to references/.',
  over: 'Past the guide of 500 lines or 5,000 tokens.',
}

const TONE = { fine: undefined, long: 'warning', over: 'destructive' } as const

/** A step of the scale, 14 by 6 with 2px corners: tall enough for the corners to read as corners, so a printed scale and not a row of beads. */
const segment = cva('h-1.5 w-3.5 rounded-xs transition-colors duration-150 ease-out', {
  variants: {
    fill: {
      empty: 'bg-input',
      fine: 'bg-current',
      long: 'bg-warning',
      over: 'bg-destructive',
    },
  },
})

const STEPS = [1, 2, 3, 4, 5] as const

export function TextSizeIndicator({ text }: { text: string }) {
  // Typing stays first; the count catches up a beat later on a long file.
  const deferred = useDeferredValue(text)
  const size = useMemo(() => textSize(deferred), [deferred])
  const band = sizeBand(size.level)
  const [shown, setShown] = useState(countsShown)
  // The card steps aside for a click, so it never covers what the click brings.
  const [peeking, setPeeking] = useState(false)

  const lines = plural(size.lines, 'line')
  const tokens = `about ${plural(size.tokens, 'token')}`
  const verdict = VERDICT[band]
  const toggle = () => {
    countsShown = !shown
    setShown(countsShown)
    setPeeking(false)
  }

  return (
    <HoverCard open={!shown && peeking} onOpenChange={setPeeking}>
      <HoverCardTrigger asChild>
        <ToolbarItem>
          <Button
            type="button"
            variant="ghost-muted"
            size="sm"
            aria-pressed={shown}
            aria-label={`${lines}, ${tokens}. Size ${size.level} of ${SIZE_LEVELS}.${verdict ? ` ${verdict}` : ''}`}
            title={shown && verdict ? verdict : undefined}
            onClick={toggle}
          >
            {/* Each face fades in as it arrives, so the swap reads as one control changing. */}
            {shown ? (
              <Text
                key="counts"
                font="mono"
                size="xs"
                tone={TONE[band]}
                tabular
                className="animate-in duration-150 ease-out fade-in-0"
              >
                {lines} · ~{shortTokens(size.tokens)} tokens
              </Text>
            ) : (
              <span
                key="bars"
                aria-hidden="true"
                className="flex animate-in items-center gap-0.5 duration-150 ease-out fade-in-0"
              >
                {STEPS.map((step) => (
                  <span
                    key={step}
                    className={segment({ fill: step <= size.level ? band : 'empty' })}
                  />
                ))}
              </span>
            )}
          </Button>
        </ToolbarItem>
      </HoverCardTrigger>
      <HoverCardContent size="note" align="end">
        {/* Words on the left, measures on the right in mono, so the digits line up. */}
        <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-0.5">
          <dt>
            <Text tone="muted">Lines</Text>
          </dt>
          <dd>
            <Text font="mono" size="xs" tabular block align="end">
              {count.format(size.lines)}
            </Text>
          </dd>
          <dt>
            <Text tone="muted">Tokens</Text>
          </dt>
          <dd>
            <Text font="mono" size="xs" tabular block align="end">
              ~{count.format(size.tokens)}
            </Text>
          </dd>
        </dl>
        {verdict ? (
          <Text tone={TONE[band]} className="mt-1.5">
            {verdict}
          </Text>
        ) : null}
        <Text tone="faint" className="mt-1.5">
          Click to show in the toolbar
        </Text>
      </HoverCardContent>
    </HoverCard>
  )
}
