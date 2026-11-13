/**
 * The script that measures a drawn page: the box and the look of each element
 * it shows, as `readLayout` (`@domain/layout.ts`) reads them. It runs in the
 * page's window, in a world of its own, so the page's scripts cannot change
 * what `getBoundingClientRect` or `getComputedStyle` answer. It is a string
 * because the main process has no DOM to type it against: `readLayout` holds
 * what comes back to its shape.
 */
import { LAYOUT_ELEMENTS_MAX } from '@domain/layout.ts'

/** The most elements one page is searched for: a page with more is measured on its first ones. */
const SEARCH_MAX = 5000

export const MEASURE_PAGE = `(() => {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const ink = canvas.getContext('2d', { willReadFrequently: true })
  const seen = new Map()
  // A colour as sRGB and HSL, whatever notation the page wrote it in; null for none.
  const colour = (value) => {
    if (seen.has(value)) return seen.get(value)
    let text = null
    if (ink) {
      ink.clearRect(0, 0, 1, 1)
      ink.fillStyle = '#000'
      ink.fillStyle = value
      ink.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = ink.getImageData(0, 0, 1, 1).data
      if (a > 0) {
        // The canvas holds the colour mixed with its own alpha: take that back out.
        const [red, green, blue] = [r, g, b].map((c) => Math.min(255, Math.round((c * 255) / a)))
        const max = Math.max(red, green, blue) / 255
        const min = Math.min(red, green, blue) / 255
        const light = (max + min) / 2
        const spread = max - min
        const sat = spread === 0 ? 0 : spread / (1 - Math.abs(2 * light - 1))
        let hue = 0
        if (spread !== 0) {
          if (max === red / 255) hue = ((green - blue) / 255 / spread) % 6
          else if (max === green / 255) hue = (blue - red) / 255 / spread + 2
          else hue = (red - green) / 255 / spread + 4
          hue = Math.round(hue * 60)
          if (hue < 0) hue += 360
        }
        const hex = '#' + [red, green, blue].map((c) => c.toString(16).padStart(2, '0')).join('')
        text = hex + ' (hsl ' + hue + ' ' + Math.round(sat * 100) + '% ' + Math.round(light * 100) + '%)'
        if (a < 255) text += ', ' + Math.round((a / 255) * 100) + '% opaque'
      }
    }
    seen.set(value, text)
    return text
  }
  const found = []
  const all = document.body ? document.body.querySelectorAll('*') : []
  for (let i = 0; i < all.length && i < ${SEARCH_MAX}; i++) {
    const el = all[i]
    const tag = el.tagName.toLowerCase()
    if (tag === 'script' || tag === 'style' || tag === 'br' || tag === 'template') continue
    const box = el.getBoundingClientRect()
    if (!(box.width > 0 && box.height > 0)) continue
    const look = getComputedStyle(el)
    if (look.display === 'none' || look.visibility === 'hidden' || look.opacity === '0') continue
    let own = ''
    for (const node of el.childNodes) if (node.nodeType === 3) own += ' ' + node.textContent
    own = own.replace(/\\s+/g, ' ').trim()
    const matrix = /^matrix\\(([^,]+),([^,]+),/.exec(look.transform)
    const scale = matrix ? Math.hypot(Number(matrix[1]), Number(matrix[2])) : 1
    const scaled = Math.abs(scale - 1) > 0.001
    const classes = typeof el.className === 'string' ? el.className.trim().split(/\\s+/).filter(Boolean) : []
    found.push({
      el,
      area: box.width * box.height,
      row: {
        parent: 0,
        name: tag + (el.id ? '#' + el.id : '') + classes.slice(0, 4).map((c) => '.' + c).join(''),
        text: own.slice(0, 60),
        x: box.left + scrollX,
        y: box.top + scrollY,
        width: box.width,
        height: box.height,
        scale: scaled ? scale : 1,
        unscaled: scaled && el.offsetWidth > 0 ? [el.offsetWidth, el.offsetHeight] : null,
        background: colour(look.backgroundColor),
        color: own ? colour(look.color) : null,
        font: own ? look.fontSize : null,
        radius: look.borderRadius === '0px' ? null : look.borderRadius,
        padding: look.padding === '0px' ? null : look.padding,
        border: look.borderWidth === '0px' || look.borderStyle === 'none' ? null : look.borderWidth,
        gap: look.gap === 'normal' || look.gap === '0px' ? null : look.gap,
        shadows: look.boxShadow === 'none' ? 0 : look.boxShadow.split(/,(?![^(]*\\))/).length,
      },
    })
  }
  // The largest are kept, in the order of the page, each inside the nearest kept element that holds it.
  const kept = new Set([...found].sort((a, b) => b.area - a.area).slice(0, ${LAYOUT_ELEMENTS_MAX}))
  const ids = new Map()
  const elements = []
  for (const item of found) {
    if (!kept.has(item)) continue
    let holder = item.el.parentElement
    while (holder && !ids.has(holder)) holder = holder.parentElement
    item.row.parent = holder ? ids.get(holder) : 0
    elements.push(item.row)
    ids.set(item.el, elements.length)
  }
  const root = document.documentElement
  return {
    window: [innerWidth, innerHeight],
    page: [Math.max(root.scrollWidth, innerWidth), Math.max(root.scrollHeight, innerHeight)],
    elements,
    leftOut: found.length - elements.length,
  }
})()`
