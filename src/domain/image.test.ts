import { describe, expect, it } from 'vitest'
import {
  addImages,
  fitForJev,
  type ImageRef,
  imageFileName,
  imageSize,
  imageTypeOf,
  isJevFormat,
  jevImageProblem,
  MAX_IMAGES,
} from './image.ts'
import { pngHeader } from './image-fixtures.ts'

/** A JPEG up to its frame header, with an application segment in front as cameras write one. */
const jpegHeader = (width: number, height: number): Uint8Array =>
  new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xe0,
    0x00,
    0x04,
    0x4a,
    0x46,
    0xff,
    0xc2,
    0x00,
    0x11,
    0x08,
    height >> 8,
    height & 0xff,
    width >> 8,
    width & 0xff,
    0x03,
    0,
    0,
    0,
  ])

describe('imageSize', () => {
  it('reads a PNG’s size from its header', () => {
    expect(imageSize(pngHeader(1280, 800))).toEqual({ format: 'png', width: 1280, height: 800 })
  })

  it('reads a JPEG’s size from its frame header, past the segments before it', () => {
    expect(imageSize(jpegHeader(4032, 3024))).toEqual({ format: 'jpg', width: 4032, height: 3024 })
  })

  it('knows nothing else as a picture, whatever its name', () => {
    expect(imageSize(new TextEncoder().encode('RIFF....WEBPVP8 '))).toBeNull()
    expect(imageSize(new Uint8Array(0))).toBeNull()
  })
})

describe('jevImageProblem', () => {
  it('passes a picture inside the limits, both ends included', () => {
    expect(jevImageProblem(pngHeader(280, 1568))).toBeNull()
  })

  it('says what is wrong with one Jev would refuse', () => {
    expect(jevImageProblem(pngHeader(279, 600))).toBe(
      'it is 279 × 600 px, and Jev reads 280 to 1568 px a side',
    )
    expect(jevImageProblem(jpegHeader(4032, 3024))).toContain('4032 × 3024 px')
    expect(jevImageProblem(new Uint8Array(40))).toBe('it is not a PNG or JPEG')
  })
})

describe('fitForJev', () => {
  const problemAfter = (width: number, height: number) => {
    const fit = fitForJev(width, height)
    return jevImageProblem(pngHeader(fit.width, fit.height))
  }

  it('leaves a picture that fits as it is', () => {
    expect(fitForJev(1280, 800)).toEqual({
      width: 1280,
      height: 800,
      drawWidth: 1280,
      drawHeight: 800,
    })
  })

  it('scales a phone photo down and a small icon up, keeping the shape', () => {
    expect(fitForJev(4032, 3024)).toMatchObject({ width: 1568, height: 1176 })
    expect(fitForJev(100, 50)).toMatchObject({ width: 560, height: 280 })
  })

  it('centres a strip too thin for both limits on the smallest canvas that fits', () => {
    expect(fitForJev(3000, 100)).toEqual({
      width: 1568,
      height: 280,
      drawWidth: 1568,
      drawHeight: 52,
    })
  })

  it('always lands inside the limits', () => {
    for (const [w, h] of [
      [1, 1],
      [20, 9000],
      [9000, 20],
      [1569, 279],
      [5000, 5000],
    ])
      expect(problemAfter(w, h)).toBeNull()
  })
})

describe('names and lists', () => {
  it('tells pictures a model can read from other files, and the two Jev reads', () => {
    expect(imageTypeOf('files/Mock.PNG')).toBe('image/png')
    expect(imageTypeOf('files/photo.webp')).toBe('image/webp')
    expect(imageTypeOf('files/brief.md')).toBeNull()
    expect(isJevFormat('a.jpeg')).toBe(true)
    expect(isJevFormat('a.webp')).toBe(false)
  })

  it('names a kept file after the picture, in words a folder is safe with', () => {
    expect(imageFileName('Screen Shot 2026-11-05 at 9.41.png', 'png')).toBe(
      'screen-shot-2026-11-05-at-9-41.png',
    )
    expect(imageFileName('../../etc/passwd', 'jpg')).toBe('etc-passwd.jpg')
    expect(imageFileName('', 'jpg')).toBe('image.jpg')
  })

  it('adds pictures once each, up to the limit', () => {
    const upload = (id: string): ImageRef => ({ name: id, file: null, upload: id })
    const held = [upload('a')]
    expect(addImages(held, [upload('a'), upload('b')]).map((i) => i.upload)).toEqual(['a', 'b'])
    const many = Array.from({ length: 10 }, (_, i) => upload(`n${i}`))
    expect(addImages(held, many)).toHaveLength(MAX_IMAGES)
  })
})
