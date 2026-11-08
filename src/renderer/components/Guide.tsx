/**
 * A document with its contents beside it: the guide. The contents list tracks
 * the section being read with a rail on its left edge, sits still while the
 * document scrolls on a wide window, and folds into one line over it on a
 * narrow one.
 */
import type { ComponentProps, ReactNode } from 'react'
import { Disclosure } from './Disclosure.tsx'

/** The contents beside a 70ch reading column; one column on narrow screens. */
export function GuideLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid max-w-[1120px] grid-cols-1 items-start gap-5 lg:grid-cols-[208px_minmax(0,70ch)] lg:gap-14">
      {children}
    </div>
  )
}

/** The document itself, styled by `.guide-body` in styles.css. */
export function GuideBody(props: Omit<ComponentProps<'article'>, 'className'>) {
  return <article className="guide-body" {...props} />
}

/**
 * The contents on a wide screen: in view while the page scrolls, never taller
 * than the pane (the window less the 48px top bar and the pane's 24px padding).
 */
export function TocNav({ children }: { children: ReactNode }) {
  return (
    <nav
      aria-label="On this page"
      className="sticky top-0 hidden max-h-[calc(100dvh-96px)] flex-col gap-3 overflow-y-auto text-ui lg:flex"
    >
      {children}
    </nav>
  )
}

/** The contents on a narrow screen: one line that opens, ruled off from the document. */
export function TocCompact({ children }: { children: ReactNode }) {
  return (
    <div className="border-b lg:hidden">
      <Disclosure summary="On this page">{children}</Disclosure>
    </div>
  )
}

export function TocList({ children }: { children: ReactNode }) {
  return <ol className="m-0 flex flex-col border-l p-0">{children}</ol>
}

/** Links under the contents, ruled off from them. */
export function TocFoot({ children }: { children: ReactNode }) {
  return <p className="m-0 flex flex-col gap-1.5 border-t pt-3">{children}</p>
}

/** One section in the contents: a rail marks the one being read. */
export function TocButton({
  current,
  ...props
}: Omit<ComponentProps<'button'>, 'className'> & { current: boolean }) {
  return (
    <button
      type="button"
      aria-current={current ? 'true' : undefined}
      className="-ml-px block min-h-8 w-full border-l border-transparent px-3 py-1 text-left text-ui text-muted-foreground transition-colors duration-150 ease-out focus-ring-inset hover:text-foreground aria-[current]:border-foreground aria-[current]:text-foreground pointer-coarse:min-h-11"
      {...props}
    />
  )
}

/** An outside link in the contents' foot: quiet, with no underline, darkening on hover. */
export function TocLink(props: Omit<ComponentProps<'a'>, 'className'>) {
  return (
    <a
      target="_blank"
      rel="noreferrer"
      className="text-muted-foreground no-underline transition-colors duration-150 ease-out hover:text-foreground"
      {...props}
    />
  )
}
