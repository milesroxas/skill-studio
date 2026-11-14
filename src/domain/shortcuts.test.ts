import { describe, expect, it } from 'vitest'
import {
  ariaCombo,
  assignKeys,
  comboOf,
  comboText,
  commandFor,
  firesIn,
  heldOf,
  type KeyPress,
  keyCaps,
  normalizeCombo,
  refusalOf,
  resetKeys,
  resolveKeys,
  SHORTCUT_COMMANDS,
  shortcutKeysOf,
  spokenCombo,
  worksWhileTyping,
} from './shortcuts.ts'

const press = (key: string, code: string, held: Partial<KeyPress> = {}): KeyPress => ({
  key,
  code,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...held,
})

describe('comboOf', () => {
  it('reads ⌘ on a Mac and Ctrl elsewhere as the same shortcut', () => {
    expect(comboOf(press('k', 'KeyK', { metaKey: true }), true)).toBe('mod+k')
    expect(comboOf(press('k', 'KeyK', { ctrlKey: true }), false)).toBe('mod+k')
  })

  it('keeps the Mac’s Control apart from ⌘', () => {
    expect(comboOf(press('k', 'KeyK', { ctrlKey: true }), true)).toBe('ctrl+k')
  })

  it('is no shortcut for a modifier alone or the Windows key', () => {
    expect(comboOf(press('Meta', 'MetaLeft', { metaKey: true }), true)).toBeNull()
    expect(comboOf(press('Shift', 'ShiftLeft', { shiftKey: true }), false)).toBeNull()
    expect(comboOf(press('k', 'KeyK', { metaKey: true }), false)).toBeNull()
  })

  it('keeps Shift with a letter and drops it with a symbol it typed', () => {
    expect(comboOf(press('R', 'KeyR', { shiftKey: true }), true)).toBe('shift+r')
    expect(comboOf(press('?', 'Slash', { shiftKey: true }), true)).toBe('?')
  })

  it('reads a number by its place, whatever the layout types there', () => {
    // On a French layout the key marked 1 types & unless Shift is held.
    expect(comboOf(press('&', 'Digit1'), false)).toBe('1')
    expect(comboOf(press('1', 'Numpad1'), false)).toBe('1')
  })

  it('reads a letter by its place where the press types no plain letter', () => {
    expect(comboOf(press('˚', 'KeyK', { altKey: true }), true)).toBe('alt+k')
    expect(comboOf(press('л', 'KeyK'), false)).toBe('k')
  })

  it('follows the letters printed on the keys on another Latin layout', () => {
    // Dvorak's K sits where QWERTY has V.
    expect(comboOf(press('k', 'KeyV'), false)).toBe('k')
  })

  it('names the keys that have names', () => {
    expect(comboOf(press(' ', 'Space'), false)).toBe('space')
    expect(comboOf(press('Enter', 'Enter', { metaKey: true }), true)).toBe('mod+enter')
    expect(comboOf(press('ArrowUp', 'ArrowUp', { shiftKey: true }), true)).toBe('shift+arrowup')
    expect(comboOf(press('+', 'Equal', { shiftKey: true, metaKey: true }), true)).toBe('mod+plus')
  })
})

describe('normalizeCombo', () => {
  it('writes modifiers in one order', () => {
    expect(normalizeCombo('Shift+Mod+K')).toBe('mod+shift+k')
  })

  it('refuses what is not a shortcut', () => {
    expect(normalizeCombo('')).toBeNull()
    expect(normalizeCombo('mod+')).toBeNull()
    expect(normalizeCombo('hyper+k')).toBeNull()
    expect(normalizeCombo('mod+mod+k')).toBeNull()
    expect(normalizeCombo('mod+kk')).toBeNull()
  })
})

describe('which shortcuts start where', () => {
  it('lets only a ⌘ or Control shortcut through while typing', () => {
    expect(worksWhileTyping('mod+k')).toBe(true)
    expect(worksWhileTyping('ctrl+k')).toBe(true)
    expect(worksWhileTyping('alt+k')).toBe(false)
    expect(worksWhileTyping('1')).toBe(false)
  })

  it('starts nothing behind a dialog that stops the page', () => {
    expect(firesIn('r', 'page')).toBe(true)
    expect(firesIn('r', 'field')).toBe(false)
    expect(firesIn('r', 'menu')).toBe(false)
    expect(firesIn('mod+k', 'field')).toBe(true)
    expect(firesIn('mod+k', 'modal')).toBe(false)
  })
})

describe('resolveKeys and commandFor', () => {
  it('starts every command on its own keys', () => {
    expect(commandFor('1', {})).toBe('go.editor')
    expect(commandFor('r', {})).toBe('run.open')
    expect(commandFor('mod+k', {})).toBe('skill.switch')
  })

  it('never starts a fixed command: its own place handles it', () => {
    expect(commandFor('mod+s', {})).toBeUndefined()
  })

  it('lets a chosen shortcut win over a default it collides with', () => {
    const keys = resolveKeys({ 'run.open': 'mod+k' })
    expect(keys['run.open']).toBe('mod+k')
    expect(keys['skill.switch']).toBe('')
  })

  it('reads a command turned off as having no shortcut', () => {
    expect(commandFor('r', { 'run.open': '' })).toBeUndefined()
  })

  it('gives each command one shortcut no other has', () => {
    const keys = Object.values(resolveKeys({})).filter(Boolean)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('refusalOf', () => {
  it('refuses the keys the app and the computer keep', () => {
    expect(refusalOf('mod+s', 'run.open')).toBe('Already used for Save. Try other keys.')
    expect(refusalOf('mod+c', 'run.open')).toBe('Already used for Copy. Try other keys.')
  })

  it('refuses a key that moves around, alone or with Shift', () => {
    expect(refusalOf('tab', 'run.open')).toMatch(/moves around/)
    expect(refusalOf('shift+tab', 'run.open')).toMatch(/moves around/)
    expect(refusalOf('mod+enter', 'run.open')).toBeNull()
  })

  it('takes a letter, a number or a symbol', () => {
    expect(refusalOf('g', 'run.open')).toBeNull()
    expect(refusalOf('shift+r', 'run.open')).toBeNull()
    expect(refusalOf('/', 'run.open')).toBeNull()
  })

  it('never lets a fixed command change', () => {
    expect(refusalOf('g', 'write.save' as never)).toMatch(/keeps its keys/)
  })

  it('accepts every default', () => {
    for (const c of SHORTCUT_COMMANDS)
      if (!('fixed' in c) && c.keys) expect(refusalOf(c.keys, c.id)).toBeNull()
  })
})

describe('assignKeys', () => {
  it('moves a shortcut from the command that had it', () => {
    const { changed, displaced } = assignKeys({}, 'run.open', 'mod+k')
    expect(changed).toEqual({ 'run.open': 'mod+k', 'skill.switch': '' })
    expect(displaced).toBe('skill.switch')
  })

  it('drops a choice that is the default again', () => {
    expect(assignKeys({ 'run.open': 'g' }, 'run.open', 'r').changed).toEqual({})
  })

  it('turns a command off', () => {
    expect(assignKeys({}, 'run.open', '').changed).toEqual({ 'run.open': '' })
  })

  it('puts a command back on its own keys, taking them from whoever has them', () => {
    const moved = assignKeys({}, 'go.cases', 'r').changed
    const { changed, displaced } = resetKeys(moved, 'run.open')
    expect(displaced).toBe('go.cases')
    expect(resolveKeys(changed)['run.open']).toBe('r')
    expect(resolveKeys(changed)['go.cases']).toBe('')
  })
})

describe('shortcutKeysOf', () => {
  it('reads nothing as no changes', () => {
    expect(shortcutKeysOf(undefined)).toEqual({})
    expect(shortcutKeysOf(['r'])).toEqual({})
  })

  it('keeps known commands with shortcuts that parse', () => {
    expect(shortcutKeysOf({ 'run.open': 'Shift+G', 'go.settings': '' })).toEqual({
      'run.open': 'shift+g',
      'go.settings': '',
    })
  })

  it('drops unknown commands, fixed ones, refused keys and defaults', () => {
    expect(
      shortcutKeysOf({
        nope: 'g',
        'write.save': 'g',
        'run.open': 'mod+c',
        'go.editor': '1',
        'go.cases': 4,
      }),
    ).toEqual({})
  })
})

describe('how a shortcut is shown', () => {
  it('draws the Mac’s symbols in its order, and names elsewhere', () => {
    expect(keyCaps('mod+shift+k', true)).toEqual(['⇧', '⌘', 'K'])
    expect(keyCaps('mod+shift+k', false)).toEqual(['Ctrl', 'Shift', 'K'])
    expect(keyCaps('', true)).toEqual([])
  })

  it('draws the modifiers held before the key comes', () => {
    const held = heldOf({ metaKey: true, ctrlKey: false, altKey: false, shiftKey: true }, true)
    expect(held).toBe('mod+shift+')
    expect(keyCaps(held, true)).toEqual(['⇧', '⌘'])
    expect(spokenCombo(held, true)).toBe('Shift Command')
    expect(heldOf({ metaKey: false, ctrlKey: false, altKey: false, shiftKey: false }, true)).toBe(
      '',
    )
  })

  it('writes one line of text', () => {
    expect(comboText('mod+j', true)).toBe('⌘J')
    expect(comboText('mod+j', false)).toBe('Ctrl+J')
    expect(comboText('?', true)).toBe('?')
  })

  it('says it in words', () => {
    expect(spokenCombo('mod+k', true)).toBe('Command K')
    expect(spokenCombo('alt+arrowup', false)).toBe('Alt Up arrow')
    expect(spokenCombo('?', true)).toBe('Question mark')
    expect(spokenCombo('enter', true)).toBe('Enter')
  })

  it('writes aria-keyshortcuts', () => {
    expect(ariaCombo('mod+k', true)).toBe('Meta+K')
    expect(ariaCombo('mod+k', false)).toBe('Control+K')
    expect(ariaCombo('shift+r', true)).toBe('Shift+R')
  })
})
