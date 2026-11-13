import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pngHeader } from '@domain/__fixtures__/image.ts'
import { mergeConfig } from '@domain/config.ts'
import type { Artifact, Case, Grader } from '@domain/schemas.ts'
import { image } from '@typesafe-ai/sdk'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { holdsImage } from '../images.ts'
import type { Jev } from '../jev.ts'
import { MissingAnswerError } from '../shared/questions.ts'
import type { JudgeContext, JudgeInput } from '../types.ts'
import { genericPack } from './index.ts'
import { genericScoring } from './score.ts'

type Question = { instructions: string; criteria: { true: string; false: string } }

// Jev is a network call: answer every question with a fixed Noul.
const ask = vi.fn(async (_state: Record<string, unknown>, questions: Record<string, unknown>) =>
  Object.fromEntries(Object.keys(questions).map((id) => [id, { noul: 0.12345 }])),
)
// A braced body: a hook that returns the mock would have it called again as a teardown.
beforeEach(() => {
  ask.mockClear()
})
const ctx = {
  jev: { ask } as unknown as Jev,
  useJev: true,
  config: mergeConfig(null, [genericScoring]),
  skillDir: '/s',
  log: () => {},
} satisfies JudgeContext

const grader = (id: string, weight = 1): Grader => ({
  id,
  type: 'statement',
  focus: null,
  weight,
  statement: `statement ${id}`,
  image: null,
})
const rule = (id: string) => ({ id, text: `rule ${id}`, section: 'Rules' })
const testCase = (graders: Grader[] = [], prompt = 'Thank Elena.'): Case =>
  ({ id: 'c1', prompt, graders, bench: {} }) as unknown as Case

const md: Artifact = { file: 'outputs/output.md', kind: 'markdown' }
const page: Artifact = { file: 'outputs/index.html', kind: 'html' }

const output = (over: Partial<JudgeInput> = {}): JudgeInput => ({
  text: 'note',
  units: [],
  case: null,
  images: [],
  rules: [],
  artifacts: [md],
  primary: md,
  others: [],
  skill: null,
  notes: null,
  transcript: null,
  dir: '/sample',
  renders: [],
  ...over,
})

/** The state and the questions of request `n`. */
const asked = (n = 0) => {
  const [state, questions] = ask.mock.calls[n] as [
    Record<string, unknown>,
    Record<string, Question>,
  ]
  return { state, questions }
}

const drawn = {
  size: { id: 'desktop' as const, width: 1280, height: 960 },
  read: { image: image(pngHeader(1280, 960)), problem: null },
}

describe('generic pack', () => {
  it('asks nothing without a rule or a check, without Jev, or of an output with nothing in it', async () => {
    expect(await genericPack.judge(output(), ctx)).toBeNull()
    const ruled = output({ rules: [rule('r1')] })
    expect(await genericPack.judge(ruled, { ...ctx, useJev: false })).toBeNull()
    expect(await genericPack.judge({ ...ruled, text: '  \n' }, ctx)).toBeNull()
    const off = output({ rules: [rule('r1')], case: { ...testCase(), bench: { judge: false } } })
    expect(await genericPack.judge(off as JudgeInput, ctx)).toBeNull()
    expect(ask).not.toHaveBeenCalled()
  })

  it('asks every rule and every check in one request, and keeps order and weight', async () => {
    const raw = await genericPack.judge(
      output({ rules: [rule('r1'), rule('r2')], case: testCase([grader('g1'), grader('g2', 3)]) }),
      ctx,
    )
    // One state, sent once: the output and its pictures are not paid for a second time.
    expect(ask).toHaveBeenCalledTimes(1)
    expect(Object.keys(asked(0).questions)).toEqual(['rule:r1', 'rule:r2', 'check:g1', 'check:g2'])
    expect(raw).toEqual({
      adherence: {
        rules: [
          { id: 'r1', text: 'rule r1', section: 'Rules', noul: 0.12345 },
          { id: 'r2', text: 'rule r2', section: 'Rules', noul: 0.12345 },
        ],
      },
      rubric: {
        statements: [
          // As Jev said it: rounded, an answer of 0.4996 would be kept as 0.5 and pass a threshold it missed.
          { id: 'g1', text: 'statement g1', weight: 1, noul: 0.12345, units: null, best: null },
          { id: 'g2', text: 'statement g2', weight: 3, noul: 0.12345, units: null, best: null },
        ],
      },
    })
  })

  it('fails the reading when Jev leaves a check unanswered, and names which', async () => {
    ask.mockResolvedValueOnce({ 'check:g1': { noul: 0.9 } })
    await expect(
      genericPack.judge(output({ case: testCase([grader('g1'), grader('g2')]) }), ctx),
    ).rejects.toThrow(new MissingAnswerError('check:g2', 'noul'))
  })

  it('says what the output answers, and no more, of a piece of writing with nothing beside it', async () => {
    await genericPack.judge(output({ rules: [rule('r1')], case: testCase([grader('g1')]) }), ctx)
    expect(asked(0).state).toEqual({ request: 'Thank Elena.', output: 'note' })
    expect(asked(0).questions['rule:r1'].instructions).toBe(
      '`output` was produced to answer `request`. Does `output` follow this rule: "rule r1"',
    )
    expect(asked(0).questions['check:g1'].instructions).toBe(
      '`output` was produced to answer `request`. Is this statement true of `output`: "statement g1"',
    )
    await genericPack.judge(output({ rules: [rule('r1')] }), ctx)
    expect(asked(1).questions['rule:r1'].instructions).toBe(
      'Does `output` follow this rule: "rule r1"',
    )
  })

  it('asks a rule under its heading with the skill beside it, and each heading whether it is for this work', async () => {
    const skill = '# Mockups\n\n## For a screen\n\n- rule r1\n\n## For a detail\n\n- rule r2\n'
    const rules = [
      { id: 'r1', text: 'rule r1', section: 'For a screen' },
      { id: 'r2', text: 'rule r2', section: 'For a detail' },
      // Above every heading: asked as it is, and of no heading.
      { id: 'r3', text: 'rule r3', section: 'SKILL.md' },
    ]
    ask.mockResolvedValueOnce({
      'rule:r1': { noul: 0.1 },
      'rule:r2': { noul: 0.9 },
      'rule:r3': { noul: 0.8 },
      'heading:0': { noul: 0.02 },
      'heading:1': { noul: 0.98 },
    })
    const raw = await genericPack.judge(output({ rules, skill, case: testCase() }), ctx)
    const { state, questions } = asked()
    expect(state).toEqual({
      request: 'Thank Elena.',
      output: 'note',
      skill: skill.trim(),
      headings: ['For a screen', 'For a detail'],
    })
    expect(Object.keys(questions)).toEqual([
      'rule:r1',
      'rule:r2',
      'rule:r3',
      'heading:0',
      'heading:1',
    ])
    const lead =
      '`output` was produced to answer `request`. `skill` holds the instructions `output` is held to: it is not part of `output`. '
    expect(questions['rule:r1'].instructions).toBe(
      `${lead}\`skill\` has this rule under its heading "For a screen": "rule r1" Does \`output\` follow the rule?`,
    )
    expect(questions['rule:r1'].criteria.true).toContain(
      'its heading or its own words are for another kind of work than `request` asks for',
    )
    expect(questions['rule:r3'].instructions).toBe(
      `${lead}Does \`output\` follow this rule: "rule r3"`,
    )
    expect(questions['heading:0'].instructions).toBe(
      `${lead}\`skill\` groups its rules under the headings in \`headings\`. Are the rules under the heading "For a screen" for the kind of work \`request\` asks for?`,
    )
    expect(raw?.adherence?.rules).toEqual([
      { id: 'r1', text: 'rule r1', section: 'For a screen', noul: 0.1, applies: 0.02 },
      { id: 'r2', text: 'rule r2', section: 'For a detail', noul: 0.9, applies: 0.98 },
      { id: 'r3', text: 'rule r3', section: 'SKILL.md', noul: 0.8 },
    ])
    // The rule for a screen is no miss of a detail: it is set aside, and the layer counts the other two.
    const scored = genericScoring.score(raw, {} as never, ctx.config)
    expect(scored.layers.adherence).toBe(1)
    expect(scored.verdicts.map((v) => v.aside)).toEqual(['inapplicable', undefined, undefined])
    expect(scored.flags).toEqual(['1 rule not counted: for another kind of work than this'])
  })

  it('asks no heading of rules listed in bench.json, which stand under none', async () => {
    const rules = [{ id: 'r1', text: 'rule r1', section: 'bench.json rules' }]
    await genericPack.judge(output({ rules, skill: null }), ctx)
    expect(Object.keys(asked().questions)).toEqual(['rule:r1'])
    expect(asked().state).toEqual({ output: 'note' })
  })

  it('quotes a rule or a check without backticks, which TypeSafe reads as a path into the state', async () => {
    const check = { ...grader('g1'), statement: 'The file is `output.md`, in **bold**.' }
    const rules = [{ id: 'r1', text: 'Write to `out/`.', section: 'bench.json rules' }]
    await genericPack.judge(output({ rules, case: testCase([check]) }), ctx)
    expect(asked().questions['check:g1'].instructions).toContain(
      'Is this statement true of `output`: "The file is output.md, in bold."',
    )
    expect(asked().questions['rule:r1'].instructions).toContain('"Write to out/."')
  })

  it('judges a page by its text and by how it looks: the kind of file does not decide whether rules count', async () => {
    const raw = await genericPack.judge(
      output({
        text: '<h1>Hi</h1>',
        primary: page,
        artifacts: [page],
        rules: [rule('r1')],
        renders: [drawn],
      }),
      ctx,
    )
    expect(raw?.adherence?.rules).toHaveLength(1)
    const { state, questions } = asked()
    expect(state).toEqual({ output: '<h1>Hi</h1>', picture: drawn.read.image })
    expect(questions['rule:r1'].instructions).toBe(
      '`picture` shows `output` as it looks when it is opened in a window 1280 px wide and 960 px tall. Anything of the page below that window is not in `picture`. Do `output` and `picture` follow this rule: "rule r1"',
    )
  })

  it('says when a page was drawn smaller than its window, so no length is read off the picture', async () => {
    const wide = {
      size: { id: 'desktop' as const, width: 1600, height: 1200 },
      read: { image: image(pngHeader(1568, 1176)), problem: null },
    }
    await genericPack.judge(
      output({
        text: '<h1>Hi</h1>',
        primary: page,
        artifacts: [page],
        rules: [rule('r1')],
        renders: [wide],
      }),
      ctx,
    )
    expect(asked().questions['rule:r1'].instructions).toContain(
      'in a window 1600 px wide and 1200 px tall, scaled to 1568 by 1176 px, so a length measured on `picture` is not its length in `output`.',
    )
  })

  it('judges a picture as the work when the output is one', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'st-generic-'))
    try {
      mkdirSync(join(dir, 'outputs'))
      writeFileSync(join(dir, 'outputs/card.png'), pngHeader(800, 600))
      const card: Artifact = { file: 'outputs/card.png', kind: 'image' }
      const picture = output({ text: '', dir, primary: card, artifacts: [card] })
      await genericPack.judge({ ...picture, case: testCase([grader('g1')]) }, ctx)
      const { state, questions } = asked()
      expect(Object.keys(state)).toEqual(['request', 'picture'])
      expect(questions['check:g1'].instructions).toBe(
        '`picture` was produced to answer `request`. Is this statement true of `picture`: "statement g1"',
      )
      // A picture Jev cannot read is said, and no rule is marked followed for it.
      writeFileSync(join(dir, 'outputs/card.png'), pngHeader(100, 100))
      const unread = await genericPack.judge({ ...picture, rules: [rule('r1')] }, ctx)
      expect(unread).toEqual({
        adherence: null,
        rubric: null,
        unread: expect.stringContaining('picture not judged'),
      })
      expect(ask).toHaveBeenCalledTimes(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('reads what the agent told the user, and holds only what must be said to it', async () => {
    await genericPack.judge(
      output({ rules: [rule('r1')], notes: '  Size: 1536 by 864, as asked.  ' }),
      ctx,
    )
    const { state, questions } = asked()
    expect(state.notes).toBe('Size: 1536 by 864, as asked.')
    expect(questions['rule:r1'].instructions).toContain(
      '`notes` is what its maker told the user about `output`: it is not part of `output`.',
    )
    // A rule about the piece, such as its length, is never failed for how the notes read.
    for (const side of [questions['rule:r1'].criteria.true, questions['rule:r1'].criteria.false])
      expect(side).toContain('Nothing else is judged on `notes`.')
    await genericPack.judge(output({ rules: [rule('r1')], notes: ' \n' }), ctx)
    expect(asked(1).state).not.toHaveProperty('notes')
    expect(asked(1).questions['rule:r1'].criteria.true).not.toContain('notes')
  })

  it('reads the other files made beside the output, so a rule about a test is judged on the test', async () => {
    const others = [{ file: 'outputs/sum.test.ts', text: 'test("adds", () => {})' }]
    await genericPack.judge(output({ rules: [rule('r1')], others }), ctx)
    const { state, questions } = asked()
    expect(state.other_files).toEqual({ 'outputs/sum.test.ts': 'test("adds", () => {})' })
    expect(questions['rule:r1'].instructions).toBe(
      '`other_files` holds the other files made with `output`, each by its name. Do `output` and `other_files` follow this rule: "rule r1"',
    )
  })

  it('puts the pictures a request came with in state once, and says so in the question', async () => {
    const chart = image(pngHeader(800, 600))
    await genericPack.judge(
      output({
        case: testCase([grader('g1')], 'Describe the chart.'),
        images: [{ name: 'chart.png', image: chart }],
      }),
      ctx,
    )
    const { state, questions } = asked()
    expect(state).toEqual({
      request: 'Describe the chart.',
      request_images: [chart],
      output: 'note',
    })
    expect(questions['check:g1'].instructions).toContain(
      'which came with the pictures in `request_images`',
    )
  })

  it('asks a check about a picture with that picture in its own question', async () => {
    const skillDir = mkdtempSync(join(tmpdir(), 'st-generic-'))
    try {
      writeFileSync(join(skillDir, 'mock.png'), pngHeader(800, 600))
      writeFileSync(join(skillDir, 'huge.png'), pngHeader(4000, 3000))
      const log = vi.fn()
      const graders = [
        { ...grader('g1'), image: 'mock.png' },
        { ...grader('g2'), image: 'huge.png' },
        grader('g3'),
      ]
      const raw = await genericPack.judge(output({ case: testCase(graders) }), {
        ...ctx,
        skillDir,
        log,
      })
      const { questions } = asked()
      expect(holdsImage(questions['check:g1'])).toBe(true)
      expect(holdsImage(questions['check:g3'])).toBe(false)
      // A check about a picture Jev would refuse is not asked without it: it is left out and said.
      expect(Object.keys(questions)).toEqual(['check:g1', 'check:g3'])
      expect(raw?.rubric?.statements.map((s) => s.id)).toEqual(['g1', 'g3'])
      expect(raw?.rubric?.unasked).toEqual([
        expect.stringMatching(/^grader g2 not judged, .*4000 × 3000 px.*: statement g2$/),
      ])
      expect(log).toHaveBeenCalledWith(expect.stringContaining('4000 × 3000 px'))
      // With every check left out, nothing is asked and the rubric counts none.
      ask.mockClear()
      const none = await genericPack.judge(output({ case: testCase([graders[1]]) }), {
        ...ctx,
        skillDir,
        log,
      })
      expect(ask).not.toHaveBeenCalled()
      expect(none?.rubric).toEqual({ statements: [], unasked: [expect.any(String)] })
    } finally {
      rmSync(skillDir, { recursive: true, force: true })
    }
  })

  it('asks again with less when Jev refuses a request for its size, and says what it read', async () => {
    const tooLarge = new Error('400 {"detail":{"error_type":"max_tokens_exceeded"}}')
    ask.mockRejectedValueOnce(tooLarge)
    const others = [{ file: 'outputs/app.js', text: 'run()' }]
    const long = output({ text: 'x'.repeat(30_000), rules: [rule('r1')], others })
    const raw = await genericPack.judge(long, ctx)
    expect(ask).toHaveBeenCalledTimes(2)
    expect((asked(0).state.output as string).length).toBe(24_000)
    expect((asked(1).state.output as string).length).toBe(12_000)
    expect(asked(1).state).not.toHaveProperty('other_files')
    expect(asked(1).questions['rule:r1'].instructions).not.toContain('other_files')
    expect(raw?.short).toContain('the first 12,000 characters')
    // What was read less of is said under the output, and counts in no layer.
    const scored = genericScoring.score(raw, {} as never, ctx.config)
    expect(scored.flags).toContain(raw?.short)
    // Refused at every size, the reading fails as any other does; so does any other error, at once.
    ask.mockClear()
    for (let i = 0; i < 3; i += 1) ask.mockRejectedValueOnce(tooLarge)
    await expect(genericPack.judge(long, ctx)).rejects.toThrow('max_tokens_exceeded')
    expect(ask).toHaveBeenCalledTimes(3)
    ask.mockClear()
    ask.mockRejectedValueOnce(new Error('401 no key'))
    await expect(genericPack.judge(long, ctx)).rejects.toThrow('401 no key')
    expect(ask).toHaveBeenCalledTimes(1)
  })

  it('asks a long list of rules in more than one request, each over the same state', async () => {
    const rules = Array.from({ length: 45 }, (_, i) => rule(`r${i + 1}`))
    const raw = await genericPack.judge(output({ rules }), ctx)
    expect(ask).toHaveBeenCalledTimes(2)
    expect(Object.keys(asked(0).questions)).toHaveLength(40)
    expect(Object.keys(asked(1).questions)).toHaveLength(5)
    expect(asked(1).state).toEqual(asked(0).state)
    expect(raw?.adherence?.rules).toHaveLength(45)
  })

  it('reads the start of a long file, so one output cannot outgrow a request', async () => {
    await genericPack.judge(output({ text: 'x'.repeat(30_000), rules: [rule('r1')] }), ctx)
    expect((asked().state.output as string).length).toBe(24_000)
  })
})
