/**
 * An assistant reply with the changes it proposes to the open skill. Prose
 * reads as prose; the changes stand under it as one list, a row each: what it
 * changes, how much, and one button. A row opens to the file's diff or the
 * case. Applying goes through the operations the Skill and Cases screens
 * use, so the backend checks it as it checks them, and the status
 * line offers Undo. A reply's changes apply only to the skill it was written
 * about.
 */
import { caseName, draftOf } from '@domain/case-draft.ts'
import {
  caseHolds,
  changeDraft,
  type ReplyPart,
  replyParts,
  type SkillChange,
} from '@domain/changes.ts'
import { type ReactNode, useMemo } from 'react'
import { api } from '../api.ts'
import {
  type CaseStanding,
  caseDetail,
  caseLabels,
  caseTarget,
  fileDetail,
  fileDone,
  fileStanding,
  legacyCase,
  losesEdits,
  replaceWarning,
  shownText,
  showsDiff,
  unsavedFiles,
  versionDetail,
  versionSaved,
} from '../changes.ts'
import type { Ctx } from '../ctx.ts'
import { lineDiff } from '../diff.ts'
import { caseUnsaved } from '../draft-edits.ts'
import { type Reporter, useAction } from '../hooks.ts'
import { inSkill } from '../in-skill.ts'
import { useArrived } from '../motion.ts'
import { reportFailure } from '../transport.ts'
import { DiffLines } from './DiffLines.tsx'
import { Disclosure, DisclosureList } from './Disclosure.tsx'
import { List, Stack, Toolbar } from './layout.tsx'
import { Prose } from './Prose.tsx'
import { CheckWeight } from './Scores.tsx'
import { Status } from './Status.tsx'
import { Hint, Text } from './text.tsx'
import { Button } from './ui/button.tsx'

/** Where changes land: the open skill and its files as saved. */
export interface ChangeHost {
  /** The open skill; null when none is open. */
  ctx: Ctx | null
  /** The open skill's files as saved, by path; null until read. */
  files: Record<string, string> | null
  /** Why the files could not be read; null while they are being read or once they have been. */
  filesProblem?: string | null
  /** Read the files again, and whether that read is on its way. */
  readFiles?: { run: () => void; running: boolean }
}

/** A file row's detail while the saved file is unknown because it could not be read; null while it is being read. */
const unreadDetail = (host: ChangeHost): string | null =>
  host.filesProblem ? 'Could not read the saved file.' : null

type Change<K extends SkillChange['kind']> = Extract<SkillChange, { kind: K }>

/** How every row of a reply stands: still arriving, offered, or not on offer and why. */
export type Offer = { kind: 'writing' } | { kind: 'open' } | { kind: 'blocked'; reason: string }

/** Why a reply's changes cannot be applied now; null when they can. */
function blockedBy(host: ChangeHost, skill: string | undefined): string | null {
  if (!host.ctx) return 'Open the skill these were written for to apply them.'
  if (skill !== host.ctx.state.skill.path)
    return 'These were written for another skill. Open it to apply them.'
  return null
}

/**
 * A file's name and the folder it sits in. The name is the row's title and the
 * folder rides on the detail line, so a long path never cuts off the name.
 */
const splitPath = (path: string): { name: string; folder: string } => {
  const name = path.split('/').at(-1) ?? path
  return { name, folder: path.slice(0, -name.length) }
}

/** A row's title over a line of detail. */
export function Summary({
  title,
  detail,
  mono,
}: {
  title: string
  detail: ReactNode
  mono?: boolean
}) {
  return (
    <span className="flex min-w-0 flex-col">
      <Text font={mono ? 'mono' : 'sans'} size="ui" truncate>
        {title}
      </Text>
      <Text tone="muted" size="xs" tabular>
        {detail}
      </Text>
    </span>
  )
}

/**
 * The end of a row: the button that applies it, or once it stands in the
 * skill, the word that says so. The word fades in when a click put it there.
 */
function Action({
  host,
  offer,
  label,
  busyLabel,
  doneLabel,
  done,
  onApply,
}: {
  host: ChangeHost
  offer: Offer
  label: string
  busyLabel: string
  doneLabel: string
  done: boolean
  onApply: () => Promise<void>
}) {
  // With no skill open the row is not on offer; a failure then has only the shell to say it.
  const [busy, run] = useAction(host.ctx?.report ?? unawaited)
  return (
    <RowAction
      offer={offer}
      label={label}
      busy={busy}
      busyLabel={busyLabel}
      doneLabel={doneLabel}
      done={done}
      onApply={() => void run(onApply)}
    />
  )
}

/**
 * The end of a proposed change's row, wherever a reply proposes one: nothing
 * while it is written, then one outline button, then once the change stands
 * where it goes, the word that says so, fading in when a click put it there.
 */
export function RowAction({
  offer,
  label,
  busy = false,
  busyLabel,
  doneLabel,
  done,
  onApply,
}: {
  offer: Offer
  label: string
  busy?: boolean
  busyLabel?: string
  doneLabel: string
  done: boolean
  onApply: () => void
}) {
  const arrived = useArrived(String(done))
  if (offer.kind === 'writing') return null
  if (done)
    return (
      <span className={arrived ? 'animate-ink' : undefined}>
        <Status tone="success" size="ui" stamp={arrived}>
          {doneLabel}
        </Status>
      </span>
    )
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="w-full"
      disabled={offer.kind === 'blocked'}
      busy={busy}
      busyLabel={busyLabel}
      onClick={onApply}
    >
      {label}
    </Button>
  )
}

/** Say a failure where no skill's status line is in reach. */
const unawaited: Reporter = (message) =>
  reportFailure(typeof message === 'string' ? new Error(message) : message)

const REPLACE_EDITS = (path: string) => ({
  title: `Replace your unsaved changes to ${path}?`,
  description:
    'The assistant’s text takes their place. Undo brings back the saved file, not the unsaved changes.',
  action: 'Replace',
  destructive: true,
})

/** Put a file back as it was before a change: gone when it was new, else its saved text. */
const restoreFile = (path: string, before: string | null, after: string) =>
  before === null ? api.deleteSkillFile(path) : api.saveSkillFile(path, before, after)

function FileRow({
  change,
  host,
  offer,
  className,
}: {
  change: Change<'file'>
  host: ChangeHost
  offer: Offer
  className?: string
}) {
  const { path, text } = change
  const { name, folder } = splitPath(path)
  // Against the file as saved, and the reader's unsaved text, which the assistant read.
  const standing = fileStanding(host.files, host.ctx?.drafts.files ?? {}, path, text)
  const { before } = standing
  const shown = shownText(standing)
  const lines = useMemo(() => lineDiff(shown ?? '', text), [shown, text])
  const done = fileDone(standing)
  const apply = async () => {
    const { ctx } = host
    if (!ctx || before === undefined) return
    // Saving over unsaved edits drops them, and Undo cannot bring them back: ask first.
    if (losesEdits(standing) && !(await ctx.confirm(REPLACE_EDITS(path)))) return
    try {
      await api.saveSkillFile(path, text, before)
      // The saved copy and the draft move together, so an open editor goes straight to the new text.
      ctx.files.took(path, text)
      ctx.drafts.setFile(path, null)
      await ctx.reload()
      ctx.report(before === null ? `Created ${path}` : `Applied the change to ${path}`, {
        undo: inSkill(ctx, () => restoreFile(path, before, text)),
      })
    } catch (e) {
      ctx.report(e as Error)
    }
  }
  return (
    <Disclosure
      variant="row"
      className={className}
      summary={
        <Summary
          mono
          title={name}
          detail={[
            folder,
            (before === undefined && unreadDetail(host)) || fileDetail(standing, lines),
          ]
            .filter(Boolean)
            .join(' · ')}
        />
      }
      action={
        <Action
          host={host}
          offer={before === undefined ? { kind: 'writing' } : offer}
          label={before === null ? 'Create' : 'Apply'}
          busyLabel={before === null ? 'Creating…' : 'Applying…'}
          doneLabel="Applied"
          done={done}
          onApply={apply}
        />
      }
    >
      {showsDiff(standing) ? <DiffLines lines={lines} /> : undefined}
    </Disclosure>
  )
}

/** One part of a case: a label in small caps over its text. */
function CasePart({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Stack gap="xs">
      <Text size="xs" caps tone="muted">
        {label}
      </Text>
      {children}
    </Stack>
  )
}

const REPLACE_CASE = (name: string, standing: CaseStanding) => ({
  title: `Replace the case ${name}?`,
  description: replaceWarning(standing),
  action: 'Replace',
  destructive: true,
})

function CaseRow({
  change,
  host,
  offer,
  className,
}: {
  change: Change<'case'>
  host: ChangeHost
  offer: Offer
  className?: string
}) {
  const { saved, id, title, twin } = caseTarget(change, host.ctx?.state.cases ?? [])
  const standing = {
    saved,
    done: caseHolds(change, saved),
    drafted: saved !== undefined && caseUnsaved(host.ctx?.drafts.cases[saved.id], draftOf(saved)),
    twin: twin ? caseName(twin) : undefined,
  }
  const name = caseName({ id, title, prompt: change.prompt })
  const labels = caseLabels(standing)
  const apply = async () => {
    const { ctx } = host
    if (!ctx) return
    if (saved && !(await ctx.confirm(REPLACE_CASE(caseName(saved), standing)))) return
    try {
      await api.saveCase({ ...changeDraft(change, saved), id, title }, !saved)
      if (saved) ctx.drafts.setCase(saved.id, null)
      await ctx.reload()
      ctx.report(
        `${saved ? 'Replaced' : 'Added'} the case ${name}`,
        saved
          ? { action: { label: 'Open', run: () => ctx.go('cases', { id }) } }
          : { undo: inSkill(ctx, () => api.deleteCase(id)) },
      )
    } catch (e) {
      ctx.report(e as Error)
    }
  }
  return (
    <Disclosure
      variant="row"
      className={className}
      summary={<Summary title={name} detail={caseDetail(standing, change.checks.length)} />}
      action={
        <Action
          host={host}
          offer={legacyCase(standing) ? { kind: 'blocked', reason: '' } : offer}
          label={labels.label}
          busyLabel={labels.busy}
          doneLabel={labels.done}
          done={standing.done}
          onApply={apply}
        />
      }
    >
      <Stack gap="md">
        <CasePart label="Prompt">
          <Text as="p" size="ui" wrap="pre">
            {change.prompt}
          </Text>
        </CasePart>
        {change.expected ? (
          <CasePart label="A good answer">
            <Text as="p" size="ui">
              {change.expected}
            </Text>
          </CasePart>
        ) : null}
        {change.checks.length ? (
          <CasePart label="Checks">
            <List variant="number" gap="sm">
              {change.checks.map((check) => (
                <Text as="li" size="ui" key={check.statement}>
                  {check.statement}
                  <CheckWeight weight={check.weight} />
                </Text>
              ))}
            </List>
          </CasePart>
        ) : null}
      </Stack>
    </Disclosure>
  )
}

function VersionRow({
  change,
  host,
  offer,
  className,
}: {
  change: Change<'version'>
  host: ChangeHost
  offer: Offer
  className?: string
}) {
  const versions = host.ctx?.state.versions
  const saved = versionSaved(versions, change.name)
  // A version keeps the files as saved. Unsaved edits, which the assistant read, would not be in it.
  // A draft that says what the file on disk says is none.
  const unsaved = saved ? 0 : unsavedFiles(host.files, host.ctx?.drafts.files ?? {}).length
  const apply = async () => {
    const { ctx } = host
    if (!ctx || !versions) return
    try {
      const version = await api.saveVersion(change.name, '')
      await ctx.reload()
      ctx.report(`Saved ${version.version}`, {
        action: { label: 'Open', run: () => ctx.go('editor', { version: version.version }) },
      })
    } catch (e) {
      ctx.report(e as Error)
    }
  }
  return (
    <Disclosure
      variant="row"
      className={className}
      summary={
        <Summary
          title={change.name}
          detail={
            unsaved
              ? `Save your ${unsaved === 1 ? 'unsaved file' : `${unsaved} unsaved files`} on the Skill screen first`
              : versionDetail(versions, saved)
          }
        />
      }
      action={
        <Action
          host={host}
          offer={unsaved ? { kind: 'blocked', reason: '' } : offer}
          label="Save"
          busyLabel="Saving…"
          doneLabel="Saved"
          done={saved !== undefined}
          onApply={apply}
        />
      }
    />
  )
}

/** A change still arriving: its label, which is a path when the model has written one. */
export function WritingRow({ label, className }: { label: string; className?: string }) {
  const file = label.includes('.') ? splitPath(label) : null
  return (
    <Disclosure
      variant="row"
      className={className}
      summary={
        <Summary
          mono={Boolean(file)}
          title={file?.name ?? label}
          detail={
            <>
              {file?.folder ? `${file.folder} · ` : ''}
              <span className="animate-pulse">Writing…</span>
            </>
          }
        />
      }
    />
  )
}

/** One row of the list: a change, or one still being written. */
function Row({ part, host, offer }: { part: ChangeRowPart; host: ChangeHost; offer: Offer }) {
  // Rows that arrive while a reply is written fade in; a finished reply's rows are at rest.
  const className = offer.kind === 'writing' ? 'animate-ink' : undefined
  if (part.kind === 'writing') return <WritingRow label={part.label} className={className} />
  const props = { host, offer, className }
  const { change } = part
  if (change.kind === 'file') return <FileRow change={change} {...props} />
  if (change.kind === 'case') return <CaseRow change={change} {...props} />
  return <VersionRow change={change} {...props} />
}

type ChangeRowPart = Exclude<ReplyPart, { kind: 'prose' }>

const isFileChange = (part: ChangeRowPart): boolean =>
  part.kind !== 'writing' && part.change.kind === 'file'

/** The reply as runs of prose and runs of changes, in order. */
function segments(parts: ReplyPart[]): Array<string | ChangeRowPart[]> {
  const out: Array<string | ChangeRowPart[]> = []
  for (const part of parts) {
    const last = out.at(-1)
    if (part.kind === 'prose') out.push(part.text)
    else if (Array.isArray(last)) last.push(part)
    else out.push([part])
  }
  return out
}

/**
 * A reply as prose and changes. `writing` is a reply still arriving: its
 * changes show as they come, and are offered once it has ended. `skill` is the
 * path of the skill it was written about.
 */
export function Reply({
  text,
  skill,
  writing,
  host,
}: {
  text: string
  skill: string | undefined
  writing: boolean
  host: ChangeHost
}) {
  const parts = useMemo(() => segments(replyParts(text, { partial: writing })), [text, writing])
  const blocked = writing ? null : blockedBy(host, skill)
  const offer: Offer = writing
    ? { kind: 'writing' }
    : blocked
      ? { kind: 'blocked', reason: blocked }
      : { kind: 'open' }
  // A file change waits on the saved files. When they could not be read, the reply says so once, with the way to try again.
  const unread =
    offer.kind === 'open' &&
    host.filesProblem &&
    parts.some((part) => Array.isArray(part) && part.some(isFileChange))
      ? host.filesProblem
      : null
  return (
    <Stack gap="lg">
      {parts.map((part, i) =>
        typeof part === 'string' ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: a segment has no identity but its place
          <Prose key={i} text={part} density="compact" />
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: as above
          <Stack key={i} gap="sm">
            <DisclosureList label="Proposed changes">
              {part.map((row, k) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: a row keeps its place as the reply grows
                <Row key={k} part={row} host={host} offer={offer} />
              ))}
            </DisclosureList>
            {offer.kind === 'blocked' ? <Hint>{offer.reason}</Hint> : null}
          </Stack>
        ),
      )}
      {unread ? (
        <Toolbar>
          <Hint tone="destructive" role="alert">
            Could not read the skill’s saved files. {unread}
          </Hint>
          {host.readFiles ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              busy={host.readFiles.running}
              busyLabel="Reading…"
              onClick={host.readFiles.run}
            >
              Retry
            </Button>
          ) : null}
        </Toolbar>
      ) : null}
    </Stack>
  )
}
