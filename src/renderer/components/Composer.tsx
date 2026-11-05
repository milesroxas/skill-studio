/**
 * Where a request to the assistant is typed: a text area that grows, the model
 * in use, and one button that sends or stops. Return sends and Shift+Return
 * breaks the line, as in any chat. The side panel frames it as a box; inside a
 * popover it sits bare.
 */
import { cva, type VariantProps } from 'class-variance-authority'
import { ArrowUpIcon, SquareIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Spacer } from './layout.tsx'
import { ModelChip } from './ModelControls.tsx'
import { Button } from './ui/button.tsx'
import { Textarea } from './ui/textarea.tsx'

const composerVariants = cva('flex flex-col', {
  variants: {
    frame: {
      box: 'rounded-lg border border-input bg-background shadow-xs transition-[border-color,box-shadow] duration-150 ease-out focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30',
      bare: '',
    },
  },
  defaultVariants: { frame: 'bare' },
})

interface ComposerProps extends VariantProps<typeof composerVariants> {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  /** A reply is on its way: the button stops it. */
  running: boolean
  onStop: () => void
  /** What the field is for, read to assistive technology. */
  label: string
  placeholder: string
  autoFocus?: boolean
  /** Shown between the text and the controls, such as the reply to a request. */
  children?: ReactNode
  /** In place of the send button, such as what to do with a finished reply. */
  actions?: ReactNode
}

export function Composer({
  value,
  onChange,
  onSubmit,
  running,
  onStop,
  label,
  placeholder,
  autoFocus,
  children,
  actions,
  frame,
}: ComposerProps) {
  return (
    <form
      className={composerVariants({ frame })}
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <Textarea
        aria-label={label}
        rows={1}
        // The frame or the popover shows the focus; the field itself stays plain.
        className="max-h-48 min-h-10 resize-none overflow-y-auto border-0 bg-transparent px-3 py-2.5 shadow-none focus-visible:ring-0 dark:bg-transparent"
        placeholder={placeholder}
        autoFocus={autoFocus}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
          event.preventDefault()
          onSubmit()
        }}
      />
      {children}
      <div className="flex items-center gap-2 px-2 pb-2">
        <ModelChip />
        <Spacer />
        {running ? (
          <Button type="button" variant="outline" size="icon-sm" aria-label="Stop" onClick={onStop}>
            <SquareIcon aria-hidden="true" className="size-3 fill-current" />
          </Button>
        ) : (
          (actions ?? (
            <Button type="submit" size="icon-sm" aria-label="Send" disabled={!value.trim()}>
              <ArrowUpIcon aria-hidden="true" />
            </Button>
          ))
        )}
      </div>
    </form>
  )
}
