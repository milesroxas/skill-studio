/** One artifact as the reader sees it: Markdown rendered, HTML framed, images shown, code listed. */
import type { Artifact as ArtifactRef } from '@domain/schemas.ts'
import { copyOf } from '@domain/text.ts'
import { ArrowUpRightIcon } from 'lucide-react'
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { api } from '../api.ts'
import type { PageSize } from '../stage.ts'
import { Loading, ReadFailed } from './layout.tsx'
import { Prose } from './Prose.tsx'
import { SelectBox } from './SelectBox.tsx'
import { Hint, Text } from './text.tsx'
import { Button } from './ui/button.tsx'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group.tsx'

interface Props {
  run: string
  sample: string
  artifact: ArtifactRef | null
  /** The size a page is drawn at, and its control; without it a page takes the room's width. */
  page?: PageSize
}

/** How far a picture is scaled down to fit: "shown at 59%", or "actual size". */
export const scaleText = (scale: number): string =>
  scale >= 1 ? 'actual size' : `shown at ${Math.round(scale * 100)}%`

/**
 * What a page's size control leaves unsaid, short enough for a card a third of
 * the window wide: the scale it is drawn at, or under Full width the pixels it
 * came to. The control names the size and its list gives the pixels.
 */
export const pageCaption = (page: { width: number | null }, drawn: number, scale: number) =>
  page.width === null ? `${Math.round(drawn)} px` : `${Math.round(scale * 100)}%`

/**
 * The size a page is drawn at, changed where it is read: at the start of the
 * line about the page, on the stage and in a card.
 */
export function PageSizeSelect({ page }: { page: PageSize }) {
  return (
    <SelectBox
      aria-label="Size the page is drawn at"
      variant="caption"
      value={page.choice}
      onChange={page.pick}
      options={page.options}
    />
  )
}

/**
 * A page in a card: drawn at its size and scaled down to the card's width,
 * never up, so a page made for 1536 pixels shows whole in a column a third as
 * wide. With a height it is fitted whole; without one it fills the frame's
 * height and scrolls. The line over it says the size and the scale.
 */
function PageView({
  url,
  title,
  page,
  action,
}: {
  url: string
  title: string
  page: PageSize | undefined
  action: ReactNode
}) {
  const box = useRef<HTMLDivElement>(null)
  const [room, setRoom] = useState<{ width: number; height: number } | null>(null)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => setRoom({ width: el.clientWidth, height: el.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const drawn = page?.width ?? room?.width ?? null
  const scale = room && drawn ? Math.min(1, room.width / drawn) : 1
  const tall = page?.width ? page.height : null
  return (
    <div className="relative isolate">
      {/* One line at every width: a line that wraps in one card and not the other sets the two pages at different heights. */}
      <p className="m-0 flex h-9 items-center gap-1 border-b px-4 *:shrink-0 *:whitespace-nowrap">
        {page ? (
          <span className="-ml-2">
            <PageSizeSelect page={page} />
          </span>
        ) : null}
        {page && drawn ? (
          <Text size="xs" tone="muted" tabular title={`Drawn ${Math.round(drawn)} px wide`}>
            {pageCaption(page, drawn, scale)}
          </Text>
        ) : null}
        <span className="-mr-2 ml-auto">{action}</span>
      </p>
      {/* A frame that scrolls would trap the page swipe on touch: show it, open it to scroll. */}
      <div
        ref={box}
        className={
          tall
            ? 'flex justify-center overflow-hidden bg-muted'
            : 'flex h-[70svh] justify-center overflow-hidden bg-muted pointer-coarse:h-[60svh]'
        }
        style={tall ? { height: tall * scale } : undefined}
      >
        {room && drawn ? (
          <div className="shrink-0 overflow-hidden" style={{ width: drawn * scale }}>
            <iframe
              className="block origin-top-left border-0 bg-artifact pointer-coarse:pointer-events-none"
              style={{
                width: drawn,
                height: tall ?? room.height / scale,
                transform: `scale(${scale})`,
              }}
              src={url}
              title={title}
              sandbox="allow-scripts"
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function ArtifactView({ run, sample, artifact, page }: Props) {
  // The text read, with the file it was read from: text of another file is never shown under this one's name.
  const [read, setRead] = useState<{ of: string; text: string } | null>(null)
  const [failure, setFailure] = useState<{ of: string; message: string } | null>(null)
  const [loading, setLoading] = useState(false)
  /** Bumped by Try again: the same file, read once more. */
  const [attempt, setAttempt] = useState(0)
  // By its name and kind, not the object: every reload of the skill brings a new object for the same file.
  const file = artifact?.file ?? null
  const textual = artifact ? artifact.kind !== 'image' && artifact.kind !== 'html' : false
  const of = `${run}/${sample}/${file}`
  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` reads again on purpose.
  useEffect(() => {
    if (file === null || !textual) return
    let live = true
    setLoading(true)
    api.artifactText(run, sample, file).then(
      (text) => {
        if (!live) return
        setRead({ of: `${run}/${sample}/${file}`, text })
        setFailure(null)
        setLoading(false)
      },
      (e: Error) => {
        if (!live) return
        setFailure({ of: `${run}/${sample}/${file}`, message: e.message })
        setLoading(false)
      },
    )
    return () => {
      live = false
    }
  }, [run, sample, file, textual, attempt])
  const text = read?.of === of ? read.text : null
  const error = failure?.of === of ? failure.message : null
  if (!artifact) return <Hint inset>This output has no file to show.</Hint>
  const url = api.artifactUrl(run, sample, artifact.file)
  if (artifact.kind === 'image')
    return <img className="block max-w-full" src={url} alt={artifact.file} />
  if (artifact.kind === 'html')
    return (
      <PageView
        url={url}
        title={artifact.file}
        page={page}
        action={<OpenFullSize run={run} sample={sample} file={artifact.file} />}
      />
    )
  if (text === null)
    return error ? (
      <ReadFailed
        size="compact"
        title="Could not read this file"
        retrying={loading}
        onRetry={() => setAttempt((n) => n + 1)}
      >
        {error}
      </ReadFailed>
    ) : (
      <Loading />
    )
  if (artifact.kind === 'markdown') return <Prose text={copyOf(text)} />
  return (
    <pre className="m-0 overflow-x-auto bg-muted px-5 py-4 font-mono text-xs whitespace-pre-wrap break-words">
      {text}
    </pre>
  )
}

/**
 * Open a file the agent wrote in a window of its own, at its own size. Quiet,
 * with the arrow that says it opens elsewhere: an action on the file in view,
 * at the end of the line about it, never a button beside the controls that pick.
 */
export function OpenFullSize({ run, sample, file }: { run: string; sample: string; file: string }) {
  return (
    <Button
      type="button"
      variant="ghost-muted"
      size="xs"
      onClick={() => api.openArtifact(run, sample, file)}
    >
      Open full size
      <ArrowUpRightIcon aria-hidden="true" />
    </Button>
  )
}

/** What of an output is being read: one of the files the agent wrote, or the steps it took. */
export type OutputView = ArtifactRef | 'transcript'

/**
 * Pick which file of an output to read, when it wrote more than one. Its
 * transcript is not one of them: the card's foot opens it.
 */
export function ArtifactPicker({
  artifacts,
  value,
  onChange,
}: {
  artifacts: ArtifactRef[]
  value: OutputView | null
  onChange: (view: OutputView) => void
}) {
  if (artifacts.length < 2) return null
  return (
    <div className="border-b px-4 py-2">
      <ToggleGroup
        type="single"
        variant="default"
        size="sm"
        spacing={1}
        aria-label="Read"
        className="flex-wrap"
        value={value === 'transcript' ? '' : (value?.file ?? '')}
        onValueChange={(picked) => {
          const next = artifacts.find((a) => a.file === picked)
          if (next) onChange(next)
        }}
      >
        {artifacts.map((a) => (
          <ToggleGroupItem key={a.file} value={a.file} font="mono" text="xs">
            {a.file.replace(/^outputs\//, '')}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}
