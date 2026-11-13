/**
 * A page as a browser measured it: the box of each element it drew, and the
 * text a judge reads them from. Jev looks at a picture and reads source, and
 * does neither sum nor ruler well: a size, a distance or a position it is
 * asked about is measured where the page is drawn, and the sums between an
 * element and what holds it are done here, in code.
 */

/** One element of a drawn page. Lengths are CSS px, places from the page's top left. */
export interface LayoutElement {
  /** Its place in the list, from 1, in the order of the page. */
  id: number
  /** The `id` of the nearest listed element it is inside; 0 for none. */
  parent: number
  /** Its tag, id and classes, as a selector reads: `div#pop.card`. */
  name: string
  /** The start of its own words, without those of the elements inside it. */
  text: string
  /** Its box as drawn, any scale applied. */
  x: number
  y: number
  width: number
  height: number
  /** The scale its own transform gives it; 1 for none. */
  scale: number
  /** Its width and height before its transform, when the transform changes them. */
  unscaled: [number, number] | null
  /** Its background as `#rrggbb (hsl h s% l%)`; null when it has none. */
  background: string | null
  /** The colour of its own words, written as `background` is; null when it has no words of its own. */
  color: string | null
  /** Its font size, when it has words of its own. */
  font: string | null
  radius: string | null
  padding: string | null
  border: string | null
  gap: string | null
  /** How many shadows it casts. */
  shadows: number
}

/** A page's elements as one window drew them. */
export interface PageLayout {
  /** The window the page was drawn in. */
  window: [number, number]
  /** The whole page, which may go on below the window. */
  page: [number, number]
  /** The largest elements, in the order of the page. */
  elements: LayoutElement[]
  /** How many smaller elements the page has that are not listed. */
  leftOut: number
}

/** The most elements a layout holds: a page has no end of them, and the smallest say least. */
export const LAYOUT_ELEMENTS_MAX = 300

const NAME_MAX = 80
const TEXT_MAX = 60
const STYLE_MAX = 60
/** No page is drawn larger than this a side, so no honest length is past it. */
const LENGTH_MAX = 1_000_000

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

const length = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= LENGTH_MAX
    ? Math.round(value * 100) / 100
    : null

/** One line of plain text: a page chooses its own class names and words, and they are quoted to a judge. */
const words = (value: unknown, max: number): string =>
  typeof value === 'string'
    ? value
        // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what is removed
        .replace(/[\u0000-\u001f\u007f`]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max)
    : ''

const style = (value: unknown): string | null => words(value, STYLE_MAX) || null

const pair = (value: unknown): [number, number] | null => {
  if (!Array.isArray(value) || value.length !== 2) return null
  const [a, b] = [length(value[0]), length(value[1])]
  return a === null || b === null || a < 0 || b < 0 ? null : [a, b]
}

function elementOf(value: unknown, id: number): LayoutElement | null {
  const raw = record(value)
  if (!raw) return null
  const [x, y, width, height] = [raw.x, raw.y, raw.width, raw.height].map(length)
  if (x === null || y === null || width === null || height === null) return null
  if (width <= 0 || height <= 0) return null
  const name = words(raw.name, NAME_MAX)
  if (!name) return null
  const parent = typeof raw.parent === 'number' && Number.isInteger(raw.parent) ? raw.parent : 0
  const scale = length(raw.scale)
  const shadows = typeof raw.shadows === 'number' && Number.isInteger(raw.shadows) ? raw.shadows : 0
  return {
    id,
    // An element is inside one listed before it: anything else is no parent.
    parent: parent > 0 && parent < id ? parent : 0,
    name,
    text: words(raw.text, TEXT_MAX),
    x,
    y,
    width,
    height,
    scale: scale !== null && scale > 0 ? scale : 1,
    unscaled: pair(raw.unscaled),
    background: style(raw.background),
    color: style(raw.color),
    font: style(raw.font),
    radius: style(raw.radius),
    padding: style(raw.padding),
    border: style(raw.border),
    gap: style(raw.gap),
    shadows: Math.min(Math.max(shadows, 0), 99),
  }
}

/**
 * A layout as the page's own window reported it, held to its shape. The page
 * is what an agent wrote and it runs scripts, so what comes back from it is
 * read as any untrusted file is: null unless it is a layout, with every
 * number finite, every string short and no more elements than a layout holds.
 */
export function readLayout(value: unknown): PageLayout | null {
  const raw = record(value)
  if (!raw || !Array.isArray(raw.elements)) return null
  const window = pair(raw.window)
  const page = pair(raw.page)
  if (!window || !page) return null
  const elements: LayoutElement[] = []
  for (const item of raw.elements.slice(0, LAYOUT_ELEMENTS_MAX)) {
    const element = elementOf(item, elements.length + 1)
    // One that does not read would shift every `parent` after it: the layout is not kept.
    if (!element) return null
    elements.push(element)
  }
  if (!elements.length) return null
  const leftOut =
    typeof raw.leftOut === 'number' && Number.isInteger(raw.leftOut) && raw.leftOut > 0
      ? raw.leftOut
      : 0
  return { window, page, elements, leftOut: leftOut + raw.elements.length - elements.length }
}

const n = (value: number): string => String(Math.round(value * 100) / 100)

/** How an element is named in a line: its number says which of several alike it is. */
const nameOf = (element: LayoutElement): string => `#${element.id} ${element.name}`

/** An offset as a judge reads it: which side, and by how much. `along` names the direction of none. */
const offset = (value: number, before: string, after: string, along: string): string =>
  Math.abs(value) < 0.005
    ? `on its centre ${along}`
    : `${n(Math.abs(value))} px ${value < 0 ? before : after} its centre`

/** The hue, saturation and lightness a colour was measured at, read back from how it is written. */
const hslOf = (colour: string | null): [number, number, number] | null => {
  const found = colour ? /\(hsl (\d+) (\d+)% (\d+)%\)/.exec(colour) : null
  return found ? [Number(found[1]), Number(found[2]), Number(found[3])] : null
}

/**
 * How an element's background differs from its holder's, with the sums done:
 * a rule that sets one surface so many points lighter than another states
 * these three numbers. Empty when either has no background of its own.
 */
function against(element: LayoutElement, holder: LayoutElement): string {
  const [own, held] = [hslOf(element.background), hslOf(holder.background)]
  if (!own || !held) return ''
  const turn = Math.abs(own[0] - held[0])
  const light = own[2] - held[2]
  const sat = own[1] - held[1]
  const points = (value: number, less: string, more: string): string =>
    value === 0
      ? 'the same'
      : `${Math.abs(value)} point${Math.abs(value) > 1 ? 's' : ''} ${value < 0 ? less : more}`
  return `; background lightness ${own[2]}% against its ${held[2]}% (${points(light, 'darker', 'lighter')}), saturation ${own[1]}% against its ${held[1]}% (${points(sat, 'lower', 'higher')}), hue ${own[0]}° against its ${held[0]}° (${Math.min(turn, 360 - turn)}° apart)`
}

/** An element a rule is likely to be about: one large enough to be a region, or one lifted off the page. */
const notable = (element: LayoutElement, layout: PageLayout): boolean =>
  element.width * element.height >= 0.03 * layout.window[0] * layout.window[1] ||
  element.scale !== 1 ||
  element.shadows > 0

/** How many of the elements an element is inside it is placed against: the nearest ones. */
const HOLDERS = 2

/**
 * Where an element sits inside one that holds it, with the sums done: how far
 * each of its edges is from the holder's, in px and as a share of the holder's
 * width, its size as a share of the holder's, how far its centre is from the
 * holder's, and how its background differs from the holder's. These are the numbers a rule about a margin, a share or a
 * centring states, and Jev compares two numbers far more surely than it works
 * one out.
 */
function inside(element: LayoutElement, holder: LayoutElement): string {
  const left = element.x - holder.x
  const top = element.y - holder.y
  const right = holder.x + holder.width - (element.x + element.width)
  const bottom = holder.y + holder.height - (element.y + element.height)
  const across = element.x + element.width / 2 - (holder.x + holder.width / 2)
  const down = element.y + element.height / 2 - (holder.y + holder.height / 2)
  const share = (value: number, of: number): string => `${n((value / of) * 100)}%`
  return [
    `  inside ${nameOf(holder)}: ${n(left)} px from its left edge, ${n(top)} from its top, ${n(right)} from its right, ${n(bottom)} from its bottom`,
    ` (${[left, top, right, bottom].map((edge) => share(edge, holder.width)).join(', ')} of its width)`,
    `; ${share(element.width, holder.width)} of its width, ${share(element.height, holder.height)} of its height`,
    `; centre ${offset(across, 'left of', 'right of', 'from left to right')} and ${offset(down, 'above', 'below', 'from top to bottom')}`,
    Math.abs(down) < 0.005 ? '' : ` (${share(Math.abs(down), holder.height)} of its height)`,
    against(element, holder),
  ].join('')
}

/** One element's own line: its box, and what of its look a rule may state. */
function lineOf(element: LayoutElement): string {
  const { x, y, width, height } = element
  const parts = [
    `${nameOf(element)}${element.text ? ` "${element.text}"` : ''}: left ${n(x)}, top ${n(y)}, ${n(width)} × ${n(height)} px, right ${n(x + width)}, bottom ${n(y + height)}, centre (${n(x + width / 2)}, ${n(y + height / 2)})`,
    element.scale !== 1
      ? `scaled ${n(element.scale)}${
          element.unscaled
            ? ` (${n(element.unscaled[0])} × ${n(element.unscaled[1])} px before scaling)`
            : ''
        }`
      : null,
    element.background ? `background ${element.background}` : null,
    element.color ? `text colour ${element.color}` : null,
    element.font ? `font size ${element.font}` : null,
    element.radius ? `corner radius ${element.radius}` : null,
    element.padding ? `padding ${element.padding}` : null,
    element.border ? `border ${element.border}` : null,
    element.gap ? `gap ${element.gap}` : null,
    element.shadows ? `${element.shadows} shadow${element.shadows > 1 ? 's' : ''}` : null,
  ]
  return parts.filter((part): part is string => part !== null).join('; ')
}

/**
 * The layout as a judge reads it, in `room` characters at most: one line an
 * element, and under a notable one where it sits inside the elements that
 * hold it. When the page has more than fits, the largest elements are kept:
 * a rule about a layout is about its regions before its details.
 */
export function layoutText(layout: PageLayout, room: number): string {
  const byId = new Map(layout.elements.map((element) => [element.id, element]))
  const blocks = layout.elements.map((element) => {
    const lines = [lineOf(element)]
    if (notable(element, layout)) {
      let holder = byId.get(element.parent)
      for (let i = 0; holder && i < HOLDERS; i++) {
        lines.push(inside(element, holder))
        holder = byId.get(holder.parent)
      }
    }
    return { element, text: lines.join('\n') }
  })
  const head = `window ${n(layout.window[0])} × ${n(layout.window[1])} px; page ${n(layout.page[0])} × ${n(layout.page[1])} px`
  let used = head.length
  const kept = new Set<number>()
  const largest = [...blocks].sort(
    (a, b) => b.element.width * b.element.height - a.element.width * a.element.height,
  )
  for (const block of largest) {
    if (used + block.text.length + 1 > room) break
    used += block.text.length + 1
    kept.add(block.element.id)
  }
  const left = layout.leftOut + blocks.length - kept.size
  return [
    head,
    ...blocks.filter((block) => kept.has(block.element.id)).map((block) => block.text),
    ...(left > 0
      ? [`${left} smaller element${left > 1 ? 's are' : ' is'} on the page and not listed.`]
      : []),
  ].join('\n')
}
