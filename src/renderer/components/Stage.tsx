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
 */
import type { Artifact, ArtifactKind } from '@domain/schemas.ts'
import {
  type CSSProperties,
  type ReactNode,
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
      else if (said.studioStage === 'scroll') {
        const to = { studioStage: 'scrollTo', x: Number(said.x) || 0, y: Number(said.y) || 0 }
        // The pages run in origins of their own, which have no name to address them by.
        for (const frame of frames) if (frame !== from) frame.contentWindow?.postMessage(to, '*')
      }
    }
    window.addEventListener('message', handle)
    return () => window.removeEventListener('message', handle)
  }, [onFlip])

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
            layer.artifact ? natural[urlOf(layer, layer.artifact)] : undefined,
          ),
  }))
  const caption = placed.find((p) => p.layer.side === shown)?.geometry?.caption ?? ''

  return (
    <>
      <div className="relative h-[60svh] min-h-64 rounded-chin bg-muted">
        <div ref={box} className="absolute inset-4">
          {placed.map(({ layer, geometry: g }) =>
            g ? (
              <StageFrame
                key={layer.side}
                layer={layer}
                geometry={g}
                on={layer.side === shown}
                urlOf={urlOf}
                onNatural={(url, box) => setNatural((known) => ({ ...known, [url]: box }))}
              />
            ) : null,
          )}
        </div>
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

/** One output's frame on the stage: its page, picture, file or steps, or the wait for it. */
function StageFrame({
  layer,
  geometry: g,
  on,
  urlOf,
  onNatural,
}: {
  layer: StageLayer
  geometry: Geometry
  /** In view; the other frame stays drawn under it, hidden, so a flip is instant. */
  on: boolean
  urlOf: (layer: StageLayer, artifact: Artifact, stage?: boolean) => string
  /** A picture loaded, and this is its own size. */
  onNatural: (url: string, box: Box) => void
}) {
  const { artifact, reading, writing = false } = layer
  const landed = useLanded(writing)
  const page = !writing && !reading && (artifact?.kind === 'html' || artifact?.kind === 'image')
  return (
    <div
      aria-hidden={!on}
      inert={!on}
      className={cn(
        'absolute overflow-hidden shadow-raised',
        page ? 'bg-artifact' : 'overflow-y-auto rounded-sm bg-card',
        !on && 'invisible',
        landed && 'animate-ink',
      )}
      style={g.frame}
    >
      {writing ? (
        <OutputWriting place="stage" />
      ) : reading ? (
        reading
      ) : !artifact ? (
        <Hint inset>This output wrote no file to show here.</Hint>
      ) : artifact.kind === 'html' ? (
        <iframe
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
        <ArtifactView run={layer.run} sample={layer.sample} artifact={artifact} />
      )}
    </div>
  )
}
