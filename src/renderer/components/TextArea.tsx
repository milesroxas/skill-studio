/**
 * A textarea that grows with its text, so the page is the only thing that
 * scrolls. CSS `field-sizing: content` does this where supported; elsewhere
 * the height is set from the content after each render and whenever the
 * field's width changes (rotation, resize, late font load).
 *
 * Give it `assist`, the kind of field it is, and a button in its corner opens
 * "write with AI" for that kind. Typed and written text reach the caller the
 * same way, through `onValueChange`, and written text goes in as typing would,
 * so Undo brings back what it replaced. `corner` is one more `CornerButton`
 * about the field's content, before the pen, and `foot` is content attached
 * under the text inside the field's own edge, as the composer holds its
 * pictures: the picture a check is about is part of the check, not a thing
 * beside it.
 */
import { cva, type VariantProps } from 'class-variance-authority'
import { type ComponentProps, type ReactNode, useEffect, useLayoutEffect, useRef } from 'react'
import { cn } from '../lib/utils.ts'
import { Assist, AssistButton, type AssistSpec } from './Assist.tsx'
import { Textarea } from './ui/textarea.tsx'

const native = typeof CSS !== 'undefined' && CSS.supports('field-sizing', 'content')

function fitHeight(el: HTMLTextAreaElement) {
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`
}

/**
 * Replace a field's text the way typing over a selection does. The browser
 * then keeps the old text in the field's own undo history, which setting the
 * value would wipe. False when the browser refuses, and nothing has changed.
 */
function typeOver(el: HTMLTextAreaElement, text: string): boolean {
  el.focus()
  // The command writes into whatever holds the focus: it must be this field.
  if (document.activeElement !== el) return false
  el.select()
  return document.execCommand('insertText', false, text)
}

const textAreaVariants = cva('resize-none overflow-hidden', {
  variants: {
    variant: {
      default: 'min-h-21',
      /**
       * One line that grows as it wraps, such as a check: it reads as an input
       * until it needs more. 7px top and bottom centre one 20px line in the
       * input's 36px, borders included.
       */
      line: 'min-h-9 py-[7px]',
    },
  },
  defaultVariants: { variant: 'default' },
})

type TextAreaProps = Omit<ComponentProps<'textarea'>, 'value'> &
  VariantProps<typeof textAreaVariants> & {
    value: string
    /** The new text, whether it was typed or written by the assistant. */
    onValueChange: (value: string) => void
    /** The kind of field this is, which puts "write with AI" in its corner. */
    assist?: AssistSpec
    /** A `CornerButton` about the field's content, in the corner before the pen. */
    corner?: ReactNode
    /** Attached content under the text, inside the field: a 40px picture row. */
    foot?: ReactNode
  }

export function TextArea({
  ref: outer,
  variant,
  className,
  value,
  onValueChange,
  onChange,
  assist,
  corner,
  foot,
  ...props
}: TextAreaProps) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const frame = useRef<HTMLDivElement>(null)
  /** Both this component and the caller see the element. */
  const attach = (el: HTMLTextAreaElement | null) => {
    ref.current = el
    if (typeof outer === 'function') outer(el)
    else if (outer) outer.current = el
  }
  useLayoutEffect(() => {
    if (!native && ref.current) fitHeight(ref.current)
  })
  useEffect(() => {
    const el = ref.current
    if (native || !el) return
    let width = el.clientWidth
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === width) return
      width = el.clientWidth
      fitHeight(el)
    })
    observer.observe(el)
    document.fonts?.ready.then(() => fitHeight(el))
    return () => observer.disconnect()
  }, [])
  const field = (
    <Textarea
      ref={attach}
      // The corner buttons lie over the field, so the text keeps clear of them: one is 24px
      // at 6px from the edge; two stand 12px apart, so their 36px hit areas meet and do not overlap.
      className={cn(
        textAreaVariants({ variant }),
        assist && corner ? 'pr-17' : (assist || corner) && 'pr-9',
        // The foot lies inside the bottom padding: 8px under the text, a 40px picture, 8px to the edge.
        foot && 'pb-14',
        className,
      )}
      value={value}
      onChange={(event) => {
        onChange?.(event)
        onValueChange(event.target.value)
      }}
      {...props}
    />
  )
  if (!assist && !corner && !foot) return field
  return (
    <div ref={frame} className="relative min-w-0">
      {field}
      {foot ? <div className="absolute bottom-2 left-3">{foot}</div> : null}
      <span className="absolute top-1.5 right-1.5 flex gap-3">
        {corner}
        {assist ? (
          <Assist
            {...assist}
            // It opens under the field, never over the text it is about.
            anchor={frame}
            value={value}
            onApply={(text) => {
              // Typing over fires the field's own change, which carries the text to the caller.
              if (ref.current && typeOver(ref.current, text)) return
              onValueChange(text)
              ref.current?.focus()
            }}
          >
            <AssistButton field={assist.field} />
          </Assist>
        ) : null}
      </span>
    </div>
  )
}
