import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ASSIST_FIELDS,
  ASSIST_LIMIT,
  type AssistFieldId,
  type AssistInput,
  DESCRIPTION_WORDS,
  leftOutLine,
  madeFor,
  toAdd,
} from '@domain/assist.ts'
import { wordCount } from '@domain/text.ts'
import { QUESTIONS_PER_REQUEST, SAME_STATE } from '@judges/proposals.ts'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * What the model answers, one reply per request, and what it was asked; what
 * Jev answers when it has a key, and what it was asked.
 */
const world = vi.hoisted(() => ({
  replies: [] as string[],
  asked: [] as Array<{ system: string; user: string; images: number; schema: unknown }>,
  /** The request, by number from 0, that waits unanswered until it is stopped. */
  holdAt: null as number | null,
  /**
   * Null: no key. Else, for a new check that holds `check`, the two answers
   * Jev gives about it and the check of the case it is asked beside: `same`
   * to "do they ask the same", `differ` to "could one answer meet one and miss
   * the other". A pair it holds no answer for reads as different.
   */
  jev: null as null | Array<{ check: string; same: number; differ: number }>,
  jevAsked: [] as Array<{
    state: unknown
    questions: string[]
    signal: AbortSignal | undefined
  }>,
  /** Jev's requests, by number from 0, that fail; `every` fails them all. */
  jevFails: [] as number[] | 'every',
  /** Jev's request, by number from 0, that waits unanswered until it is stopped. */
  jevHoldsAt: null as number | null,
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
      messages: Array<{ text: string; images?: unknown[] }>
      schema: unknown
      signal: AbortSignal
    }) => {
      const at = world.asked.length
      world.asked.push({
        system,
        user: messages[0]?.text ?? '',
        images: messages[0]?.images?.length ?? 0,
        schema,
      })
      if (world.holdAt === at)
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
  writePreferences: () => {},
}))
vi.mock('@judges/jev.ts', () => ({
  DEFAULT_MODEL: 'jev',
  Jev: class {
    static available = () => world.jev !== null
    model = 'jev'
    async ask(state: unknown, questions: Record<string, unknown>, signal?: AbortSignal) {
      const keys = Object.keys(questions)
      const at = world.jevAsked.length
      world.jevAsked.push({ state, questions: keys, signal })
      if (!world.jev) throw new Error('no key')
      if (world.jevFails === 'every' || world.jevFails.includes(at)) throw new Error('Jev is down')
      // Without a signal it waits for ever, as a request nothing can end would.
      if (world.jevHoldsAt === at)
        await new Promise((_, fail) =>
          signal?.addEventListener('abort', () => fail(new Error('stopped'))),
        )
      const pairs = world.jev
      return Object.fromEntries(
        keys.map((key) => {
          const text = JSON.stringify(questions[key])
          const asksSame = text.includes('Do these two checks ask for the same thing')
          const pair = pairs.find((p) => text.includes(p.check))
          const noul = pair ? (asksSame ? pair.same : pair.differ) : asksSame ? 0.05 : 0.95
          return [key, { noul }]
        }),
      )
    }
  },
  isAuthError: () => false,
}))

// The operations read where the app keeps its files once, as they load: a scratch folder here.
const home = mkdtempSync(join(tmpdir(), 'assist-home-'))
process.env.SKILL_STUDIO_HOME = home
const { findRun, startAssist, stopRun } = await import('./ai.ts')
const { parsers } = await import('./api/operations.ts')
afterAll(() => rmSync(home, { recursive: true, force: true }))

const reply = (text: string): string => JSON.stringify({ text })

/** A description of `n` words, each one word by any count. */
const description = (n: number): string =>
  `Writes ${Array.from({ length: n - 1 }, (_, i) => (i % 2 ? 'notes' : 'release')).join(' ')}`

const input = (field: AssistFieldId, items?: string[]): AssistInput => ({
  field,
  instruction: field === 'case.checks' ? 'Write the checks this case lacks' : 'Write it',
  current: '',
  context: [{ label: 'The case', text: 'Prompt: Write the launch note for Shelf.' }],
  images: [],
  ...(items ? { items } : {}),
})

async function ended(id: string): Promise<ReturnType<typeof findRun>> {
  for (let i = 0; i < 200 && findRun(id).status === 'running'; i += 1)
    await new Promise((next) => setImmediate(next))
  return findRun(id)
}

/** The run a request ends on, with what it put in the field. */
async function written(request: AssistInput, skillDir: string | null = null) {
  const run = await startAssist(request, [], skillDir)
  expect(run.kind).toBe('assist')
  return ended(run.id)
}

/** Wait until the run is waiting on its `n`th request, to the model or to Jev. */
async function waiting(count: () => number, n: number): Promise<void> {
  for (let i = 0; i < 200 && count() < n; i += 1) await new Promise((next) => setImmediate(next))
  expect(count()).toBe(n)
}

let skillDir = ''
beforeEach(() => {
  world.replies = []
  world.asked = []
  world.holdAt = null
  world.jev = null
  world.jevAsked = []
  world.jevFails = []
  world.jevHoldsAt = null
  skillDir = mkdtempSync(join(tmpdir(), 'assist-'))
})
afterEach(() => rmSync(skillDir, { recursive: true, force: true }))

describe('how a description’s words are counted', () => {
  it('is the number its field asks the model for', () => {
    expect(DESCRIPTION_WORDS).toBe(50)
    expect(ASSIST_FIELDS['skill.description'].shape).toContain(
      `${DESCRIPTION_WORDS} words or fewer`,
    )
  })

  it('counts as a person does, split on white space, with the function the Improve panel shows a draft’s words by', () => {
    expect(wordCount('Writes well-known, up-to-date notes.')).toBe(4)
    expect(wordCount('Writes 50 notes for v2.3.')).toBe(5)
    // A dash or an ampersand between spaces is a word to this count.
    expect(wordCount('Writes notes — fast & short …')).toBe(7)
    expect(wordCount('Runs `st run` on each case.')).toBe(6)
    expect(wordCount('Writes notes.\nUse when asked.')).toBe(5)
    expect(wordCount('Writes notes.\r\nUse when asked.')).toBe(5)
    expect(wordCount('  ')).toBe(0)
  })

  it('counts words of any script written with spaces, and text written without them as one', () => {
    expect(wordCount('Écrit les notes de version.')).toBe(5)
    expect(wordCount('Пишет заметки к выпуску.')).toBe(4)
    expect(wordCount('これはテストです。それも。')).toBe(1)
  })
})

describe('Write with AI, on a description', () => {
  it('takes a description of exactly 50 words as it is, and asks once', async () => {
    const text = description(50)
    expect(wordCount(text)).toBe(50)
    world.replies.push(reply(text))
    const done = await written(input('skill.description'))
    expect(done.status, done.error ?? '').toBe('done')
    expect(done.text).toBe(text)
    expect(world.asked).toHaveLength(1)
  })

  it('takes 50 words split on white space as 50, though a point inside a number would part one', async () => {
    const text = `${description(49)} v2.3`
    expect(wordCount(text)).toBe(50)
    world.replies.push(reply(text))
    const done = await written(input('skill.description'))
    expect(done.text).toBe(text)
    expect(world.asked).toHaveLength(1)
  })

  it('counts a dash between spaces as a word, so 49 words and a dash are sent back', async () => {
    const text = `${description(49)} — fast`
    expect(wordCount(text)).toBe(51)
    world.replies.push(reply(text), reply(description(20)))
    const done = await written(input('skill.description'))
    expect(world.asked).toHaveLength(2)
    expect(world.asked[1].user).toContain('has 51 words')
    expect(done.text).toBe(description(20))
  })

  it('never sends back a description written without spaces, however long', async () => {
    // Sixty sentences: sixty words to a count that parts text at punctuation, one to this one.
    const text = 'リリースノートを書きます。'.repeat(60)
    expect(wordCount(text)).toBe(1)
    world.replies.push(reply(text))
    const done = await written(input('skill.description'))
    expect(done.text).toBe(text)
    expect(world.asked).toHaveLength(1)
  })

  it('sends one of 51 words back once, with its count, and takes the shorter second', async () => {
    const long = description(51)
    const short = description(30)
    world.replies.push(reply(long), reply(short))
    const done = await written(input('skill.description'))
    expect(done.status, done.error ?? '').toBe('done')
    expect(done.text).toBe(short)
    expect(world.asked).toHaveLength(2)
    const [first, second] = world.asked
    expect(second.system).toBe(first.system)
    expect(second.schema).toEqual(first.schema)
    expect(second.user).toContain(first.user)
    expect(second.user).toContain(long)
    expect(second.user).toContain('has 51 words')
    expect(second.user).toContain('50 words or fewer')
  })

  it('reads a reply over two lines as one line, and counts it the same', async () => {
    const words51 = description(51).split(' ')
    const text = `${words51.slice(0, 20).join(' ')}\r\n${words51.slice(20).join(' ')}`
    world.replies.push(reply(text), reply(description(40)))
    const done = await written(input('skill.description'))
    expect(world.asked).toHaveLength(2)
    expect(world.asked[1].user).toContain('has 51 words')
    expect(done.text).toBe(description(40))
  })

  it('keeps the first when the second is no shorter', async () => {
    world.replies.push(reply(description(55)), reply(description(55)))
    const done = await written(input('skill.description'))
    expect(done.text).toBe(description(55))
    expect(world.asked).toHaveLength(2)
  })

  it('keeps a second still over 50 words when it has fewer than the first', async () => {
    world.replies.push(reply(description(70)), reply(description(56)))
    const done = await written(input('skill.description'))
    expect(done.status).toBe('done')
    expect(done.text).toBe(description(56))
    expect(world.asked).toHaveLength(2)
  })

  it('keeps the first when the second cannot be read, so the person still gets a description', async () => {
    world.replies.push(reply(description(60)), '{"text": "cut of')
    const done = await written(input('skill.description'))
    expect(done.status, done.error ?? '').toBe('done')
    expect(done.text).toBe(description(60))
    expect(world.asked).toHaveLength(2)
  })

  it('refuses an empty description, and keeps the first when the second has no text', async () => {
    world.replies.push(reply('  '))
    const empty = await written(input('skill.description'))
    expect(empty.status).toBe('failed')
    expect(empty.error).toContain('no text')
    world.replies.push(reply(description(60)), reply(''))
    const done = await written(input('skill.description'))
    expect(done.status, done.error ?? '').toBe('done')
    expect(done.text).toBe(description(60))
    expect(world.asked).toHaveLength(3)
  })

  it('sends the second request without the pictures, and says nothing of them', async () => {
    world.replies.push(reply(description(60)), reply(description(30)))
    const run = await startAssist(
      { ...input('skill.description'), images: [{ name: 'shot.png', file: null, upload: 'u1' }] },
      [{ path: join(skillDir, 'shot.png'), mediaType: 'image/png' } as never],
      null,
    )
    await ended(run.id)
    expect(world.asked[0].images).toBe(1)
    expect(world.asked[0].user).toContain('shot.png')
    expect(world.asked[1].images).toBe(0)
    expect(world.asked[1].user).not.toContain('shot.png')
  })

  it('ends stopped on Stop during the first request, and done with the first description on Stop during the second', async () => {
    world.holdAt = 0
    const first = await startAssist(input('skill.description'), [], null)
    await waiting(() => world.asked.length, 1)
    stopRun(first.id)
    expect((await ended(first.id)).status).toBe('stopped')

    // Requests are numbered across both presses: this press's second is the third.
    world.replies.push(reply(description(60)))
    world.holdAt = 2
    const run = await startAssist(input('skill.description'), [], null)
    await waiting(() => world.asked.length, 3)
    stopRun(run.id)
    const done = await ended(run.id)
    expect(done.status, done.error ?? '').toBe('done')
    expect(done.text).toBe(description(60))
    expect(world.asked).toHaveLength(3)
  })

  it('holds no other field to 50 words', async () => {
    const prompt = description(80)
    expect(wordCount(prompt)).toBe(80)
    world.replies.push(reply(prompt))
    const done = await written(input('case.prompt'))
    expect(done.text).toBe(prompt)
    expect(world.asked).toHaveLength(1)
  })
})

const HAS = ['The note names Priya as the lead.', 'The note gives the launch date.']

describe('Write checks with AI, before a first run', () => {
  it('drops a check the case has in the same words, give or take case, spacing and punctuation', async () => {
    world.replies.push(
      reply(
        'the note   names Priya as the lead\nThe note gives the price: $12.\n- THE NOTE GIVES THE LAUNCH-DATE!',
      ),
    )
    const done = await written(input('case.checks', HAS))
    expect(done.status, done.error ?? '').toBe('done')
    expect(done.text).toBe('The note gives the price: $12.')
    expect(done.leftOut).toEqual({ had: 2, twice: 0 })
    expect(world.jevAsked).toHaveLength(0)
  })

  it('drops a new check that says what one before it in the reply says, and asks Jev nothing of it', async () => {
    world.jev = []
    world.replies.push(
      reply('The note gives the price.\nThe note names the city.\n- the note gives THE PRICE'),
    )
    const done = await written(input('case.checks', HAS))
    expect(done.text).toBe('The note gives the price.\nThe note names the city.')
    expect(done.leftOut).toEqual({ had: 0, twice: 1 })
    // Only the two left, each beside each of the case's, both ways round.
    expect(world.jevAsked).toHaveLength(1)
    expect(world.jevAsked[0].questions).toHaveLength(2 * 2 * 2)
  })

  it('counts a repeat of a check Jev left out with it, as one the case has, never as one above', async () => {
    world.jev = [{ check: 'The note says when Shelf launches.', same: 0.95, differ: 0.03 }]
    world.replies.push(
      reply(
        'The note says when Shelf launches.\nThe note gives the price.\nthe note says when Shelf launches',
      ),
    )
    const done = await written(input('case.checks', HAS))
    expect(done.text).toBe('The note gives the price.')
    expect(done.leftOut).toEqual({ had: 2, twice: 0 })
  })

  it('asks Jev, in one request, whether each new check asks what a check of the case asks, and drops one it is sure of', async () => {
    world.jev = [{ check: 'The note says when Shelf launches.', same: 0.93, differ: 0.04 }]
    world.replies.push(reply('The note says when Shelf launches.\nThe note gives the price.'))
    const done = await written(input('case.checks', HAS))
    expect(done.status, done.error ?? '').toBe('done')
    expect(done.text).toBe('The note gives the price.')
    expect(done.leftOut).toEqual({ had: 1, twice: 0 })
    expect(world.asked).toHaveLength(1)
    expect(world.jevAsked).toHaveLength(1)
    const [request] = world.jevAsked
    expect(request.state).toEqual(SAME_STATE)
    // Each new check beside each of the case's, both ways round.
    expect(request.questions).toHaveLength(2 * 2 * 2)
    expect(request.signal).toBeInstanceOf(AbortSignal)
  })

  it('asks Jev nothing about a check already dropped for its words, nor while the case has no checks', async () => {
    world.jev = []
    world.replies.push(reply('The note gives the launch date\nThe note gives the price.'))
    const done = await written(input('case.checks', HAS))
    expect(done.text).toBe('The note gives the price.')
    expect(world.jevAsked).toHaveLength(1)
    expect(world.jevAsked[0].questions).toHaveLength(1 * 2 * 2)
    world.replies.push(reply('The note gives the price.\nThe note names Priya.'))
    const first = await written(input('case.checks', []))
    expect(first.text).toBe('The note gives the price.\nThe note names Priya.')
    expect(world.jevAsked).toHaveLength(1)
  })

  it('keeps a check Jev is not sure of', async () => {
    world.jev = [{ check: 'The note says when Shelf launches.', same: 0.62, differ: 0.38 }]
    world.replies.push(reply('The note says when Shelf launches.'))
    const done = await written(input('case.checks', HAS))
    expect(done.text).toBe('The note says when Shelf launches.')
    expect(done.leftOut).toBeUndefined()
    expect(world.jevAsked).toHaveLength(1)
  })

  it('reads Jev’s answers against the skill’s own threshold', async () => {
    mkdirSync(join(skillDir, 'evals'))
    writeFileSync(join(skillDir, 'evals', 'bench.json'), JSON.stringify({ yes: 0.95 }))
    world.jev = [{ check: 'The note says when Shelf launches.', same: 0.93, differ: 0.04 }]
    world.replies.push(reply('The note says when Shelf launches.'))
    const done = await written(input('case.checks', HAS), skillDir)
    expect(done.text).toBe('The note says when Shelf launches.')
    expect(world.jevAsked).toHaveLength(1)
  })

  it('without a key, drops only a check in the same words', async () => {
    world.replies.push(reply('The note says when Shelf launches.\nThe note gives the launch date.'))
    const done = await written(input('case.checks', HAS))
    expect(done.text).toBe('The note says when Shelf launches.')
    expect(world.jevAsked).toHaveLength(0)
  })

  it('drops nothing on Jev’s account when Jev fails, and the person still gets the checks', async () => {
    world.jev = [{ check: 'The note says when Shelf launches.', same: 0.99, differ: 0.01 }]
    world.jevFails = 'every'
    world.replies.push(reply('The note says when Shelf launches.\nThe note gives the launch date.'))
    const done = await written(input('case.checks', HAS))
    expect(done.status, done.error ?? '').toBe('done')
    expect(done.text).toBe('The note says when Shelf launches.')
    expect(world.jevAsked).toHaveLength(1)
  })

  it('ends with nothing to add when every check it wrote is one the case has', async () => {
    world.jev = [{ check: 'The note says when Shelf launches.', same: 0.97, differ: 0.02 }]
    world.replies.push(
      reply('The note says when Shelf launches.\nThe note names Priya as the lead.'),
    )
    const done = await written(input('case.checks', HAS))
    expect(done.status, done.error ?? '').toBe('done')
    expect(done.text).toBe('')
    expect(done.leftOut).toEqual({ had: 2, twice: 0 })
    expect(world.asked).toHaveLength(1)
  })

  it(`asks Jev at most ${QUESTIONS_PER_REQUEST} questions a request, as st propose does, each with the run's signal, and a failed one drops nothing`, async () => {
    expect(QUESTIONS_PER_REQUEST).toBe(40)
    const has = Array.from({ length: 8 }, (_, i) => `The note names city ${i + 1}.`)
    // Three new checks beside eight: 24 pairs, 48 questions, so 40 in the first request and 8 in the second.
    world.jev = [
      { check: 'The note gives the price.', same: 0.98, differ: 0.01 },
      { check: 'The note gives the launch day.', same: 0.98, differ: 0.01 },
    ]
    world.jevFails = [0]
    world.replies.push(
      reply('The note gives the price.\nThe note names the lead.\nThe note gives the launch day.'),
    )
    const done = await written(input('case.checks', has))
    expect(world.jevAsked.map((r) => r.questions.length)).toEqual([40, 8])
    const [first, second] = world.jevAsked
    expect(first.signal).toBeInstanceOf(AbortSignal)
    expect(second.signal).toBe(first.signal)
    // The price was asked of only in the request that failed, so it stays; the launch day was
    // asked of in both, and the answered one is sure.
    expect(done.text).toBe('The note gives the price.\nThe note names the lead.')
    expect(done.leftOut).toEqual({ had: 1, twice: 0 })
  })

  it('sends no more of Jev’s requests once Stop is pressed, and ends done with every check it wrote', async () => {
    world.jev = []
    world.jevHoldsAt = 0
    const has = Array.from({ length: 8 }, (_, i) => `The note names city ${i + 1}.`)
    world.replies.push(
      reply('The note gives the price.\nThe note names the lead.\nThe note gives the day.'),
    )
    const run = await startAssist(input('case.checks', has), [], null)
    await waiting(() => world.jevAsked.length, 1)
    stopRun(run.id)
    const done = await ended(run.id)
    expect(done.status, done.error ?? '').toBe('done')
    expect(done.text).toBe(
      'The note gives the price.\nThe note names the lead.\nThe note gives the day.',
    )
    expect(world.jevAsked).toHaveLength(1)
    expect(world.jevAsked[0].signal?.aborted).toBe(true)
  })

  it('on Stop during a later request, keeps what Jev ruled before it and every check it had not ruled on', async () => {
    // Eleven new checks beside two: 22 pairs, so twenty in the first request and two in the second.
    const fresh = Array.from({ length: 11 }, (_, i) => `The note names product ${i + 1}.`)
    world.jev = [
      { check: 'The note names product 1.', same: 0.97, differ: 0.02 },
      { check: 'The note names product 11.', same: 0.97, differ: 0.02 },
    ]
    world.jevHoldsAt = 1
    world.replies.push(reply(fresh.join('\n')))
    const run = await startAssist(input('case.checks', HAS), [], null)
    await waiting(() => world.jevAsked.length, 2)
    stopRun(run.id)
    const done = await ended(run.id)
    expect(done.status, done.error ?? '').toBe('done')
    expect(done.text).toBe(fresh.slice(1).join('\n'))
    expect(done.leftOut).toEqual({ had: 1, twice: 0 })
    expect(world.jevAsked.map((r) => r.questions.length)).toEqual([40, 4])
  })
})

describe('what the reply box says of checks left out', () => {
  it('says nothing when none was', () => {
    expect(leftOutLine(undefined, 'The note gives the price.')).toBeNull()
    expect(leftOutLine({ had: 0, twice: 0 }, 'The note gives the price.')).toBeNull()
  })

  it('says how many and why, under the checks left in', () => {
    const kept = 'The note gives the price.'
    expect(leftOutLine({ had: 1, twice: 0 }, kept)).toBe(
      '1 check that came back is left out: this case has it already.',
    )
    expect(leftOutLine({ had: 2, twice: 0 }, kept)).toBe(
      '2 checks that came back are left out: this case has them already.',
    )
    expect(leftOutLine({ had: 0, twice: 1 }, kept)).toBe(
      '1 check that came back is left out: it repeats one above.',
    )
    expect(leftOutLine({ had: 0, twice: 2 }, kept)).toBe(
      '2 checks that came back are left out: they repeat ones above.',
    )
    expect(leftOutLine({ had: 2, twice: 1 }, kept)).toBe(
      '3 checks that came back are left out: this case has 2 already, and 1 repeats one above.',
    )
  })

  it('says there is nothing to add when every one was', () => {
    expect(leftOutLine({ had: 2, twice: 1 }, '')).toBe(
      'Every check that came back is one this case has already: there is nothing to add.',
    )
  })
})

describe('what is added, and when a reply is shown again', () => {
  it('adds only the checks the list has not got by the time Add is pressed', () => {
    const kept = 'The note gives the price.\nThe note names the city.'
    expect(toAdd(kept, HAS)).toBe(kept)
    // The person typed one of them into the list while the reply was written.
    expect(toAdd(kept, [...HAS, 'the note gives the PRICE'])).toBe('The note names the city.')
    expect(toAdd(kept, [...HAS, 'The note gives the price', 'The note names the city!'])).toBeNull()
  })

  it('shows a reply again only for the list it was made for', () => {
    const made = madeFor('case.checks', '', HAS)
    expect(madeFor('case.checks', '', [...HAS])).toBe(made)
    expect(madeFor('case.checks', '', [...HAS, 'The note gives the price.'])).not.toBe(made)
    expect(madeFor('case.check', '', HAS)).not.toBe(made)
    expect(madeFor('case.prompt', 'Write the note.')).not.toBe(madeFor('case.prompt', 'Write it.'))
  })
})

describe('the size of a request', () => {
  it('counts the case’s checks once, in the context the model reads, not again as the list’s items', () => {
    const checks = Array.from(
      { length: 40 },
      (_, i) => `The note names city ${i + 1} ${'x'.repeat(6_000)}.`,
    )
    const context = [{ label: 'The case', text: checks.map((c) => `Check: ${c}`).join('\n') }]
    const size = context[0].text.length
    expect(size).toBeLessThan(ASSIST_LIMIT)
    expect(size * 2).toBeGreaterThan(ASSIST_LIMIT)
    const parsed = parsers['ai.assist']({
      field: 'case.checks',
      instruction: 'Write the checks this case lacks',
      current: '',
      context,
      images: [],
      items: checks,
    })
    expect(parsed.items).toEqual(checks)
  })
})
