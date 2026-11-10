import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pngHeader } from '@domain/__fixtures__/image.ts'
import { mergeConfig } from '@domain/config.ts'
import type { ScoreSubject } from '@domain/pack.ts'
import { describe, expect, it, vi } from 'vitest'
import { Jev } from '../jev.ts'
import { MissingAnswerError } from '../shared/questions.ts'
import type { JudgeContext, JudgeInput } from '../types.ts'
import { designPack } from './index.ts'
import { type DesignRaw, designScoring } from './score.ts'

const config = mergeConfig({ packs: ['design'] }, [designScoring])
const ctx: JudgeContext = {
  jev: new Jev(),
  useJev: false,
  config,
  skillDir: '/none',
  log: () => {},
}
const subject: ScoreSubject = {
  case: null,
  primary: { file: 'outputs/index.html', kind: 'html' },
  artifacts: [],
  words: 40,
  range: null,
}

const input = (html: string): JudgeInput => ({
  text: html,
  units: [],
  title: null,
  case: null,
  images: [],
  rules: [],
  evidence: {},
  artifacts: [{ file: 'outputs/index.html', kind: 'html' }],
  primary: { file: 'outputs/index.html', kind: 'html' },
  transcript: null,
  dir: '/none',
})

const failed = async (html: string): Promise<string[]> => {
  const raw = await designPack.judge(input(html), ctx)
  return raw?.markup?.filter((c) => !c.ok).map((c) => c.id) ?? []
}

const GOOD = `<!doctype html>
<html lang="en"><head><title>Home</title>
<meta name="viewport" content="width=device-width"></head>
<body><main><h1>Hi</h1><h2>Sub</h2><h3>Deep</h3><h2>Next</h2>
<img src="a.png" alt=""></main></body></html>`

describe('design markup checks', () => {
  it('passes a complete page with no Jev layer', async () => {
    const raw = await designPack.judge(input(GOOD), ctx)
    expect(raw?.markup?.every((c) => c.ok)).toBe(true)
    expect(raw?.jev).toBeNull()
  })

  it('flags a bare fragment on every shell check', async () => {
    expect(await failed('<div>hi</div>')).toEqual([
      'doctype',
      'lang',
      'title',
      'viewport',
      'main',
      'headings',
    ])
  })

  it('flags skipped heading levels and a page that starts below h1', async () => {
    expect(await failed(GOOD.replace('<h3>', '<h4>').replace('</h3>', '</h4>'))).toEqual([
      'headings',
    ])
    expect(await failed(GOOD.replace('<h1>Hi</h1>', ''))).toEqual(['headings'])
  })

  it('flags images without alt and inline handlers', async () => {
    const html = GOOD.replace('alt=""', '').replace('<main>', '<main onclick="go()">')
    expect(await failed(html)).toEqual(['alt', 'handlers'])
  })

  it('fails an empty title, an empty lang and look-alike attributes', async () => {
    const html = GOOD.replace('<title>Home</title>', '<title> </title>')
      .replace('lang="en"', 'lang=""')
      .replace('alt=""', 'data-alt="x"')
    expect(await failed(html)).toEqual(['lang', 'title', 'alt'])
  })

  it('reads attributes in any case, quoting and order', async () => {
    const html = GOOD.replace('<html lang="en">', "<HTML data-x='1' LANG=en>")
      .replace('name="viewport"', "content='x' NAME='Viewport'")
      .replace('<title>Home</title>', '<title data-x="a > b">Home</title>')
    expect(await failed(html)).toEqual([])
  })

  it('ignores markup inside comments and scripts, and handler-like text', async () => {
    const html = GOOD.replace(
      '</main>',
      '<!-- <img src="x.png"> --><script>const tag = "<img src=y onclick=z>"</script><p>Turn on=off</p></main>',
    )
    expect(await failed(html)).toEqual([])
  })

  it('reads only an event’s name after `on` as a handler', async () => {
    // Attributes a page may carry: none of them runs script.
    const plain = GOOD.replace('<main>', '<main one only once online onboarding="x">')
    expect(await failed(plain)).toEqual([])
    for (const handler of ['onclick', 'ONLOAD', 'onpointerdown', 'onanimationend'])
      expect(await failed(GOOD.replace('<main>', `<main ${handler}="go()">`))).toEqual(['handlers'])
  })

  it('knows every handler a page can carry, the prefixed ones included', async () => {
    for (const handler of [
      'onunhandledrejection',
      'onrejectionhandled',
      'oncommand',
      'onbeforematch',
      'onbeforetoggle',
      'oncontextlost',
      'onsecuritypolicyviolation',
      'onpointerrawupdate',
      'onvisibilitychange',
      'onreadystatechange',
      'onpageswap',
      'onscrollsnapchange',
      'onbegin',
      'onwebkitanimationend',
      'onwebkittransitionend',
      'onwebkitfullscreenchange',
    ])
      expect(await failed(GOOD.replace('<main>', `<main ${handler}="go()">`)), handler).toEqual([
        'handlers',
      ])
  })

  it('keeps Jev’s answer as it came, and fails the reading when one asked for is missing', async () => {
    const ask = vi.fn(async () => ({ hierarchy: { noul: 0.4996 } }))
    const asking = { ...ctx, jev: { ask } as unknown as Jev, useJev: true }
    const raw = await designPack.judge(input(GOOD), asking)
    // Rounded to three places this would be 0.5, and pass a threshold of 0.5 it did not reach.
    expect(raw?.jev?.hierarchy).toBe(0.4996)
    expect(raw && designScoring.score(raw, subject, config).layers.visual).toBe(0)
    ask.mockResolvedValueOnce({} as never)
    await expect(designPack.judge(input(GOOD), asking)).rejects.toThrow(MissingAnswerError)
  })

  it('stores no answer to the screenshot question Jev left out, and keeps the markup checks', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'st-design-'))
    try {
      mkdirSync(join(dir, 'outputs'))
      writeFileSync(join(dir, 'outputs/shot.png'), pngHeader(800, 600))
      const shot = { file: 'outputs/shot.png', kind: 'image' as const }
      const page = { ...input(GOOD), dir, artifacts: [...input(GOOD).artifacts, shot] }
      const ask = vi.fn(async (_state: unknown, _questions: Record<string, unknown>) => ({
        hierarchy: { noul: 0.9 },
      }))
      const raw = await designPack.judge(page, {
        ...ctx,
        jev: { ask } as unknown as Jev,
        useJev: true,
      })
      expect(Object.keys(ask.mock.calls[0][1])).toEqual(['hierarchy', 'finished'])
      expect(raw?.jev).toMatchObject({ hierarchy: 0.9, finished: null })
      expect(raw?.markup).toHaveLength(8)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('has nothing to judge without html or a screenshot', async () => {
    const md = { ...input(''), primary: null, artifacts: [] }
    expect(await designPack.judge(md, ctx)).toBeNull()
  })
})

describe('design scoring', () => {
  it('scores markup as the share of checks passed, with a flag per failure', () => {
    const raw: DesignRaw = {
      markup: [
        { id: 'a', ok: true, note: 'a' },
        { id: 'b', ok: false, note: 'no <main> landmark' },
      ],
      jev: null,
    }
    const scored = designScoring.score(raw, subject, config)
    expect(scored).toMatchObject({
      layers: { markup: 0.5, visual: null },
      flags: ['markup: no <main> landmark'],
    })
    // Code measured these, so neither is open to a correction.
    expect(scored.verdicts.map((v) => [v.text, v.met, v.open, v.layer])).toEqual([
      ['markup: a', true, false, 'markup'],
      ['markup: no <main> landmark', false, false, 'markup'],
    ])
    expect(designScoring.certainties(raw)).toEqual([])
  })

  it('counts the visual layer from Jev’s answers, with the reader’s own over them', () => {
    const raw: DesignRaw = {
      markup: null,
      jev: {
        hierarchy: 0.9,
        finished: 0.2,
        statements: [
          {
            id: 'g1',
            text: 'The form has a submit button.',
            weight: 2,
            noul: 0.1,
            units: null,
            best: null,
          },
        ],
      },
    }
    const jev = designScoring.score(raw, subject, config)
    // hierarchy met (1), finished missed (1), the check missed (×2)
    expect(jev.layers.visual).toBe(1 / 4)
    expect(jev.flags).toEqual([
      'screenshot does not look finished',
      'grader g1 (×2) not met: The form has a submit button.',
    ])
    const own = designScoring.score(raw, subject, config, {
      'check:The form has a submit button.': true,
    })
    expect(own.layers.visual).toBe(3 / 4)
    expect(own.flags).toEqual(['screenshot does not look finished'])
    expect(own.verdicts.find((v) => v.kind === 'check')).toMatchObject({
      met: true,
      corrected: true,
      weight: 2,
    })
  })

  it('leaves every layer null without raw answers', () => {
    expect(designScoring.score(null, subject, config).layers).toEqual({
      markup: null,
      visual: null,
    })
  })
})
