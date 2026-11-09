import { describe, expect, it } from 'vitest'
import { installDirs, markedPath, mergePath } from './path.ts'

describe('mergePath', () => {
  it('adds only the folders the PATH lacks, in order', () => {
    expect(
      mergePath('/usr/bin:/bin', ['/opt/homebrew/bin', '/usr/bin'], installDirs('/Users/a')),
    ).toBe('/usr/bin:/bin:/opt/homebrew/bin:/Users/a/.local/bin:/usr/local/bin')
  })

  it('starts from nothing', () => {
    expect(mergePath(undefined, ['/a'])).toBe('/a')
    expect(mergePath('', ['/a', ''])).toBe('/a')
  })
})

describe('markedPath', () => {
  it('reads the PATH between the marks, whatever the shell printed around it', () => {
    expect(markedPath('Welcome!\n__SKILL_STUDIO_PATH__/a:/b__SKILL_STUDIO_PATH__\nbye')).toBe(
      '/a:/b',
    )
  })

  it('finds none without the marks', () => {
    expect(markedPath('zsh: no such option')).toBeNull()
    expect(markedPath('__SKILL_STUDIO_PATH____SKILL_STUDIO_PATH__')).toBeNull()
  })
})
