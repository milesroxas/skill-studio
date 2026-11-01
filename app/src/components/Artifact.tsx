/** One artifact as the reader sees it: Markdown rendered, HTML framed, images shown, code listed. */
import type { Artifact as ArtifactRef } from '@core/schemas.ts'
import { copyOf } from '@core/text.ts'
import { useEffect, useState } from 'react'
import { api } from '../api.ts'
import { markdownHtml } from '../markdown.ts'

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
  if (!artifact) return <p className="help card-note">This sample wrote no output.</p>
  const url = api.artifactUrl(run, sample, artifact.file)
  if (artifact.kind === 'image')
    return <img className="artifact-image" src={url} alt={artifact.file} />
  if (artifact.kind === 'html')
    return (
      <div className="artifact-html">
        <p className="artifact-open">
          <a href={url} target="_blank" rel="noopener noreferrer">
            Open full size
          </a>
        </p>
        <iframe className="artifact-frame" src={url} title={artifact.file} sandbox="" />
      </div>
    )
  if (error) return <p className="help card-note">{error}</p>
  if (text === null) return <p className="help card-note">Loading…</p>
  if (artifact.kind === 'markdown')
    return (
      <div
        className="doc"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: every string is escaped in markdown.ts
        dangerouslySetInnerHTML={{ __html: markdownHtml(copyOf(text)) }}
      />
    )
  return <pre className="code">{text}</pre>
}

/** Pick one of a sample's artifacts to read; hidden when it wrote only one. */
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
    <fieldset className="artifact-tabs" aria-label="Files">
      {artifacts.map((a) => (
        <button
          key={a.file}
          type="button"
          aria-pressed={value?.file === a.file}
          onClick={() => onChange(a)}
        >
          {a.file.replace(/^outputs\//, '')}
        </button>
      ))}
    </fieldset>
  )
}
