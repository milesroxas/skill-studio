import { deflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { pngOf } from './__fixtures__/png.ts'
import { readPng } from './png.ts'

describe('readPng', () => {
  it('reads the pixels of a picture as a browser writes it', () => {
    const picture = readPng(pngOf(3, 2, (x, y) => [x * 10, y * 20, 200, x === 2 ? 128 : 255]))
    expect(picture).toMatchObject({ width: 3, height: 2 })
    expect([...(picture?.data ?? [])]).toEqual([
      ...[0, 0, 200, 255, 10, 0, 200, 255, 20, 0, 200, 128],
      ...[0, 20, 200, 255, 10, 20, 200, 255, 20, 20, 200, 128],
    ])
  })

  it('undoes each of the filters a line may be written with', () => {
    // One line a filter, each holding the same pixels once undone: red, then green.
    const pixels = [200, 0, 0, 255, 0, 200, 0, 255]
    const filtered = (type: number, prior: number[] | null): number[] =>
      pixels.map((value, i) => {
        const left = i >= 4 ? pixels[i - 4] : 0
        const up = prior ? prior[i] : 0
        const corner = prior && i >= 4 ? prior[i - 4] : 0
        const estimate = left + up - corner
        const paeth =
          Math.abs(estimate - left) <= Math.abs(estimate - up) &&
          Math.abs(estimate - left) <= Math.abs(estimate - corner)
            ? left
            : Math.abs(estimate - up) <= Math.abs(estimate - corner)
              ? up
              : corner
        const take = [0, left, up, (left + up) >> 1, paeth][type]
        return (value - take) & 0xff
      })
    const raw = [0, 1, 2, 3, 4].flatMap((type, y) => [type, ...filtered(type, y ? pixels : null)])
    const base = pngOf(2, 5, () => [0, 0, 0, 0])
    // The same file with its data swapped for the filtered lines.
    const ihdrEnd = 8 + 12 + 13
    const data = deflateSync(new Uint8Array(raw))
    const idat = new Uint8Array(12 + data.length)
    new DataView(idat.buffer).setUint32(0, data.length)
    idat.set([0x49, 0x44, 0x41, 0x54], 4)
    idat.set(data, 8)
    const file = Buffer.concat([base.subarray(0, ihdrEnd), idat, base.subarray(base.length - 12)])
    const picture = readPng(file)
    expect([...(picture?.data ?? [])]).toEqual(Array.from({ length: 5 }, () => pixels).flat())
  })

  it('reads nothing that is not such a picture', () => {
    const fine = pngOf(2, 2, () => [1, 2, 3, 255])
    expect(readPng(new Uint8Array([1, 2, 3]))).toBeNull()
    expect(
      readPng(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')),
    ).toBeNull()
    expect(readPng(pngOf(2, 2, () => [1, 2, 3, 255], { depth: 16 }))).toBeNull()
    expect(readPng(pngOf(2, 2, () => [1, 2, 3, 255], { interlace: 1 }))).toBeNull()
    // Cut short: its data no longer holds what its header says.
    expect(readPng(fine.subarray(0, fine.length - 20))).toBeNull()
  })

  it('asks for no memory for a picture whose header claims a size past the limit', () => {
    const huge = pngOf(1, 1, () => [0, 0, 0, 255])
    new DataView(huge.buffer, huge.byteOffset).setUint32(16, 50_000)
    expect(readPng(huge)).toBeNull()
    // A header that claims more pixels than the data holds is not inflated past its claim.
    const lying = pngOf(4, 4, () => [0, 0, 0, 255])
    new DataView(lying.buffer, lying.byteOffset).setUint32(16, 2)
    expect(readPng(lying)).toBeNull()
  })
})
