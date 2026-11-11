/**
 * Files and folders on their way into a case. Each file picked, or each
 * folder, is read and sent for keeping as one pick; the case holds it until
 * it is saved, as it holds a picture. A picture picked here goes to the
 * case's pictures instead, which the judge sees too.
 */
import { imageTypeOf } from '@domain/image.ts'
import { type InputUpload, inputLimitProblem, skippedInput } from '@domain/inputs.ts'
import { useRef, useState } from 'react'
import { api } from './api.ts'

/** Base64 of a file's bytes, built in pieces: one call cannot take a whole file as arguments. */
async function base64Of(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let at = 0; at < bytes.length; at += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000))
  return btoa(binary)
}

/** Send one pick: files by their path from its name. Throws, with what is wrong, when it is refused. */
async function upload(
  name: string,
  files: Array<{ path: string; file: File }>,
): Promise<InputUpload> {
  const problem = inputLimitProblem(
    files.length,
    files.reduce((sum, f) => sum + f.file.size, 0),
  )
  if (problem) throw new Error(problem)
  const read = await Promise.all(
    files.map(async (f) => ({ path: f.path, data: await base64Of(f.file) })),
  )
  return api.uploadInput({ name, files: read })
}

export interface AddInputs {
  /** How many picks are being read and sent for keeping. */
  adding: number
  /** Why the last one could not be added; null once another is. */
  error: string | null
  /** Files picked one by one: each is a pick of its own. */
  addFiles: (files: File[]) => void
  /** The files of one folder, from a folder picker: one pick under the folder's name. */
  addFolder: (files: File[]) => void
}

/**
 * Add files and folders to a case. `onAdded` is told the scope the picks were
 * made for, such as a case, so they go there even when the reader has moved
 * on by the time they land. `onPictures` takes the pictures among the files.
 */
export function useAddInputs(
  onAdded: (picks: InputUpload[], scope: string) => void,
  onPictures: (files: File[]) => void,
  scope = '',
): AddInputs {
  const [adding, setAdding] = useState(0)
  const [error, setError] = useState<string | null>(null)
  // The case may change while a pick is on its way: the newest callback gets it.
  const latest = useRef(onAdded)
  latest.current = onAdded

  const send = (picks: Array<() => Promise<InputUpload>>) => {
    if (!picks.length) return
    setError(null)
    setAdding((n) => n + picks.length)
    void Promise.allSettled(picks.map((pick) => pick())).then((results) => {
      setAdding((n) => n - picks.length)
      const failed = results.find((r) => r.status === 'rejected')
      if (failed) setError((failed.reason as Error).message)
      const added = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
      if (added.length) latest.current(added, scope)
    })
  }

  const addFiles = (files: File[]) => {
    const pictures = files.filter((file) => imageTypeOf(file.name))
    if (pictures.length) onPictures(pictures)
    send(
      files
        .filter((file) => !imageTypeOf(file.name))
        .map((file) => () => upload(file.name, [{ path: file.name, file }])),
    )
  }

  const addFolder = (files: File[]) => {
    const kept = files
      .map((file) => ({ path: file.webkitRelativePath || file.name, file }))
      .filter((f) => !skippedInput(f.path))
    const name = kept[0]?.path.split('/')[0] ?? files[0]?.webkitRelativePath.split('/')[0]
    if (!kept.length) {
      setError(`${name ?? 'That folder'} holds no files to add.`)
      return
    }
    send([() => upload(name, kept)])
  }

  return { adding, error, addFiles, addFolder }
}
