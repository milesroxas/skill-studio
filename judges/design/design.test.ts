import { mergeConfig } from '@core/config.ts'
import type { ScoreSubject } from '@core/pack.ts'
import { Jev } from '@server/jev.ts'
import { describe, expect, it } from 'vitest'
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
const subject: ScoreSubject = { case: null, primary: null, artifacts: [], words: 0, range: null }

const input = (html: string): JudgeInput => ({
  text: html,
  units: [],
  title: null,
  case: null,
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
    expect(designScoring.score(raw, subject, config)).toEqual({
      layers: { markup: 0.5, visual: null },
      flags: ['markup: no <main> landmark'],
    })
    expect(designScoring.confidence(raw)).toBeNull()
  })

  it('leaves every layer null without raw answers', () => {
    expect(designScoring.score(null, subject, config).layers).toEqual({
      markup: null,
      visual: null,
    })
  })
})
