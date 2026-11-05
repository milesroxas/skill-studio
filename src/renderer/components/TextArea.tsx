/**
 * A textarea that grows with its text, so the page is the only thing that
 * scrolls. CSS `field-sizing: content` does this where supported; elsewhere
 * the height is set from the content after each render and whenever the
 * field's width changes (rotation, resize, late font load).
 */
import { cva, type VariantProps } from 'class-variance-authority'
import { type ComponentProps, useEffect, useLayoutEffect, useRef } from 'react'
import { cn } from '../lib/utils.ts'
import { Textarea } from './ui/textarea.tsx'

const native = typeof CSS !== 'undefined' && CSS.supports('field-sizing', 'content')

function fitHeight(el: HTMLTextAreaElement) {
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`
}

const textAreaVariants = cva('resize-none overflow-hidden', {
  variants: {
    variant: {
      default: 'min-h-21',
      /** One line that grows as it wraps, such as a check: it reads as an input until it needs more. */
      line: 'min-h-9 py-[7px]',
    },
  },
  defaultVariants: { variant: 'default' },
})

export function TextArea({
  ref: outer,
  variant,
  className,
  ...props
}: ComponentProps<'textarea'> & VariantProps<typeof textAreaVariants>) {
  const ref = useRef<HTMLTextAreaElement>(null)
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
  return (
    <Textarea ref={attach} className={cn(textAreaVariants({ variant }), className)} {...props} />
  )
}
