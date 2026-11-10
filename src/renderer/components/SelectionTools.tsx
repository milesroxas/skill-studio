/**
 * The popout over a selection in SKILL.md: what the writing checks found in
 * the rule, when they found anything, over three ways to improve it, in one
 * fixed order. Auto refine checks it and rewrites it only when something
 * drifts; Suggest changes offers three labelled rewrites; Help me improve
 * moves to the side panel for a few questions and a draft. The popout takes
 * no focus while it is a row of buttons, so typing goes on in the editor; it
 * takes focus once a result is in it.
 */
import type { Finding, RuleScene } from '@domain/lint.ts'
import { type RefObject, useState } from 'react'
import { FindingList, RefineBody } from './Refine.tsx'
import { RewritesBody } from './Rewrites.tsx'
import { Text } from './text.tsx'
import { Button } from './ui/button.tsx'
import { Popover, PopoverAnchor, PopoverContent, PopoverSection } from './ui/popover.tsx'

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
  id,
  anchor,
  open,
  onOpenChange,
  onClosed,
  scene,
  findings,
  onApply,
  onImprove,
}: {
  /** Names the popout, for the editor's key that moves the focus into it. */
  id: string
  anchor: RefObject<VirtualAnchor | null>
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The popout closed: the editor takes focus back. */
  onClosed: () => void
  scene: RuleScene
  /** What the checks found in the selected rule, shown over the actions; empty for prose. */
  findings: Finding[]
  /** Put `text` in place of the selection. */
  onApply: (text: string) => void
  onImprove: () => void
}) {
  const [mode, setMode] = useState<Mode>('menu')
  const pick = (next: Mode) => setMode(next)
  const close = () => onOpenChange(false)
  const noted = mode === 'menu' && findings.length > 0

  const actions = (
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
  )

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
        size={
          mode === 'menu'
            ? noted
              ? 'compose'
              : 'selection'
            : mode === 'refine'
              ? 'compose'
              : 'compose-wide'
        }
        id={id}
        aria-label={TITLES[mode]}
        aria-keyshortcuts="F6"
        // A row of buttons takes no focus: the selection stays live in the editor.
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          onClosed()
        }}
        // Its own surface, though React nests it in the screen: a shortcut typed here is not the screen's.
        onKeyDown={(event) => event.stopPropagation()}
      >
        {noted ? (
          <>
            <PopoverSection pad="text">
              <Text size="ui" weight="medium">
                Writing checks
              </Text>
              <FindingList findings={findings} />
            </PopoverSection>
            <PopoverSection>
              <div className="flex items-center gap-0.5">{actions}</div>
            </PopoverSection>
          </>
        ) : mode === 'menu' ? (
          actions
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
