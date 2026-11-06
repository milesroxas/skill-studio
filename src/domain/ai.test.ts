import { describe, expect, it } from 'vitest'
import {
  type AiProviderInfo,
  type AiRun,
  type AiRunStatus,
  compactCount,
  defaultFirst,
  effortFor,
  isNewsOf,
  isOpenAiChatModel,
  openAiEfforts,
  RUNS_KEPT,
  resolveChoice,
  runsToForget,
  summarizeUsage,
  type UsageEntry,
} from './ai.ts'

const opus = { id: 'opus', label: 'Opus', efforts: ['low', 'high'] as const }
const plain = { id: 'plain', label: 'Plain', efforts: [] }
const providers: AiProviderInfo[] = [
  { id: 'anthropic', connected: false, problem: null, models: [] },
  {
    id: 'claude-code',
    connected: true,
    problem: null,
    models: [{ ...opus, efforts: [...opus.efforts] }, plain],
  },
  { id: 'openai', connected: true, problem: null, models: [plain] },
  { id: 'codex', connected: true, problem: 'cannot list', models: [] },
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
