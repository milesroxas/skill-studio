import type { CliAccount } from '@domain/ai.ts'
import { describe, expect, it } from 'vitest'
import { keptAccount } from './account.ts'

const signedIn: CliAccount = { signedIn: true, email: 'a@b.c', billing: 'plan', plan: 'max' }
const signedOut: CliAccount = { signedIn: false, email: null, billing: null, plan: null }

/** An asker that counts its runs, and a clock to move. */
function setup(answers: Array<CliAccount | null | Error>) {
  let asked = 0
  let time = 1000
  const account = keptAccount(
    async () => {
      const answer = answers[Math.min(asked, answers.length - 1)]
      asked += 1
      if (answer instanceof Error) throw answer
      return answer
    },
    () => time,
  )
  return {
    account,
    asked: () => asked,
    later: (ms: number) => {
      time += ms
    },
  }
}

describe('keptAccount', () => {
  it('asks the CLI once for requests made within half a minute', async () => {
    const cli = setup([signedIn])
    expect(await cli.account()).toEqual(signedIn)
    cli.later(29_000)
    expect(await cli.account()).toEqual(signedIn)
    expect(cli.asked()).toBe(1)
    cli.later(2000)
    await cli.account()
    expect(cli.asked()).toBe(2)
  })

  it('asks again when a fresh answer is wanted, and keeps that one', async () => {
    const cli = setup([signedIn, { ...signedIn, plan: 'pro' }])
    await cli.account()
    expect((await cli.account(true))?.plan).toBe('pro')
    expect((await cli.account())?.plan).toBe('pro')
    expect(cli.asked()).toBe(2)
  })

  it('does not keep signed out, so signing in shows on the next ask', async () => {
    const cli = setup([signedOut, signedIn])
    expect((await cli.account())?.signedIn).toBe(false)
    expect((await cli.account())?.signedIn).toBe(true)
  })

  it('reads a CLI that fails as one that cannot say, and asks again', async () => {
    const cli = setup([new Error('spawn failed'), null, signedIn])
    expect(await cli.account()).toBeNull()
    expect(await cli.account()).toBeNull()
    expect(await cli.account()).toEqual(signedIn)
  })

  it('shares one run between askers at the same moment', async () => {
    const cli = setup([signedIn])
    await Promise.all([cli.account(), cli.account(true), cli.account()])
    expect(cli.asked()).toBe(1)
  })
})
