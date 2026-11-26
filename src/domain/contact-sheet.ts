/**
 * A contact sheet: one case's drawn pages from some runs side by side in one
 * picture, a row a run and a column an attempt, each labelled, so an agent or
 * a person looks at one picture a case instead of each page (`st sheet`).
 * Pure: where each panel goes, which attempts do not fit, and the page the
 * drawing host draws the sheet from.
 */
import { JEV_IMAGE } from './image.ts'

/** The most panels one sheet holds. */
export const SHEET_PANELS_MAX = 12
/** The longest side of a sheet: the longest Jev reads, which a model in a chat reads whole too. */
export const SHEET_SIDE_MAX = JEV_IMAGE.maxSide

/** Around the sheet's edge, and between two panels or two rows. */
const PAD = 24
const GAP = 16
/** The lines of words: the case's name, a row's run, a panel's attempt. */
const TITLE = 44
const HEAD = 30
const CAPTION = 24
/** The narrowest a sheet is drawn, so the case's name has room. */
const WIDTH_MIN = 480

/** One drawn page of one attempt, by the size of its picture. */
export interface SheetPicture {
  attempt: number
  width: number
  height: number
}

/** One run's pictures of the case, in the order of its attempts. */
export interface SheetRow {
  run: string
  pictures: readonly SheetPicture[]
}

/** A box on the sheet, in pixels from its top left. */
export interface Box {
  x: number
  y: number
  width: number
  height: number
}

export interface SheetPanel {
  attempt: number
  /** Where "attempt N" is written. */
  caption: Box
  /** Where the picture is drawn, kept whole inside it from its top left. */
  picture: Box
}

export interface SheetLayout {
  width: number
  height: number
  title: Box
  /** Each run with a panel, in the order given. */
  rows: { run: string; head: Box; panels: SheetPanel[] }[]
  /** The pictures that did not fit. */
  leftOut: number
}

/** A row's pictures, one an attempt: the first of two with the same number. */
const oneAnAttempt = (row: SheetRow): SheetRow => ({
  run: row.run,
  pictures: row.pictures.filter((p, i, all) => all.findIndex((q) => q.attempt === p.attempt) === i),
})

/**
 * The attempts that are the sheet's columns: each attempt some row has a
 * picture of, in order, as many as hold `SHEET_PANELS_MAX` pictures at most.
 * A row's place in a column it has no picture of is empty, and an empty place
 * is no panel: it counts neither to the limit nor as left out.
 */
function columnsOf(rows: readonly SheetRow[]): number[] {
  const attempts = [...new Set(rows.flatMap((r) => r.pictures.map((p) => p.attempt)))].sort(
    (a, b) => a - b,
  )
  const columns: number[] = []
  let panels = 0
  for (const attempt of attempts) {
    const here = rows.filter((r) => r.pictures.some((p) => p.attempt === attempt)).length
    if (panels + here > SHEET_PANELS_MAX) break
    panels += here
    columns.push(attempt)
  }
  return columns
}

/**
 * Where each panel of a sheet goes: a row a run, in the order given, and a
 * column an attempt, so an attempt with no picture leaves its place in its
 * run's row empty. A row with no picture has no place; past
 * `SHEET_PANELS_MAX` rows, the rest do not fit, and nor do the attempts past
 * the last column. Each picture is shown at one width, no wider than the
 * widest is drawn, in a box as tall as the tallest for its width, so that the
 * sheet is no more than `SHEET_SIDE_MAX` a side. Null for rows with no
 * picture at all.
 */
export function sheetLayout(given: readonly SheetRow[]): SheetLayout | null {
  const withPictures = given.map(oneAnAttempt).filter((r) => r.pictures.length)
  if (!withPictures.length) return null
  const kept = withPictures.slice(0, SHEET_PANELS_MAX)
  const attempts = columnsOf(kept)
  const columns = attempts.length
  const shown = kept
    .map((r) => ({ run: r.run, pictures: r.pictures.filter((p) => attempts.includes(p.attempt)) }))
    .filter((r) => r.pictures.length)
  const pictures = shown.flatMap((r) => r.pictures)
  const leftOut = withPictures.reduce((sum, r) => sum + r.pictures.length, 0) - pictures.length

  const n = shown.length
  const ratio = Math.max(...pictures.map((p) => p.height / p.width))
  const widest = Math.max(...pictures.map((p) => p.width))
  const byWidth = (SHEET_SIDE_MAX - 2 * PAD - (columns - 1) * GAP) / columns
  const byHeight =
    (SHEET_SIDE_MAX - 2 * PAD - TITLE - n * (HEAD + CAPTION) - (n - 1) * GAP) / (n * ratio)
  const width = Math.max(1, Math.floor(Math.min(widest, byWidth, byHeight)))
  const height = Math.max(1, Math.floor(width * ratio))
  const rowHeight = HEAD + CAPTION + height

  const sheetWidth = Math.max(WIDTH_MIN, 2 * PAD + columns * width + (columns - 1) * GAP)
  const inner = sheetWidth - 2 * PAD
  return {
    width: sheetWidth,
    height: 2 * PAD + TITLE + n * rowHeight + (n - 1) * GAP,
    title: { x: PAD, y: PAD, width: inner, height: TITLE },
    rows: shown.map((row, i) => {
      const top = PAD + TITLE + i * (rowHeight + GAP)
      return {
        run: row.run,
        head: { x: PAD, y: top, width: inner, height: HEAD },
        panels: row.pictures.map((p) => {
          const x = PAD + attempts.indexOf(p.attempt) * (width + GAP)
          return {
            attempt: p.attempt,
            caption: { x, y: top + HEAD, width, height: CAPTION },
            picture: { x, y: top + HEAD + CAPTION, width, height },
          }
        }),
      }
    }),
    leftOut,
  }
}

/** Words as text in a page: no character of them is read as markup. */
const asText = (words: string): string =>
  words.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  )

const place = (box: Box): string =>
  `left:${box.x}px;top:${box.y}px;width:${box.width}px;height:${box.height}px;line-height:${box.height}px`

/** The sheet's background: cool, so a page drawn on white or paper stands apart from it, and so does a picture that did not load. */
export const SHEET_BACKGROUND = [228, 230, 234] as const

/**
 * The page a sheet is drawn from. `picture` names the file beside the page
 * that holds a panel's picture, by its row and its attempt. Every label is written
 * as text. The page runs no script and loads nothing but pictures.
 */
export function sheetPage(
  title: string,
  layout: SheetLayout,
  picture: (row: number, attempt: number) => string,
): string {
  const words = (kind: string, box: Box, text: string): string =>
    `<div class="t ${kind}" style="${place(box)}">${asText(text)}</div>`
  const body = [
    words('title', layout.title, title),
    ...layout.rows.flatMap((row, r) => [
      words('run', row.head, row.run),
      ...row.panels.flatMap((panel) => [
        words('attempt', panel.caption, `attempt ${panel.attempt}`),
        `<img alt="" src="${asText(picture(r, panel.attempt))}" style="${place(panel.picture)}">`,
      ]),
    ]),
  ]
  return `<!doctype html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src file:; style-src 'unsafe-inline'">
<title>${asText(title)}</title>
<style>
html, body { margin: 0; width: ${layout.width}px; height: ${layout.height}px; overflow: hidden; background: rgb(${SHEET_BACKGROUND.join(' ')}); color: #0a1020; font-family: system-ui, sans-serif; }
.t { position: absolute; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.title { font-size: 20px; font-weight: 600; }
.run { font-size: 15px; font-weight: 600; }
.attempt { font-size: 13px; color: #5b605a; }
img { position: absolute; object-fit: contain; object-position: left top; outline: 1px solid #c4c7cd; }
</style></head><body>
${body.join('\n')}
</body></html>
`
}
