import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pngHeader } from '@domain/__fixtures__/image.ts'
import { mergeConfig } from '@domain/config.ts'
import type { ScoreSubject } from '@domain/pack.ts'
import { image } from '@typesafe-ai/sdk'
import { describe, expect, it, vi } from 'vitest'
import { Jev } from '../jev.ts'
import { MissingAnswerError } from '../shared/questions.ts'
import type { JudgeContext, JudgeInput, PageShot } from '../types.ts'
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

/** A mockup's artboard: a page, and no web page. It has no lang, viewport, landmark or heading. */
const ARTBOARD =
  '<!doctype html><html><head><meta charset="utf-8"></head><body><div id="art"></div></body></html>'

const input = (html: string, renders: PageShot[] = []): JudgeInput => ({
  text: html,
  units: [],
  case: null,
  images: [],
  rules: [],
  artifacts: [{ file: 'outputs/index.html', kind: 'html' }],
  primary: { file: 'outputs/index.html', kind: 'html' },
  others: [],
  skill: null,
  notes: null,
  transcript: null,
  dir: '/none',
  renders,
})

const drawn = (id: 'desktop' | 'phone', width: number, height: number): PageShot => ({
  size: { id, width, height },
  read: { image: image(pngHeader(width, height)), problem: null },
  layout: null,
})

type Ask = (state: Record<string, unknown>, questions: Record<string, unknown>) => Promise<unknown>
const asking = (ask: Ask): JudgeContext => ({
  ...ctx,
  jev: { ask } as unknown as Jev,
  useJev: true,
})

describe('design pack', () => {
  it('says nothing of a page nobody drew: it looks, and code holds a page to no rule of its own', async () => {
    const ask = vi.fn<Ask>(async () => ({}))
    // Without Jev, and with Jev but no picture: a page with no lang or landmark is failed for neither.
    expect(await designPack.judge(input(ARTBOARD, [drawn('desktop', 1280, 960)]), ctx)).toBeNull()
    expect(await designPack.judge(input(ARTBOARD), asking(ask))).toBeNull()
    expect(ask).not.toHaveBeenCalled()
  })

  it('asks of the picture alone: one main point, nothing broken', async () => {
    const ask = vi.fn<Ask>(async () => ({ hierarchy: { noul: 0.9 }, finished: { noul: 0.8 } }))
    const raw = await designPack.judge(input(ARTBOARD, [drawn('desktop', 1280, 960)]), asking(ask))
    const [state, questions] = ask.mock.calls[0]
    expect(Object.keys(questions)).toEqual(['hierarchy', 'finished'])
    // The HTML is the generic pack's to read against the skill's rules, not this pack's.
    expect(Object.keys(state)).toEqual(['screenshot'])
    const scored = raw && designScoring.score(raw, subject, config)
    expect(scored?.layers).toEqual({ visual: 1 })
    expect(scored?.flags).toEqual([])
  })

  it('does not call plain blocks broken, so a wireframe is not failed for being one', async () => {
    const ask = vi.fn<Ask>(async () => ({ hierarchy: { noul: 0.9 }, finished: { noul: 0.8 } }))
    await designPack.judge(input(ARTBOARD, [drawn('desktop', 1280, 960)]), asking(ask))
    const finished = ask.mock.calls[0][1].finished as { criteria: { true: string; false: string } }
    expect(finished.criteria.true).toContain('Plain blocks standing in for content are not broken')
    expect(finished.criteria.false).not.toMatch(/placeholder|lorem|empty/i)
  })

  it('keeps Jev’s answer as it came, and fails the reading when one asked for is missing', async () => {
    const ask = vi.fn<Ask>(async () => ({ hierarchy: { noul: 0.4996 }, finished: { noul: 0.9 } }))
    const page = input(ARTBOARD, [drawn('desktop', 1280, 960)])
    const raw = await designPack.judge(page, asking(ask))
    // Rounded to three places this would be 0.5, and pass a threshold of 0.5 it did not reach.
    expect(raw?.jev?.hierarchy).toBe(0.4996)
    const one = { ...config, yes: 0.5, no: 0.5 }
    expect(raw && designScoring.score(raw, subject, one).layers.visual).toBe(0.5)
    // Between the two thresholds every skill starts with, it is no answer: the layer counts the other.
    const scored = raw && designScoring.score(raw, subject, config)
    expect(scored?.layers.visual).toBe(1)
    expect(scored?.flags).toEqual([])
    expect(scored?.verdicts.find((v) => v.id === 'other:hierarchy')?.aside).toBe('unsure')
    ask.mockResolvedValueOnce({ hierarchy: { noul: 0.9 } })
    await expect(designPack.judge(page, asking(ask))).rejects.toThrow(MissingAnswerError)
  })

  it('asks whether a page drawn at phone width fits, and stores no answer to that one when Jev leaves it out', async () => {
    const page = input(ARTBOARD, [drawn('desktop', 1280, 960), drawn('phone', 390, 1200)])
    const ask = vi.fn<Ask>(async () => ({
      hierarchy: { noul: 0.9 },
      finished: { noul: 0.8 },
      phone: { noul: 0.1 },
    }))
    const raw = await designPack.judge(page, asking(ask))
    const [state, questions] = ask.mock.calls[0]
    expect(Object.keys(questions)).toEqual(['hierarchy', 'finished', 'phone'])
    expect(Object.keys(state)).toEqual(['screenshot', 'phone'])
    expect(raw?.jev).toMatchObject({ finished: 0.8, phone: 0.1 })
    const scored = raw && designScoring.score(raw, subject, config)
    expect(scored?.flags).toEqual(['page does not fit a phone screen'])
    expect(scored?.verdicts.find((v) => v.id === 'other:phone')).toMatchObject({
      text: 'The page fits a phone screen',
      met: false,
    })
    ask.mockResolvedValueOnce({ hierarchy: { noul: 0.9 }, finished: { noul: 0.8 } })
    const left = await designPack.judge(page, asking(ask))
    expect(left?.jev).toEqual({ hierarchy: 0.9, finished: 0.8, phone: null })
  })

  it('takes the page as drawn over the agent’s own screenshot, which stands in when none was', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'st-design-'))
    try {
      mkdirSync(join(dir, 'outputs'))
      writeFileSync(join(dir, 'outputs/shot.png'), pngHeader(800, 600))
      const shot = { file: 'outputs/shot.png', kind: 'image' as const }
      const desktop = drawn('desktop', 1280, 960)
      const page = (renders: PageShot[]): JudgeInput => ({
        ...input(ARTBOARD, renders),
        dir,
        artifacts: [...input(ARTBOARD).artifacts, shot],
      })
      const ask = vi.fn<Ask>(async () => ({ hierarchy: { noul: 0.9 }, finished: { noul: 0.8 } }))
      await designPack.judge(page([desktop]), asking(ask))
      expect(ask.mock.calls[0][0].screenshot).toBe(desktop.read.image)
      // A drawing Jev cannot read, or none: the agent's own screenshot stands in.
      const unreadable = await designPack.judge(
        page([{ size: desktop.size, read: { image: null, problem: 'too small' }, layout: null }]),
        asking(ask),
      )
      expect(ask.mock.calls[1][0].screenshot).not.toBe(desktop.read.image)
      expect(ask.mock.calls[1][0].screenshot).toBeTruthy()
      expect(unreadable?.unread).toBeUndefined()
      await designPack.judge(page([]), asking(ask))
      expect(ask.mock.calls[2][0].screenshot).toBeTruthy()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('says so when the only picture is one Jev cannot read, and asks nothing', async () => {
    const ask = vi.fn<Ask>(async () => ({}))
    const unreadable: PageShot = {
      size: { id: 'desktop', width: 100, height: 100 },
      read: { image: null, problem: 'too small' },
      layout: null,
    }
    const raw = await designPack.judge(input(ARTBOARD, [unreadable]), asking(ask))
    expect(raw).toEqual({ jev: null, unread: 'screenshot not judged: too small' })
    expect(ask).not.toHaveBeenCalled()
    expect(raw && designScoring.score(raw, subject, config)).toMatchObject({
      layers: { visual: null },
      flags: ['screenshot not judged: too small'],
    })
  })

  it('has nothing to judge without a page or a picture', async () => {
    const md = { ...input(''), primary: null, artifacts: [] }
    expect(await designPack.judge(md, asking(vi.fn<Ask>(async () => ({}))))).toBeNull()
  })
})

describe('design scoring', () => {
  it('counts the look from Jev’s answers, with the reader’s own over them', () => {
    const raw: DesignRaw = { jev: { hierarchy: 0.9, finished: 0.2 } }
    const jev = designScoring.score(raw, subject, config)
    expect(jev.layers.visual).toBe(1 / 2)
    expect(jev.flags).toEqual(['something looks broken'])
    const own = designScoring.score(raw, subject, config, { 'other:finished': true })
    expect(own.layers.visual).toBe(1)
    expect(own.flags).toEqual([])
    expect(own.verdicts.find((v) => v.id === 'other:finished')).toMatchObject({
      met: true,
      corrected: true,
    })
    expect(designScoring.certainties(raw)).toHaveLength(2)
  })

  it('counts neither the shell checks nor the checks a reading from before holds', () => {
    // What `report.json` kept when the pack held a page to a web page's shell and marked the case's checks.
    const old = {
      markup: [{ id: 'lang', ok: false, note: 'no lang on <html>' }],
      jev: {
        hierarchy: 0.9,
        finished: null,
        statements: [{ id: 'g1', text: 'x', weight: 2, noul: 0.1, units: null, best: null }],
      },
    } as DesignRaw
    const scored = designScoring.score(old, subject, config)
    expect(scored.layers).toEqual({ visual: 1 })
    expect(scored.flags).toEqual([])
    expect(scored.verdicts.map((v) => v.id)).toEqual(['other:hierarchy'])
  })

  it('leaves the layer null without raw answers', () => {
    expect(designScoring.score(null, subject, config).layers).toEqual({ visual: null })
  })
})
