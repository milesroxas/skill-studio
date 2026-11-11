/**
 * A case's files as the form shows them: one row for each picture, file or
 * folder the case comes with, then the buttons that add more. Every row leads
 * with a tile of one size, a picture's own thumbnail or an icon, so the list
 * reads as one kind of thing; a hairline between rows carries the eye from a
 * name to its remove button. One still being read holds a row of its own, so
 * the list does not jump when it arrives.
 */
import type { ImageRef } from '@domain/image.ts'
import type { InputEntry } from '@domain/inputs.ts'
import { FileIcon, FilePlusIcon, FolderIcon, FolderPlusIcon, XIcon } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Toolbar } from './layout.tsx'
import { Picture } from './Pictures.tsx'
import { Text } from './text.tsx'
import { Button } from './ui/button.tsx'

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

/** A picture's thumbnail is 40px with a hairline: a file's tile is the same box, with its icon. */
const tile =
  'flex size-10 shrink-0 items-center justify-center rounded-sm border bg-muted text-muted-foreground [&_svg]:size-4'

const row = 'flex min-h-14 min-w-0 items-center gap-3'

interface CaseFilesProps {
  pictures: ImageRef[]
  entries: InputEntry[]
  /** How many more are being read: each holds a row. */
  adding?: number
  onRemovePicture: (image: ImageRef) => void
  onRemoveEntry: (entry: InputEntry) => void
  onFiles: (files: File[]) => void
  /** The files of one folder, each with its path from the folder in `webkitRelativePath`. */
  onFolder: (files: File[]) => void
}

export function CaseFiles({
  pictures,
  entries,
  adding = 0,
  onRemovePicture,
  onRemoveEntry,
  onFiles,
  onFolder,
}: CaseFilesProps) {
  const files = useRef<HTMLInputElement>(null)
  const folder = useRef<HTMLInputElement>(null)
  // Not in React's attribute types: set where the element is.
  useEffect(() => folder.current?.setAttribute('webkitdirectory', ''), [])
  const take = (input: HTMLInputElement, to: (files: File[]) => void) => {
    to([...(input.files ?? [])])
    // The same file can be picked again after it is removed.
    input.value = ''
  }

  const rows: Array<{
    key: string
    name: string
    lead: ReactNode
    meta: string
    remove: () => void
  }> = [
    ...pictures.map((image) => ({
      key: `picture ${image.upload ?? image.file}`,
      name: image.name,
      lead: <Picture image={image} size="sm" />,
      meta: '',
      remove: () => onRemovePicture(image),
    })),
    ...entries.map((entry) => ({
      key: `entry ${entry.name}`,
      name: entry.folder ? `${entry.name}/` : entry.name,
      lead: (
        <span className={tile}>
          {entry.folder ? <FolderIcon aria-hidden="true" /> : <FileIcon aria-hidden="true" />}
        </span>
      ),
      meta: entry.folder ? plural(entry.files, 'file') : '',
      remove: () => onRemoveEntry(entry),
    })),
  ]

  /**
   * Removing a row moves the keyboard to the row that took its place, or to
   * the button that adds one when none is left, so focus never falls off the list.
   */
  const removes = useRef<Array<HTMLButtonElement | null>>([])
  const addButton = useRef<HTMLButtonElement>(null)
  const [focus, setFocus] = useState<number | null>(null)
  useEffect(() => {
    if (focus === null) return
    ;(removes.current[focus] ?? addButton.current)?.focus()
    setFocus(null)
  }, [focus])

  return (
    <div className="flex flex-col gap-3">
      {rows.length || adding ? (
        <ul aria-label="Files" className="m-0 flex list-none flex-col divide-y border-y p-0">
          {rows.map((r, i) => (
            <li key={r.key} className={row}>
              {r.lead}
              <Text font="mono" truncate title={r.name}>
                {r.name}
              </Text>
              {r.meta ? (
                <Text tone="muted" size="xs" className="shrink-0">
                  {r.meta}
                </Text>
              ) : null}
              <Button
                ref={(el) => {
                  removes.current[i] = el
                }}
                type="button"
                variant="ghost-muted"
                size="icon-sm"
                className="ml-auto"
                aria-label={`Remove ${r.name}`}
                title="Remove"
                onClick={() => {
                  r.remove()
                  setFocus(Math.min(i, rows.length - 2))
                }}
              >
                <XIcon aria-hidden="true" />
              </Button>
            </li>
          ))}
          {Array.from({ length: adding }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: placeholders with nothing else to tell them apart.
            <li key={i} className={row}>
              <span className={`${tile} animate-pulse`} />
              <Text tone="muted">Reading…</Text>
            </li>
          ))}
        </ul>
      ) : null}
      <input
        ref={files}
        type="file"
        multiple
        hidden
        tabIndex={-1}
        onChange={(event) => take(event.target, onFiles)}
      />
      <input
        ref={folder}
        type="file"
        hidden
        tabIndex={-1}
        onChange={(event) => take(event.target, onFolder)}
      />
      <Toolbar>
        <Button
          ref={addButton}
          type="button"
          variant="outline"
          size="sm"
          onClick={() => files.current?.click()}
        >
          <FilePlusIcon aria-hidden="true" />
          Add files
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => folder.current?.click()}>
          <FolderPlusIcon aria-hidden="true" />
          Add folder
        </Button>
      </Toolbar>
    </div>
  )
}
