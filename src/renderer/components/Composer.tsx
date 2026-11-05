/**
 * Where a request to the assistant is typed: a text area that grows, the model
 * in use, and one button that sends or stops. Return sends and Shift+Return
 * breaks the line, as in any chat. Pictures join the request by the button,
 * by a paste or by a drop anywhere on it. The side panel frames it as a box;
 * inside a popover it sits bare.
 */
import { cva, type VariantProps } from 'class-variance-authority'
import { ArrowUpIcon, SquareIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { type Attached, picturesIn } from '../images.ts'
import { Spacer } from './layout.tsx'
import { ModelChip } from './ModelControls.tsx'
import { PicturePicker, PictureStrip, usePictureDrop } from './Pictures.tsx'
import { Hint } from './text.tsx'
import { Button } from './ui/button.tsx'
import { Textarea } from './ui/textarea.tsx'

const composerVariants = cva('flex flex-col', {
  variants: {
    frame: {
      box: 'rounded-lg border border-input bg-background shadow-xs transition-[border-color,box-shadow] duration-150 ease-out focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30',
      bare: '',
    },
    /** A picture is held over it: the drop lands here. */
    over: { true: '', false: '' },
  },
  compoundVariants: [
    { frame: 'box', over: true, className: 'border-ring ring-[3px] ring-ring/50' },
    { frame: 'bare', over: true, className: 'bg-accent/60' },
  ],
  defaultVariants: { frame: 'bare', over: false },
})

interface ComposerProps extends Pick<VariantProps<typeof composerVariants>, 'frame'> {
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
  /** The pictures that go with the request. Leave out where a request takes none. */
  pictures?: Attached
  /** A request of pictures and no words may be sent. */
  picturesSuffice?: boolean
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
  pictures,
  picturesSuffice = false,
}: ComposerProps) {
  const drop = usePictureDrop((files) => pictures?.add(files))
  const held = pictures ? pictures.images.length + pictures.adding : 0
  const ready =
    !pictures?.adding && Boolean(value.trim() || (picturesSuffice && pictures?.images.length))
  const submit = () => {
    if (ready && !running) onSubmit()
  }
  return (
    <form
      className={composerVariants({ frame, over: Boolean(pictures) && drop.over })}
      {...(pictures ? drop.handlers : {})}
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      {pictures && held ? (
        <PictureStrip
          size="sm"
          label="Pictures with this request"
          className="px-3 pt-3"
          images={pictures.images}
          adding={pictures.adding}
          onRemove={pictures.remove}
        />
      ) : null}
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
          submit()
        }}
        onPaste={(event) => {
          const files = pictures ? picturesIn(event.clipboardData) : []
          if (!files.length) return
          // A copied picture often brings its file name as text: the picture is what was meant.
          event.preventDefault()
          pictures?.add(files)
        }}
      />
      {pictures?.error ? (
        <Hint tone="destructive" role="alert" className="px-3 pb-2">
          {pictures.error}
        </Hint>
      ) : null}
      {children}
      <div className="flex items-center gap-1 px-2 pb-2">
        {pictures ? (
          <PicturePicker variant="icon-sm" label="Add pictures" onFiles={pictures.add} />
        ) : null}
        <ModelChip />
        <Spacer />
        {running ? (
          <Button type="button" variant="outline" size="icon-sm" aria-label="Stop" onClick={onStop}>
            <SquareIcon aria-hidden="true" className="size-3 fill-current" />
          </Button>
        ) : (
          (actions ?? (
            <Button type="submit" size="icon-sm" aria-label="Send" disabled={!ready}>
              <ArrowUpIcon aria-hidden="true" />
            </Button>
          ))
        )}
      </div>
    </form>
  )
}
