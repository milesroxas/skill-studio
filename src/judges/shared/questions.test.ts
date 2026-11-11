import { pngHeader } from '@domain/__fixtures__/image.ts'
import type { Case } from '@domain/schemas.ts'
import { Image, image } from '@typesafe-ai/sdk'
import { describe, expect, it } from 'vitest'
import { holdsImage } from '../images.ts'
import type { JudgeInput } from '../types.ts'
import { asksJev, MissingAnswerError, noulOf, requestState, scoreOf } from './questions.ts'

const picture = image(pngHeader(800, 600))

const output = (over: Partial<JudgeInput> = {}): JudgeInput => ({
  text: 'note',
  units: [],
  case: null,
  images: [],
  rules: [],
  artifacts: [],
  primary: null,
  others: [],
  notes: null,
  transcript: null,
  dir: '/sample',
  renders: [],
  ...over,
})

describe('requestState', () => {
  it("is the case's prompt, and nothing without a case", () => {
    const withCase = output({ case: { id: 'intro', prompt: '  Thank Elena.  ' } as Case })
    expect(requestState(withCase)).toEqual({ request: 'Thank Elena.' })
    expect(requestState(output())).toEqual({})
  })

  it('holds the pictures a request came with, once', () => {
    const withCase = output({
      case: { id: 'c1', prompt: 'Describe the chart.' } as Case,
      images: [{ name: 'chart.png', image: picture }],
    })
    expect(requestState(withCase)).toEqual({
      request: 'Describe the chart.',
      request_images: [picture],
    })
  })
})

describe('pictures', () => {
  it('finds a picture however deep it sits in a request', () => {
    expect(picture).toBeInstanceOf(Image)
    expect(holdsImage({ frames: [{ at: 1, frame: picture }] })).toBe(true)
    expect(holdsImage({ output: 'text', rules: ['a', 'b'] })).toBe(false)
  })
})

describe('whether Jev is asked', () => {
  const of = (judge: unknown) => ({ case: { bench: { judge } } as unknown as Case })

  it('asks when grading has a key and the case does not say otherwise', () => {
    expect(asksJev({ case: null }, { useJev: true })).toBe(true)
    expect(asksJev(of(undefined), { useJev: true })).toBe(true)
    expect(asksJev(of(true), { useJev: true })).toBe(true)
  })

  it('does not ask for a case with `judge: false`, nor without a key', () => {
    expect(asksJev(of(false), { useJev: true })).toBe(false)
    expect(asksJev(of(undefined), { useJev: false })).toBe(false)
  })
})

describe('reading an answer', () => {
  const answers = {
    yes: { noul: 0.4996 },
    level: { score: 1.5 },
    nan: { noul: Number.NaN },
    empty: {},
  }

  it('hands back what Jev said, unrounded', () => {
    expect(noulOf(answers, 'yes')).toBe(0.4996)
    expect(scoreOf(answers, 'level')).toBe(1.5)
  })

  it('throws a named error for an answer that is missing or not a number', () => {
    for (const read of [
      () => noulOf(answers, 'gone'),
      () => noulOf(answers, 'nan'),
      () => noulOf(answers, 'empty'),
      () => noulOf(answers, 'constructor'),
      () => scoreOf(answers, 'yes'),
    ])
      expect(read).toThrow(MissingAnswerError)
    expect(() => noulOf(answers, 'gone')).toThrow('Jev gave no noul for "gone".')
  })
})
