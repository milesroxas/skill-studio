/**
 * The guide, rendered from docs/guide.md so the app and GitHub show one text.
 * Sections get ids, a contents list tracks the one being read, and every
 * section can be jumped to. Loaded on demand, so it costs nothing until opened.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import guide from '../../../docs/guide.md?raw'
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

  // The section being read is the last heading that has passed the top third of the screen.
  useEffect(() => {
    const root = body.current
    if (!root) return
    const headings = [...root.querySelectorAll<HTMLElement>('h2[id]')]
    const update = () => {
      const line = window.innerHeight / 3
      let current = headings[0]?.id ?? ''
      for (const h of headings) if (h.getBoundingClientRect().top <= line) current = h.id
      setActive(current)
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
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
    <ol>
      {sections.map((s) => (
        <li key={s.id}>
          <button
            type="button"
            aria-current={active === s.id ? 'true' : undefined}
            onClick={() => jump(s.id)}
          >
            {s.title}
          </button>
        </li>
      ))}
    </ol>
  )

  return (
    <div className="guide">
      <nav className="guide-toc" aria-label="On this page">
        <p className="guide-toc-title">On this page</p>
        {contents}
        <p className="guide-toc-foot">
          <a href={`${REPO}#readme`} target="_blank" rel="noreferrer">
            Full reference
          </a>
          <a href={`${REPO}/blob/main/docs/guide.md`} target="_blank" rel="noreferrer">
            Edit on GitHub
          </a>
        </p>
      </nav>
      <details className="guide-toc-compact">
        <summary>On this page</summary>
        {contents}
      </details>
      <article
        ref={body}
        className="guide-body"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: markdown.ts escapes every string
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
