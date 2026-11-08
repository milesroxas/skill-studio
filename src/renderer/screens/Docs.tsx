/**
 * The guide, rendered from docs/guide.md so the app and GitHub show one text
 * and the same pictures. Sections get ids, a contents list tracks the one being
 * read, and every section can be jumped to or opened on. Loaded on demand, so
 * it costs nothing until opened.
 */

import { type ComponentProps, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import guide from '../../../docs/guide.md?raw'
import { Disclosure } from '../components/Disclosure.tsx'
import { Text } from '../components/text.tsx'
import { type GuideSection, guideSections } from '../guide.ts'
import { markdownHtml } from '../markdown.ts'

const REPO = 'https://github.com/milesroxas/skill-studio'

/** The guide's pictures, keyed as guide.md writes them: `images/loop.svg`. */
const IMAGES = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>('../../../docs/images/*', {
      eager: true,
      query: '?url',
      import: 'default',
    }),
  ).map(([path, url]) => [path.replace(/^.*\/docs\//, ''), url]),
)

/** The guide as HTML with an id on each section heading, and the list of sections. */
function render(text: string): { html: string; sections: GuideSection[] } {
  const sections = guideSections(text)
  let index = 0
  const html = markdownHtml(text, { images: IMAGES })
    .replace(/<h2>/g, () => `<h2 id="${sections[index++]?.id ?? ''}">`)
    // A wide table scrolls sideways on its own instead of widening the page.
    .replace(/<table>/g, '<div class="guide-table"><table>')
    .replace(/<\/table>/g, '</table></div>')
  return { html, sections }
}

export function Docs({
  section,
}: {
  /** A section to open on, by the id of its heading: the help sends a screen's own step. */
  section: string | null
}) {
  const { html, sections } = useMemo(() => render(guide), [])
  const body = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(sections[0]?.id ?? '')

  // Land on the section asked for, at once: the reader did not scroll here.
  useEffect(() => {
    if (!section) return
    document.getElementById(section)?.scrollIntoView({ block: 'start' })
    setActive(section)
  }, [section])

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
    const still = document.documentElement.dataset.motion === 'reduced'
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
          <TocLink href={`${REPO}#documentation`}>Full reference</TocLink>
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
function GuideLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid max-w-[1120px] grid-cols-1 items-start gap-5 lg:grid-cols-[208px_minmax(0,70ch)] lg:gap-14">
      {children}
    </div>
  )
}

/**
 * The contents on a wide screen: in view while the page scrolls, never taller
 * than the pane (the window less the 48px top bar and the pane's 24px padding).
 */
function TocNav({ children }: { children: ReactNode }) {
  return (
    <nav
      aria-label="On this page"
      className="sticky top-0 hidden max-h-[calc(100dvh-96px)] flex-col gap-3 overflow-y-auto text-ui lg:flex"
    >
      {children}
    </nav>
  )
}

/** The contents on a narrow screen: one line that opens, ruled off from the guide. */
function TocCompact({ children }: { children: ReactNode }) {
  return (
    <div className="border-b lg:hidden">
      <Disclosure summary="On this page">{children}</Disclosure>
    </div>
  )
}

function TocList({ children }: { children: ReactNode }) {
  return <ol className="m-0 flex flex-col border-l p-0">{children}</ol>
}

function TocFoot({ children }: { children: ReactNode }) {
  return <p className="m-0 flex flex-col gap-1.5 border-t pt-3">{children}</p>
}

/** One section in the contents: a rail marks the one being read. */
function TocButton({
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

function TocLink(props: Omit<ComponentProps<'a'>, 'className'>) {
  return (
    <a
      target="_blank"
      rel="noreferrer"
      className="text-muted-foreground no-underline transition-colors duration-150 ease-out hover:text-foreground"
      {...props}
    />
  )
}
