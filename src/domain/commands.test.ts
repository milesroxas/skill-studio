import { describe, expect, it, vi } from 'vitest'
import { commandName, commandQuery, isCommand, matchCommands, withCommand } from './commands.ts'

describe('commandName and isCommand', () => {
  it('read the name of a bare command and one with arguments', () => {
    expect(commandName('/animate')).toBe('animate')
    expect(commandName('/review the toast\nand the drawer')).toBe('review')
    expect(commandName('/caveman:caveman status')).toBe('caveman:caveman')
    expect(commandName('  /animate  ')).toBe('animate')
    expect(isCommand('/animate')).toBe(true)
  })

  it('is false for a plain message, a lone slash or a path', () => {
    expect(commandName('What is a check?')).toBeNull()
    expect(isCommand('What is a check?')).toBe(false)
    expect(isCommand('/')).toBe(false)
    expect(isCommand('/usr/bin/env')).toBe(false)
    expect(isCommand('')).toBe(false)
  })
})

describe('commandQuery', () => {
  it('is the name typed so far while the caret is in it', () => {
    expect(commandQuery('/', 1)).toBe('')
    expect(commandQuery('/ani', 4)).toBe('ani')
    expect(commandQuery('/animate the toast', 4)).toBe('ani')
  })

  it('is null once a space follows the name, or without a leading slash', () => {
    expect(commandQuery('/animate ', 9)).toBeNull()
    expect(commandQuery('/animate the toast', 12)).toBeNull()
    expect(commandQuery('ask /animate', 12)).toBeNull()
    expect(commandQuery('', 0)).toBeNull()
  })
})

const commands = [
  { name: 'animate', description: 'Build an animation from scratch.' },
  { name: 'apple-design', description: "Apple's approach to motion." },
  { name: 'anthropic-skills:docs', description: 'Work with documents.' },
  { name: 'emil-ui-polish', description: 'The details that make interfaces feel finished.' },
]

describe('matchCommands', () => {
  it('keeps every command for an empty query, in name order', () => {
    expect(matchCommands(commands, '').map((c) => c.name)).toEqual([
      'animate',
      'anthropic-skills:docs',
      'apple-design',
      'emil-ui-polish',
    ])
  })

  it('puts names that start with the query first, then a plugin skill by its own name, then the rest', () => {
    expect(matchCommands(commands, 'an').map((c) => c.name)).toEqual([
      'animate',
      'anthropic-skills:docs',
    ])
    expect(matchCommands(commands, 'docs').map((c) => c.name)).toEqual(['anthropic-skills:docs'])
    expect(matchCommands(commands, 'motion').map((c) => c.name)).toEqual(['apple-design'])
    expect(matchCommands(commands, 'polish').map((c) => c.name)).toEqual(['emil-ui-polish'])
  })

  it('drops what matches nowhere and stops at the limit', () => {
    expect(matchCommands(commands, 'zzz')).toEqual([])
    expect(matchCommands(commands, '', 2)).toHaveLength(2)
  })
})

describe('withCommand', () => {
  it('replaces the word being typed and keeps the rest', () => {
    expect(withCommand('/ani', 'animate')).toEqual({ text: '/animate ', caret: 9 })
    expect(withCommand('/ani the toast', 'animate')).toEqual({
      text: '/animate the toast',
      caret: 9,
    })
    expect(withCommand('/', 'caveman:caveman')).toEqual({ text: '/caveman:caveman ', caret: 17 })
  })
})

describe('order', () => {
  it('sorts names in one fixed locale, whatever the machine is set to', () => {
    const compare = vi.spyOn(String.prototype, 'localeCompare')
    matchCommands(
      [
        { name: 'b', description: '' },
        { name: 'a', description: '' },
      ],
      '',
    )
    expect(compare).toHaveBeenCalled()
    for (const call of compare.mock.calls) expect(call[1]).toBe('en')
    compare.mockRestore()
  })
})
