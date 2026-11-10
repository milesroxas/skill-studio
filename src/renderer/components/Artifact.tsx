/** One artifact as the reader sees it: Markdown rendered, HTML framed, images shown, code listed. */
import type { Artifact as ArtifactRef } from '@domain/schemas.ts'
import { copyOf } from '@domain/text.ts'
import { useEffect, useState } from 'react'
import { api } from '../api.ts'
import { Loading, ReadFailed } from './layout.tsx'
import { Prose } from './Prose.tsx'
import { Hint } from './text.tsx'
import { Button } from './ui/button.tsx'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group.tsx'

interface Props {
  run: string
  sample: string
  artifact: ArtifactRef | null
}

export function ArtifactView({ run, sample, artifact }: Props) {
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
  if (!artifact) return <Hint inset>The agent wrote no file for this output.</Hint>
  const url = api.artifactUrl(run, sample, artifact.file)
  if (artifact.kind === 'image')
    return <img className="block max-w-full" src={url} alt={artifact.file} />
  if (artifact.kind === 'html')
    return (
      <div className="relative isolate">
        <p className="m-0 flex justify-end border-b px-4 py-2 text-xs">
          <Button
            type="button"
            variant="link-muted"
            size="inline-sm"
            onClick={() => api.openArtifact(run, sample, artifact.file)}
          >
            Open full size
          </Button>
        </p>
        {/* A frame that scrolls would trap the page swipe on touch: show it, open it to scroll. */}
        <iframe
          className="block min-h-[70svh] w-full border-0 bg-artifact pointer-coarse:pointer-events-none pointer-coarse:min-h-[60svh]"
          src={url}
          title={artifact.file}
          sandbox=""
        />
      </div>
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

/** What of an output is being read: one of the files the agent wrote, or the steps it took. */
export type OutputView = ArtifactRef | 'transcript'

const TRANSCRIPT = ':transcript'

/**
 * Pick what of an output to read: one of its files, or its transcript when it
 * has one. Hidden when there is one thing to read and nothing to pick.
 */
export function ArtifactPicker({
  artifacts,
  value,
  onChange,
  transcript = false,
}: {
  artifacts: ArtifactRef[]
  value: OutputView | null
  onChange: (view: OutputView) => void
  /** The run kept the agent's steps for this output. */
  transcript?: boolean
}) {
  if (artifacts.length + (transcript ? 1 : 0) < 2) return null
  return (
    <div className="border-b px-4 py-2">
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        spacing={1}
        aria-label="Read"
        value={value === 'transcript' ? TRANSCRIPT : (value?.file ?? '')}
        onValueChange={(picked) => {
          if (picked === TRANSCRIPT) return onChange('transcript')
          const next = artifacts.find((a) => a.file === picked)
          if (next) onChange(next)
        }}
      >
        {artifacts.map((a) => (
          <ToggleGroupItem key={a.file} value={a.file} font="mono" text="xs">
            {a.file.replace(/^outputs\//, '')}
          </ToggleGroupItem>
        ))}
        {transcript ? (
          <ToggleGroupItem value={TRANSCRIPT} text="xs">
            Transcript
          </ToggleGroupItem>
        ) : null}
      </ToggleGroup>
    </div>
  )
}
