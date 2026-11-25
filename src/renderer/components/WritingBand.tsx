/**
 * The assistant at work, edge to edge across the sheet it writes into: the
 * turning ribbon across the sheet's whole width, and under it, centred, what
 * is being written ("Writing a fix…"), as a figure and its caption. The
 * caption breathes, slowly, while the ribbon turns. It meets the sheet's
 * edges, so the sheet's own corners round it, and a hairline parts it from
 * the head above. As the sheet opens the ribbon fades in and grows down from
 * its top edge, and the caption rises in under it near the start. It clips
 * what moves in it, so the sheet it sits in, which scrolls when it runs long,
 * shows no scrollbar while the caption rises.
 * See docs/design/brand.md.
 */
import { after } from '../motion.ts'
import { TurningRibbon } from './TurningRibbon.tsx'
import { Text, Working } from './text.tsx'

export function WritingBand({
  label,
}: {
  /** What is being written, in a sentence: "Writing a fix…". */
  label: string
}) {
  return (
    <div className="flex flex-col overflow-hidden border-t bg-muted">
      <TurningRibbon className="block h-16 w-full origin-top animate-grow" style={after(80)} />
      <div className="flex animate-rise justify-center px-3 pb-2.5" style={after(120)}>
        <Text size="xs" tone="muted" role="status">
          <Working>{label}</Working>
        </Text>
      </div>
    </div>
  )
}
