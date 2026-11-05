/**
 * The design judge pack. It reads the HTML as text and a PNG or JPEG the
 * agent left in outputs/, if any. It does not render the page, so layout,
 * color and responsive behaviour are judged only when a screenshot exists.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { round, stripComments } from '@domain/text.ts'
import { image, noul } from '@typesafe-ai/sdk'
import type { JevState } from '../jev.ts'
import { askStatements, pairwiseText, requestOf } from '../shared/questions.ts'
import type { JudgePack } from '../types.ts'
import { type DesignConfig, type DesignRaw, designScoring, type MarkupCheck } from './score.ts'

interface Tag {
  name: string
  /** Attribute names lowercased; a valueless attribute maps to ''. */
  attrs: Map<string, string>
}

/** Start tags, attribute values unquoted. Comments and script and style bodies are not markup. */
function tagsOf(html: string): Tag[] {
  const markup = stripComments(html).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '<$1>')
  const tags: Tag[] = []
  const tag =
    /<([a-z][a-z0-9-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>/gi
  const attr = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
  for (const [, name, rest] of markup.matchAll(tag)) {
    const attrs = new Map<string, string>()
    for (const [, key, double, single, bare] of rest.matchAll(attr)) {
      const lower = key.toLowerCase()
      if (!attrs.has(lower)) attrs.set(lower, double ?? single ?? bare ?? '')
    }
    tags.push({ name: name.toLowerCase(), attrs })
  }
  return tags
}

/** Text of the first `<title>`, tags and surrounding space removed; null without one. */
const titleText = (html: string): string | null => {
  const match = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(stripComments(html))
  return match ? match[1].replace(/<[^>]*>/g, '').trim() : null
}

function markupChecks(html: string): MarkupCheck[] {
  const tags = tagsOf(html)
  const imgs = tags.filter((t) => t.name === 'img')
  const headings = tags.filter((t) => /^h[1-6]$/.test(t.name)).map((t) => Number(t.name[1]))
  let orderly = headings.length > 0 && headings[0] === 1
  for (let i = 1; i < headings.length; i += 1)
    if (headings[i] > headings[i - 1] + 1) orderly = false
  const root = tags.find((t) => t.name === 'html')
  // alt="" is valid: it marks a decorative image. Only a missing alt fails.
  const missingAlt = imgs.filter((t) => !t.attrs.has('alt')).length
  return [
    { id: 'doctype', ok: /^\uFEFF?\s*<!doctype html\s*>/i.test(html), note: 'no <!doctype html>' },
    { id: 'lang', ok: Boolean(root?.attrs.get('lang')?.trim()), note: 'no lang on <html>' },
    { id: 'title', ok: Boolean(titleText(html)), note: 'no <title>' },
    {
      id: 'viewport',
      ok: tags.some((t) => t.name === 'meta' && t.attrs.get('name')?.toLowerCase() === 'viewport'),
      note: 'no viewport meta',
    },
    { id: 'main', ok: tags.some((t) => t.name === 'main'), note: 'no <main> landmark' },
    {
      id: 'headings',
      ok: orderly,
      note: headings.length ? 'headings skip a level or do not start at h1' : 'no headings',
    },
    { id: 'alt', ok: missingAlt === 0, note: `${missingAlt} <img> without alt` },
    {
      id: 'handlers',
      ok: !tags.some((t) => [...t.attrs.keys()].some((key) => /^on[a-z]+$/.test(key))),
      note: 'inline event handler attributes',
    },
  ]
}

export const designPack: JudgePack<DesignRaw> = {
  ...designScoring,
  label: 'Design: markup checks and a visual read of the HTML or screenshot',
  artifacts: ['html', 'image'],
  async judge(input, ctx) {
    const html = input.primary?.kind === 'html' ? input.text : ''
    const shot =
      input.artifacts.find((a) => a.kind === 'image' && /\.(?:png|jpe?g)$/i.test(a.file)) ?? null
    if (!html && !shot) return null
    const markup = html ? markupChecks(html) : null
    let jev: DesignRaw['jev'] = null
    if (ctx.useJev) {
      const state: JevState = {}
      const request = requestOf(input)
      if (request) state.request = request
      if (html) state.html = html.slice(0, (ctx.config as DesignConfig).design.maxChars)
      if (shot) state.screenshot = image(readFileSync(join(input.dir, shot.file)))
      const subject = html ? 'html' : 'screenshot'
      const questions = {
        hierarchy: noul(
          `Does \`${subject}\` give the page one clear primary heading or message, with the rest subordinate to it?`,
          {
            true: 'One element reads as the main point by size, position or heading level, and the other parts support it.',
            false: 'Several parts compete to be the main point, or there is no main point at all.',
          },
        ),
        ...(shot
          ? {
              finished: noul('Does `screenshot` show a finished page, with nothing broken?', {
                true: 'Text is readable, nothing overlaps or overflows, and there is no placeholder text or empty box.',
                false:
                  'Something overlaps, overflows or is cut off, or placeholder text, lorem ipsum or an empty region shows.',
              }),
            }
          : {}),
      }
      const [answers, statements] = await Promise.all([
        ctx.jev.ask(state, questions),
        askStatements(input.case?.graders ?? [], state, subject, ctx),
      ])
      jev = {
        hierarchy: round(answers.hierarchy.noul, 3),
        finished: answers.finished ? round(answers.finished.noul, 3) : null,
        statements,
      }
    }
    return { markup, jev }
  },
  pairwise: pairwiseText,
}
