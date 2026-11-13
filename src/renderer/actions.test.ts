import { createElement, Fragment } from 'react'
import { describe, expect, it } from 'vitest'
import { hasActions, keepsTextMenu } from './actions.ts'

const item = (key: string) => createElement('span', { key })

describe('hasActions', () => {
  it('is false for nothing, and for fragments holding only nothing', () => {
    expect(hasActions(null)).toBe(false)
    expect(hasActions([null, false, undefined])).toBe(false)
    expect(hasActions(createElement(Fragment, null, null, false))).toBe(false)
    expect(hasActions(createElement(Fragment, null, createElement(Fragment, null, null)))).toBe(
      false,
    )
  })

  it('finds an action inside a fragment or a list', () => {
    expect(hasActions(createElement(Fragment, null, null, item('a')))).toBe(true)
    expect(hasActions(createElement(Fragment, null, [item('a'), item('b')]))).toBe(true)
    expect(hasActions(item('a'))).toBe(true)
  })
})

describe('keepsTextMenu', () => {
  it('keeps the system menu in a field or over selected text, and the actions otherwise', () => {
    expect(keepsTextMenu({ typing: true, selected: false })).toBe(true)
    expect(keepsTextMenu({ typing: false, selected: true })).toBe(true)
    expect(keepsTextMenu({ typing: false, selected: false })).toBe(false)
  })
})
