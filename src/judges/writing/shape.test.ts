import { describe, expect, it } from 'vitest'
import { claimsOf, evidenceChunks, fallbackLint, nearestEvidence, shapeOf } from './shape.ts'

const EM = String.fromCharCode(0x2014)

describe('shapeOf', () => {
  it('measures prose and counts section headings, not the title', () => {
    const text = [
      '# Title',
      '',
      'One short line.',
      '',
      'This paragraph has two sentences. The second one is a fair bit longer than the first.',
      '',
      '## Why did we ship it?',
      '',
      '- a list item is not prose',
      '',
      '## A heading that runs on for far more than eight words',
    ].join('\n')
    const shape = shapeOf(text)
    expect(shape).toMatchObject({ headings: 2, questionHeadings: 1, longHeadings: 1 })
    expect(shape.measures).toEqual({
      sentenceMedian: 5,
      shortSentenceShare: 0.67,
      paragraphMedian: 9.5,
      oneLineShare: 0.5,
    })
  })

  it('returns null measures for text with no prose', () => {
    expect(shapeOf('# Only a title').measures).toEqual({
      sentenceMedian: null,
      shortSentenceShare: null,
      paragraphMedian: null,
      oneLineShare: null,
    })
  })
})

describe('fallbackLint', () => {
  const rules = (text: string, range: [number, number] | null = null) =>
    fallbackLint(text, range).map((f) => f.rule)

  it('flags em dashes but not numeric ranges', () => {
    expect(rules(`It works ${EM} mostly.`)).toEqual(['em-dash'])
    expect(rules(`Pages 10${EM}20 cover it.`)).toEqual([])
  })

  it('flags exclamation marks and emoji outside code fences', () => {
    expect(rules('Shipped! 🚀')).toEqual(['exclamation', 'emoji'])
    expect(rules('Run it:\n```\nif (!ok) alert("hi!")\n```\n')).toEqual([])
    expect(rules('![alt](a.png)')).toEqual([])
  })

  it('flags a word count outside the range', () => {
    expect(rules('one two three', [5, 10])).toEqual(['length'])
    expect(rules('one two three', [1, 10])).toEqual([])
  })
})

describe('claimsOf', () => {
  const unit = (...items: string[]) => [{ text: items.join(' '), items, list: false }]

  it('keeps sentences with numbers, names, actions or status words', () => {
    const claims = claimsOf(
      unit(
        'Latency fell to 40 ms.',
        'It now uses Postgres underneath.',
        'We rebuilt the queue.',
        'The judge is live.',
        'This felt nice.',
      ),
    ).map((c) => c.claim)
    expect(claims).toEqual([
      'Latency fell to 40 ms.',
      'It now uses Postgres underneath.',
      'We rebuilt the queue.',
      'The judge is live.',
    ])
  })

  it('drops a sentence flagged with [check] and the one before it', () => {
    const claims = claimsOf(unit('We cut 3 steps. It saved 2 hours [check: source?]. Fine.'))
    expect(claims).toEqual([])
  })
})

describe('evidence retrieval', () => {
  it('chunks evidence and ranks chunks by shared terms, numbers counting more', () => {
    const chunks = evidenceChunks([
      '# Notes\n\nThe cache cut p95 latency to 40 ms in March.\n\n<!-- hidden note here please -->\n\n- The team moved billing to Stripe last year.\n- tiny',
    ])
    expect(chunks).toEqual([
      'The cache cut p95 latency to 40 ms in March.',
      'The team moved billing to Stripe last year.',
    ])
    expect(nearestEvidence('Billing runs on Stripe', chunks, 1)).toEqual([chunks[1]])
    expect(nearestEvidence('latency is 40 ms', chunks, 1)).toEqual([chunks[0]])
  })
})

describe('code in the copy', () => {
  const prose = 'One sentence that is of a normal length for prose in an article like this.'

  it('measures the prose alone, whichever fence the code is in and closed or not', () => {
    const plain = shapeOf(`${prose}\n`)
    expect(plain.measures).toMatchObject({ sentenceMedian: 15, paragraphMedian: 15 })
    for (const code of [
      '```js\nconst a = 1\nconst b = 2\n```',
      '~~~\nconst a = 1\n~~~',
      '```\nleft open',
    ])
      expect(shapeOf(`${prose}\n\n${code}\n`)).toEqual(plain)
  })

  it('lints nothing inside a tilde fence, and still names where a finding is', () => {
    const text = 'Fine.\n\n~~~\nwow! \u2014 code\n~~~\n\nReally! Yes.'
    const findings = fallbackLint(text, null)
    expect(findings.map((f) => f.rule)).toEqual(['exclamation'])
    expect(findings[0].excerpt).toContain('Really!')
  })
})
