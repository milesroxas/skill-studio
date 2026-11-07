/**
 * The folders the library looks in, as the Library and the welcome both show
 * them: what is always read, the folders added, and a way to add one. The
 * desktop app picks a folder in the system's own dialog; a browser, which
 * cannot reach one, types it.
 */
import { AGENTS, STORE_DIR } from '@domain/library.ts'
import { FolderPlusIcon, PlusIcon } from 'lucide-react'
import { useState } from 'react'
import { api } from '../api.ts'
import type { Reporter } from '../hooks.ts'
import { PlainList, Stack, Toolbar } from './layout.tsx'
import { Hint, Text } from './text.tsx'
import { Button } from './ui/button.tsx'
import { Input } from './ui/input.tsx'

/** The user folders read on every machine, "~/.agents, …, and ~/.codex", from the same list the scan walks. */
const USER_FOLDERS = new Intl.ListFormat('en', { type: 'conjunction' }).format(
  [STORE_DIR, ...AGENTS.map((a) => a.dir)].map((dir) => `~/${dir.split('/')[0]}`),
)

export function Folders({
  workspaces,
  save,
  report,
  variant = 'outline',
}: {
  workspaces: string[]
  /** Store the new list; `done` says what changed, for the status line. Settles when the list is stored. */
  save: (list: string[], done: string) => Promise<unknown>
  report: Reporter
  /** The add button's weight: filled where adding a folder is the step to take. */
  variant?: 'default' | 'outline'
}) {
  /** A change to the list is on its way: every control of the list waits for it. */
  const [busy, setBusy] = useState(false)
  const store = async (list: string[], done: string) => {
    setBusy(true)
    try {
      await save(list, done)
    } finally {
      setBusy(false)
    }
  }
  const add = (folder: string) => store([...workspaces, folder], `Looking in ${folder}`)
  const { chooseFolder } = api
  return (
    <Stack gap="md">
      <Hint>
        Skill Studio always reads the skills in {USER_FOLDERS}. It also finds every project with a
        skills folder up to three levels inside the folders below.
      </Hint>
      {workspaces.length ? (
        <PlainList>
          {workspaces.map((w) => (
            <li key={w}>
              <Toolbar gap="md" wrap={false}>
                <Text font="mono" truncate title={w}>
                  {w}
                </Text>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Stop looking in ${w}`}
                  disabled={busy}
                  onClick={() =>
                    store(
                      workspaces.filter((x) => x !== w),
                      `Stopped looking in ${w}`,
                    )
                  }
                >
                  Remove
                </Button>
              </Toolbar>
            </li>
          ))}
        </PlainList>
      ) : null}
      {chooseFolder ? (
        <Toolbar>
          <Button
            type="button"
            variant={variant}
            busy={busy}
            busyLabel="Saving…"
            onClick={() =>
              chooseFolder().then((folder) => {
                if (folder) void add(folder)
              }, report)
            }
          >
            <FolderPlusIcon aria-hidden="true" />
            Add a folder…
          </Button>
        </Toolbar>
      ) : (
        <TypedFolder variant={variant} busy={busy} onAdd={add} />
      )}
    </Stack>
  )
}

/** A folder typed by its path, where no dialog can pick one. */
function TypedFolder({
  variant,
  busy,
  onAdd,
}: {
  variant: 'default' | 'outline'
  busy: boolean
  onAdd: (folder: string) => void
}) {
  const [adding, setAdding] = useState('')
  return (
    <form
      className="contents"
      onSubmit={(e) => {
        e.preventDefault()
        const folder = adding.trim()
        if (!folder) return
        onAdd(folder)
        setAdding('')
      }}
    >
      <Toolbar>
        <Input
          aria-label="Folder to look in"
          placeholder="~/Projects"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          font="mono"
          value={adding}
          width="auto"
          onChange={(e) => setAdding(e.target.value)}
        />
        <Button
          type="submit"
          variant={variant}
          disabled={!adding.trim()}
          busy={busy}
          busyLabel="Saving…"
        >
          <PlusIcon aria-hidden="true" />
          Add folder
        </Button>
      </Toolbar>
    </form>
  )
}
