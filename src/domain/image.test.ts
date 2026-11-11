import { describe, expect, it } from 'vitest'
import { pngHeader } from './__fixtures__/image.ts'
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
  pictureSize,
} from './image.ts'

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

  it('always lands inside the limits, and never stretches the picture', () => {
    for (const [w, h] of [
      [1, 1],
      [20, 9000],
      [9000, 20],
      [1569, 279],
      [5000, 5000],
      [100, 1000],
      [1200, 200],
    ]) {
      expect(problemAfter(w, h)).toBeNull()
      const fit = fitForJev(w, h)
      // The picture is drawn in its own shape, to within the pixel that rounding costs.
      const scale = Math.max(fit.drawWidth, fit.drawHeight) / Math.max(w, h)
      expect(Math.abs(fit.drawWidth - w * scale)).toBeLessThanOrEqual(1)
      expect(Math.abs(fit.drawHeight - h * scale)).toBeLessThanOrEqual(1)
    }
  })

  it('centres a strip that scaling up would push past the long limit, in its own shape', () => {
    // 100 by 1000 scaled until the short side fits would be 280 by 2800: the long side wins.
    expect(fitForJev(100, 1000)).toEqual({
      width: 280,
      height: 1568,
      drawWidth: 157,
      drawHeight: 1568,
    })
  })
})

describe('names and lists', () => {
  it('reads a name every object has as no picture at all', () => {
    expect(imageTypeOf('files/x.constructor')).toBeNull()
    expect(imageTypeOf('files/x.valueof')).toBeNull()
  })

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

describe('pictureSize', () => {
  const bytes = (...values: number[]) => new Uint8Array(values)
  const text = (value: string) => new TextEncoder().encode(value)

  it('reads a PNG, a GIF and an SVG by its width and height or its viewBox', () => {
    expect(pictureSize(pngHeader(1600, 900), 'cover.png')).toEqual([1600, 900])
    expect(
      pictureSize(bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x40, 0x06, 0x84, 0x03), 'a.gif'),
    ).toEqual([1600, 900])
    expect(pictureSize(text('<svg xmlns="x" width="1600" height="900px">'), 'a.svg')).toEqual([
      1600, 900,
    ])
    expect(pictureSize(text('<svg viewBox="0 0 1200 630">'), 'a.svg')).toEqual([1200, 630])
  })

  it('reads a lossless and an extended WebP', () => {
    const webp = (chunk: string, rest: number[]) =>
      new Uint8Array([...text('RIFF'), 0, 0, 0, 0, ...text('WEBP'), ...text(chunk), ...rest])
    // VP8X: 24-bit width and height, each less one, from byte 24.
    const extended = webp('VP8X', [0, 0, 0, 0, 0, 0, 0, 0, 0x3f, 0x06, 0, 0x83, 0x03, 0])
    expect(pictureSize(extended, 'a.webp')).toEqual([1600, 900])
    // VP8L: 14 bits of width less one, then 14 of height less one, from byte 21.
    const bits = (1600 - 1) | ((900 - 1) << 14)
    const lossless = webp('VP8L', [
      0,
      0,
      0,
      0,
      0x2f,
      bits & 0xff,
      (bits >> 8) & 0xff,
      (bits >> 16) & 0xff,
      (bits >>> 24) & 0xff,
      0,
      0,
      0,
      0,
      0,
    ])
    expect(pictureSize(lossless, 'a.webp')).toEqual([1600, 900])
  })

  it('says nothing of a file it cannot read', () => {
    expect(pictureSize(text('not a picture'), 'a.png')).toBeNull()
    expect(pictureSize(text('<svg width="50%">'), 'a.svg')).toBeNull()
  })
})
