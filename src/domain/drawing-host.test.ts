import { describe, expect, it } from 'vitest'
import { goneProfiles, PROFILE_PREFIX, profilePid } from './drawing-host.ts'

const folder = (rest: string): string => `${PROFILE_PREFIX}${rest}`

describe('profilePid', () => {
  it('reads the process id a profile folder is named for, and none from any other name', () => {
    expect(profilePid(folder('123-abc'))).toBe(123)
    expect(profilePid(folder('1239-abc'))).toBe(1239)
    for (const name of [
      folder('123'),
      folder('-abc'),
      folder('0-abc'),
      folder('x1-abc'),
      'other-123-abc',
    ])
      expect(profilePid(name)).toBeNull()
  })
})

describe('goneProfiles', () => {
  const names = [
    folder('11-a'),
    folder('11-b'),
    folder('119-c'),
    folder('22-d'),
    'unrelated',
    folder('x-e'),
  ]

  it('gives the folders of every host that has gone, and none whose id has a process', () => {
    expect(goneProfiles(names, (pid) => pid === 22)).toEqual([
      folder('11-a'),
      folder('11-b'),
      folder('119-c'),
    ])
  })

  it('gives only the folders of the host named, never those of an id that starts the same', () => {
    expect(goneProfiles(names, () => false, 11)).toEqual([folder('11-a'), folder('11-b')])
  })

  it('leaves a folder whose id has a process, though it is the host named: the id may be a new host’s', () => {
    expect(goneProfiles(names, (pid) => pid === 11, 11)).toEqual([])
  })
})
