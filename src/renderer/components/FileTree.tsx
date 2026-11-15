/**
 * A skill's files as a tree: each folder's files, then the folders in it,
 * every one a `NavButton`. A file's row opens it. A folder's row folds what
 * it holds away and back; what is in it starts under its name.
 *
 * A new file or folder is named where it will be: one field, in the tree,
 * after the files of the folder it goes in. Enter makes it, Escape lets it
 * go, and so does leaving the field empty. A folder is there for as long as
 * a file is in it, so naming a folder goes on to naming its first file.
 *
 * A right-click on a row offers what its caller hands in for that file or
 * folder (`ContextActions`).
 */
import type { FileFolder } from '@domain/paths.ts'
import { nameOf } from '@domain/paths.ts'
import { ChevronRightIcon } from 'lucide-react'
import { type FocusEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { cn } from '../lib/utils.ts'
import { PlainList } from './layout.tsx'
import { NavButton, NavButtonTitle } from './NavButton.tsx'
import { ContextActions } from './RowActions.tsx'
import { Hint } from './text.tsx'
import { Input } from './ui/input.tsx'

/** What is being named, and the folder it goes in (`''` is the skill's own, beside SKILL.md). */
export interface TreeNaming {
  kind: 'file' | 'folder'
  folder: string
}

/**
 * The field a new file or folder is named in. It checks the name when it is
 * sent, and from then on as it is typed, so a mistake goes the moment it is
 * fixed. Leaving it with a name in it sends the name; leaving the window
 * does nothing, since the reader may have gone to look the name up.
 */
function NameField({
  kind,
  first,
  check,
  onName,
  onCancel,
}: {
  kind: TreeNaming['kind']
  /** The folder holds nothing yet: say what keeps it. */
  first: boolean
  check: (name: string) => string | null
  onName: (name: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const field = useRef<HTMLInputElement>(null)
  /** Sent or let go: the blur that follows the field's going is not a second answer. */
  const done = useRef(false)
  const id = useId()
  useEffect(() => field.current?.focus(), [])

  const send = () => {
    const refusal = check(name)
    setError(refusal)
    if (refusal) return
    done.current = true
    onName(name)
  }
  const cancel = () => {
    done.current = true
    onCancel()
  }
  const leave = (event: FocusEvent<HTMLFormElement>) => {
    if (done.current || !document.hasFocus()) return
    if (event.currentTarget.contains(event.relatedTarget)) return
    if (name.trim()) send()
    else cancel()
  }
  const note =
    error ?? (first ? 'Name its first file. A folder is kept once a file is in it.' : null)
  return (
    <li>
      <form
        className="flex flex-col gap-1 py-0.5"
        onBlur={leave}
        onSubmit={(event) => {
          event.preventDefault()
          send()
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return
          event.stopPropagation()
          cancel()
        }}
      >
        <Input
          ref={field}
          aria-label={kind === 'file' ? 'Name of the new file' : 'Name of the new folder'}
          aria-invalid={error ? true : undefined}
          aria-describedby={note ? id : undefined}
          placeholder={kind === 'file' ? 'File name' : 'Folder name'}
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          size="sm"
          font="mono"
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            // Checked late: only a name already refused is checked as it is typed.
            if (error) setError(check(event.target.value))
          }}
        />
        {note ? (
          // Under the field's own text, which starts 8px in.
          <Hint
            id={id}
            tone={error ? 'destructive' : undefined}
            role={error ? 'alert' : undefined}
            className="px-2"
          >
            {note}
          </Hint>
        ) : null}
      </form>
    </li>
  )
}

export function FileTree({
  tree,
  current,
  unsaved,
  arrived,
  onOpen,
  fileActions,
  folderActions,
  naming,
  checkName,
  onName,
  onCancelName,
}: {
  /** The skill's folder (`fileTree`), holding a folder being named as well. */
  tree: FileFolder
  /** The file that is open; null when none of the list's is, such as while a version shows. */
  current: string | null
  unsaved: (path: string) => boolean
  /** The file joined the list while the reader watched: its row fades in. */
  arrived: (path: string) => boolean
  onOpen: (path: string) => void
  /** `RowAction`s for a right-click on a file's row. */
  fileActions: (path: string) => ReactNode
  /** `RowAction`s for a right-click on a folder's row. */
  folderActions: (path: string) => ReactNode
  naming: TreeNaming | null
  /** Why the name typed cannot be used, as a sentence; null when it can. */
  checkName: (name: string) => string | null
  onName: (name: string) => void
  onCancelName: () => void
}) {
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set())
  const list = useRef<HTMLDivElement>(null)
  // A file opened or a name asked for inside a folded folder unfolds it, once: the reader may
  // fold it again with the file still open.
  const [shown, setShown] = useState({ current, naming })
  if (shown.current !== current || shown.naming !== naming) {
    setShown({ current, naming })
    const inside = [
      shown.current !== current ? current : null,
      shown.naming !== naming && naming ? `${naming.folder}/` : null,
    ]
    const next = [...folded].filter(
      (folder) => !inside.some((path) => path?.startsWith(`${folder}/`)),
    )
    if (next.length !== folded.size) setFolded(new Set(next))
  }
  const fold = (folder: string) => {
    const next = new Set(folded)
    if (!next.delete(folder)) next.add(folder)
    setFolded(next)
  }
  /** The open file's row takes the focus back, so the keyboard is not left with nowhere to be. */
  const cancel = () => {
    onCancelName()
    list.current?.querySelector<HTMLElement>('[data-current]')?.focus()
  }

  const rows = (folder: FileFolder): ReactNode => (
    <>
      {folder.files.map((path) => (
        <li key={path}>
          <ContextActions subject={path} actions={fileActions(path)}>
            <NavButton
              current={path === current}
              arrived={arrived(path)}
              title={path}
              onClick={() => onOpen(path)}
            >
              <NavButtonTitle font="mono" unsaved={unsaved(path)}>
                {nameOf(path)}
              </NavButtonTitle>
            </NavButton>
          </ContextActions>
        </li>
      ))}
      {naming?.folder === folder.path ? (
        <NameField
          // A folder named goes on to its first file: a new field, empty.
          key={`${naming.kind}:${naming.folder}`}
          kind={naming.kind}
          first={
            naming.kind === 'file' &&
            folder.path !== '' &&
            !folder.files.length &&
            !folder.folders.length
          }
          check={checkName}
          onName={onName}
          onCancel={cancel}
        />
      ) : null}
      {folder.folders.map((inner) => {
        const open = !folded.has(inner.path)
        return (
          <li key={inner.path}>
            <ContextActions subject={inner.path} actions={folderActions(inner.path)}>
              <NavButton title={inner.path} aria-expanded={open} onClick={() => fold(inner.path)}>
                <NavButtonTitle
                  font="mono"
                  lead={
                    <ChevronRightIcon
                      aria-hidden="true"
                      className={cn(
                        // Its stroke starts 4px into its box; pulled back, it starts where a file's name does.
                        '-ml-1 size-3.5 text-muted-foreground transition-transform duration-150 ease-out-strong',
                        open && 'rotate-90',
                      )}
                    />
                  }
                >
                  {inner.name}
                </NavButtonTitle>
              </NavButton>
            </ContextActions>
            {open ? (
              // Indented by the chevron and its gap, so what a folder holds starts under its name.
              <PlainList gap="xs" className="mt-0.5 pl-4">
                {rows(inner)}
              </PlainList>
            ) : null}
          </li>
        )
      })}
    </>
  )

  return (
    <div ref={list} className="contents">
      <PlainList gap="xs" bleed>
        {rows(tree)}
      </PlainList>
    </div>
  )
}
