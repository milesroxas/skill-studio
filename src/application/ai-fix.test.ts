import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFixText } from '@domain/fix.ts'
import type { JudgedVerdict } from '@domain/pack.ts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * What the model answers, one reply per request, and what it was asked; what
 * Jev answers when it has a key, and what it was asked; and the verdicts the
 * run's grading gives the attempt.
 */
const world = vi.hoisted(() => ({
  replies: [] as string[],
  asked: [] as Array<{ system: string; user: string; schema: unknown }>,
  /** A request that waits, unanswered, until it is stopped. */
  hold: false,
  files: [] as Array<{ path: string; text: string }>,
  request: null as string | null,
  verdicts: [] as unknown[],
  /** Null: no key, so code's checks alone read a revision. */
  jev: null as null | { kept: number[]; holds: number },
  jevAsked: [] as Array<{
    state: Record<string, unknown>
    questions: string[]
    signal: AbortSignal | undefined
  }>,
  /** Jev's requests, by number from 0, that fail, and the one that waits unanswered until it is stopped. */
  jevFails: [] as number[],
  jevHolds: null as number | null,
}))

vi.mock('@infrastructure/ai/index.ts', () => ({
  aiProvider: () => ({
    run: async ({
      system,
      messages,
      schema,
      signal,
    }: {
      system: string
      messages: Array<{ text: string }>
      schema: unknown
      signal: AbortSignal
    }) => {
      world.asked.push({ system, user: messages[0]?.text ?? '', schema })
      if (world.hold)
        await new Promise((_, fail) =>
          signal.addEventListener('abort', () => fail(new Error('stopped'))),
        )
      const text = world.replies.shift()
      if (text === undefined) throw new Error('no reply left')
      return { text, model: 'sonnet', usage: {} }
    },
  }),
  aiProviderInfo: async () => [
    {
      id: 'claude-code',
      connected: true,
      problem: null,
      models: [{ id: 'sonnet', label: 'Sonnet', efforts: [] }],
      account: null,
      installable: false,
    },
  ],
  isProviderError: () => false,
}))
vi.mock('@infrastructure/ai/store.ts', () => ({
  readChat: () => [],
  readUsage: () => [],
  recordUsage: () => {},
  writeChat: () => {},
}))
vi.mock('@infrastructure/preferences.ts', () => ({
  readPreferences: () => ({ aiProvider: 'claude-code', aiModel: 'sonnet', aiEffort: '' }),
}))
vi.mock('@infrastructure/answer-files.ts', () => ({
  answerText: () => ({ caseId: 'shelf', request: world.request, files: world.files }),
}))
vi.mock('@infrastructure/cases.ts', () => ({
  loadCases: () => [{ id: 'shelf', prompt: 'Write the launch note for Shelf.' }],
}))
vi.mock('@infrastructure/runs.ts', () => ({
  readRun: () => ({ report: { results: [] }, cases: {} }),
}))
vi.mock('./grade.ts', () => ({
  correctionsOf: () => ({}),
  runVerdicts: () => ({ 'shelf-s1': world.verdicts }),
}))
// Jev answers the kept question from `world.jev.kept`, one a request, and every principle with `holds`.
vi.mock('@judges/jev.ts', () => ({
  Jev: class {
    static available = () => world.jev !== null
    model = 'jev'
    async ask(
      state: Record<string, unknown>,
      questions: Record<string, unknown>,
      signal?: AbortSignal,
    ) {
      const keys = Object.keys(questions)
      const at = world.jevAsked.length
      world.jevAsked.push({ state, questions: keys, signal })
      const jev = world.jev
      if (!jev) throw new Error('no key')
      if (world.jevFails.includes(at)) throw new Error('Jev is down')
      // Without a signal it waits for ever, as a request nothing can end would.
      if (world.jevHolds === at)
        await new Promise((_, fail) =>
          signal?.addEventListener('abort', () => fail(new Error('stopped'))),
        )
      const kept = jev.kept.shift() ?? 0.9
      return Object.fromEntries(
        keys.map((key) => [
          key,
          key.endsWith('_complexity')
            ? { score: 1 }
            : { noul: key.startsWith('kept_') ? kept : jev.holds },
        ]),
      )
    }
  },
  isAuthError: () => false,
}))

const { findRun, startFix, startRefine, startRewrites, stopRun } = await import('./ai.ts')

const RULE =
  'Open with the headline and nothing before it, because readers decide in the first line.'
const SHORT = 'Keep the note under 120 words, because a longer one is skimmed.'

/** A revision the checks pass: a step, an always or never, and its why. */
const CLEAN =
  'Open with the headline, never the product name, because readers decide in the first line.'
/** A revision code finds open: "try to" leaves the line to the agent. */
const VAGUE =
  'Try to open with the headline where you can, because readers decide in the first line.'
/** Another, as open as the first. */
const VAGUE_TOO =
  'Try to open with the headline when you can, because readers decide in the first line.'

const draft = (revision: string, why = 'The note opens with the product name.') =>
  JSON.stringify({ why, revision })
const again = (revision: string) => JSON.stringify({ revision })

const jevVerdict = (text: string): JudgedVerdict => ({
  id: `rule:${text}`,
  kind: 'rule',
  text,
  met: false,
  layer: 'adherence',
  section: 'Rules',
  open: true,
  by: 'jev',
  jev: false,
  corrected: false,
})

/** A verdict code gave: it counted 134 words against 120. */
const codeVerdict = (text: string): JudgedVerdict => ({
  ...jevVerdict(text),
  by: 'code',
  code: {
    met: false,
    why: null,
    stands: true,
    tests: [
      {
        test: 'count',
        read: { part: 'text', skip: null },
        what: 'words',
        compare: 'at most',
        n: 120,
      },
    ],
    saw: [
      {
        test: 'count',
        answer: 'missed',
        why: null,
        counts: [134, 131],
        compare: 'at most',
        n: 120,
      },
    ],
  },
})

let skillDir = ''
beforeEach(() => {
  world.replies = []
  world.asked = []
  world.hold = false
  world.request = null
  world.verdicts = []
  world.jev = null
  world.jevAsked = []
  world.jevFails = []
  world.jevHolds = null
  world.files = [{ path: 'outputs/output.md', text: 'Shelf is here. Meet the new shelf.' }]
  skillDir = mkdtempSync(join(tmpdir(), 'fix-'))
  writeFileSync(
    join(skillDir, 'SKILL.md'),
    `---\nname: note\ndescription: Writes launch notes.\n---\n\n# Note\n\n## Rules\n\n- ${RULE}\n- ${SHORT}\n`,
  )
})
afterEach(() => rmSync(skillDir, { recursive: true, force: true }))

async function ended(id: string): Promise<ReturnType<typeof findRun>> {
  for (let i = 0; i < 200 && findRun(id).status === 'running'; i += 1)
    await new Promise((next) => setImmediate(next))
  return findRun(id)
}

/** The draft a fix of `rule` ends on. */
async function fixed(rule = RULE) {
  const run = await startFix({ skillDir, run: 'r1', sample: 'shelf-s1', rule })
  expect(run.kind).toBe('fix')
  const done = await ended(run.id)
  expect(done.status, done.error ?? '').toBe('done')
  return readFixText(done.text)
}

describe('startFix', () => {
  it('asks once, from the rule, the request and the answer, and ends on the draft', async () => {
    world.replies.push(draft(CLEAN, 'The note opens with the product name, not the headline.'))
    expect(await fixed()).toEqual({
      why: 'The note opens with the product name, not the headline.',
      revision: `- ${CLEAN}`,
    })
    expect(world.asked).toHaveLength(1)
    const { user } = world.asked[0]
    expect(user).toContain(`- ${RULE}`)
    expect(user).toContain('Write the launch note for Shelf.')
    expect(user).toContain('Shelf is here. Meet the new shelf.')
  })

  it('sends the request as the agent got it, with what the app added to it', async () => {
    world.request = 'Write the launch note for Shelf.\nAlso write outputs/preview.html.'
    world.replies.push(draft(`- ${RULE}`, 'It followed the rule.'))
    await fixed()
    expect(world.asked[0].user).toContain('Also write outputs/preview.html.')
  })

  it('asks nothing when the rule is no longer in SKILL.md', async () => {
    await expect(
      startFix({
        skillDir,
        run: 'r1',
        sample: 'shelf-s1',
        rule: 'A rule since rewritten, with more words.',
      }),
    ).rejects.toThrow('changed since the run')
    expect(world.asked).toHaveLength(0)
  })

  it('fails the run on a reply with no fix in it', async () => {
    world.replies.push(JSON.stringify({ why: 'Nothing.', revision: '' }))
    const run = await startFix({ skillDir, run: 'r1', sample: 'shelf-s1', rule: RULE })
    const done = await ended(run.id)
    expect(done.status).toBe('failed')
    expect(done.error).toContain('no fix')
  })
})

describe('the sheet holds the verdict', () => {
  it('says Jev marked it, where Jev did', async () => {
    world.verdicts = [jevVerdict(SHORT), jevVerdict(RULE)]
    world.replies.push(draft(CLEAN))
    await fixed()
    const { system, user } = world.asked[0]
    expect(system).toContain('Start from the verdict')
    expect(user).toMatch(
      /<verdict>\nJev, a model that reads answers, marked the answer as breaking/,
    )
  })

  it('holds what code saw, for a rule code checked', async () => {
    world.verdicts = [jevVerdict(RULE), codeVerdict(SHORT)]
    world.replies.push(draft(`- ${SHORT}`.replace('under 120 words', 'to 120 words at most')))
    await fixed(SHORT)
    const { user } = world.asked[0]
    expect(user).toContain('Code marked the answer as breaking the rule')
    expect(user).toContain(
      '{"test":{"test":"count","read":{"part":"text","skip":null},"what":"words","compare":"at most","n":120},"saw":{"test":"count","answer":"missed","why":null,"counts":[134,131],"compare":"at most","n":120}}',
    )
  })

  it('says the person marked it, and that their mark stands', async () => {
    world.verdicts = [{ ...jevVerdict(RULE), by: 'reader', jev: true, corrected: true }]
    world.replies.push(draft(CLEAN))
    await fixed()
    const { system, user } = world.asked[0]
    expect(user).toContain('The person who wrote the skill marked the answer as breaking')
    expect(user).toContain('Jev had read the answer as following the rule')
    expect(system).toContain('A mark the person made stands')
  })

  it('says when no verdict was kept', async () => {
    world.replies.push(draft(CLEAN))
    await fixed()
    expect(world.asked[0].user).toContain('No verdict was kept for this rule')
  })
})

describe('the revision is checked, and tried once more', () => {
  it('asks no more when code and Jev find nothing open in it', async () => {
    world.jev = { kept: [0.9], holds: 0.9 }
    world.replies.push(draft(CLEAN))
    expect((await fixed())?.revision).toBe(`- ${CLEAN}`)
    expect(world.asked).toHaveLength(1)
    // One request: whether it still asks what the rule asks, and the revision read as a rule.
    expect(world.jevAsked).toHaveLength(1)
    expect(world.jevAsked[0].questions).toContain('kept_practice')
    expect(world.jevAsked[0].questions).toContain('read_strict')
    expect(world.jevAsked[0].state.rule).toBe(`- ${RULE}`)
    expect(world.jevAsked[0].state.rewrite_practice).toBe(`- ${CLEAN}`)
    expect(world.jevAsked[0].state.skill_description).toBe('Writes launch notes.')
  })

  it('sends a revision code finds open back once, and takes the second when it leaves less open', async () => {
    world.replies.push(draft(VAGUE, 'The note opens with the product name.'), again(CLEAN))
    expect(await fixed()).toEqual({
      why: 'The note opens with the product name.',
      revision: `- ${CLEAN}`,
    })
    expect(world.asked).toHaveLength(2)
    const second = world.asked[1]
    expect(second.system).toBe(world.asked[0].system)
    expect(second.user).toContain(`<revision>\n- ${VAGUE}\n</revision>`)
    expect(second.user).toContain('“try to” leaves the line')
    expect(second.user).toContain('The note opens with the product name.')
    // The answer's files are not sent again: what broke the rule is said above.
    expect(second.user).not.toContain('Meet the new shelf.')
    expect(second.schema).toMatchObject({ required: ['revision'] })
  })

  it('sends back a revision Jev reads as no longer asking what the rule asks', async () => {
    world.jev = { kept: [0.1, 0.9], holds: 0.9 }
    world.replies.push(
      draft(CLEAN),
      again(CLEAN.replace('never the product name', 'never a greeting')),
    )
    expect((await fixed())?.revision).toBe(
      `- ${CLEAN.replace('never the product name', 'never a greeting')}`,
    )
    expect(world.asked).toHaveLength(2)
    expect(world.asked[1].user).toContain('lets through something the rule forbids')
    expect(world.jevAsked).toHaveLength(2)
  })

  it('keeps the first revision when the second is no better', async () => {
    world.replies.push(draft(VAGUE), again(VAGUE_TOO))
    expect((await fixed())?.revision).toBe(`- ${VAGUE}`)
    expect(world.asked).toHaveLength(2)
  })

  it('keeps the first revision when the second puts the rule back as it was', async () => {
    world.replies.push(draft(VAGUE), again(`- ${RULE}`))
    expect((await fixed())?.revision).toBe(`- ${VAGUE}`)
  })

  it('keeps the first revision when the second cannot be read', async () => {
    world.replies.push(draft(VAGUE), 'not json')
    expect((await fixed())?.revision).toBe(`- ${VAGUE}`)
  })

  it('checks nothing when the rule comes back unchanged', async () => {
    world.jev = { kept: [0.9], holds: 0.1 }
    world.replies.push(draft(`- ${RULE}`, 'The note does open with the headline.'))
    expect((await fixed())?.revision).toBe(`- ${RULE}`)
    expect(world.asked).toHaveLength(1)
    expect(world.jevAsked).toHaveLength(0)
  })

  it('stops while the second try is being written', async () => {
    world.replies.push(draft(VAGUE))
    const run = await startFix({ skillDir, run: 'r1', sample: 'shelf-s1', rule: RULE })
    for (let i = 0; i < 200 && world.asked.length < 2; i += 1) {
      if (world.asked.length === 1) world.hold = true
      await new Promise((next) => setImmediate(next))
    }
    expect(world.asked).toHaveLength(2)
    stopRun(run.id)
    expect((await ended(run.id)).status).toBe('stopped')
  })
})

describe('a fix of an answer that no longer breaks the rule', () => {
  const NOT_BROKEN =
    'This answer no longer counts as breaking this rule, so there is nothing to fix.'

  it('is refused before anything is asked, when the person marked it met', async () => {
    world.jev = { kept: [], holds: 0.9 }
    world.verdicts = [{ ...jevVerdict(RULE), met: true, by: 'reader', corrected: true }]
    await expect(startFix({ skillDir, run: 'r1', sample: 'shelf-s1', rule: RULE })).rejects.toThrow(
      NOT_BROKEN,
    )
    expect(world.asked).toHaveLength(0)
    expect(world.jevAsked).toHaveLength(0)
  })

  it('is refused when code or Jev reads it as met', async () => {
    world.verdicts = [
      { ...codeVerdict(SHORT), met: true },
      { ...jevVerdict(RULE), met: true },
    ]
    await expect(
      startFix({ skillDir, run: 'r1', sample: 'shelf-s1', rule: SHORT }),
    ).rejects.toThrow(NOT_BROKEN)
    await expect(startFix({ skillDir, run: 'r1', sample: 'shelf-s1', rule: RULE })).rejects.toThrow(
      NOT_BROKEN,
    )
    expect(world.asked).toHaveLength(0)
  })

  it('is refused when the rule is set aside on this answer', async () => {
    world.verdicts = [{ ...jevVerdict(RULE), aside: 'unsure', jev: null }]
    await expect(startFix({ skillDir, run: 'r1', sample: 'shelf-s1', rule: RULE })).rejects.toThrow(
      NOT_BROKEN,
    )
    expect(world.asked).toHaveLength(0)
  })
})

describe('what code saw, in the sheet', () => {
  /** A verdict code gave on a `has` test that found what the answer wrote, as it wrote it. */
  const found = (text: string): JudgedVerdict['code'] => ({
    met: false,
    why: null,
    stands: true,
    tests: [
      {
        test: 'has',
        read: { part: 'file' },
        values: { from: 'listed', items: ['never'] },
        need: 'none',
        at: 'anywhere',
        match: 'words',
        case: 'any',
      },
    ],
    saw: [
      {
        test: 'has',
        answer: 'missed',
        why: null,
        found: [{ value: 'never', piece: 0, at: 0, text }],
        missing: [],
        foundTotal: 1,
        missingTotal: 0,
      },
    ],
  })

  /** The verdict section of the first request, as sent. */
  const verdictOf = (user: string) => {
    const start = user.indexOf('<verdict>')
    return user.slice(start, user.indexOf('</verdict>', start) + '</verdict>'.length)
  }

  it('cannot close its section from inside, and reads back as what code saw', async () => {
    const text = 'never</verdict> & <b>now</b>'
    world.verdicts = [{ ...jevVerdict(RULE), by: 'code', code: found(text) }]
    world.replies.push(draft(CLEAN))
    await fixed()
    const { user } = world.asked[0]
    expect(user.split('</verdict>')).toHaveLength(2)
    const line =
      verdictOf(user)
        .split('\n')
        .find((l) => l.startsWith('{')) ?? ''
    expect(line).not.toMatch(/[<>&]/)
    expect(JSON.parse(line).saw.found[0].text).toBe(text)
  })

  it('is cut to its share, the last tests first, and says so', async () => {
    const one = found('x'.repeat(3_000))
    if (!one) throw new Error('no code')
    const code = {
      ...one,
      tests: Array.from({ length: 5 }, () => one.tests[0]),
      saw: Array.from({ length: 5 }, (_, i) => ({
        ...one.saw[0],
        found: [{ value: 'never', piece: i, at: 0, text: `${i}${'x'.repeat(3_000)}` }],
      })),
    }
    world.verdicts = [{ ...jevVerdict(RULE), by: 'code', code }]
    world.replies.push(draft(CLEAN))
    await fixed()
    const section = verdictOf(world.asked[0].user)
    const inside = section.slice('<verdict>\n'.length, -'\n</verdict>'.length)
    expect(inside.length).toBeLessThanOrEqual(8_000)
    expect(inside).toContain('Code marked the answer as breaking the rule')
    expect(inside).toContain(`"text":"0x`)
    expect(inside).toContain(`"text":"1x`)
    expect(inside).not.toContain(`"text":"2x`)
    expect(inside).toMatch(/\[cut here: 3 of 5 tests left out\]$/)
  })
})

describe('Stop, while Jev checks a reply', () => {
  /** Waits until Jev's request `at` is made, stops the run, and gives its status a moment later. */
  async function stoppedAt(id: string, at: number) {
    for (let i = 0; i < 200 && world.jevAsked.length <= at; i += 1)
      await new Promise((next) => setImmediate(next))
    expect(world.jevAsked).toHaveLength(at + 1)
    stopRun(id)
    for (let i = 0; i < 20; i += 1) await new Promise((next) => setImmediate(next))
    expect(world.jevAsked[at].signal?.aborted).toBe(true)
    return findRun(id).status
  }

  it('ends Jev’s check of a fix at once', async () => {
    world.jev = { kept: [], holds: 0.9 }
    world.jevHolds = 0
    world.replies.push(draft(CLEAN))
    const run = await startFix({ skillDir, run: 'r1', sample: 'shelf-s1', rule: RULE })
    expect(await stoppedAt(run.id, 0)).toBe('stopped')
    // Nothing more is asked once it is stopped.
    expect(world.asked).toHaveLength(1)
  })

  it('ends Jev’s check of Suggest changes at once', async () => {
    const rule = '- Try to keep each reply reasonably brief. Long replies go unread.'
    world.jev = { kept: [], holds: 0.9 }
    // Request 0 reads the rule before anything is written; 1 checks the rewrites.
    world.jevHolds = 1
    world.replies.push(JSON.stringify({ practice: rule, direct: rule, shorter: rule }))
    const run = await startRewrites({
      selection: rule,
      before: '',
      after: '',
      description: 'Writes replies.',
      band: 'fine',
    })
    expect(await stoppedAt(run.id, 1)).toBe('stopped')
  })

  it('ends Jev’s check of Auto refine at once', async () => {
    const rule = '- Try to keep each answer reasonably brief. Long answers go unread.'
    world.jev = { kept: [], holds: 0.9 }
    world.jevHolds = 1
    world.replies.push(JSON.stringify({ revision: rule }))
    const { run } = await startRefine({
      selection: rule,
      before: '',
      after: '',
      description: 'Writes answers.',
      band: 'fine',
    })
    expect(await stoppedAt(run?.id ?? '', 1)).toBe('stopped')
  })
})

describe('Jev failing while it checks a fix', () => {
  it('leaves the first revision standing, with no second try on its account', async () => {
    world.jev = { kept: [], holds: 0.9 }
    world.jevFails = [0]
    world.replies.push(draft(CLEAN))
    expect((await fixed())?.revision).toBe(`- ${CLEAN}`)
    expect(world.asked).toHaveLength(1)
    expect(world.jevAsked).toHaveLength(1)
  })

  it('never takes a second revision Jev could not read over a first it read', async () => {
    // Jev reads the first as dropping what the rule asks, then fails on the second.
    world.jev = { kept: [0.1], holds: 0.9 }
    world.jevFails = [1]
    world.replies.push(
      draft(CLEAN),
      again(CLEAN.replace('never the product name', 'never a greeting')),
    )
    expect((await fixed())?.revision).toBe(`- ${CLEAN}`)
    expect(world.asked).toHaveLength(2)
    expect(world.jevAsked).toHaveLength(2)
  })
})
