/**
 * The drawing host's start file draws pages a model wrote. On Linux it turns
 * hardware acceleration off and turns on no software WebGL: Chromium's
 * SwiftShader switch is not meant for untrusted content, as such a page is.
 * Read from its source, since the file starts Electron as it loads.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/** The start file's code, its comments taken out. */
const code = readFileSync(resolve(import.meta.dirname, 'index.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '')

describe('the drawing host on Linux', () => {
  it('draws in software, with hardware acceleration off', () => {
    expect(code).toMatch(/process\.platform === 'linux'\) app\.disableHardwareAcceleration\(\)/)
  })

  it('turns on no switch of Chromium’s: no SwiftShader, no ANGLE, no GPU blocklist left out', () => {
    expect(code).not.toMatch(/appendSwitch|swiftshader|use-angle|use-gl|ignore-gpu-blocklist/i)
  })
})
