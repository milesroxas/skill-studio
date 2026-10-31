/**
 * The design judge pack. It reads the HTML as text and a PNG or JPEG the
 * agent left in outputs/, if any. It does not render the page, so layout,
 * color and responsive behaviour are judged only when a screenshot exists.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { State } from '@server/jev.ts'
import { image, noul } from '@typesafe-ai/sdk'
import { askStatements, pairwiseText, round } from '../shared/questions.ts'
import type { JudgePack } from '../types.ts'
import { type DesignConfig, type DesignRaw, designScoring, type MarkupCheck } from './score.ts'

function markupChecks(html: string): MarkupCheck[] {
  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0])
  const headings = [...html.matchAll(/<h([1-6])\b/gi)].map((m) => Number(m[1]))
  let orderly = headings.length > 0 && headings[0] === 1
  for (let i = 1; i < headings.length; i += 1)
    if (headings[i] > headings[i - 1] + 1) orderly = false
  return [
    { id: 'doctype', ok: /^\s*<!doctype html>/i.test(html), note: 'no <!doctype html>' },
    { id: 'lang', ok: /<html\b[^>]*\blang=/i.test(html), note: 'no lang on <html>' },
    { id: 'title', ok: /<title>\s*\S/i.test(html), note: 'no <title>' },
    {
      id: 'viewport',
      ok: /<meta\b[^>]*name=["']viewport["']/i.test(html),
      note: 'no viewport meta',
    },
    { id: 'main', ok: /<main\b/i.test(html), note: 'no <main> landmark' },
    {
      id: 'headings',
      ok: orderly,
      note: headings.length ? 'headings skip a level or do not start at h1' : 'no headings',
    },
    {
      id: 'alt',
      ok: imgs.every((tag) => /\balt=/i.test(tag)),
      note: `${imgs.filter((tag) => !/\balt=/i.test(tag)).length} <img> without alt`,
    },
    {
      id: 'handlers',
      ok: !/\son[a-z]+\s*=/i.test(html),
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
      const state: State = {}
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
        hierarchy: round(answers.hierarchy.noul),
        finished: answers.finished ? round(answers.finished.noul) : null,
        statements,
      }
    }
    return { markup, jev }
  },
  pairwise: pairwiseText,
}
