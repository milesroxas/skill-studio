/**
 * The stage: an output as a browser draws it, big enough to judge. A page is
 * drawn at the width the reader picks and scaled down to fit, never up; given
 * a height too, the size its case names, it is fitted whole, as a picture is.
 * Both outputs stand on the stage at once with one in view, so flipping
 * between them is instant, and a page that scrolls tells the other to scroll
 * with it: each flip lands on the same part of both. Under it, a line says the
 * size drawn and how it is scaled, led by what changes that size and ended by
 * one action on what is in view. An output still being written holds the
 * frame its page will be drawn in, so nothing moves when it lands, and it
 * fades in when it does.
 *
 * Two stages side by side (`StagePair`) hold one output each, and their pages
 * scroll together as two on one stage do. Something read in place of an
 * output, such as the diff of two files, stands on the same ground at the same
 * size (`StageSheet`), so a change of view moves nothing under it.
 *
 * The ground is 60% of the window high, and no higher than what stands on it
 * needs: a picture, or a page drawn whole, that its width holds short of that
 * height takes a ground as high as itself, so no empty ground parts it from
 * what follows. Anything that scrolls keeps the whole height.
 *
 * The wheel moves the app, never what is on the stage, until the reader asks
 * (`useGate`). The stage is most of the column, so the pointer is nearly
 * always over it: a file or a page that took the wheel there would hold the
 * reader inside it until its end. A press on the stage lets them scroll
 * inside, and leaving it gives the wheel back.
 */
import type { Artifact, ArtifactKind } from '@domain/schemas.ts'
import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { api } from '../api.ts'
import { cn } from '../lib/utils.ts'
import { useLanded } from '../motion.ts'
import { ArtifactView, pageCaption, scaleText } from './Artifact.tsx'
import { OutputWriting } from './OutputCard.tsx'
import { Hint, Text } from './text.tsx'

export type Side = 'a' | 'b'

/**
 * The ground an output stands on: 60% of the window high, so the page under it
 * starts at one height in every view. It grows where a ground beside it is
 * higher, so two side by side end on one line.
 */
const GROUND = 'relative h-[60svh] min-h-64 grow rounded-md bg-muted'

/** The ground while the reader scrolls inside it: a ring says the wheel is the stage's now. */
const ENGAGED =
  'transition-[box-shadow] duration-150 ease-out data-engaged:ring-2 data-engaged:ring-border'

/**
 * Who the wheel moves over a stage. What stands on it may scroll, a long
 * file, a page, the steps: left to take the wheel, it would hold a reader who
 * only meant to move down the app. So until they ask, a cover lies over what
 * scrolls: it takes nothing from the wheel, which moves the app, and a press
 * on it lets them in. The cover says so in a small line once the pointer
 * rests on the stage, and is a button, so the keyboard reaches it.
 *
 * Inside, the wheel is the stage's, and the ground takes a ring that says so.
 * Leaving the stage, a press anywhere else, or Escape gives it back. What
 * does not scroll has no cover: a page that fits is used as it is.
 */
function useGate(scrolls: boolean): {
  ground: RefObject<HTMLDivElement | null>
  /** For the ground: how it leaves, and that it is engaged. */
  props: {
    'data-engaged'?: ''
    onMouseLeave: () => void
    onKeyDown: (event: KeyboardEvent) => void
  }
  /** The cover, over what scrolls; null inside and where nothing scrolls. */
  cover: ReactNode
} {
  const ground = useRef<HTMLDivElement>(null)
  const cover = useRef<HTMLButtonElement>(null)
  const [engaged, setEngaged] = useState(false)
  /** The keyboard let the reader in, or out: the focus goes with them. */
  const keyed = useRef(false)
  const inside = scrolls && engaged

  useEffect(() => {
    if (!inside) {
      // Out by Escape: the focus is back on the cover, where it came from.
      if (keyed.current) cover.current?.focus()
      keyed.current = false
      return
    }
    if (keyed.current) {
      // In by the keyboard: the focus goes to what scrolls, so the arrows move it.
      const scroller = [
        ...(ground.current?.querySelectorAll<HTMLElement>('[data-stage-scroll]') ?? []),
      ].find((el) => !el.closest('[inert]'))
      scroller?.focus()
      keyed.current = false
    }
    // A press anywhere but the stage gives the wheel back: a finger has no pointer to leave with.
    const out = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !ground.current?.contains(event.target))
        setEngaged(false)
    }
    document.addEventListener('pointerdown', out, true)
    return () => document.removeEventListener('pointerdown', out, true)
  }, [inside])

  return {
    ground,
    props: {
      'data-engaged': inside ? '' : undefined,
      onMouseLeave: () => setEngaged(false),
      onKeyDown: (event) => {
        if (event.key !== 'Escape' || !inside) return
        keyed.current = true
        setEngaged(false)
      },
    },
    cover:
      scrolls && !engaged ? (
        <button
          ref={cover}
          type="button"
          aria-label="Scroll inside this output"
          className="group/gate absolute inset-4 cursor-pointer rounded-sm focus-ring"
          onClick={(event) => {
            // A click with no pointer behind it came from the keyboard.
            keyed.current = event.detail === 0
            setEngaged(true)
          }}
        >
          {/* Shown once the pointer rests, not as it passes: a reader on their way down the app
              is told nothing. */}
          <span className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-sm bg-popover px-2.5 py-1 text-xs whitespace-nowrap text-popover-foreground opacity-0 shadow-popover transition-opacity duration-150 ease-out group-hover/gate:opacity-100 group-hover/gate:delay-300 group-focus-visible/gate:opacity-100 motion-reduce:transition-none">
            Click to scroll
          </span>
        </button>
      ) : null,
  }
}

/**
 * Whether what a frame holds runs past it, read from the two as they are laid
 * out and again whenever either changes size. `off` for what never scrolls
 * here or says so itself: a picture, a page.
 */
function useOverflows(off = false): {
  frame: RefObject<HTMLDivElement | null>
  held: RefObject<HTMLDivElement | null>
  overflows: boolean
} {
  const frame = useRef<HTMLDivElement>(null)
  const held = useRef<HTMLDivElement>(null)
  const [overflows, setOverflows] = useState(false)
  useLayoutEffect(() => {
    const el = frame.current
    if (off || !el) return setOverflows(false)
    const measure = () => setOverflows(el.scrollHeight > el.clientHeight + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    if (held.current) observer.observe(held.current)
    return () => observer.disconnect()
  }, [off])
  return { frame, held, overflows }
}

/** The ground's inset on each side, in px (`inset-4`). */
const INSET = 16

/** Pictures' own sizes by URL, kept past the stage that read them: a picture seen once holds its ground from the first frame after. */
const SEEN = new Map<string, Box>()

/** One output on the stage. */
export interface StageLayer {
  side: Side
  run: string
  sample: string
  /** The file shown; null when this output wrote none to show. */
  artifact: Artifact | null
  /** The output's name, for the frame's title. */
  name: string
  /** Something to read in place of a file, such as the steps the agent took. */
  reading?: ReactNode
  /** The output is still being written: its frame waits for it. */
  writing?: boolean
  /** The picture's own size where it is known before the picture loads, so its ground is right from the first frame. */
  size?: Box | null
}

interface Box {
  width: number
  height: number
}

interface Geometry {
  frame: CSSProperties
  /** A page's frame, drawn at its width and scaled to the stage. */
  page?: CSSProperties
  /** What the reader sees of the size: the width drawn and the scale. */
  caption: string
}

function geometry(
  kind: ArtifactKind | null,
  box: Box,
  width: number | null,
  height: number | null,
  natural: Box | undefined,
): Geometry {
  const whole: Geometry = {
    frame: { left: 0, top: 0, width: box.width, height: box.height },
    caption: '',
  }
  if (kind === 'html') {
    const drawn = width ?? Math.round(box.width)
    // A page with a height is the whole of what its case asks for: all of it shows.
    const tall = width === null ? null : height
    const scale = Math.min(1, box.width / drawn, tall ? box.height / tall : 1)
    const shown = drawn * scale
    const high = tall ? tall * scale : box.height
    return {
      frame: {
        left: (box.width - shown) / 2,
        top: (box.height - high) / 2,
        width: shown,
        height: high,
      },
      page: { width: drawn, height: high / scale, transform: `scale(${scale})` },
      // The size's name is in the control that leads the line; this is what the name leaves out.
      caption: pageCaption({ width }, drawn, scale),
    }
  }
  if (kind === 'image' && natural) {
    const scale = Math.min(1, box.width / natural.width, box.height / natural.height)
    const w = natural.width * scale
    const h = natural.height * scale
    return {
      frame: { left: (box.width - w) / 2, top: (box.height - h) / 2, width: w, height: h },
      caption: `${natural.width} × ${natural.height} · ${scaleText(scale)}`,
    }
  }
  return whole
}

/**
 * How high a box `width` wide must be to hold the file whole; null for what
 * fills any height it is given: a page with no height of its own, a file or
 * steps that scroll, a picture whose size is not known yet.
 */
function heightFor(
  kind: ArtifactKind | null,
  boxWidth: number,
  width: number | null,
  height: number | null,
  natural: Box | undefined,
): number | null {
  if (kind === 'html')
    return width !== null && height ? height * Math.min(1, boxWidth / width) : null
  if (kind === 'image' && natural) return natural.height * Math.min(1, boxWidth / natural.width)
  return null
}

/** What a layer shows, as one name: what scrolls is known for that, and not for what it showed before. */
const scrollKeyOf = (layer: StageLayer): string =>
  [
    layer.side,
    layer.run,
    layer.sample,
    layer.writing ? '' : layer.reading ? ':reading' : (layer.artifact?.file ?? ''),
  ].join('|')

export function Stage({
  layers,
  shown,
  width,
  height = null,
  onFlip,
  lead,
  action,
}: {
  layers: StageLayer[]
  /** The side in view. */
  shown: Side
  /** The width a page is drawn at, in CSS pixels; null for the stage's own. */
  width: number | null
  /** The height a page is drawn at with that width, fitted whole; null to fill the stage's height. */
  height?: number | null
  /** A or B was pressed while a page had the focus. */
  onFlip: (side: Side) => void
  /**
   * What changes the size the line states, at its start: a `SelectBox
   * variant="caption"`, which stands 8px before the stage's edge so its text,
   * not the box that shows on hover, starts where the stage does.
   */
  lead?: ReactNode
  /**
   * One thing to do with the output in view, at the end of the size line: a
   * `ghost-muted` `xs` button, which stands 8px past the stage's edge so its
   * label, not the box that shows on hover, ends where the stage does.
   */
  action?: ReactNode
}) {
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<Box | null>(null)
  /** A picture's own size, by its URL, once it has loaded. */
  const [natural, setNatural] = useState<Record<string, Box>>({})
  const naturalOf = (layer: StageLayer, artifact: Artifact): Box | undefined => {
    const url = urlOf(layer, artifact)
    return natural[url] ?? SEEN.get(url) ?? layer.size ?? undefined
  }
  /** What scrolls, by `scrollKey`: a file or the steps by their own measure, a page by its word. */
  const [scrolling, setScrolling] = useState<Record<string, boolean>>({})
  const tellScrolls = useCallback(
    (key: string, scrolls: boolean) =>
      setScrolling((known) => (known[key] === scrolls ? known : { ...known, [key]: scrolls })),
    [],
  )

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // A page on the stage says where it scrolled and which letter was pressed in it.
  useEffect(() => {
    const handle = (event: MessageEvent) => {
      const frames = [...(box.current?.querySelectorAll('iframe') ?? [])]
      const from = frames.find((f) => f.contentWindow === event.source)
      const said = event.data as { studioStage?: unknown; x?: unknown; y?: unknown; key?: unknown }
      if (!from || !said || typeof said !== 'object') return
      if (said.studioStage === 'key' && (said.key === 'a' || said.key === 'b')) onFlip(said.key)
      else if (said.studioStage === 'reach') {
        // How far the page can scroll: any way at all, and the wheel over it would be the page's.
        const key = from.closest<HTMLElement>('[data-scroll-key]')?.dataset.scrollKey
        if (key) tellScrolls(key, Number(said.y) > 0)
      } else if (said.studioStage === 'scroll') {
        const to = { studioStage: 'scrollTo', x: Number(said.x) || 0, y: Number(said.y) || 0 }
        // The pages run in origins of their own, which have no name to address them by.
        for (const frame of frames) if (frame !== from) frame.contentWindow?.postMessage(to, '*')
      }
    }
    window.addEventListener('message', handle)
    return () => window.removeEventListener('message', handle)
  }, [onFlip, tellScrolls])

  const urlOf = (layer: StageLayer, artifact: Artifact, stage = false) =>
    api.artifactUrl(layer.run, layer.sample, artifact.file, stage)
  // An output being written waits in the frame of the page beside it, if that is a page: it will
  // most likely be one too. It states no size, since nothing is drawn at one yet.
  const waitsAsPage = layers.some((l) => !l.writing && l.artifact?.kind === 'html')
  const placed = layers.map((layer) => ({
    layer,
    geometry: !size
      ? null
      : layer.writing
        ? { ...geometry(waitsAsPage ? 'html' : null, size, width, height, undefined), caption: '' }
        : geometry(
            layer.artifact?.kind ?? null,
            size,
            width,
            height,
            layer.artifact ? naturalOf(layer, layer.artifact) : undefined,
          ),
  }))
  // What each output needs of the ground; one that fills any height keeps the ground whole.
  const needs = !size
    ? [null]
    : layers.map((layer) =>
        layer.reading
          ? null
          : layer.writing
            ? heightFor(waitsAsPage ? 'html' : null, size.width, width, height, undefined)
            : heightFor(
                layer.artifact?.kind ?? null,
                size.width,
                width,
                height,
                layer.artifact ? naturalOf(layer, layer.artifact) : undefined,
              ),
      )
  const held = needs.every((need): need is number => need !== null)
    ? Math.ceil(Math.max(...needs)) + INSET * 2
    : null
  const caption = placed.find((p) => p.layer.side === shown)?.geometry?.caption ?? ''
  const inView = layers.find((layer) => layer.side === shown)
  const gate = useGate(inView ? (scrolling[scrollKeyOf(inView)] ?? false) : false)

  return (
    <>
      <div
        ref={gate.ground}
        className={cn(GROUND, ENGAGED)}
        style={held ? { height: `min(60svh, ${held}px)` } : undefined}
        {...gate.props}
      >
        <div ref={box} className="absolute inset-4">
          {placed.map(({ layer, geometry: g }) =>
            g ? (
              <StageFrame
                key={layer.side}
                layer={layer}
                geometry={g}
                on={layer.side === shown}
                scrollKey={scrollKeyOf(layer)}
                onScrolls={tellScrolls}
                urlOf={urlOf}
                onNatural={(url, box) => {
                  SEEN.set(url, box)
                  setNatural((known) => ({ ...known, [url]: box }))
                }}
              />
            ) : null,
          )}
        </div>
        {gate.cover}
      </div>
      {/* Kept from the first frame, so nothing moves when a picture loads and its size is known. */}
      <div className="flex min-h-6 items-center gap-1">
        {lead ? <span className="-ml-2">{lead}</span> : null}
        <Text size="xs" tone="muted" tabular>
          {caption}
        </Text>
        {action ? <span className="-mr-2 ml-auto">{action}</span> : null}
      </div>
    </>
  )
}

/**
 * Two stages side by side, one output each. A page says where it scrolled, and
 * the page on the other stage follows.
 */
export function StagePair({ children }: { children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const handle = (event: MessageEvent) => {
      const frames = [...(box.current?.querySelectorAll('iframe') ?? [])]
      const from = frames.find((f) => f.contentWindow === event.source)
      const said = event.data as { studioStage?: unknown; x?: unknown; y?: unknown }
      if (!from || !said || typeof said !== 'object' || said.studioStage !== 'scroll') return
      const to = { studioStage: 'scrollTo', x: Number(said.x) || 0, y: Number(said.y) || 0 }
      // The pages run in origins of their own, which have no name to address them by.
      for (const frame of frames) if (frame !== from) frame.contentWindow?.postMessage(to, '*')
    }
    window.addEventListener('message', handle)
    return () => window.removeEventListener('message', handle)
  }, [])
  return (
    <div ref={box} className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {children}
    </div>
  )
}

/** One stage of a pair: the stage and the line under it, in its half. */
export function StageHalf({ children }: { children: ReactNode }) {
  return <div className="flex min-w-0 flex-col gap-2.5">{children}</div>
}

/**
 * Something read on the stage's ground in place of an output: one sheet that
 * scrolls, on `bg-card` as a file is, and under it the line a stage has, which
 * here says how to read the sheet. The line keeps its height when it is empty.
 */
export function StageSheet({ line, children }: { line?: string; children: ReactNode }) {
  const { frame, held, overflows } = useOverflows()
  const gate = useGate(overflows)
  return (
    <>
      <div ref={gate.ground} className={cn(GROUND, ENGAGED)} {...gate.props}>
        <div
          ref={frame}
          data-stage-scroll=""
          tabIndex={-1}
          className="absolute inset-4 overflow-y-auto rounded-sm bg-card shadow-raised outline-none"
        >
          <div ref={held}>{children}</div>
        </div>
        {gate.cover}
      </div>
      <div className="flex min-h-6 items-center">
        <Text size="xs" tone="muted">
          {line}
        </Text>
      </div>
    </>
  )
}

/** One output's frame on the stage: its page, picture, file or steps, or the wait for it. */
function StageFrame({
  layer,
  geometry: g,
  on,
  scrollKey,
  onScrolls,
  urlOf,
  onNatural,
}: {
  layer: StageLayer
  geometry: Geometry
  /** In view; the other frame stays drawn under it, hidden, so a flip is instant. */
  on: boolean
  /** What the frame shows, as one name (`scrollKeyOf`). */
  scrollKey: string
  /** The frame's file or steps run past it, or stopped doing so. A page says so itself. */
  onScrolls: (key: string, scrolls: boolean) => void
  urlOf: (layer: StageLayer, artifact: Artifact, stage?: boolean) => string
  /** A picture loaded, and this is its own size. */
  onNatural: (url: string, box: Box) => void
}) {
  const { artifact, reading, writing = false } = layer
  const landed = useLanded(writing)
  const page = !writing && !reading && (artifact?.kind === 'html' || artifact?.kind === 'image')
  const { frame, held, overflows } = useOverflows(page || writing)
  useEffect(() => {
    if (!page) onScrolls(scrollKey, overflows)
  }, [page, scrollKey, overflows, onScrolls])
  /** A file or the steps, read in the frame, which scrolls when they run past it. */
  const read = (content: ReactNode) => <div ref={held}>{content}</div>
  return (
    <div
      ref={frame}
      aria-hidden={!on}
      inert={!on}
      data-scroll-key={scrollKey}
      // What the keyboard is put on to scroll a file; a page's frame takes the focus itself.
      {...(page ? {} : { 'data-stage-scroll': '', tabIndex: -1 })}
      className={cn(
        'absolute overflow-hidden shadow-raised',
        page ? 'bg-artifact' : 'overflow-y-auto rounded-sm bg-card outline-none',
        !on && 'invisible',
        landed && 'animate-ink',
      )}
      style={g.frame}
    >
      {writing ? (
        <OutputWriting />
      ) : reading ? (
        read(reading)
      ) : !artifact ? (
        <Hint inset>This output wrote no file to show here.</Hint>
      ) : artifact.kind === 'html' ? (
        <iframe
          data-stage-scroll=""
          className="block origin-top-left border-0 bg-artifact"
          style={g.page}
          src={urlOf(layer, artifact, true)}
          title={`${layer.name}: ${artifact.file}`}
          sandbox="allow-scripts"
        />
      ) : artifact.kind === 'image' ? (
        <img
          className="block size-full"
          src={urlOf(layer, artifact)}
          alt={`${artifact.file} from ${layer.name}`}
          onLoad={(event) => {
            const { naturalWidth, naturalHeight } = event.currentTarget
            onNatural(urlOf(layer, artifact), { width: naturalWidth, height: naturalHeight })
          }}
        />
      ) : (
        read(<ArtifactView run={layer.run} sample={layer.sample} artifact={artifact} />)
      )}
    </div>
  )
}
