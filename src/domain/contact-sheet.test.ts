import { describe, expect, it } from 'vitest'
import {
  SHEET_PANELS_MAX,
  SHEET_SIDE_MAX,
  type SheetLayout,
  type SheetRow,
  sheetLayout,
  sheetPage,
} from './contact-sheet.ts'

/** A run's row of `count` desktop pictures, attempts 1 to `count`. */
const row = (run: string, count: number, width = 1280, height = 960): SheetRow => ({
  run,
  pictures: Array.from({ length: count }, (_, i) => ({ attempt: i + 1, width, height })),
})

const laid = (rows: SheetRow[]): SheetLayout => {
  const layout = sheetLayout(rows)
  if (!layout) throw new Error('No layout.')
  return layout
}

const panels = (layout: SheetLayout): number =>
  layout.rows.reduce((sum, r) => sum + r.panels.length, 0)

/** Two boxes share a pixel. */
const overlap = (
  a: { x: number; y: number; width: number; height: number },
  b: typeof a,
): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

describe('sheetLayout', () => {
  it('shows one picture at the size it was drawn, under its run and attempt', () => {
    const layout = laid([row('a', 1)])
    expect([layout.width, layout.height]).toEqual([1328, 1106])
    expect(layout.rows).toHaveLength(1)
    expect(layout.rows[0].panels[0]).toMatchObject({
      attempt: 1,
      picture: { x: 24, y: 122, width: 1280, height: 960 },
    })
    expect(layout.leftOut).toBe(0)
  })

  it('puts a row a run and a column an attempt, scaled to stay inside the side Jev reads', () => {
    const layout = laid([row('a', 3), row('b', 2)])
    expect(layout.rows.map((r) => [r.run, r.panels.map((p) => p.attempt)])).toEqual([
      ['a', [1, 2, 3]],
      ['b', [1, 2]],
    ])
    expect([layout.width, layout.height]).toEqual([1568, 960])
    const [first, second] = layout.rows
    // One column is one attempt: the second run's attempt 2 is under the first run's.
    expect(second.panels[1].picture.x).toBe(first.panels[1].picture.x)
    expect(second.panels[0].picture.y).toBeGreaterThan(
      first.panels[0].picture.y + first.panels[0].picture.height,
    )
    // Each picture keeps its shape.
    expect(first.panels[0].picture).toMatchObject({ width: 496, height: 372 })
  })

  it('keeps a column to one attempt: an attempt with no picture leaves its place empty', () => {
    // A drew attempts 1 and 3; B drew 1 and 2.
    const layout = laid([
      {
        run: 'A',
        pictures: [1, 3].map((attempt) => ({ attempt, width: 1280, height: 960 })),
      },
      {
        run: 'B',
        pictures: [1, 2].map((attempt) => ({ attempt, width: 1280, height: 960 })),
      },
    ])
    const x = (run: number, attempt: number) =>
      layout.rows[run].panels.find((p) => p.attempt === attempt)?.picture.x
    const column = (n: number) => 24 + n * (layout.rows[0].panels[0].picture.width + 16)
    expect(layout.rows.map((r) => r.panels.map((p) => p.attempt))).toEqual([
      [1, 3],
      [1, 2],
    ])
    expect([x(0, 1), x(1, 1)]).toEqual([column(0), column(0)])
    expect(x(1, 2)).toBe(column(1))
    expect(x(0, 3)).toBe(column(2))
    // Three columns, four panels: the two empty places are no panel, and none is left out.
    expect(layout.width).toBe(1568)
    expect(layout.leftOut).toBe(0)
  })

  it('counts an empty place as no panel against the limit', () => {
    // Attempts 1 to 12 in A, and only attempt 12 in B: column 12 would make 13 panels.
    const layout = laid([
      row('A', 12),
      { run: 'B', pictures: [{ attempt: 12, width: 1280, height: 960 }] },
    ])
    expect(layout.rows.map((r) => r.run)).toEqual(['A'])
    expect(layout.rows[0].panels).toHaveLength(11)
    expect(layout.leftOut).toBe(2)
  })

  it('holds 12 panels at most, and counts the attempts left out', () => {
    expect(SHEET_PANELS_MAX).toBe(12)
    const one = laid([row('a', 20)])
    expect([panels(one), one.leftOut]).toEqual([12, 8])
    // A short row leaves room for more columns in a long one.
    const two = laid([row('a', 1), row('b', 20)])
    expect(two.rows.map((r) => r.panels.length)).toEqual([1, 11])
    expect(two.leftOut).toBe(9)
    // Past 12 runs, the runs after the twelfth do not fit.
    const many = laid(Array.from({ length: 14 }, (_, i) => row(`r${i}`, 2)))
    expect(many.rows).toHaveLength(12)
    expect([panels(many), many.leftOut]).toEqual([12, 16])
  })

  it('is never past 1568 pixels a side, and no two panels meet, whatever it holds', () => {
    expect(SHEET_SIDE_MAX).toBe(1568)
    for (const [width, height] of [
      [1280, 960],
      [1536, 864],
      [800, 3000],
      [390, 1200],
    ])
      for (let runs = 1; runs <= 13; runs++)
        for (const attempts of [1, 2, 5, 13]) {
          const layout = laid(
            Array.from({ length: runs }, (_, i) => row(`r${i}`, attempts, width, height)),
          )
          expect(layout.width).toBeLessThanOrEqual(SHEET_SIDE_MAX)
          expect(layout.height).toBeLessThanOrEqual(SHEET_SIDE_MAX)
          expect(panels(layout)).toBeLessThanOrEqual(SHEET_PANELS_MAX)
          expect(panels(layout) + layout.leftOut).toBe(runs * attempts)
          const boxes = layout.rows.flatMap((r) => [
            r.head,
            ...r.panels.flatMap((p) => [p.caption, p.picture]),
          ])
          for (const [i, a] of boxes.entries()) {
            expect(a.x + a.width).toBeLessThanOrEqual(layout.width)
            expect(a.y + a.height).toBeLessThanOrEqual(layout.height)
            for (const b of boxes.slice(i + 1)) expect(overlap(a, b)).toBe(false)
          }
        }
  })

  it('leaves out a run with no picture, and lays out nothing for none', () => {
    const layout = laid([row('a', 0), row('b', 2)])
    expect(layout.rows.map((r) => r.run)).toEqual(['b'])
    expect(layout.leftOut).toBe(0)
    expect(sheetLayout([row('a', 0)])).toBeNull()
    expect(sheetLayout([])).toBeNull()
  })
})

describe('sheetPage', () => {
  const layout = laid([row('2026-11-26-skill-v1', 2)])

  it('writes every label as text, never as markup', () => {
    const html = sheetPage(
      '<img src=x onerror="alert(1)"> & more',
      layout,
      (r, c) => `${r}-${c}.png`,
    )
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; more')
    expect(html).toContain('>2026-11-26-skill-v1</div>')
    expect(html).toContain('>attempt 2</div>')
  })

  it('heads a row with its label, as text on one line cut short where it does not fit, and lays it out as without one', () => {
    const label = `2026-11-26-skill-v1-claude-haiku (v1 · draft <b>a</b> & \n${'x'.repeat(200)})`
    const labelled = laid([{ ...row('2026-11-26-skill-v1', 2), label }])
    const { rows, ...rest } = labelled
    const { rows: plainRows, ...plainRest } = layout
    // A label of any length moves no box: the sheet is laid out by its pictures alone.
    expect(rest).toEqual(plainRest)
    expect(rows.map(({ label: _, ...r }) => r)).toEqual(plainRows.map(({ label: _, ...r }) => r))
    expect([labelled.rows[0].label, layout.rows[0].label]).toEqual([label, '2026-11-26-skill-v1'])
    const html = sheetPage('Landing', labelled, (r, a) => `${r}-${a}.png`)
    expect(html).toContain(
      `class="t run" style="${`left:24px;top:68px;width:${layout.width - 48}px;height:30px;line-height:30px`}">2026-11-26-skill-v1-claude-haiku (v1 · draft &lt;b&gt;a&lt;/b&gt; &amp; \n${'x'.repeat(200)})</div>`,
    )
    expect(html).not.toContain('<b>a</b>')
    // Every label is held to one line and cut short with an ellipsis where it runs past its box.
    expect(html).toContain(
      '.t { position: absolute; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
    )
  })

  it('loads only the pictures beside it, and runs no script', () => {
    const html = sheetPage('Landing', layout, (r, a) => `${r}-${a}.png`)
    expect(html).toContain(`content="default-src 'none'; img-src file:; style-src 'unsafe-inline'"`)
    expect([...html.matchAll(/<img [^>]*src="([^"]+)"/g)].map((m) => m[1])).toEqual([
      '0-1.png',
      '0-2.png',
    ])
    expect(html).not.toContain('<script')
    expect(html).toContain(`width: ${layout.width}px; height: ${layout.height}px`)
  })
})
