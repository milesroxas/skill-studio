import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pngHeader } from '@domain/__fixtures__/image.ts'
import { mergeConfig } from '@domain/config.ts'
import { layoutText, readLayout } from '@domain/layout.ts'
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
  layout: null,
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
    // Whether each rule comes up is asked of the request alone, beside it.
    expect(ask).toHaveBeenCalledTimes(2)
    expect(Object.keys(asked(0).questions)).toEqual(['rule:r1', 'rule:r2', 'check:g1', 'check:g2'])
    expect(Object.keys(asked(1).questions)).toEqual(['up:r1', 'up:r2'])
    expect(raw).toEqual({
      adherence: {
        rules: [
          { id: 'r1', text: 'rule r1', section: 'Rules', noul: 0.12345, comesUp: 0.12345 },
          { id: 'r2', text: 'rule r2', section: 'Rules', noul: 0.12345, comesUp: 0.12345 },
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
    expect(asked(2).questions['rule:r1'].instructions).toBe(
      'Does `output` follow this rule: "rule r1"',
    )
  })

  it('asks a rule under its heading with the skill beside it, and each heading of the request alone', async () => {
    const skill = '# Mockups\n\n## For a screen\n\n- rule r1\n\n## For a detail\n\n- rule r2\n'
    const rules = [
      { id: 'r1', text: 'rule r1', section: 'For a screen' },
      { id: 'r2', text: 'rule r2', section: 'For a detail' },
      // Above every heading: asked as it is, and of no heading.
      { id: 'r3', text: 'rule r3', section: 'SKILL.md' },
    ]
    ask
      .mockResolvedValueOnce({
        'rule:r1': { noul: 0.1 },
        'rule:r2': { noul: 0.9 },
        'rule:r3': { noul: 0.8 },
      })
      .mockResolvedValueOnce({
        'heading:0': { noul: 0.02 },
        'heading:1': { noul: 0.98 },
        'up:r1': { noul: 0.9 },
        'up:r2': { noul: 0.9 },
        'up:r3': { noul: 0.9 },
      })
    const raw = await genericPack.judge(output({ rules, skill, case: testCase() }), ctx)
    expect(ask).toHaveBeenCalledTimes(2)
    const { state, questions } = asked(0)
    expect(state).toEqual({
      request: 'Thank Elena.',
      output: 'note',
      skill: skill.trim(),
      headings: ['For a screen', 'For a detail'],
    })
    expect(Object.keys(questions)).toEqual(['rule:r1', 'rule:r2', 'rule:r3'])
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
    // Which rules are for this work is what was asked for: the output that was made is not in view.
    const headings = asked(1)
    expect(headings.state).toEqual({
      request: 'Thank Elena.',
      skill: skill.trim(),
      headings: ['For a screen', 'For a detail'],
    })
    expect(Object.keys(headings.questions)).toEqual([
      'heading:0',
      'heading:1',
      'up:r1',
      'up:r2',
      'up:r3',
    ])
    expect(headings.questions['heading:0'].instructions).toBe(
      '`skill` holds the instructions an answer to `request` is held to. `skill` groups its rules under the headings in `headings`. Are the rules under the heading "For a screen" for the kind of work `request` asks for?',
    )
    expect(raw?.adherence?.rules).toEqual([
      {
        id: 'r1',
        text: 'rule r1',
        section: 'For a screen',
        noul: 0.1,
        applies: 0.02,
        comesUp: 0.9,
      },
      {
        id: 'r2',
        text: 'rule r2',
        section: 'For a detail',
        noul: 0.9,
        applies: 0.98,
        comesUp: 0.9,
      },
      { id: 'r3', text: 'rule r3', section: 'SKILL.md', noul: 0.8, comesUp: 0.9 },
    ])
    // The rule for a screen is no miss of a detail: it is set aside, and the layer counts the other two.
    const scored = genericScoring.score(raw, {} as never, ctx.config)
    expect(scored.layers.adherence).toBe(1)
    expect(scored.verdicts.map((v) => v.aside)).toEqual(['inapplicable', undefined, undefined])
    expect(scored.flags).toEqual([
      '1 rule not counted: for another kind of work or situation than this',
    ])
  })

  it('asks the headings with the rules, of the output, where there is no request', async () => {
    const skill = '# Mockups\n\n## For a screen\n\n- rule r1\n'
    const rules = [{ id: 'r1', text: 'rule r1', section: 'For a screen' }]
    await genericPack.judge(output({ rules, skill }), ctx)
    expect(ask).toHaveBeenCalledTimes(1)
    expect(asked().state).toEqual({
      output: 'note',
      skill: skill.trim(),
      headings: ['For a screen'],
    })
    expect(Object.keys(asked().questions)).toEqual(['rule:r1', 'heading:0'])
    expect(asked().questions['heading:0'].instructions).toBe(
      '`skill` holds the instructions `output` is held to: it is not part of `output`. `skill` groups its rules under the headings in `headings`. Are the rules under the heading "For a screen" for the kind of work `output` is?',
    )
  })

  it('asks a heading of the request’s words alone: neither its pictures nor the output', async () => {
    const skill = '# Mockups\n\n## For a screen\n\n- rule r1\n'
    const rules = [{ id: 'r1', text: 'rule r1', section: 'For a screen' }]
    const shot = image(pngHeader(800, 600))
    await genericPack.judge(
      output({ rules, skill, case: testCase(), images: [{ image: shot } as never] }),
      ctx,
    )
    // The rules are asked with the request's pictures, which a rule may be about.
    expect(asked(0).state.request_images).toEqual([shot])
    expect(asked(1).state).toEqual({
      request: 'Thank Elena.',
      skill: skill.trim(),
      headings: ['For a screen'],
    })
    expect(holdsImage(asked(1).state)).toBe(false)
  })

  it('asks no heading of rules listed in bench.json, which stand under none', async () => {
    const rules = [{ id: 'r1', text: 'rule r1', section: 'bench.json rules' }]
    await genericPack.judge(output({ rules, skill: null }), ctx)
    expect(Object.keys(asked().questions)).toEqual(['rule:r1'])
    expect(asked().state).toEqual({ output: 'note' })
  })

  it('asks of the request alone whether each rule comes up, and sets aside one that does not', async () => {
    const rules = [
      {
        id: 'r1',
        text: 'When the request names a table, write a Markdown table.',
        section: 'Rules',
      },
      { id: 'r2', text: 'When quoting a price, give its currency.', section: 'Rules' },
      { id: 'r3', text: 'Open with the news.', section: 'Rules' },
      { id: 'r4', text: 'Never use exclamation marks.', section: 'Rules' },
    ]
    const skill = '# Update\n\n## Rules\n\n- rules\n'
    ask
      .mockResolvedValueOnce({
        'rule:r1': { noul: 0.98 },
        'rule:r2': { noul: 0.08 },
        'rule:r3': { noul: 0.95 },
        'rule:r4': { noul: 0.5 },
      })
      .mockResolvedValueOnce({
        'heading:0': { noul: 0.98 },
        'up:r1': { noul: 0.1 },
        'up:r2': { noul: 0.2 },
        'up:r3': { noul: 0.97 },
        'up:r4': { noul: 0.2 },
      })
    const raw = await genericPack.judge(
      output({ rules, skill, case: testCase([], 'Tell the team the launch moved.') }),
      ctx,
    )
    const up = asked(1)
    // Asked as a heading is: of the request and the skill, with nothing of the output.
    expect(up.state).toEqual({
      request: 'Tell the team the launch moved.',
      skill: skill.trim(),
      headings: ['Rules'],
    })
    expect(up.questions['up:r1'].instructions).toBe(
      '`skill` holds the instructions an answer to `request` is held to. `skill` has this rule under its heading "Rules": "When the request names a table, write a Markdown table." Does the rule come up for what `request` asks, whatever an answer to it turns out to be?',
    )
    const scored = genericScoring.score(raw, {} as never, ctx.config)
    // A table rule on a request with no table is no rule followed. A rule marked broken with the
    // output in view came up, whatever was said of the request. One not sure of is set aside too.
    expect(scored.verdicts.map((v) => v.aside ?? (v.met ? 'met' : 'missed'))).toEqual([
      'inapplicable',
      'missed',
      'met',
      'inapplicable',
    ])
    expect(scored.layers.adherence).toBe(0.5)
    expect(scored.flags).toContain(
      '2 rules not counted: for another kind of work or situation than this',
    )
  })

  it('asks no rule whether it comes up where there is no request, and reads an older reading as before', async () => {
    await genericPack.judge(output({ rules: [rule('r1')] }), ctx)
    expect(ask).toHaveBeenCalledTimes(1)
    expect(Object.keys(asked().questions)).toEqual(['rule:r1'])
    // A reading kept from before rules were asked it has no comesUp, and counts as it did.
    const older = { adherence: { rules: [{ ...rule('r1'), noul: 0.9 }] }, rubric: null }
    expect(genericScoring.score(older, {} as never, ctx.config).layers.adherence).toBe(1)
  })

  it('asks what rests on the request alone once a grading, and gives every output of the case that answer', async () => {
    const skill = '# Update\n\n## Rules\n\n- rule r1\n'
    const rules = [{ id: 'r1', text: 'rule r1', section: 'Rules' }]
    const once = new Map()
    const graded = { ...ctx, once }
    const sideAsks = () =>
      ask.mock.calls.filter(([, questions]) => Object.hasOwn(questions, 'up:r1')).length
    ask.mockImplementation(async (_state, questions) =>
      Object.fromEntries(
        Object.keys(questions).map((id) => [id, { noul: id === 'up:r1' ? 0.2 : 0.9 }]),
      ),
    )
    try {
      const first = await genericPack.judge(
        output({ rules, skill, text: 'one', case: testCase() }),
        graded,
      )
      const second = await genericPack.judge(
        output({ rules, skill, text: 'two', case: testCase() }),
        graded,
      )
      // Each output's rules are asked of it; the headings and whether a rule comes up, once.
      expect(ask).toHaveBeenCalledTimes(3)
      expect(sideAsks()).toBe(1)
      expect(first?.adherence?.rules[0]).toMatchObject({ applies: 0.9, comesUp: 0.2 })
      expect(second?.adherence?.rules).toEqual(first?.adherence?.rules)
      // Another request is another answer.
      await genericPack.judge(output({ rules, skill, case: testCase([], 'Thank Ana.') }), graded)
      expect(sideAsks()).toBe(2)
      // A request that failed is asked again by the next output, not failed for it too.
      ask.mockRejectedValueOnce(new Error('network')).mockRejectedValueOnce(new Error('network'))
      await expect(
        genericPack.judge(output({ rules, skill, case: testCase([], 'Thank Bo.') }), graded),
      ).rejects.toThrow('network')
      await genericPack.judge(output({ rules, skill, case: testCase([], 'Thank Bo.') }), graded)
      expect(sideAsks()).toBe(4)
    } finally {
      ask.mockReset()
      ask.mockImplementation(async (_state, questions) =>
        Object.fromEntries(Object.keys(questions).map((id) => [id, { noul: 0.12345 }])),
      )
    }
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
      layout: null,
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

  it('gives Jev what the window measured, and says a length is read there', async () => {
    const layout = readLayout({
      window: [1280, 960],
      page: [1280, 2000],
      elements: [
        { parent: 0, name: 'main#app', text: '', x: 0, y: 0, width: 1280, height: 2000 },
        { parent: 1, name: 'h1', text: 'Hi', x: 40, y: 40, width: 600, height: 48, font: '40px' },
      ],
    })
    if (!layout) throw new Error('the fixture is a layout')
    const measured = output({
      text: '<h1>Hi</h1>',
      primary: page,
      artifacts: [page],
      rules: [{ id: 'r1', text: 'Set the heading 40px from the top.', section: 'Rules' }],
      renders: [{ ...drawn, layout }],
    })
    await genericPack.judge(measured, ctx)
    expect(asked().state.layout).toBe(layoutText(layout, 14_000))
    expect(asked().questions['rule:r1'].instructions).toContain(
      '`layout` lists the elements of `output` as that window measured them: the place and the size of each in px, from the top left of the page, and where it sits inside the elements that hold it. A size, a distance or a position is read from `layout`, where it was measured, and not judged by eye on `picture`.',
    )

    // A layout is the largest part of a request: it is sent only where a rule or a check is about what it holds.
    ask.mockClear()
    await genericPack.judge({ ...measured, rules: [rule('r1')] }, ctx)
    expect(asked().state).not.toHaveProperty('layout')
    expect(asked().state).toHaveProperty('picture')
    expect(asked().questions['rule:r1'].instructions).not.toContain('`layout`')
    ask.mockClear()
    await genericPack.judge(
      {
        ...measured,
        rules: [rule('r1')],
        case: testCase([{ ...grader('g1'), statement: 'The heading is centred.' }]),
      },
      ctx,
    )
    expect(asked().state).toHaveProperty('layout')

    // The layout goes with the picture the window drew: a drawing Jev cannot read is told of no window.
    ask.mockClear()
    await genericPack.judge(
      { ...measured, renders: [{ ...drawn, read: { image: null, problem: 'too small' }, layout }] },
      ctx,
    )
    expect(asked().state).not.toHaveProperty('layout')
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

  it('says a picture is shown at another size only when the copy drawn of it is one', async () => {
    const card: Artifact = { file: 'outputs/card.png', kind: 'image' }
    const copy = image(pngHeader(1568, 882))
    const picture = output({
      text: '',
      primary: card,
      artifacts: [card],
      case: testCase([grader('g1')]),
    })
    const lead = async (pixels: [number, number]) => {
      ask.mockClear()
      const fitted = { file: card.file, pixels, read: { image: copy, problem: null } }
      await genericPack.judge({ ...picture, fitted }, ctx)
      return asked().questions['check:g1'].instructions
    }
    expect(await lead([1920, 1080])).toContain('which is 1920 by 1080 px')
    // A copy drawn only to be still and upright is the picture's own size: nothing to say of it.
    expect(await lead([1568, 882])).not.toContain('another size')
  })

  it('reads a picture’s measures from the page that draws it, and says whose they are', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'st-generic-'))
    try {
      mkdirSync(join(dir, 'outputs'))
      writeFileSync(join(dir, 'outputs/card.png'), pngHeader(1200, 900))
      const card: Artifact = { file: 'outputs/card.png', kind: 'image' }
      const layout = readLayout({
        window: [600, 450],
        page: [600, 450],
        elements: [{ parent: 0, name: 'main#card', text: '', x: 0, y: 0, width: 600, height: 450 }],
      })
      if (!layout) throw new Error('the fixture is a layout')
      const made = output({
        text: '',
        dir,
        primary: card,
        artifacts: [card, page],
        others: [{ file: 'outputs/index.html', text: '<main id="card"></main>' }],
        rules: [{ id: 'r1', text: 'Inset the card 40px from every edge.', section: 'Rules' }],
        source: { file: 'outputs/index.html', window: [600, 450], times: 2, layout },
      })
      await genericPack.judge(made, ctx)
      expect(Object.keys(asked().state)).toEqual(['picture', 'other_files', 'layout'])
      expect(asked().state.layout).toBe(layoutText(layout, 14_000))
      expect(asked().questions['rule:r1'].instructions).toContain(
        '`picture` is what the page "outputs/index.html" draws in a window 600 px wide and 450 px tall, and `layout` lists that page\'s elements as measured there: the place and the size of each in px, from the top left of the page, and where it sits inside the elements that hold it. `picture` is 2 times that size, so a length in `picture` is 2 times its length in `layout`. A size, a distance or a position is read from `layout`',
      )

      // No rule or check about a size or a place: the measures are not sent.
      ask.mockClear()
      await genericPack.judge({ ...made, rules: [rule('r1')] }, ctx)
      expect(asked().state).not.toHaveProperty('layout')
      // A page judged as the work has measures of its own: the source is for a picture.
      ask.mockClear()
      await genericPack.judge({ ...made, text: '<main></main>', primary: page }, ctx)
      expect(asked().questions['rule:r1'].instructions).not.toContain('is what the page')
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

  it('asks again with less when Jev refuses the state with one question, and says what it read', async () => {
    const tooLarge = new Error('400 {"detail":{"error_type":"max_tokens_exceeded"}}')
    ask.mockRejectedValueOnce(tooLarge)
    const others = [{ file: 'outputs/app.js', text: 'run()' }]
    const long = output({ text: 'x'.repeat(50_000), rules: [rule('r1')], others })
    const raw = await genericPack.judge(long, ctx)
    expect(ask).toHaveBeenCalledTimes(2)
    expect((asked(0).state.output as string).length).toBe(40_000)
    expect((asked(1).state.output as string).length).toBe(20_000)
    expect(asked(1).state).not.toHaveProperty('other_files')
    expect(asked(1).questions['rule:r1'].instructions).not.toContain('other_files')
    expect(raw?.cut).toEqual([
      'Jev read only the first 20,000 characters of the output',
      'Jev read none of outputs/app.js',
    ])
    // What was read less of is said under the output, and counts in no layer.
    const scored = genericScoring.score(raw, {} as never, ctx.config)
    expect(scored.flags).toEqual(expect.arrayContaining(raw?.cut ?? []))
    expect(scored.verdicts.map((v) => v.text)).toEqual(expect.arrayContaining(raw?.cut ?? []))
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

  it('says every part of the work Jev read only the start of, and nothing of a part it read whole', async () => {
    const whole = await genericPack.judge(
      output({ rules: [rule('r1')], notes: 'Chose blue.', skill: '# Skill\n\n- rule r1' }),
      ctx,
    )
    expect(whole).not.toHaveProperty('cut')
    const raw = await genericPack.judge(
      output({
        text: 'x'.repeat(41_000),
        rules: [rule('r1')],
        case: testCase([], 'p'.repeat(17_000)),
        notes: 'n'.repeat(7000),
        skill: 's'.repeat(13_000),
        others: [
          { file: 'outputs/app.js', text: 'a'.repeat(6000), cut: true },
          { file: 'outputs/b.css', text: 'b' },
          { file: 'outputs/c.js', text: '', cut: true },
        ],
      }),
      ctx,
    )
    expect(asked(1).state.other_files).toEqual({
      'outputs/app.js': 'a'.repeat(6000),
      'outputs/b.css': 'b',
    })
    expect(raw?.cut).toEqual([
      "Jev read only the first 16,000 characters of the case's prompt",
      'Jev read only the first 40,000 characters of the output',
      'Jev read only the first 6,000 characters of notes.md',
      'Jev read only the first 12,000 characters of SKILL.md',
      'Jev read only the start of outputs/app.js',
      'Jev read none of outputs/c.js',
    ])
  })

  it('gives Jev the text files the request came with, by name, and says what it read of them', async () => {
    const requestFiles = [
      { file: 'design/color.md', text: 'Ink #0A1020.' },
      { file: 'design/layout.md', text: 'l'.repeat(8000), cut: true },
      { file: 'design/type.md', text: 't'.repeat(20_000) },
      { file: 'design/forms.md', text: '', cut: true },
    ]
    const raw = await genericPack.judge(
      output({ rules: [rule('r1')], case: testCase(), requestFiles }),
      ctx,
    )
    const { state, questions } = asked()
    expect(state.request_files).toEqual({
      'design/color.md': 'Ink #0A1020.',
      'design/layout.md': 'l'.repeat(8000),
      'design/type.md': 't'.repeat(24_000 - 8012),
    })
    expect(questions['rule:r1'].instructions).toContain(
      '`request_files` holds the files that came with `request`, each by its name: what `output` was made from, and no part of it.',
    )
    expect(raw?.cut).toEqual([
      "Jev read only the start of the case's design/layout.md and design/type.md",
      "Jev read none of the case's design/forms.md",
    ])
    // Asked again with less, less of them is read, and that is said too.
    ask.mockClear()
    ask.mockRejectedValueOnce(new Error('400 {"detail":{"error_type":"max_tokens_exceeded"}}'))
    const less = await genericPack.judge(
      output({ rules: [rule('r1')], case: testCase(), requestFiles }),
      ctx,
    )
    // The room is shared out: a short file is read whole, and the long ones split what is left.
    // Call 1 asked whether the rule comes up, beside the request that was refused.
    expect(asked(2).state.request_files).toEqual({
      'design/color.md': 'Ink #0A1020.',
      'design/layout.md': 'l'.repeat(3994),
      'design/type.md': 't'.repeat(3994),
    })
    expect(less?.cut).toEqual([
      "Jev read only the start of the case's design/layout.md and design/type.md",
      "Jev read none of the case's design/forms.md",
    ])
    // Without a request there is nothing they came with, and a heading is asked without them.
    ask.mockClear()
    await genericPack.judge(output({ rules: [rule('r1')], requestFiles }), ctx)
    expect(asked().state).not.toHaveProperty('request_files')
  })

  it('asks a long list of rules in one request, over one state', async () => {
    const rules = Array.from({ length: 45 }, (_, i) => rule(`r${i + 1}`))
    const raw = await genericPack.judge(output({ rules }), ctx)
    expect(ask).toHaveBeenCalledTimes(1)
    expect(Object.keys(asked(0).questions)).toHaveLength(45)
    expect(raw?.adherence?.rules).toHaveLength(45)
  })

  it('asks fewer questions a request, not less of the work, when the questions are what is too large', async () => {
    const tooLarge = new Error('400 {"detail":{"error_type":"max_tokens_exceeded"}}')
    // Jev holds the whole output with up to 10 questions, and refuses more.
    ask.mockImplementation(async (_state, questions) => {
      if (Object.keys(questions).length > 10) throw tooLarge
      return Object.fromEntries(Object.keys(questions).map((id) => [id, { noul: 0.9 }]))
    })
    try {
      const rules = Array.from({ length: 45 }, (_, i) => rule(`r${i + 1}`))
      const raw = await genericPack.judge(output({ text: 'x'.repeat(30_000), rules }), ctx)
      const calls = ask.mock.calls as unknown as Array<[Record<string, unknown>, object]>
      // The whole output stays in every request: only the questions were split.
      expect(calls.every(([state]) => state.output === asked(0).state.output)).toBe(true)
      const answered = calls.flatMap(([, questions]) =>
        Object.keys(questions).length <= 10 ? Object.keys(questions) : [],
      )
      // Each question is answered once, and each rule has its answer.
      expect(answered).toHaveLength(45)
      expect(new Set(answered).size).toBe(45)
      expect(raw?.adherence?.rules.map((r) => r.noul)).toEqual(Array(45).fill(0.9))
      expect(raw).not.toHaveProperty('cut')
    } finally {
      ask.mockReset()
      ask.mockImplementation(async (_state, questions) =>
        Object.fromEntries(Object.keys(questions).map((id) => [id, { noul: 0.12345 }])),
      )
    }
  })

  it('reads the start of a long file, so one output cannot outgrow a request', async () => {
    await genericPack.judge(output({ text: 'x'.repeat(50_000), rules: [rule('r1')] }), ctx)
    expect((asked().state.output as string).length).toBe(40_000)
  })
})
