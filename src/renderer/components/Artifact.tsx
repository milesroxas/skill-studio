/** One artifact as the reader sees it: Markdown rendered, HTML framed, images shown, code listed. */
import type { Artifact as ArtifactRef } from '@domain/schemas.ts'
import { copyOf } from '@domain/text.ts'
import { useEffect, useState } from 'react'
import { api } from '../api.ts'
import { markdownHtml } from '../markdown.ts'
import { Loading } from './layout.tsx'
import { Hint } from './text.tsx'
import { Button } from './ui/button.tsx'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group.tsx'

interface Props {
  run: string
  sample: string
  artifact: ArtifactRef | null
}

export function ArtifactView({ run, sample, artifact }: Props) {
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const textual = artifact && artifact.kind !== 'image' && artifact.kind !== 'html'
  useEffect(() => {
    setText(null)
    setError(null)
    if (!artifact || !textual) return
    let live = true
    api.artifactText(run, sample, artifact.file).then(
      (value) => live && setText(value),
      (e: Error) => live && setError(e.message),
    )
    return () => {
      live = false
    }
  }, [run, sample, artifact, textual])
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
          className="block min-h-[70svh] w-full border-0 bg-white pointer-coarse:pointer-events-none pointer-coarse:min-h-[60svh]"
          src={url}
          title={artifact.file}
          sandbox=""
        />
      </div>
    )
  if (error)
    return (
      <Hint inset tone="destructive">
        {error}
      </Hint>
    )
  if (text === null) return <Loading />
  if (artifact.kind === 'markdown')
    return (
      <div
        className="doc"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: every string is escaped in markdown.ts
        dangerouslySetInnerHTML={{ __html: markdownHtml(copyOf(text)) }}
      />
    )
  return (
    <pre className="m-0 overflow-x-auto bg-muted px-5 py-4 font-mono text-xs whitespace-pre-wrap break-words">
      {text}
    </pre>
  )
}

/** Pick one of an output's files to read; hidden when the agent wrote only one. */
export function ArtifactPicker({
  artifacts,
  value,
  onChange,
}: {
  artifacts: ArtifactRef[]
  value: ArtifactRef | null
  onChange: (a: ArtifactRef) => void
}) {
  if (artifacts.length < 2) return null
  return (
    <div className="border-b px-4 py-2">
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        spacing={1}
        aria-label="Files"
        value={value?.file ?? ''}
        onValueChange={(file) => {
          const next = artifacts.find((a) => a.file === file)
          if (next) onChange(next)
        }}
      >
        {artifacts.map((a) => (
          <ToggleGroupItem key={a.file} value={a.file} className="font-mono text-xs">
            {a.file.replace(/^outputs\//, '')}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}
