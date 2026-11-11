import { describe, expect, it } from 'vitest'
import { appNameOf, boundsOf, devUrlOf, pageUrl, placed, refusedSwitch } from './launch.ts'

describe('pageUrl', () => {
  it('leaves the page as it is when no place is named', () => {
    expect(pageUrl('studio://app/')).toBe('studio://app/')
  })

  it('names the screen in the hash the page routes by', () => {
    expect(pageUrl('studio://app/', { screen: 'welcome' })).toBe('studio://app/#/welcome')
    expect(pageUrl('http://localhost:5173', { screen: 'docs' })).toBe(
      'http://localhost:5173/#/docs',
    )
  })

  it('carries a skill path whole, spaces and all', () => {
    const url = new URL(pageUrl('studio://app/', { skill: '/Users/a b/skills/thank-you-note' }))
    expect(url.searchParams.get('skill')).toBe('/Users/a b/skills/thank-you-note')
  })
})

describe('placed', () => {
  const display = { x: 0, y: 25, width: 1440, height: 875 }
  const size = { width: 760, height: 600 }

  it('centers a window on its anchor', () => {
    expect(placed(size, display, display)).toEqual({ x: 340, y: 163, width: 760, height: 600 })
  })

  it('stands higher when less of the spare height goes above it', () => {
    expect(placed(size, display, display, 0.4).y).toBe(135)
  })

  it('stays whole inside the display when its anchor is at the edge', () => {
    const corner = { x: 1200, y: 600, width: 720, height: 480 }
    expect(placed(size, corner, display)).toEqual({ x: 680, y: 300, width: 760, height: 600 })
  })

  it('shrinks to a display smaller than it is', () => {
    const small = { x: 0, y: 0, width: 640, height: 480 }
    expect(placed(size, small, small)).toEqual({ x: 0, y: 0, width: 640, height: 480 })
  })
})

describe('boundsOf', () => {
  it('reads saved bounds', () => {
    expect(boundsOf('{"x":10,"y":20,"width":800,"height":600}')).toEqual({
      x: 10,
      y: 20,
      width: 800,
      height: 600,
    })
  })

  it('is null for a damaged or partial file', () => {
    expect(boundsOf('{"x":10,"y":2')).toBeNull()
    expect(boundsOf('null')).toBeNull()
    expect(boundsOf('{"x":10,"y":20,"width":"wide","height":600}')).toBeNull()
  })
})

describe('appNameOf', () => {
  it('keeps the name in a packaged app', () => {
    expect(appNameOf(true, 'Skill Studio')).toBe('Skill Studio')
  })

  it('names a development copy apart, so it has its own keychain item', () => {
    expect(appNameOf(false, 'Skill Studio')).toBe('Skill Studio Dev')
  })
})

describe('devUrlOf', () => {
  const env = { ELECTRON_RENDERER_URL: 'http://localhost:5173' }

  it('is the dev server in a development copy', () => {
    expect(devUrlOf(false, env)).toBe('http://localhost:5173')
    expect(devUrlOf(false, {})).toBeUndefined()
    expect(devUrlOf(false, { ELECTRON_RENDERER_URL: '' })).toBeUndefined()
  })

  it('is nothing in a packaged app, whatever the environment names', () => {
    expect(devUrlOf(true, env)).toBeUndefined()
    expect(devUrlOf(true, { ELECTRON_RENDERER_URL: 'https://evil.example' })).toBeUndefined()
  })
})

describe('refusedSwitch', () => {
  const started =
    (...switches: string[]) =>
    (name: string) =>
      switches.includes(name)

  it.each([
    'remote-debugging-port',
    'remote-debugging-pipe',
    'remote-debugging-address',
    'remote-allow-origins',
    'use-mock-keychain',
  ])('names --%s for a packaged app started with it', (name) => {
    expect(refusedSwitch(true, started(name))).toBe(name)
    expect(refusedSwitch(true, started('lang', name))).toBe(name)
  })

  it('is nothing for a packaged app started as usual', () => {
    expect(refusedSwitch(true, started())).toBeUndefined()
    expect(refusedSwitch(true, started('lang', 'user-data-dir'))).toBeUndefined()
  })

  it('is nothing in development, where the page is debugged from outside', () => {
    expect(refusedSwitch(false, started('remote-debugging-port'))).toBeUndefined()
    expect(refusedSwitch(false, started('use-mock-keychain'))).toBeUndefined()
  })
})
