/**
 * One version of the skill, opened from the list beside the editor: what
 * changed between it and the files now, or between it and the version before,
 * file by file, with the way back to it. A run keeps the version it tested, so
 * there is always a copy to read and restore; one saved by hand keeps its own.
 */
import type { SkillVersion } from '@domain/views.ts'
import { useState } from 'react'
import { api } from '../api.ts'
import type { Ctx } from '../ctx.ts'
import { lineDiff } from '../diff.ts'
import { useFetch } from '../hooks.ts'
import { countsLine, countsOf, plural, shortDate, versionOutputs, versionScore } from '../model.ts'
import { FileDiff } from './FileDiff.tsx'
import {
  ColumnBody,
  ColumnHeader,
  ColumnTitle,
  EmptyState,
  Loading,
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
  const { state, config, outputs, go, report, confirm, reload } = ctx
  const { versions, current } = state.versions
  const found = versions.find((v) => v.version === version) ?? null
  const before = found ? (versions[versions.indexOf(found) - 1] ?? null) : null
  const [against, setAgainst] = useState<Against>('now')
  const [showAll, setShowAll] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // Read again whenever the files change, here or from the assistant's panel.
  const from = against === 'before' && before ? before.version : version
  const to = against === 'before' && before ? version : 'current'
  const a = useFetch(() => api.skillFiles(from), [from, current.hash])
  const b = useFetch(() => api.skillFiles(to), [to, current.hash])

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
  const score = versionScore(outputs, config, found.version)
  const counts = countsLine(countsOf(versionOutputs(outputs, found.version), config))

  const restore = async () => {
    const lose = current.changed
    const ok = await confirm(
      lose
        ? {
            title: `Restore ${found.version} over files that are no version?`,
            description:
              'The files now were changed since the last run and are kept nowhere else, so restoring loses them. Run them first to keep them as a version.',
            action: 'Restore',
            destructive: true,
          }
        : {
            title: `Restore ${found.version}?`,
            description: `SKILL.md and references/ go back to ${found.version}. ${current.version} stays in the list, so you can return to it.`,
            action: 'Restore',
          },
    )
    if (!ok) return
    setRestoring(true)
    try {
      await api.restoreVersion(found.version, lose)
      await reload()
      report(`Restored ${found.version}`)
    } catch (e) {
      report(e as Error)
    } finally {
      setRestoring(false)
    }
  }

  const undelete = async (undo: string) => {
    try {
      const { restored } = await api.undeleteVersion(undo)
      await reload()
      report(`${restored} is back`)
    } catch (e) {
      report(e as Error)
    }
  }

  const remove = async (v: SkillVersion) => {
    // A saved copy alone comes back with Undo. Runs hold results, so the reader agrees to lose them first.
    if (
      runs &&
      !(await confirm({
        title: `Delete ${v.version} and its ${plural(runs, 'run')}?`,
        description:
          runs === 1
            ? `The run made with ${v.version} is deleted too, with its outputs and your picks on them. Your skill files don't change.`
            : `The ${runs} runs made with ${v.version} are deleted too, with their outputs and your picks on them. Your skill files don't change.`,
        action: 'Delete',
        destructive: true,
      }))
    )
      return
    setDeleting(true)
    try {
      const gone = await api.deleteVersion(v.version)
      go('editor', {}, { replace: true })
      await reload()
      report(`Deleted ${v.version}${gone.runs ? ` and its ${plural(gone.runs, 'run')}` : ''}`, {
        undo: () => undelete(gone.undo),
      })
    } catch (e) {
      report(e as Error)
    } finally {
      setDeleting(false)
    }
  }

  const filesFrom = a.data?.files
  const filesTo = b.data?.files
  const diffs =
    filesFrom && filesTo
      ? [...new Set([...Object.keys(filesFrom), ...Object.keys(filesTo)])].sort().map((file) => {
          const was = filesFrom[file] ?? ''
          const now = filesTo[file] ?? ''
          return { file, was, now, lines: lineDiff(was, now) }
        })
      : null
  const changed = diffs?.some((d) => d.lines.length) ?? false
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
          {a.error || b.error ? <Hint tone="destructive">{a.error ?? b.error}</Hint> : null}
          {!diffs && !a.error && !b.error ? <Loading /> : null}
          {diffs?.map(({ file, was, now, lines }) =>
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
          {diffs && !changed ? (
            <Hint>
              {to === 'current'
                ? `No differences: the files now are as ${found.version} had them.`
                : `No differences between ${from} and ${to}.`}
            </Hint>
          ) : null}
        </Stack>
      </ColumnBody>
    </>
  )
}
