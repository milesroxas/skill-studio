/**
 * The popout over a selection in SKILL.md: three ways to improve the selected
 * rule, in one fixed order. Auto refine checks it and rewrites it only when
 * something drifts; Suggest changes offers three labelled rewrites; Help me
 * improve moves to the side panel for a few questions and a draft. The popout
 * takes no focus while it is a row of buttons, so typing goes on in the
 * editor; it takes focus once a result is in it.
 */
import type { RuleScene } from '@domain/lint.ts'
import { type RefObject, useState } from 'react'
import { RefineBody } from './Refine.tsx'
import { RewritesBody } from './Rewrites.tsx'
import { Button } from './ui/button.tsx'
import { Popover, PopoverAnchor, PopoverContent } from './ui/popover.tsx'

type Mode = 'menu' | 'refine' | 'rewrites'

const TITLES: Record<Mode, string> = {
  menu: 'Improve the selection',
  refine: 'Auto refine',
  rewrites: 'Suggest changes',
}

/** Something with a rectangle on screen: the selection, as Radix anchors to it. */
export interface VirtualAnchor {
  getBoundingClientRect: () => DOMRect
}

export function SelectionTools({
  anchor,
  open,
  onOpenChange,
  onClosed,
  scene,
  onApply,
  onImprove,
}: {
  anchor: RefObject<VirtualAnchor | null>
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The popout closed: the editor takes focus back. */
  onClosed: () => void
  scene: RuleScene
  /** Put `text` in place of the selection. */
  onApply: (text: string) => void
  onImprove: () => void
}) {
  const [mode, setMode] = useState<Mode>('menu')
  const pick = (next: Mode) => setMode(next)
  const close = () => onOpenChange(false)

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) setMode('menu')
        onOpenChange(next)
      }}
    >
      <PopoverAnchor virtualRef={anchor as RefObject<VirtualAnchor>} />
      <PopoverContent
        side="top"
        align="center"
        sideOffset={8}
        size={mode === 'menu' ? 'selection' : mode === 'refine' ? 'compose' : 'compose-wide'}
        aria-label={TITLES[mode]}
        // A row of buttons takes no focus: the selection stays live in the editor.
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          onClosed()
        }}
        // Its own surface, though React nests it in the screen: a shortcut typed here is not the screen's.
        onKeyDown={(event) => event.stopPropagation()}
      >
        {mode === 'menu' ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick('refine')}
            >
              Auto refine
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick('rewrites')}
            >
              Suggest changes
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onImprove()
                close()
              }}
            >
              Help me improve
            </Button>
          </>
        ) : mode === 'refine' ? (
          <RefineBody
            scene={scene}
            onApply={(text) => {
              onApply(text)
              close()
            }}
            onImprove={() => {
              onImprove()
              close()
            }}
            onClose={close}
          />
        ) : (
          <RewritesBody
            scene={scene}
            onApply={(text) => {
              onApply(text)
              close()
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  )
}
