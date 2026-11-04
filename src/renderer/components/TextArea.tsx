/**
 * A textarea that grows with its text, so the page is the only thing that
 * scrolls. CSS `field-sizing: content` does this where supported; elsewhere
 * the height is set from the content after each render and whenever the
 * field's width changes (rotation, resize, late font load).
 */
import { type ComponentProps, useEffect, useLayoutEffect, useRef } from 'react'

const native = typeof CSS !== 'undefined' && CSS.supports('field-sizing', 'content')

function fitHeight(el: HTMLTextAreaElement) {
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`
}

export function TextArea({ ref: outer, ...props }: ComponentProps<'textarea'>) {
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
  return <textarea ref={attach} {...props} />
}
