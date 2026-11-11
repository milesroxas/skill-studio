/**
 * A case's input files: what the agent gets beside the prompt, in its
 * `files/` folder. One is added as an entry, a file or a whole folder picked
 * at once, and waits as an upload until the case is saved, as a picture does.
 */

/** A file or folder picked for a case, kept until the case is saved. */
export interface InputUpload {
  /** Its name right in the case's `files/`: the file's, or the folder's. */
  name: string
  /** Id of the kept copy. */
  upload: string
  /** How many files it holds: 1 for a file. */
  files: number
  folder: boolean
}

/** A pick as the page sends it for keeping: each file by its path from the entry's own name, its bytes in base64. */
export interface InputPick {
  name: string
  files: Array<{ path: string; data: string }>
}

/** The most one pick holds, so a folder picked by mistake, such as a whole project, is refused before it is read. */
export const INPUT_LIMITS = { files: 500, bytes: 16 * 1024 * 1024 } as const

/** Why a pick of `files` files and `bytes` bytes is refused, or null when it is not. */
export function inputLimitProblem(files: number, bytes: number): string | null {
  if (files > INPUT_LIMITS.files)
    return `That is ${files.toLocaleString('en-US')} files; one pick holds ${INPUT_LIMITS.files} at most. Pick the folder the prompt is about, not the whole project.`
  if (bytes > INPUT_LIMITS.bytes)
    return `That is ${Math.ceil(bytes / 1024 / 1024)} MB; one pick holds ${INPUT_LIMITS.bytes / 1024 / 1024} MB at most. Pick the folder the prompt is about, not the whole project.`
  return null
}

/** A path in a picked folder that is left out: hidden files and folders, and installed dependencies. */
export const skippedInput = (path: string): boolean =>
  path.split('/').some((part) => part.startsWith('.') || part === 'node_modules')

/** An input file or folder as the form lists it. */
export interface InputEntry {
  /** Its name right in the case's `files/`. */
  name: string
  files: number
  folder: boolean
  /** Picked and not saved yet. */
  added: boolean
}
