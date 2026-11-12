/**
 * Write the skill: SKILL.md and references/, edited in place on disk. Every
 * keystroke is kept as a draft, so unsaved text survives a reload or a quit;
 * saving writes the file and clears its draft.
 *
 * The skill's versions are listed under its files. A run keeps the version it
 * tested, so none is saved by hand; opening one shows what changed and offers
 * the way back to it.
 *
 * The file's header holds one switch for what the column shows (the text
 * styled, its Markdown, or what changed since the last save) and the two
 * actions on unsaved work. Save is the one filled button, and only while there
 * is something to save; Discard is always there, so nothing in the row moves
 * on the first keystroke.
 */

import { byFileOrder } from '@domain/paths.ts'
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
import { metaText, readFrontMatter } from '@domain/text.ts'
import { Fragment, memo, useEffect, useMemo, useRef, useState } from 'react'
import { api, currentSkill } from '../api.ts'
import { DiffLines } from '../components/DiffLines.tsx'
import { DraftNote } from '../components/DraftNote.tsx'
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
  Toolbar,
  Workbench,
} from '../components/layout.tsx'
import {
  forgetEditor,
  MarkdownEditor,
  type MarkdownEditorHandle,
  useEditorMode,
} from '../components/MarkdownEditor.tsx'
import { NavButton } from '../components/NavButton.tsx'
import { Segmented } from '../components/Segmented.tsx'
import { Dot } from '../components/Status.tsx'
import { GuideBox, GuideList, PairList, Starter } from '../components/starters.tsx'
import { Code, Hint, Text } from '../components/text.tsx'
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { VersionDetail } from '../components/VersionDetail.tsx'
import type { Ctx } from '../ctx.ts'
import { lineDiff } from '../diff.ts'
import { useAction } from '../hooks.ts'
import { shortcut } from '../keys.ts'
import { shortDate, versionScore } from '../model.ts'
import { editorFile } from '../route.ts'

const referencePath = (name: string): string | null => {
  const clean = name.trim().replace(/^references\//, '')
  if (!/^[\w][\w.-]*(\/[\w][\w.-]*)*$/.test(clean)) return null
  return `references/${/\.\w+$/.test(clean) ? clean : `${clean}.md`}`
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
  { value: 'changes', label: 'Changes', title: 'Read what changed since the file was saved' },
] as const

type View = (typeof VIEWS)[number]['value']

export const Editor = memo(function Editor({ ctx }: { ctx: Ctx }) {
  const { state, route, go, report, confirm, reload, config, drafts, outputs } = ctx
  /** The files as saved: the shell's one copy, which a save here updates at once. */
  const disk = ctx.files
  const edits = drafts.files
  const [showDiff, setShowDiff] = useState(false)
  const [newName, setNewName] = useState<string | null>(null)
  const [busy, runSave] = useAction(report)
  const [deleting, runDelete] = useAction(report)
  /** Each version's score. It reads every output, so it is not worked out again on a keystroke. */
  const scores = useMemo(
    () =>
      new Map(
        state.versions.versions.map((v) => [v.version, versionScore(outputs, config, v.version)]),
      ),
    [state.versions.versions, outputs, config],
  )
  const [mode, setMode] = useEditorMode((message) =>
    report(`Not saved: ${message}`, { tone: 'destructive' }),
  )
  const editor = useRef<MarkdownEditorHandle>(null)
  const nameField = useRef<HTMLInputElement>(null)
  const naming = newName !== null
  useEffect(() => {
    if (naming) nameField.current?.focus()
  }, [naming])

  const files = disk.saved ?? {}
  const paths = [...new Set([...Object.keys(files), ...Object.keys(edits)])].sort(byFileOrder)
  const file = editorFile(route.params)
  /** A version opened from the list: the column shows it in place of the file. */
  const version = route.params.get('version')
  /** A rule someone was sent here to change, by its text: Results links a missed rule to it. */
  const wanted = route.arrival === 'step' ? route.params.get('rule') : null
  const saved = files[file] ?? null
  /** The file's draft. One that says what the file on disk says is none: there is nothing in it to save. */
  const draft = edits[file]?.text === saved ? undefined : edits[file]
  const text = draft?.text ?? saved ?? ''
  const isDirty = (path: string) => edits[path] !== undefined && edits[path].text !== files[path]
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
    if (next !== 'changes' && next !== mode) setMode(next)
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

  const create = () => {
    const path = referencePath(newName ?? '')
    if (!path)
      return report('Use letters, digits, dots, dashes and slashes only.', { tone: 'warning' })
    if (paths.includes(path)) return report(`${path} already exists.`, { tone: 'warning' })
    drafts.setFile(path, { text: referenceTemplate(path), previous: null })
    setNewName(null)
    go('editor', { file: path })
  }

  const discard = async () => {
    if (
      await confirm({
        title:
          saved === null ? `Discard the new file ${file}?` : `Discard your changes to ${file}?`,
        description:
          saved === null ? 'What you typed goes.' : 'The file stays as it was last saved.',
        action: 'Discard',
        destructive: true,
      })
    ) {
      drop(file)
      if (saved === null) go('editor', {}, { replace: true })
    }
  }

  const remove = async () => {
    const ok = await confirm({
      title: `Delete ${file}?`,
      description: 'Past runs keep their copy.',
      action: 'Delete',
      destructive: true,
    })
    if (!ok) return
    void runDelete(async () => {
      await api.deleteSkillFile(file)
      if (currentSkill() !== skill) return
      disk.took(file, null)
      drop(file)
      forgetEditor(`${skill}:${file}`)
      go('editor', {}, { replace: true })
      await reload()
      report(`Deleted ${file}`)
    })
  }

  const isSkill = file === 'SKILL.md'
  const meta = isSkill ? readFrontMatter(text).meta : {}
  /** The bullets are the rules Jev grades, so the editor marks them; not when bench.json names its own. */
  const graded = isSkill && !config.rules?.length
  const diff = showDiff ? lineDiff(saved ?? '', text) : []
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

  const missing = isSkill ? ['name', 'description'].filter((k) => !metaText(meta, k)) : []
  const { current, versions } = state.versions
  const newest = versions.at(-1)

  /**
   * What to know about the file before editing it: a newer copy on disk,
   * missing front matter, a tool that reinstalls the skill over these edits.
   */
  const notes =
    stale || missing.length || state.source ? (
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
              <Toolbar>
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
              </Toolbar>
            </AlertDescription>
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
          addLabel="Add a reference file"
          addDisabled={naming}
          onAdd={() => setNewName('')}
        />
        <ColumnSection inset="list" as="nav" label="Skill files">
          <PlainList gap="none" bleed>
            {paths.map((path) => (
              <li key={path}>
                <NavButton
                  current={!version && path === file}
                  onClick={() => go('editor', { file: path })}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Text font="mono" size="xs" wrap="anywhere" className="min-w-0">
                      {path}
                    </Text>
                    {isDirty(path) ? (
                      <>
                        <Dot size="sm" tone="warning" />
                        <span className="sr-only">, unsaved changes</span>
                      </>
                    ) : null}
                  </span>
                </NavButton>
              </li>
            ))}
          </PlainList>
          {naming ? (
            <form
              className="contents"
              onSubmit={(e) => {
                e.preventDefault()
                create()
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setNewName(null)
              }}
            >
              <Input
                ref={nameField}
                aria-label="Name of the new reference file"
                placeholder="references/name.md"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="done"
                value={newName}
                size="sm"
                font="mono"
                onChange={(e) => setNewName(e.target.value)}
              />
              <Toolbar>
                <Button type="submit" size="sm" disabled={!newName.trim()}>
                  Add file
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setNewName(null)}>
                  Cancel
                </Button>
              </Toolbar>
            </form>
          ) : null}
        </ColumnSection>

        {blank && !versions.length ? null : (
          <ColumnSection
            inset="list"
            title="Versions"
            // Only edits no version holds need a word: unchanged files are a version in the list.
            // It names no version they came from: after a restore that is not the newest.
            hint={
              current.changed
                ? newest
                  ? `The next run keeps your edits as ${current.version}.`
                  : `The first run keeps the files as ${current.version}.`
                : null
            }
          >
            {versions.length ? (
              <PlainList gap="none" bleed>
                {[...versions].reverse().map((v) => {
                  const score = scores.get(v.version) ?? null
                  return (
                    <li key={v.version}>
                      <NavButton
                        current={v.version === version}
                        onClick={() => go('editor', { version: v.version })}
                      >
                        <Text size="ui" truncate block tabular>
                          {v.version}
                          {v.name ? ` · ${v.name}` : ''}
                        </Text>
                        <Text tone="muted" size="xs" tabular>
                          {[
                            v.date ? shortDate(v.date) : null,
                            score === null ? null : `scored ${Math.round(score)}`,
                            // The newest is the files unless they changed; a restored one says so.
                            v !== newest && !current.changed && v.version === current.version
                              ? 'in the files now'
                              : null,
                          ]
                            .filter(Boolean)
                            .join(' · ') || 'Not run yet'}
                        </Text>
                      </NavButton>
                    </li>
                  )
                })}
              </PlainList>
            ) : null}
          </ColumnSection>
        )}
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
      </Column>

      {version ? (
        <Column>
          <VersionDetail key={version} ctx={ctx} version={version} />
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
              value={showDiff ? 'changes' : mode}
              onChange={look}
              options={VIEWS}
            />
            {!isSkill && saved !== null ? (
              <Button
                type="button"
                variant="destructive-ghost"
                size="sm"
                disabled={busy}
                busy={deleting}
                busyLabel="Deleting…"
                onClick={remove}
              >
                Delete file
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!isDirty(file) || busy || deleting}
              onClick={discard}
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
            mode={mode}
            instead={
              showDiff ? (
                <ColumnBody>
                  {notes}
                  {diff.length ? (
                    <DiffLines lines={diff} />
                  ) : (
                    <Hint>No changes since the last save.</Hint>
                  )}
                </ColumnBody>
              ) : undefined
            }
            aria-label={`Contents of ${file}`}
            placeholder={
              isSkill
                ? 'One rule per bullet, with its why.'
                : 'Longer material SKILL.md points to. Say first when to read it.'
            }
            value={text}
            onChange={edit}
            onSave={save}
            graded={graded}
            refine={
              isSkill
                ? {
                    description: metaText(meta, 'description') ?? state.skill.description,
                    onError: (message) => report(message, { tone: 'destructive' }),
                    onReplaced: (undo, from) =>
                      report(
                        from.panel
                          ? `Applied the draft${from.rule ? ` to rule ${from.rule}` : ''}.`
                          : 'Replaced the selection.',
                        { undo },
                      ),
                    confirm,
                  }
                : undefined
            }
            assist={{
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
            }}
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
