/**
 * One version of the skill, opened from the list beside the editor: what
 * changed between it and the files now, or between it and the version before,
 * file by file, with the way back to it. A run keeps the version it tested, so
 * there is always a copy to read and restore; one saved by hand keeps its own.
 */
import { byFileOrder } from '@domain/paths.ts'
import type { SkillVersion } from '@domain/views.ts'
import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api.ts'
import type { Ctx } from '../ctx.ts'
import { lineDiff } from '../diff.ts'
import { useFetch } from '../hooks.ts'
import { inSkill } from '../in-skill.ts'
import {
  capital,
  countsLine,
  countsOf,
  plural,
  shortDate,
  versionOutputs,
  versionReading,
} from '../model.ts'
import { restoreAsk } from '../restore.ts'
import { FileDiff } from './FileDiff.tsx'
import {
  ColumnBody,
  ColumnHeader,
  ColumnTitle,
  EmptyState,
  Loading,
  ReadFailed,
  Spacer,
  Stack,
  Toolbar,
} from './layout.tsx'
import { TotalChip } from './Scores.tsx'
import { Segmented } from './Segmented.tsx'
import { Heading, Hint, Text } from './text.tsx'
import { Button } from './ui/button.tsx'
import { Toggle } from './ui/toggle.tsx'

type Against = 'now' | 'before'

export function VersionDetail({ ctx, version }: { ctx: Ctx; version: string }) {
  const { state, config, outputs, go, report, confirm, reload, drafts } = ctx
  const skill = state.skill.path
  const { versions, current } = state.versions
  const found = versions.find((v) => v.version === version) ?? null
  const before = found ? (versions[versions.indexOf(found) - 1] ?? null) : null
  const [against, setAgainst] = useState<Against>('now')
  const [showAll, setShowAll] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const from = against === 'before' && before ? before.version : version
  const to = against === 'before' && before ? version : 'current'
  const a = useFetch(() => api.skillFiles(from), [from])
  const b = useFetch(() => api.skillFiles(to), [to])
  // Read again whenever the files change, here or from the assistant's panel. A read again keeps
  // the diff in view until it lands, where a new read would show Loading in its place.
  const hash = current.hash
  const readAt = useRef(hash)
  const { reload: readFrom } = a
  const { reload: readTo } = b
  useEffect(() => {
    if (readAt.current === hash) return
    readAt.current = hash
    readFrom()
    readTo()
  }, [hash, readFrom, readTo])
  const filesFrom = a.data?.files
  const filesTo = b.data?.files
  // Every file is compared line by line: once per read, not on each render.
  const diffs = useMemo(
    () =>
      filesFrom && filesTo
        ? [...new Set([...Object.keys(filesFrom), ...Object.keys(filesTo)])].sort().map((file) => {
            const was = filesFrom[file] ?? ''
            const now = filesTo[file] ?? ''
            return { file, was, now, lines: lineDiff(was, now) }
          })
        : null,
    [filesFrom, filesTo],
  )

  if (!found)
    return (
      <EmptyState
        size="screen"
        title={`There is no ${version}`}
        actions={
          <Button type="button" onClick={() => go('editor', {}, { replace: true })}>
            Open SKILL.md
          </Button>
        }
      >
        It was deleted, or it belongs to another skill.
      </EmptyState>
    )

  const isCurrent = !current.changed && found.version === current.version
  const runs = state.runs.filter((r) => r.meta?.skillVersion === found.version).length
  const { score, why } = versionReading(outputs, config, found.version)
  const counts = countsLine(countsOf(versionOutputs(outputs, found.version), config))

  const restore = async () => {
    const lose = current.changed
    // Restore writes every file: an unsaved edit left as a draft would save back over it.
    const unsaved = Object.entries(drafts.files)
    const ok = await confirm(
      restoreAsk({
        version: found.version,
        current: current.version,
        changed: lose,
        unsaved: unsaved.map(([path]) => path).sort(byFileOrder),
      }),
    )
    if (!ok) return
    setRestoring(true)
    try {
      await api.restoreVersion(found.version, lose)
      // Dropped in the skill it was restored in, open or not.
      for (const [path, draft] of unsaved) drafts.savedFile(path, draft.text, skill)
      await reload()
      report(`Restored ${found.version}`)
    } catch (e) {
      report(e as Error)
    } finally {
      setRestoring(false)
    }
  }

  const remove = async (v: SkillVersion) => {
    // Asked every time, runs or not: a version is a whole copy of the skill, too much to lose to a stray click.
    const ok = await confirm({
      title: runs ? `Delete ${v.version} and its ${plural(runs, 'run')}?` : `Delete ${v.version}?`,
      description:
        runs === 0
          ? `This saved copy of your skill is deleted. Your skill files don't change.`
          : runs === 1
            ? `The run made with ${v.version} is deleted too, with its outputs and your corrections on them. Your skill files don't change.`
            : `The ${runs} runs made with ${v.version} are deleted too, with their outputs and your corrections on them. Your skill files don't change.`,
      action: 'Delete',
      destructive: true,
    })
    if (!ok) return
    setDeleting(true)
    try {
      const gone = await api.deleteVersion(v.version)
      go('editor', {}, { replace: true })
      await reload()
      report(`Deleted ${v.version}${gone.runs ? ` and its ${plural(gone.runs, 'run')}` : ''}`, {
        // Taken once another skill is open, it would look for the copy there.
        undo: inSkill(ctx, async () => {
          const { restored } = await api.undeleteVersion(gone.undo)
          report(`${restored} is back`)
        }),
      })
    } catch (e) {
      report(e as Error)
    } finally {
      setDeleting(false)
    }
  }

  /** A read that failed takes the place of the files: what was read before it is not what was asked for. */
  const failed = a.error ?? b.error
  const shown = failed ? null : diffs
  const changed = shown?.some((d) => d.lines.length) ?? false
  const options: Array<{ value: Against; label: string }> = [
    { value: 'now', label: 'The files now' },
    ...(before
      ? [{ value: 'before' as const, label: `${before.version}, the version before` }]
      : []),
  ]

  return (
    <>
      <ColumnHeader>
        <ColumnTitle>
          <Heading level={2} as="h2" tabular>
            {found.version}
            {found.name ? ` · ${found.name}` : ''}
          </Heading>
        </ColumnTitle>
        <Button
          type="button"
          variant="destructive-ghost"
          size="sm"
          disabled={restoring}
          busy={deleting}
          busyLabel="Deleting…"
          onClick={() => remove(found)}
        >
          Delete version
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isCurrent || deleting}
          busy={restoring}
          busyLabel="Restoring…"
          onClick={restore}
        >
          Restore
        </Button>
      </ColumnHeader>
      <ColumnBody>
        <Toolbar>
          {score === null ? null : <TotalChip total={score} />}
          <Text tone="muted" size="ui" tabular>
            {[
              found.date ? shortDate(found.date) : null,
              runs ? plural(runs, 'run') : 'Not run yet',
              // With no score chip, the line says why, once it is more than not being run.
              runs && why && why !== 'not run yet' ? capital(why) : null,
              counts,
              isCurrent ? 'In the files now' : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          {runs ? (
            <>
              <Spacer />
              <Button
                type="button"
                variant="link-muted"
                size="inline-sm"
                onClick={() => go('results', { view: 'all' })}
              >
                See its runs
              </Button>
            </>
          ) : null}
        </Toolbar>
        <Stack gap="lg">
          <Toolbar>
            <Text tone="muted" size="ui" id="version-against">
              Compare {found.version} with
            </Text>
            {options.length > 1 ? (
              <Segmented<Against>
                aria-labelledby="version-against"
                value={against}
                onChange={(v) => v && setAgainst(v)}
                options={options}
              />
            ) : (
              <Text size="ui">the files now</Text>
            )}
            <Spacer />
            <Toggle variant="outline" size="sm" pressed={showAll} onPressedChange={setShowAll}>
              Show unchanged files
            </Toggle>
          </Toolbar>
          {failed ? (
            <ReadFailed
              size="compact"
              title="Could not read the files"
              retrying={a.loading || b.loading}
              onRetry={() => {
                a.reload()
                b.reload()
              }}
            >
              {failed}
            </ReadFailed>
          ) : !diffs ? (
            <Loading />
          ) : null}
          {shown?.map(({ file, was, now, lines }) =>
            lines.length || showAll ? (
              <FileDiff
                key={`${from}-${to}-${file}`}
                file={file}
                before={was}
                after={now}
                lines={lines}
                defaultOpen={lines.length > 0}
              />
            ) : null,
          )}
          {shown && !changed ? (
            <Hint>
              {to === 'current'
                ? `No differences: your files match ${found.version}.`
                : `No differences between ${from} and ${to}.`}
            </Hint>
          ) : null}
        </Stack>
      </ColumnBody>
    </>
  )
}
