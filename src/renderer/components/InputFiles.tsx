/**
 * A case's input files as the form shows them: one row for each file or
 * folder the agent gets in `files/`, with its count and a remove button, and
 * the buttons that add more. A pick still on its way holds a row of its own,
 * so the list does not jump when it arrives.
 */
import type { InputEntry } from '@domain/inputs.ts'
import { FileIcon, FilePlusIcon, FolderIcon, FolderPlusIcon, XIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Text } from './text.tsx'
import { Button } from './ui/button.tsx'

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

interface InputListProps {
  entries: InputEntry[]
  /** How many more are on their way: each holds a row. */
  adding?: number
  onRemove: (entry: InputEntry) => void
}

export function InputList({ entries, adding = 0, onRemove }: InputListProps) {
  if (!entries.length && !adding) return null
  return (
    <ul aria-label="Input files" className="m-0 flex list-none flex-col p-0">
      {entries.map((entry) => {
        const Icon = entry.folder ? FolderIcon : FileIcon
        return (
          <li key={entry.name} className="flex min-h-8 min-w-0 items-center gap-2">
            <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <Text font="mono" truncate title={entry.name}>
              {entry.folder ? `${entry.name}/` : entry.name}
            </Text>
            <Text tone="muted" size="xs" className="shrink-0">
              {[entry.folder ? plural(entry.files, 'file') : '', entry.added ? 'not saved yet' : '']
                .filter(Boolean)
                .join(' · ')}
            </Text>
            <Button
              type="button"
              variant="ghost-muted"
              size="icon-sm"
              className="ml-auto"
              aria-label={`Remove ${entry.name}`}
              title="Remove"
              onClick={() => onRemove(entry)}
            >
              <XIcon aria-hidden="true" />
            </Button>
          </li>
        )
      })}
      {Array.from({ length: adding }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: placeholders with nothing else to tell them apart.
        <li key={i} className="flex min-h-8 items-center gap-2">
          <FileIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <Text tone="muted">Reading…</Text>
        </li>
      ))}
    </ul>
  )
}

interface InputPickerProps {
  onFiles: (files: File[]) => void
  /** The files of one folder, each with its path from the folder in `webkitRelativePath`. */
  onFolder: (files: File[]) => void
  disabled?: boolean
}

/** Add files and Add folder: each opens the system's picker. */
export function InputPicker({ onFiles, onFolder, disabled }: InputPickerProps) {
  const files = useRef<HTMLInputElement>(null)
  const folder = useRef<HTMLInputElement>(null)
  // Not in React's attribute types: set where the element is.
  useEffect(() => folder.current?.setAttribute('webkitdirectory', ''), [])
  const take = (input: HTMLInputElement, to: (files: File[]) => void) => {
    to([...(input.files ?? [])])
    // The same file can be picked again after it is removed.
    input.value = ''
  }
  return (
    <>
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
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => files.current?.click()}
      >
        <FilePlusIcon aria-hidden="true" />
        Add files
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => folder.current?.click()}
      >
        <FolderPlusIcon aria-hidden="true" />
        Add folder
      </Button>
    </>
  )
}
