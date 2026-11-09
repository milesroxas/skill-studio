import { describe, expect, it } from 'vitest'
import {
  AI_PROVIDER_IDS,
  AI_PROVIDERS,
  type AiProviderInfo,
  type AiRun,
  type AiRunStatus,
  accountLine,
  CHAT_WINDOW,
  CHAT_WINDOW_CHARS,
  chatWindowOf,
  compactCount,
  defaultFirst,
  effortFor,
  isNewsOf,
  isOpenAiChatModel,
  mainProviderOf,
  needsSignIn,
  openAiEfforts,
  providersOf,
  RUNS_KEPT,
  readyProviders,
  resolveChoice,
  runsToForget,
  summarizeUsage,
  type UsageEntry,
} from './ai.ts'

const opus = { id: 'opus', label: 'Opus', efforts: ['low', 'high'] as const }
const plain = { id: 'plain', label: 'Plain', efforts: [] }
const providers: AiProviderInfo[] = [
  {
    id: 'anthropic',
    connected: false,
    problem: null,
    models: [],
    account: null,
    installable: false,
  },
  {
    id: 'claude-code',
    connected: true,
    problem: null,
    models: [{ ...opus, efforts: [...opus.efforts] }, plain],
    account: null,
    installable: false,
  },
  {
    id: 'openai',
    connected: true,
    problem: null,
    models: [plain],
    account: null,
    installable: false,
  },
  {
    id: 'codex',
    connected: true,
    problem: 'cannot list',
    models: [],
    account: null,
    installable: false,
  },
]

describe('resolveChoice', () => {
  it('has no model while nothing is connected', () => {
    expect(resolveChoice(null, [providers[0]])).toBeNull()
  })

  it('starts on the first connected provider’s first model', () => {
    expect(resolveChoice(null, providers)).toEqual({
      provider: 'claude-code',
      model: 'opus',
      effort: '',
    })
  })

  it('keeps a stored choice that is still offered', () => {
    const stored = { provider: 'claude-code', model: 'opus', effort: 'high' } as const
    expect(resolveChoice(stored, providers)).toEqual(stored)
  })

  it('drops an effort the model does not take and a model the provider dropped', () => {
    expect(
      resolveChoice({ provider: 'claude-code', model: 'opus', effort: 'max' }, providers)?.effort,
    ).toBe('')
    expect(resolveChoice({ provider: 'openai', model: 'gone', effort: 'high' }, providers)).toEqual(
      { provider: 'openai', model: 'plain', effort: '' },
    )
  })

  it('leaves a provider that is disconnected or has no models', () => {
    expect(resolveChoice({ provider: 'anthropic', model: 'x', effort: 'high' }, providers)).toEqual(
      { provider: 'claude-code', model: 'opus', effort: '' },
    )
    expect(resolveChoice({ provider: 'codex', model: 'x', effort: '' }, providers)?.provider).toBe(
      'claude-code',
    )
  })
})

describe('efforts', () => {
  it('keeps an effort only on a model that takes it', () => {
    expect(effortFor(providers[1].models[0], 'high')).toBe('high')
    expect(effortFor(plain, 'high')).toBe('')
  })

  it('gives OpenAI’s reasoning models an effort and its other models none', () => {
    expect(openAiEfforts('gpt-5.5')).toEqual(['low', 'medium', 'high'])
    expect(openAiEfforts('o4-mini')).toEqual(['low', 'medium', 'high'])
    expect(openAiEfforts('gpt-4.1')).toEqual([])
  })
})

describe('model lists', () => {
  it('keeps OpenAI models that hold a conversation', () => {
    expect(isOpenAiChatModel('gpt-5.5')).toBe(true)
    expect(isOpenAiChatModel('o3')).toBe(true)
    expect(isOpenAiChatModel('gpt-4o-audio-preview')).toBe(false)
    expect(isOpenAiChatModel('text-embedding-3-large')).toBe(false)
    expect(isOpenAiChatModel('gpt-image-1')).toBe(false)
  })

  it('puts the default first and keeps the rest in order', () => {
    const models = [plain, { ...opus, efforts: [] }]
    expect(defaultFirst(models, 'opus').map((m) => m.id)).toEqual(['opus', 'plain'])
    expect(defaultFirst(models, 'absent').map((m) => m.id)).toEqual(['plain', 'opus'])
  })
})

describe('summarizeUsage', () => {
  const now = new Date(2026, 10, 5, 15)
  const at = (daysAgo: number, hour = 12): string =>
    new Date(2026, 10, 5 - daysAgo, hour).toISOString()
  const entry = (daysAgo: number, model: string, input: number, output: number): UsageEntry => ({
    at: at(daysAgo),
    provider: 'anthropic',
    model,
    input,
    output,
  })

  it('totals today, the last 30 days, and each model', () => {
    const summary = summarizeUsage(
      [entry(0, 'a', 100, 10), entry(0, 'b', 5, 5), entry(3, 'a', 1000, 100), entry(40, 'a', 9, 9)],
      now,
    )
    expect(summary.today).toEqual({ requests: 2, input: 105, output: 15 })
    expect(summary.month).toEqual({ requests: 3, input: 1105, output: 115 })
    expect(summary.models.map((m) => [m.model, m.requests])).toEqual([
      ['a', 2],
      ['b', 1],
    ])
  })

  it('counts yesterday evening in the month, not in today', () => {
    const summary = summarizeUsage([{ ...entry(1, 'a', 1, 1), at: at(1, 23) }], now)
    expect(summary.today.requests).toBe(0)
    expect(summary.month.requests).toBe(1)
  })
})

describe('compactCount', () => {
  it('reads thousands and millions at a glance', () => {
    expect(compactCount(950)).toBe('950')
    expect(compactCount(1234)).toBe('1.2k')
    expect(compactCount(12_000)).toBe('12k')
    expect(compactCount(123_456)).toBe('123k')
    expect(compactCount(1_234_567)).toBe('1.2M')
  })
})

const runOf = (id: string, status: AiRunStatus): AiRun => ({
  id,
  kind: 'assist',
  status,
  text: '',
  error: null,
  provider: 'claude-code',
  model: 'opus',
  usage: null,
})

describe('isNewsOf', () => {
  it('takes the first report of a run and every report while it is written', () => {
    expect(isNewsOf(undefined, runOf('a', 'running'))).toBe(true)
    expect(isNewsOf(runOf('a', 'running'), runOf('a', 'running'))).toBe(true)
    expect(isNewsOf(runOf('a', 'running'), runOf('a', 'done'))).toBe(true)
  })

  it('drops a late report that an ended run is still running', () => {
    expect(isNewsOf(runOf('a', 'stopped'), runOf('a', 'running'))).toBe(false)
    expect(isNewsOf(runOf('a', 'done'), runOf('a', 'done'))).toBe(true)
  })
})

describe('runsToForget', () => {
  const ended = Array.from({ length: RUNS_KEPT }, (_, i) => runOf(`ended-${i}`, 'done'))

  it('forgets nothing while no more than the limit are held', () => {
    expect(runsToForget(ended)).toEqual([])
  })

  it('forgets the oldest ended runs past the limit, never one still being written', () => {
    const held = [runOf('writing', 'running'), ...ended, runOf('newest', 'failed')]
    expect(runsToForget(held)).toEqual(['ended-0', 'ended-1'])
  })
})

describe('providersOf', () => {
  it('lists a vendor’s ways in, the CLI first', () => {
    expect(providersOf('Anthropic')).toEqual(['claude-code', 'anthropic'])
    expect(providersOf('OpenAI')).toEqual(['codex', 'openai'])
  })
})

describe('readyProviders', () => {
  const info = (id: AiProviderInfo['id'], connected: boolean, problem: string | null) => ({
    id,
    connected,
    problem,
    models: [],
    account: null,
    installable: false,
  })

  it('keeps the connected providers with nothing wrong', () => {
    const ready = readyProviders([
      info('anthropic', true, 'The key was refused.'),
      info('claude-code', true, null),
      info('openai', false, null),
    ])
    expect(ready.map((p) => p.id)).toEqual(['claude-code'])
  })
})

describe('needsSignIn', () => {
  const info = (id: AiProviderInfo['id'], signedIn: boolean | null): AiProviderInfo => ({
    id,
    connected: true,
    problem: null,
    models: [],
    account: signedIn === null ? null : { signedIn, email: null, billing: null, plan: null },
    installable: false,
  })

  it('asks only a signed-out CLI the app can sign in', () => {
    expect(needsSignIn(info('claude-code', false))).toBe(true)
    expect(needsSignIn(info('claude-code', true))).toBe(false)
    expect(needsSignIn(info('claude-code', null))).toBe(false)
    expect(needsSignIn(info('codex', false))).toBe(true)
    expect(needsSignIn(info('anthropic', false))).toBe(false)
  })
})

describe('accountLine', () => {
  const signedIn = { signedIn: true, email: 'a@b.co', billing: 'plan', plan: 'max' } as const

  it('says who is signed in and which plan pays', () => {
    expect(accountLine('claude-code', signedIn)).toBe('As a@b.co, on the Max plan. No key needed.')
    expect(accountLine('codex', { ...signedIn, email: null, plan: null })).toBe(
      'On your plan. No key needed.',
    )
  })

  it('never takes a key in the environment for a plan', () => {
    const line = accountLine('claude-code', { ...signedIn, billing: 'key', plan: null })
    expect(line).toContain('bills to that API account')
    expect(line).not.toContain('No key needed')
  })

  it('claims no plan when the CLI does not say what pays', () => {
    expect(accountLine('claude-code', { ...signedIn, billing: null })).toBe(
      'Uses the account the claude command is set up with.',
    )
  })

  it('falls back to the provider’s own line', () => {
    expect(accountLine('claude-code', null)).toBe(AI_PROVIDERS['claude-code'].about)
    expect(accountLine('anthropic', signedIn)).toBe(AI_PROVIDERS.anthropic.about)
  })
})

describe('the CLI as the main way in', () => {
  it('lists each vendor’s CLI ahead of its key, so the default lands on it', () => {
    expect([...AI_PROVIDER_IDS]).toEqual(['claude-code', 'anthropic', 'codex', 'openai'])
    expect(mainProviderOf('Anthropic')).toBe('claude-code')
    expect(mainProviderOf('OpenAI')).toBe('codex')
  })

  it('starts on the CLI when a key is connected too and nothing is chosen', () => {
    const model = { id: 'm', label: 'M', efforts: [] }
    const both = AI_PROVIDER_IDS.map((id) => ({
      id,
      connected: true,
      problem: null,
      models: [model],
      account: null,
      installable: false,
    }))
    expect(resolveChoice(null, both)?.provider).toBe('claude-code')
  })
})

describe('chatWindowOf', () => {
  const turn = (i: number, size = 10) => ({
    role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant',
    text: `${i}:`.padEnd(size, 'x'),
  })

  it('keeps the latest messages that fit both caps, starting at one from the user', () => {
    const many = Array.from({ length: CHAT_WINDOW + 5 }, (_, i) => turn(i))
    const window = chatWindowOf(many)
    expect(window.length).toBeLessThanOrEqual(CHAT_WINDOW)
    expect(window[0].role).toBe('user')
    expect(window.at(-1)).toEqual(many.at(-1))

    const long = Array.from({ length: 10 }, (_, i) => turn(i, CHAT_WINDOW_CHARS / 4))
    const capped = chatWindowOf(long)
    expect(capped.map((m) => m.text.slice(0, 2))).toEqual(['6:', '7:', '8:', '9:'])
    expect(capped[0].role).toBe('user')
  })

  it('always sends the newest message, however long', () => {
    const huge = [turn(0), { role: 'user' as const, text: 'y'.repeat(CHAT_WINDOW_CHARS * 2) }]
    expect(chatWindowOf(huge)).toEqual([huge[1]])
  })
})
