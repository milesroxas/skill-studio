/**
 * The guide, rendered from docs/guide.md so the app and GitHub show one text.
 * Sections get ids, a contents list tracks the one being read, and every
 * section can be jumped to. Loaded on demand, so it costs nothing until opened.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import guide from '../../../docs/guide.md?raw'
import { Text } from '../components/text.tsx'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../components/ui/collapsible.tsx'
import { cn } from '../lib/utils.ts'
import { markdownHtml } from '../markdown.ts'

const REPO = 'https://github.com/milesroxas/skill-studio'

interface Section {
  id: string
  title: string
}

const slug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/`/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/** The guide as HTML with an id on each section heading, and the list of sections. */
function render(text: string): { html: string; sections: Section[] } {
  const sections = [...text.matchAll(/^## (.+)$/gm)].map((m) => ({
    id: slug(m[1]),
    title: m[1].replace(/`/g, ''),
  }))
  let index = 0
  const html = markdownHtml(text)
    .replace(/<h2>/g, () => `<h2 id="${sections[index++]?.id ?? ''}">`)
    // A wide table scrolls sideways on its own instead of widening the page.
    .replace(/<table>/g, '<div class="guide-table"><table>')
    .replace(/<\/table>/g, '</table></div>')
  return { html, sections }
}

export function Docs() {
  const { html, sections } = useMemo(() => render(guide), [])
  const body = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(sections[0]?.id ?? '')

  // The section being read is the last heading that has passed the top third of the pane.
  // The pane scrolls, not the window, so that is what to listen to.
  useEffect(() => {
    const root = body.current
    const scroller = root?.closest('main')
    if (!root || !scroller) return
    const headings = [...root.querySelectorAll<HTMLElement>('h2[id]')]
    const update = () => {
      const box = scroller.getBoundingClientRect()
      const line = box.top + box.height / 3
      let current = headings[0]?.id ?? ''
      for (const h of headings) if (h.getBoundingClientRect().top <= line) current = h.id
      setActive(current)
    }
    update()
    scroller.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      scroller.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  // Section links are buttons: the app's routes live in the URL hash.
  const jump = (id: string) => {
    const target = document.getElementById(id)
    if (!target) return
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    target.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' })
    setActive(id)
  }

  const contents = (
    <TocList>
      {sections.map((s) => (
        <li key={s.id}>
          <TocButton current={active === s.id} onClick={() => jump(s.id)}>
            {s.title}
          </TocButton>
        </li>
      ))}
    </TocList>
  )

  return (
    <GuideLayout>
      <TocNav>
        <Text as="p" tone="faint" size="xs" weight="medium">
          On this page
        </Text>
        {contents}
        <TocFoot>
          <TocLink href={`${REPO}#readme`}>Full reference</TocLink>
          <TocLink href={`${REPO}/blob/main/docs/guide.md`}>Edit on GitHub</TocLink>
        </TocFoot>
      </TocNav>
      <TocCompact>{contents}</TocCompact>
      <article
        ref={body}
        className="guide-body"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: markdown.ts escapes every string
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </GuideLayout>
  )
}

/** The contents beside a 70ch reading column; one column on narrow screens. */
function GuideLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid max-w-[1120px] grid-cols-1 items-start gap-5 lg:grid-cols-[208px_minmax(0,70ch)] lg:gap-14">
      {children}
    </div>
  )
}

/** The contents on a wide screen: in view while the page scrolls. */
function TocNav({ children }: { children: React.ReactNode }) {
  return (
    <nav
      aria-label="On this page"
      className="sticky top-0 hidden max-h-[calc(100dvh-96px)] flex-col gap-3 overflow-y-auto text-[13px] lg:flex"
    >
      {children}
    </nav>
  )
}

/** The contents on a narrow screen: one line that opens. */
function TocCompact({ children }: { children: React.ReactNode }) {
  return (
    <Collapsible className="rounded-lg border bg-card px-3.5 shadow-sm lg:hidden">
      <CollapsibleTrigger className="flex min-h-11 w-full cursor-pointer items-center text-muted-foreground">
        On this page
      </CollapsibleTrigger>
      <CollapsibleContent className="pb-3 [&_button]:min-h-10">{children}</CollapsibleContent>
    </Collapsible>
  )
}

function TocList({ children }: { children: React.ReactNode }) {
  return <ol className="flex flex-col border-l p-0">{children}</ol>
}

function TocFoot({ children }: { children: React.ReactNode }) {
  return <p className="m-0 mt-2 flex flex-col gap-1.5 border-t pt-3">{children}</p>
}

/** One section in the contents: a rail marks the one being read. */
function TocButton({
  current,
  className,
  ...props
}: React.ComponentProps<'button'> & { current: boolean }) {
  return (
    <button
      type="button"
      aria-current={current ? 'true' : undefined}
      className={cn(
        '-ml-px block min-h-[30px] w-full border-l border-transparent px-3 py-1.25 text-left leading-snug text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-[current]:border-foreground aria-[current]:text-foreground',
        className,
      )}
      {...props}
    />
  )
}

function TocLink(props: React.ComponentProps<'a'>) {
  return (
    <a
      target="_blank"
      rel="noreferrer"
      className="text-muted-foreground no-underline transition-colors hover:text-foreground"
      {...props}
    />
  )
}
