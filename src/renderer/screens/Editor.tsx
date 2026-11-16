/**
 * Write the skill: SKILL.md and references/, edited in place on disk. Every
 * keystroke is kept as a draft, so unsaved text survives a reload or a quit;
 * saving writes the file and clears its draft.
 *
 * The skill's versions are listed under its files. A run keeps the version it
 * tested, so none is saved by hand; opening one shows what changed and offers
 * the way back to it. Under them, the versions and runs deleted lately, each
 * with Undo, while the skill's trash still holds them.
 *
 * The file's header holds one switch for what the column shows (the text
 * styled, its Markdown, or what changed) and the two actions on unsaved work.
 * Changes are read against the newest version, the copy the last run kept, so
 * a save does not empty them. While the file holds unsaved text, the last save
 * is the other thing to read them against: what Save would write and Discard
 * would drop.
 *
 * Save writes a file and makes no version: a run keeps one. So files saved
 * since the newest version stand in the versions list as a row of their own,
 * "Edited since v1", over the versions, and it opens their changes. No number
 * is given to a version until a run has made it. Save is the one filled button, and only while there
 * is something to save; Discard is always there, so nothing in the row moves
 * on the first keystroke.
 */

import {
  byFileOrder,
  fileTree,
  folderOf,
  isCorePath,
  isMarkdownPath,
  placeNew,
} from '@domain/paths.ts'
import { applyPracticeEdit, PRACTICE_EDIT } from '@domain/practice.ts'
import { scanRules } from '@domain/rules.ts'
import {
  applyTemplate,
  EXAMPLE_KINDS,
  isScaffold,
  RULE_GUIDE,
  referenceTemplate,
  type SkillTemplate,
  SNIPPETS,
  type Snippet,
} from '@domain/templates.ts'
import {
  frontMatterQuotes,
  frontMatterUnreadable,
  headProblems,
  metaText,
  readFrontMatter,
} from '@domain/text.ts'
import { FilePlusIcon, FolderPlusIcon, Trash2Icon } from 'lucide-react'
import { Fragment, memo, useEffect, useMemo, useRef, useState } from 'react'
import { api, currentSkill } from '../api.ts'
import { changedSince } from '../changes.ts'
import { DiffLines } from '../components/DiffLines.tsx'
import { Disclosure } from '../components/Disclosure.tsx'
import { DraftNote } from '../components/DraftNote.tsx'
import { FileTree, type TreeNaming } from '../components/FileTree.tsx'
import {
  Column,
  ColumnBody,
  ColumnHeader,
  ColumnSection,
  ColumnTitle,
  EmptyState,
  ListHeader,
  Loading,
  PlainList,
  ReadFailed,
  Rows,
  Toolbar,
  Workbench,
} from '../components/layout.tsx'
import {
  forgetEditor,
  MarkdownEditor,
  type MarkdownEditorHandle,
  useEditorMode,
} from '../components/MarkdownEditor.tsx'
import { NavButton, NavButtonMeta, NavButtonTitle } from '../components/NavButton.tsx'
import { RowAction } from '../components/RowActions.tsx'
import { ListScore } from '../components/Scores.tsx'
import { Segmented } from '../components/Segmented.tsx'
import { GuideBox, GuideList, PairList, Starter } from '../components/starters.tsx'
import { Code, Hint, Text } from '../components/text.tsx'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '../components/ui/alert.tsx'
import { Button } from '../components/ui/button.tsx'
import { VersionDetail } from '../components/VersionDetail.tsx'
import type { Ctx } from '../ctx.ts'
import { lineDiff } from '../diff.ts'
import { useAction, useFetch } from '../hooks.ts'
import { shortcut } from '../keys.ts'
import {
  capital,
  deletedName,
  deletesLine,
  editedSince,
  ruleRatesOf,
  shortDate,
  stamp,
  versionReading,
} from '../model.ts'
import { useArrivals } from '../motion.ts'
import { editorFile } from '../route.ts'

/** The fields at the top of a SKILL.md, as a title names them: "The name and the description". */
const fieldNames = (keys: string[]): string => {
  const names = keys.map((k) =>
    k === 'name' || k === 'description' ? `the ${k}` : `the ${k} line`,
  )
  const joined =
    names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]
  return joined.charAt(0).toUpperCase() + joined.slice(1)
}

/**
 * One line over an empty SKILL.md: the ways to begin, in a sentence. The
 * template was offered when the skill was made; here it is a way out of a
 * blank page, not a question asked again. It goes on the first keystroke.
 */
function BlankStart({
  onTemplate,
  onAssist,
}: {
  onTemplate: (template: SkillTemplate) => void
  onAssist: () => void
}) {
  return (
    <Hint role="note">
      Nothing here yet. Write the first rule, take a template’s rules (
      {EXAMPLE_KINDS.map((t, i) => (
        <Fragment key={t.id}>
          {i ? ' · ' : ''}
          <Button type="button" variant="link-muted" size="inline-sm" onClick={() => onTemplate(t)}>
            {t.label}
          </Button>
        </Fragment>
      ))}
      ), or{' '}
      <Button type="button" variant="link-muted" size="inline-sm" onClick={onAssist}>
        draft rules with AI
      </Button>
      .
    </Hint>
  )
}

/** What the file's column shows: the text in one of the editor's two views, or its changes. */
const VIEWS = [
  { value: 'formatted', label: 'Formatted', title: 'Edit with the Markdown styled in place' },
  { value: 'markdown', label: 'Markdown', title: 'Edit the plain Markdown source' },
  {
    value: 'changes',
    label: 'Changes',
    title: 'Read what changed since the last version, or since the last save',
  },
] as const

type View = (typeof VIEWS)[number]['value']

/** A file that is not Markdown has one way to be read, so its views are the text and its changes. */
const TEXT_VIEWS = [{ value: 'markdown', label: 'Text', title: 'Edit the file' }, VIEWS[2]] as const

/** What the changes are read against: the newest version, or the file as last saved. */
type Since = 'version' | 'save'

/** Names the row of edits no version keeps, among the rows that arrive in the versions list. */
const EDITS = 'edits'

/** How many of the newest versions the list shows before the rest fold away. */
const SHOWN_VERSIONS = 5
/** A fold holding one version saves no room, so fewer than this stay in the list. */
const MIN_FOLDED_VERSIONS = 2

export const Editor = memo(function Editor({ ctx }: { ctx: Ctx }) {
  const { state, route, go, report, confirm, reload, config, drafts, outputs } = ctx
  /** The files as saved: the shell's one copy, which a save here updates at once. */
  const disk = ctx.files
  const edits = drafts.files
  const [showDiff, setShowDiff] = useState(false)
  /** What the changes are read against, while a version has been kept to read them against. */
  const [since, setSince] = useState<Since>('version')
  /** A file or a folder is being named in the list, and where it will go. */
  const [naming, setNaming] = useState<TreeNaming | null>(null)
  const [busy, runSave] = useAction(report)
  const [deleting, runDelete] = useAction(report)
  /** The file a delete is on its way for: the open one's button waits only on its own. */
  const [deletingPath, setDeletingPath] = useState<string | null>(null)
  /** Each version's score. It reads every output, so it is not worked out again on a keystroke. */
  const scores = useMemo(
    () =>
      new Map(
        state.versions.versions.map((v) => [v.version, versionReading(outputs, config, v.version)]),
      ),
    [state.versions.versions, outputs, config],
  )
  /**
   * What was deleted lately and can still be taken back, the newest first.
   * Read again whenever the skill is: after a delete, an Undo and a reload.
   */
  const trash = useFetch(() => api.trashed(), [state])
  const trashed = trash.data?.deletes ?? []
  /** The delete whose Undo is on its way; the other rows wait for it. */
  const [undoing, setUndoing] = useState<string | null>(null)
  const undelete = async (gone: (typeof trashed)[number]) => {
    setUndoing(gone.undo)
    try {
      if (gone.kind === 'version') {
        const { restored } = await api.undeleteVersion(gone.undo)
        await reload()
        report(`${restored} is back`)
      } else {
        await api.undeleteRun(gone.undo)
        await reload()
        report('Run restored')
      }
    } catch (e) {
      // A refusal, such as a version of that number made since, is said in the store's words.
      report(e as Error)
      trash.reload()
    } finally {
      setUndoing(null)
    }
  }
  /** How often each rule was followed and broken, for its number in the margin. */
  const rates = useMemo(() => ruleRatesOf(outputs, config), [outputs, config])
  const [mode, setMode] = useEditorMode((message) =>
    report(`Not saved: ${message}`, { tone: 'destructive' }),
  )
  const editor = useRef<MarkdownEditorHandle>(null)

  const files = disk.saved ?? {}
  // Every file of the skill: the ones that read as text, a file only drafted so far, and the rest.
  const paths = [...new Set([...Object.keys(files), ...Object.keys(edits), ...disk.others])].sort(
    byFileOrder,
  )
  const file = editorFile(route.params)
  /** A picture, a font, a file too large to open: listed, and not read as text. */
  const notText = disk.others.includes(file)
  /** Styled and checked as Markdown; any other text is edited as it is written. */
  const markdown = isMarkdownPath(file)
  /** A version opened from the list: the column shows it in place of the file. */
  const version = route.params.get('version')
  /** A rule someone was sent here to change, by its text: Results links a missed rule to it. */
  const wanted = route.arrival === 'step' ? route.params.get('rule') : null
  const saved = files[file] ?? null
  /**
   * The version the changes are read against: the newest, which the last run
   * kept. None before the first run, and none for a file a copy kept of
   * SKILL.md and the references alone does not hold.
   */
  const newestVersion = state.versions.versions.at(-1)
  const base =
    newestVersion && (!newestVersion.partial || isCorePath(file)) ? newestVersion.version : null
  /** The files were saved since the newest version: the line that says so, for their row in the list. */
  const edited = editedSince(state.versions)
  // A version's copy never changes, so it is read once, and only when something is read against it:
  // the changes, or the row of edits, which opens the first file that has some.
  const reads = showDiff || edited !== null
  const kept = useFetch(
    () => (reads && base ? api.skillFiles(base) : Promise.resolve(null)),
    [reads, base],
  )
  /** The file's draft. One that says what the file on disk says is none: there is nothing in it to save. */
  const draft = edits[file]?.text === saved ? undefined : edits[file]
  const text = draft?.text ?? saved ?? ''
  const isDirty = (path: string) => edits[path] !== undefined && edits[path].text !== files[path]
  // A file or a version added while the list is open fades in; what the list opened with rests.
  // The files count only once read, so the ones a draft names first do not rest alone.
  const arrivedFile = useArrivals(disk.saved && drafts.status !== 'loading' ? paths : [])
  // The row of edits arrives too, the first time a save parts the files from the newest version.
  const arrivedVersion = useArrivals([
    ...state.versions.versions.map((v) => v.version),
    ...(edited ? [EDITS] : []),
  ])
  // A long list keeps its newest versions in view and folds the rest under one line.
  const newestFirst = [...state.versions.versions].reverse()
  const folds = newestFirst.length - SHOWN_VERSIONS >= MIN_FOLDED_VERSIONS
  const shownVersions = folds ? newestFirst.slice(0, SHOWN_VERSIONS) : newestFirst
  const olderVersions = folds ? newestFirst.slice(SHOWN_VERSIONS) : []
  const openIsOlder = olderVersions.some((v) => v.version === version)
  // The fold opens when the version open in the column is in it, however that version was reached.
  const [olderOpen, setOlderOpen] = useState(openIsOlder)
  const [openedVersion, setOpenedVersion] = useState(version)
  if (openedVersion !== version) {
    setOpenedVersion(version)
    if (openIsOlder) setOlderOpen(true)
  }
  /** The file changed on disk after this draft began, or went from it: saving would be refused. */
  const stale = draft !== undefined && draft.previous !== saved
  /** The file the draft began on is no longer on disk. */
  const gone = stale && saved === null

  const edit = (value: string) =>
    drafts.setFile(
      file,
      value === saved && !stale ? null : { text: value, previous: draft?.previous ?? saved },
    )

  /**
   * Put a snippet at the cursor (or over the selection) and leave the cursor
   * inside it. While the changes are showing it still lands at the cursor, and
   * shows there as an added line.
   */
  const insert = (snippet: Snippet) => editor.current?.insert(snippet)

  /** The editor remembers Formatted or Markdown; the changes are a look, and are not kept. */
  const look = (next: View | null) => {
    if (!next) return
    setShowDiff(next === 'changes')
    // A file that is not Markdown has no view to remember.
    if (markdown && next !== 'changes' && next !== mode) setMode(next)
  }

  /**
   * Open what changed since the newest version: in the open file when it has
   * changes, else in the first file that has some.
   */
  const openEdits = () => {
    const changed = kept.data ? changedSince(kept.data.files, files, edits, paths) : []
    const target = changed.includes(file) || !changed.length ? file : changed[0]
    setSince('version')
    setShowDiff(true)
    if (version || target !== file) go('editor', { file: target })
  }

  /** Put a template's body under the front matter of an empty SKILL.md. */
  const startFrom = (template: SkillTemplate) => {
    edit(applyTemplate(text, template, state.skill.name))
    requestAnimationFrame(() => editor.current?.focus())
  }

  const drop = (path: string) => drafts.setFile(path, null)

  /** The skill these files belong to: a step that ends after another was opened leaves that one alone. */
  const skill = state.skill.path

  const save = () => {
    if (!draft || !isDirty(file) || busy || deleting) return
    const sent = draft
    void runSave(async () => {
      await api.saveSkillFile(file, sent.text, sent.previous)
      // Cleared in the drafts of the skill it was saved in, open or not: left, it would read as a
      // draft begun on the file from before the save.
      if (currentSkill() !== skill) {
        drafts.savedFile(file, sent.text, skill)
        return
      }
      // The saved copy and the draft move together, so the text in the editor never steps back
      // to the file from before the save. What was typed while it was written stays a draft.
      disk.took(file, sent.text)
      drafts.savedFile(file, sent.text)
      await reload()
      report(`Saved ${file}`)
    })
  }

  /** Where the name being typed would go, or the sentence that says why it cannot be used. */
  const place = (name: string) =>
    naming ? placeNew(naming.kind, name, naming.folder, paths) : { error: '' }

  const named = (name: string) => {
    const placed = place(name)
    if (!naming || 'error' in placed) return
    // A folder is kept by the files in it, so naming one goes on to its first file.
    if (naming.kind === 'folder') return setNaming({ kind: 'file', folder: placed.path })
    // A Markdown file starts from the outline of a reference; any other starts empty.
    const text = isMarkdownPath(placed.path) ? referenceTemplate(placed.path) : ''
    drafts.setFile(placed.path, { text, previous: null })
    setNaming(null)
    go('editor', { file: placed.path })
  }

  /** Let go of a file's unsaved text: its changes, or all of a file not saved yet. */
  const discard = async (path = file) => {
    const fresh = files[path] === undefined
    if (
      await confirm({
        title: fresh ? `Discard the new file ${path}?` : `Discard your changes to ${path}?`,
        description: fresh ? 'What you typed goes.' : 'The file stays as it was last saved.',
        action: 'Discard',
        destructive: true,
      })
    ) {
      drop(path)
      if (fresh && path === file) go('editor', {}, { replace: true })
    }
  }

  const remove = async (path = file) => {
    const ok = await confirm({
      title: `Delete ${path}?`,
      description: 'Past runs keep their copy.',
      action: 'Delete',
      destructive: true,
    })
    if (!ok) return
    setDeletingPath(path)
    void runDelete(async () => {
      await api.deleteSkillFile(path)
      if (currentSkill() !== skill) return
      disk.took(path, null)
      drop(path)
      forgetEditor(`${skill}:${path}`)
      if (path === file) go('editor', {}, { replace: true })
      await reload()
      report(`Deleted ${path}`)
    })
  }

  /** What a right-click on a folder offers, and on a file before its own: a new one, there. */
  const addActions = (folder: string) => (
    <>
      <RowAction
        icon={<FilePlusIcon aria-hidden="true" />}
        onSelect={() => setNaming({ kind: 'file', folder })}
      >
        Add a file
      </RowAction>
      <RowAction
        icon={<FolderPlusIcon aria-hidden="true" />}
        onSelect={() => setNaming({ kind: 'folder', folder })}
      >
        Add a folder
      </RowAction>
    </>
  )
  /** A right-click on a file: a new one beside it, and the way to be rid of it. */
  const fileActions = (path: string) => (
    <>
      {addActions(folderOf(path))}
      {path === 'SKILL.md' ? null : path in files || disk.others.includes(path) ? (
        <RowAction
          icon={<Trash2Icon aria-hidden="true" />}
          tone="destructive"
          // One save or delete at a time, as the open file's buttons wait on each other.
          disabled={busy || deleting}
          onSelect={() => void remove(path)}
        >
          Delete file
        </RowAction>
      ) : (
        <RowAction
          icon={<Trash2Icon aria-hidden="true" />}
          tone="destructive"
          onSelect={() => void discard(path)}
        >
          Discard new file
        </RowAction>
      )}
    </>
  )

  const isSkill = file === 'SKILL.md'
  const deleteFile = (
    <Button
      type="button"
      variant="destructive-ghost"
      size="sm"
      disabled={busy || deleting}
      busy={deleting && deletingPath === file}
      busyLabel="Deleting…"
      onClick={() => void remove()}
    >
      Delete file
    </Button>
  )
  const meta = isSkill ? readFrontMatter(text).meta : {}
  /** The bullets are the rules Jev grades, so the editor marks them; not when bench.json names its own. */
  const graded = isSkill && !config.rules?.length
  /**
   * Read against the version while there is one; else against the last save.
   * The last save is a choice only while the file holds unsaved text: with
   * none, it would show nothing, so it is not offered.
   */
  const unsavedHere = isDirty(file)
  const against: Since = base ? (unsavedHere ? since : 'version') : 'save'
  /** The file as the changes are read against it; null until the version's copy is read. A file it does not hold was added since. */
  const was = against === 'save' ? (saved ?? '') : kept.data ? (kept.data.files[file] ?? '') : null
  const diff = useMemo(
    () => (showDiff && was !== null ? lineDiff(was, text) : []),
    [showDiff, was, text],
  )
  /** SKILL.md says nothing yet: the sidebar shows how to write a rule and keeps the rest for later. */
  const blank = isSkill && isScaffold(text)
  /**
   * The practice skill, run and its results read, still holding its vague
   * rule: offer the exact one. Not before the results: the walkthrough has the
   * reader find what the notes missed first, and the offer would answer it.
   */
  const tightened =
    isSkill && state.practice && state.runs.length && state.practiceSeen.includes('results')
      ? applyPracticeEdit(text)
      : null

  // Select the rule the reader came for, once the file is in the editor. The
  // selection opens the popout on it, as a click on its number does.
  const ready = Boolean(disk.saved) && drafts.status !== 'loading' && !version && !showDiff
  const revealed = useRef<string | null>(null)
  useEffect(() => {
    const visit = `${route.index}:${wanted}`
    if (!wanted || !ready || !isSkill || revealed.current === visit) return
    revealed.current = visit
    const scan = scanRules(text)
    const span = scan.spans[scan.rules.findIndex((r) => r.text === wanted)]
    // The editor mounted in this same commit, and a child's effects run before its parent's.
    if (span) editor.current?.selectLines(span.from, span.to)
  }, [wanted, ready, isSkill, text, route.index])

  if (disk.error && !disk.saved)
    return (
      <EmptyState
        size="screen"
        title="Could not read the skill’s files"
        actions={
          <Button type="button" busy={disk.loading} busyLabel="Trying again…" onClick={disk.reload}>
            Try again
          </Button>
        }
      >
        {disk.error}
      </EmptyState>
    )
  if (!disk.saved || drafts.status === 'loading') return <Loading size="screen" />

  // A block that cannot be read says so, not that its fields are missing.
  const head = isSkill ? headProblems(text, state.skill.path.split(/[\\/]/).pop() ?? '') : []
  const unreadable = isSkill && frontMatterUnreadable(text)
  const missing =
    isSkill && !unreadable ? ['name', 'description'].filter((k) => !metaText(meta, k)) : []
  // Read all the same, as Claude Code reads it, but a stricter app drops the whole block.
  const quotes = isSkill ? frontMatterQuotes(text) : null
  const { current, versions } = state.versions
  const newest = versions.at(-1)
  const versionRow = (v: (typeof versions)[number]) => {
    const { score, why } = scores.get(v.version) ?? { score: null, why: 'not run yet' }
    return (
      <li key={v.version}>
        <NavButton
          current={v.version === version}
          arrived={arrivedVersion(v.version)}
          onClick={() => go('editor', { version: v.version })}
          end={score === null ? null : <ListScore total={score} />}
        >
          <NavButtonTitle>
            {v.version}
            {v.name ? ` · ${v.name}` : ''}
          </NavButtonTitle>
          <NavButtonMeta>
            {capital(
              [
                v.date ? shortDate(v.date) : null,
                // The score is the chip at the row's end: the line says why there is none, or whose it is.
                why,
                // The newest is the files unless they changed; a restored one says so.
                v !== newest && !current.changed && v.version === current.version
                  ? 'in the files now'
                  : null,
              ]
                .filter(Boolean)
                .join(' · '),
            )}
          </NavButtonMeta>
        </NavButton>
      </li>
    )
  }

  /**
   * What to know about the file before editing it: a newer copy on disk,
   * missing front matter, a tool that reinstalls the skill over these edits.
   */
  const notes =
    stale || missing.length || quotes || head.length || state.source ? (
      <>
        {stale ? (
          <Alert variant="warning" role="status">
            <AlertTitle>
              {file} was {gone ? 'deleted' : 'changed'} outside the app while you were editing
            </AlertTitle>
            <AlertDescription>
              <p>
                {gone
                  ? 'Keep your edits to save them as a new file, or discard them.'
                  : 'Keep your edits to save over that change, or take the changed file.'}
              </p>
            </AlertDescription>
            <AlertAction>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => draft && drafts.setFile(file, { ...draft, previous: saved })}
              >
                Keep my edits
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  drop(file)
                  if (gone) go('editor', {}, { replace: true })
                }}
              >
                {gone ? 'Discard my edits' : 'Take the changed file'}
              </Button>
            </AlertAction>
          </Alert>
        ) : null}
        {missing.length ? (
          <Alert variant="warning">
            <AlertTitle>The skill needs a {missing.join(' and a ')}</AlertTitle>
            <AlertDescription>
              {/* One paragraph: the description is a grid, and a bare code span would be a row of its own. */}
              <p>
                Add it between the <Code>---</Code> lines at the top. It decides when the skill gets
                used.
              </p>
            </AlertDescription>
          </Alert>
        ) : null}
        {quotes ? (
          <Alert variant="warning">
            <AlertTitle>
              {fieldNames(quotes.keys)} {quotes.keys.length === 1 ? 'has' : 'have'} a colon some
              apps cannot read
            </AlertTitle>
            <AlertDescription>
              <p>
                Quotes around {quotes.keys.length === 1 ? 'it' : 'them'} keep{' '}
                {quotes.keys.length === 1 ? 'it' : 'them'} whole wherever the skill is used.
              </p>
            </AlertDescription>
            <AlertAction>
              <Button type="button" variant="outline" size="sm" onClick={() => edit(quotes.text)}>
                Add quotes
              </Button>
            </AlertAction>
          </Alert>
        ) : null}
        {head.map((problem) => (
          <Alert variant="warning" key={problem.title}>
            <AlertTitle>{problem.title}</AlertTitle>
            <AlertDescription>
              <p>{problem.detail}</p>
            </AlertDescription>
          </Alert>
        ))}
        {state.source ? (
          <Alert variant="muted">
            <AlertTitle>Installed from {state.source}</AlertTitle>
            <AlertDescription>
              <p>Updating it from there replaces this folder, and your edits with it.</p>
            </AlertDescription>
          </Alert>
        ) : null}
      </>
    ) : null

  return (
    <Workbench>
      {/* The document is the screen's point: once the columns stack, its files follow it. */}
      <Column kind="side">
        <ListHeader
          title="Files"
          count={paths.length}
          addLabel="Add a file"
          addIcon={<FilePlusIcon aria-hidden="true" />}
          addDisabled={naming !== null}
          // Beside the file that is open: in its folder, or by SKILL.md.
          onAdd={() => setNaming({ kind: 'file', folder: folderOf(file) })}
          also={{
            label: 'Add a folder',
            icon: <FolderPlusIcon aria-hidden="true" />,
            onAdd: () => setNaming({ kind: 'folder', folder: folderOf(file) }),
          }}
        />
        <ColumnSection inset="list" as="nav" label="Skill files">
          <FileTree
            // A folder just named holds nothing yet, and is listed for the file it waits on.
            tree={fileTree(paths, naming?.folder ? [naming.folder] : [])}
            current={version ? null : file}
            unsaved={isDirty}
            arrived={arrivedFile}
            onOpen={(path) => go('editor', { file: path })}
            fileActions={fileActions}
            folderActions={addActions}
            naming={naming}
            checkName={(name) => {
              const placed = place(name)
              return 'error' in placed ? placed.error : null
            }}
            onName={named}
            onCancelName={() => setNaming(null)}
          />
        </ColumnSection>

        {blank && !versions.length && !trashed.length ? null : (
          <ColumnSection
            inset="list"
            title="Versions"
            // Only edits no version holds need a word: unchanged files are a version in the list.
            // It names no version they came from: after a restore that is not the newest.
            // Before the first run there is no version to stand in the list, so a line says what makes one.
            hint={
              current.changed && !newest
                ? `The first run keeps the files as ${current.version}.`
                : null
            }
          >
            {versions.length ? (
              <PlainList gap="xs" bleed>
                {edited ? (
                  <li key={EDITS}>
                    <NavButton
                      current={!version && showDiff}
                      arrived={arrivedVersion(EDITS)}
                      onClick={openEdits}
                    >
                      {/* The dot: some of these edits are not saved, and a run tests the files as saved. */}
                      <NavButtonTitle unsaved={paths.some(isDirty)}>{edited}</NavButtonTitle>
                      <NavButtonMeta>Not run yet</NavButtonMeta>
                    </NavButton>
                  </li>
                ) : null}
                {shownVersions.map(versionRow)}
              </PlainList>
            ) : null}
            {olderVersions.length ? (
              <Disclosure
                summary={`${olderVersions.length} older versions`}
                open={olderOpen}
                onOpenChange={setOlderOpen}
              >
                <PlainList gap="xs" bleed>
                  {olderVersions.map(versionRow)}
                </PlainList>
              </Disclosure>
            ) : null}
            {trashed.length ? (
              <Disclosure summary="Recently deleted" detail={deletesLine(trashed)}>
                <Rows as="ul">
                  {trashed.map((gone) => (
                    <li key={gone.undo} className="flex min-h-9 items-center gap-2">
                      <span className="flex min-w-0 flex-1 flex-col">
                        <Text size="ui" truncate>
                          {deletedName(gone)}
                        </Text>
                        <Text size="xs" tone="muted">
                          Deleted {stamp(gone.deletedAt) ?? gone.deletedAt}
                        </Text>
                      </span>
                      <Button
                        type="button"
                        variant="ghost-muted"
                        size="xs"
                        aria-label={`Undo: ${deletedName(gone)}`}
                        disabled={undoing !== null && undoing !== gone.undo}
                        busy={undoing === gone.undo}
                        busyLabel="Undoing…"
                        onClick={() => void undelete(gone)}
                      >
                        Undo
                      </Button>
                    </li>
                  ))}
                </Rows>
              </Disclosure>
            ) : null}
          </ColumnSection>
        )}
        {/* A rule or a process is Markdown: a script or a data file takes none. */}
        {markdown && !notText ? (
          <ColumnSection inset="list" title="Insert">
            <Toolbar>
              {SNIPPETS.map((s) => (
                <Button
                  key={s.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => insert(s)}
                >
                  {s.label}
                </Button>
              ))}
            </Toolbar>
            <GuideBox summary="How to write a rule" defaultOpen={blank}>
              <GuideList>
                {RULE_GUIDE.map((item) => (
                  <li key={item.lead}>
                    <b>{item.lead}</b> {item.text}
                  </li>
                ))}
              </GuideList>
            </GuideBox>
          </ColumnSection>
        ) : null}
      </Column>

      {version ? (
        <Column>
          <VersionDetail key={version} ctx={ctx} version={version} />
        </Column>
      ) : notText ? (
        <Column>
          <ColumnHeader>
            <ColumnTitle>
              <Text font="mono" size="ui" weight="medium">
                {file}
              </Text>
            </ColumnTitle>
            {deleteFile}
          </ColumnHeader>
          <EmptyState title="This file cannot be opened here">
            It is not text, or it is too large. It is still part of the skill and of every version.
          </EmptyState>
        </Column>
      ) : (
        <Column>
          {/* On a narrow window the file's name takes the first row and its actions the second, so the name is never squeezed out. */}
          <ColumnHeader className="max-lg:flex-wrap">
            <ColumnTitle className="max-lg:basis-full">
              <Text font="mono" size="ui" weight="medium">
                {file}
              </Text>
              <DraftNote
                drafts={drafts}
                dirty={isDirty(file)}
                saved={saved === null ? 'New, not saved yet' : 'Saved'}
              />
            </ColumnTitle>
            <Segmented<View>
              aria-label="View"
              value={showDiff ? 'changes' : markdown ? mode : 'markdown'}
              onChange={look}
              options={markdown ? VIEWS : TEXT_VIEWS}
            />
            {!isSkill && saved !== null ? deleteFile : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!isDirty(file) || busy || deleting}
              onClick={() => void discard()}
            >
              Discard
            </Button>
            {/* The label holds still while the file is written, so the row does not shift. */}
            <Button
              type="button"
              variant={isDirty(file) ? 'default' : 'ghost'}
              size="sm"
              disabled={!isDirty(file) || stale || deleting}
              busy={busy}
              busyLabel="Saving…"
              onClick={save}
              title={shortcut('S')}
            >
              Save
            </Button>
          </ColumnHeader>
          <MarkdownEditor
            key={file}
            id={`${skill}:${file}`}
            ref={editor}
            mode={markdown ? mode : 'markdown'}
            plain={!markdown}
            instead={
              showDiff ? (
                <ColumnBody>
                  {notes}
                  {base ? (
                    // As tall as the switch, so the line holds still when the switch comes or goes.
                    <Toolbar className="min-h-8 pointer-coarse:min-h-11">
                      <Text tone="muted" size="ui" id="changes-since">
                        Changes since
                      </Text>
                      {unsavedHere ? (
                        <Segmented<Since>
                          aria-labelledby="changes-since"
                          value={since}
                          onChange={(next) => next && setSince(next)}
                          options={[
                            { value: 'version', label: base },
                            { value: 'save', label: 'The last save' },
                          ]}
                        />
                      ) : (
                        <Text size="ui" tabular>
                          {base}
                        </Text>
                      )}
                    </Toolbar>
                  ) : null}
                  {was === null ? (
                    kept.error ? (
                      <ReadFailed
                        size="compact"
                        title={`Could not read ${base}`}
                        retrying={kept.loading}
                        onRetry={kept.reload}
                      >
                        {kept.error}
                      </ReadFailed>
                    ) : (
                      <Loading />
                    )
                  ) : diff.length ? (
                    <DiffLines lines={diff} />
                  ) : against === 'version' ? (
                    <Hint>No changes since {base}.</Hint>
                  ) : base ? (
                    <Hint>No changes since the last save.</Hint>
                  ) : (
                    <Hint>
                      No changes since the last save. The first run keeps a version to compare with.
                    </Hint>
                  )}
                </ColumnBody>
              ) : undefined
            }
            aria-label={`Contents of ${file}`}
            placeholder={
              isSkill
                ? 'One rule per bullet, with its why.'
                : markdown
                  ? 'Longer material SKILL.md points to. Say first when to read it.'
                  : undefined
            }
            value={text}
            onChange={edit}
            onSave={save}
            graded={graded}
            rates={rates}
            refine={
              isSkill
                ? {
                    description: metaText(meta, 'description') ?? state.skill.description,
                    onError: (message) => report(message, { tone: 'destructive' }),
                    onReplaced: (undo, from) =>
                      report(
                        // One rule became several: the numbers under it moved, so say what happened.
                        from.split
                          ? `Split ${from.rule ? `rule ${from.rule}` : 'the rule'} into ${from.split} rules.`
                          : from.panel
                            ? `Applied the draft${from.rule ? ` to rule ${from.rule}` : ''}.`
                            : 'Replaced the selection.',
                        { undo },
                      ),
                    confirm,
                  }
                : undefined
            }
            // "Write with AI" writes Markdown: SKILL.md, or a file it points to.
            assist={
              markdown
                ? {
                    field: isSkill ? 'skill.file' : 'skill.reference',
                    blank,
                    // A reference is written to serve the skill it belongs to.
                    context: () =>
                      isSkill
                        ? []
                        : [
                            {
                              label: 'SKILL.md',
                              text: edits['SKILL.md']?.text ?? files['SKILL.md'] ?? '',
                            },
                          ],
                  }
                : undefined
            }
            banner={
              // The practice skill needs no introduction here: the walkthrough in the sidebar says what it is.
              notes || blank || tightened ? (
                <>
                  {notes}
                  {tightened ? (
                    <Starter
                      aria-label="Tighten this rule"
                      title="Tighten this rule"
                      hint="Swap the vague rule for the exact one, or write your own. Then save."
                    >
                      <PairList pairs={[PRACTICE_EDIT]} marks={['vague', 'exact']} />
                      <Toolbar>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            edit(tightened)
                            requestAnimationFrame(() => editor.current?.focus())
                          }}
                        >
                          Use the exact rule
                        </Button>
                      </Toolbar>
                    </Starter>
                  ) : null}
                  {blank ? (
                    <BlankStart onTemplate={startFrom} onAssist={() => editor.current?.assist()} />
                  ) : null}
                </>
              ) : null
            }
          />
        </Column>
      )}
    </Workbench>
  )
})
