/**
 * The stage: an output as a browser draws it, big enough to judge. A page is
 * drawn at the width the reader picks and scaled down to fit, never up; a
 * picture is fitted whole, or shown at its own size. Both outputs stand on the
 * stage at once with one in view, so flipping between them is instant, and a
 * page that scrolls tells the other to scroll with it: each flip lands on the
 * same part of both.
 */
import type { Artifact } from '@domain/schemas.ts'
import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { api } from '../api.ts'
import { cn } from '../lib/utils.ts'
import { ArtifactView } from './Artifact.tsx'
import { Hint } from './text.tsx'

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

const percent = (scale: number): string =>
  scale >= 1 ? 'actual size' : `shown at ${Math.round(scale * 100)}%`

function geometry(
  artifact: Artifact | null,
  box: Box,
  width: number | null,
  natural: Box | undefined,
): Geometry {
  const whole: Geometry = {
    frame: { left: 0, top: 0, width: box.width, height: box.height },
    caption: '',
  }
  if (artifact?.kind === 'html') {
    const drawn = width ?? Math.round(box.width)
    const scale = Math.min(1, box.width / drawn)
    const shown = drawn * scale
    return {
      frame: { left: (box.width - shown) / 2, top: 0, width: shown, height: box.height },
      page: { width: drawn, height: box.height / scale, transform: `scale(${scale})` },
      caption:
        width === null ? `${drawn} px · the stage’s width` : `${drawn} px · ${percent(scale)}`,
    }
  }
  if (artifact?.kind === 'image' && natural) {
    const scale = Math.min(1, box.width / natural.width, box.height / natural.height)
    const w = natural.width * scale
    const h = natural.height * scale
    return {
      frame: { left: (box.width - w) / 2, top: (box.height - h) / 2, width: w, height: h },
      caption: `${natural.width} × ${natural.height} · ${percent(scale)}`,
    }
  }
  return whole
}

export function Stage({
  layers,
  shown,
  width,
  onFlip,
  onCaption,
}: {
  layers: StageLayer[]
  /** The side in view. */
  shown: Side
  /** The width a page is drawn at, in CSS pixels; null for the stage's own. */
  width: number | null
  /** A or B was pressed while a page had the focus. */
  onFlip: (side: Side) => void
  /** The size line for the side in view, for the bar above the stage. */
  onCaption: (caption: string) => void
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
  const placed = layers.map((layer) => ({
    layer,
    geometry: size
      ? geometry(
          layer.artifact,
          size,
          width,
          layer.artifact ? natural[urlOf(layer, layer.artifact)] : undefined,
        )
      : null,
  }))
  const caption = placed.find((p) => p.layer.side === shown)?.geometry?.caption ?? ''
  useEffect(() => onCaption(caption), [caption, onCaption])

  return (
    <div className="relative h-[60svh] min-h-64 rounded-chin bg-muted">
      <div ref={box} className="absolute inset-4">
        {placed.map(({ layer, geometry: g }) => {
          if (!g) return null
          const { artifact } = layer
          const on = layer.side === shown
          const page = artifact?.kind === 'html' || artifact?.kind === 'image'
          return (
            <div
              key={layer.side}
              aria-hidden={!on}
              inert={!on}
              className={cn(
                'absolute overflow-hidden shadow-raised',
                page ? 'bg-artifact' : 'overflow-y-auto rounded-sm bg-card',
                !on && 'invisible',
              )}
              style={g.frame}
            >
              {!artifact ? (
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
                    const url = urlOf(layer, artifact)
                    setNatural((known) => ({
                      ...known,
                      [url]: { width: naturalWidth, height: naturalHeight },
                    }))
                  }}
                />
              ) : (
                <ArtifactView run={layer.run} sample={layer.sample} artifact={artifact} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
