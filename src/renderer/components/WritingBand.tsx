/**
 * The assistant at work, edge to edge across the sheet it writes into: the
 * turning ribbon across the sheet's whole width, and under it, centred, what
 * is being written ("Writing a fix…"), as a figure and its caption. The
 * caption breathes, slowly, while the ribbon turns. It meets the sheet's
 * edges, so the sheet's own corners round it, and a hairline parts it from
 * the head above. As the sheet opens the ribbon springs open down from its
 * top edge (`animate-grow`), and its caption settles in under it a beat
 * later (`animate-settle`). `leaving`: the work has landed, and the band
 * sinks away as it fades (`animate-sink`) while the block round it folds.
 * It clips what moves in it, so the sheet it sits in, which scrolls when it
 * runs long, shows no scrollbar while the caption comes.
 * See docs/design/brand.md.
 */
import { cva } from 'class-variance-authority'
import { after } from '../motion.ts'
import { TurningRibbon } from './TurningRibbon.tsx'
import { Text, Working } from './text.tsx'

const bandVariants = cva('flex flex-col overflow-hidden border-t bg-muted', {
  variants: { leaving: { true: 'animate-sink', false: '' } },
})

export function WritingBand({
  label,
  leaving = false,
}: {
  /** What is being written, in a sentence: "Writing a fix…". */
  label: string
  /** What was written has landed: the band sinks away. */
  leaving?: boolean
}) {
  return (
    <div className={bandVariants({ leaving })} aria-hidden={leaving || undefined}>
      <TurningRibbon className="block h-16 w-full origin-top animate-grow" />
      <div className="flex animate-settle justify-center px-3 pb-2.5" style={after(90)}>
        <Text size="xs" tone="muted" role="status">
          <Working>{label}</Working>
        </Text>
      </div>
    </div>
  )
}
