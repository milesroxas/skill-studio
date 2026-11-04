/**
 * The skill's history. Save the files as a named version, see every version
 * with its runs and mean score, compare any two file by file, and restore one.
 * A version saved here keeps its own copy of the files; one known only from a
 * run is restored from that run's snapshot.
 */
import { useEffect, useRef, useState } from 'react'
import { api } from '../api.ts'
import { DiffLines } from '../components/DiffLines.tsx'
import { Disclosure } from '../components/Disclosure.tsx'
import { InlineField } from '../components/forms.tsx'
import {
  Field,
  FormSection,
  Screen,
  Section,
  SectionHead,
  Spacer,
  Toolbar,
} from '../components/layout.tsx'
import { TotalChip } from '../components/Scores.tsx'
import { SelectBox } from '../components/SelectBox.tsx'
import { TextArea } from '../components/TextArea.tsx'
import { Heading, Hint, Text } from '../components/text.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { Label } from '../components/ui/label.tsx'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table.tsx'
import { Toggle } from '../components/ui/toggle.tsx'
import type { Ctx } from '../ctx.ts'
import { lineDiff } from '../diff.ts'
import { useFetch } from '../hooks.ts'
import { plural, versionScore } from '../model.ts'

export function Versions({ ctx }: { ctx: Ctx }) {
  const { state, config, outputs, route, go, toast, confirm, reload, drafts } = ctx
  const { versions, current } = state.versions
  const newest = [...versions].reverse()
  const runsOf = (version: string) =>
    state.runs.filter((r) => r.meta?.skillVersion === version).length
  const unsavedFiles = Object.keys(drafts.files).length

  const restore = async (version: string) => {
    const lose = current.changed
    const ok = await confirm(
      lose
        ? {
            title: `Restore ${version} over files that are no version?`,
            description: `The files now are not saved as a version, so restoring loses them. Save them as ${current.version} first to keep them.`,
            action: 'Restore anyway',
            destructive: true,
          }
        : {
            title: `Restore ${version}?`,
            description: `SKILL.md and references/ go back to ${version}. ${current.version} stays in the list, so you can return to it.`,
            action: 'Restore',
          },
    )
    if (!ok) return
    try {
      await api.restoreVersion(version, lose)
      await reload()
      toast(`Restored ${version}`)
    } catch (e) {
      toast((e as Error).message)
    }
  }

  return (
    <Screen>
      {current.changed ? (
        <SaveVersion ctx={ctx} unsavedFiles={unsavedFiles} />
      ) : (
        <Hint>
          The files are {current.version}
          {current.name ? `, ${current.name}` : ''}. Edits you save in Write start the next version.
        </Hint>
      )}

      <Section>
        <SectionHead>
          <Heading level={2}>History</Heading>
          <Text tone="muted" size="xs" tabular>
            {plural(versions.length, 'version')}
          </Text>
        </SectionHead>
        {newest.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Version</TableHead>
                <TableHead>Name</TableHead>
                <TableHead optional>Date</TableHead>
                <TableHead numeric optional>
                  Runs
                </TableHead>
                <TableHead numeric>Mean</TableHead>
                <TableHead numeric>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {newest.map((v) => {
                const isCurrent = !current.changed && v.version === current.version
                const score = versionScore(outputs, config, v.version)
                return (
                  <TableRow key={v.version} align="top">
                    <TableCell>
                      <Text weight="medium" tabular>
                        {v.version}
                      </Text>
                    </TableCell>
                    <TableCell wrap wide>
                      {v.name || <Text tone="muted">Unnamed</Text>}
                      {isCurrent ? <Text tone="muted"> · in the files now</Text> : null}
                      {v.note ? (
                        <Text block tone="muted" size="xs" clamp>
                          {v.note}
                        </Text>
                      ) : null}
                    </TableCell>
                    <TableCell optional>
                      <Text tabular size="xs">
                        {v.date ?? '–'}
                      </Text>
                    </TableCell>
                    <TableCell numeric optional>
                      {runsOf(v.version)}
                    </TableCell>
                    <TableCell numeric>
                      {score === null ? <Text tone="faint">–</Text> : <TotalChip total={score} />}
                    </TableCell>
                    <TableCell numeric>
                      <Toolbar gap="xs" justify="end" wrap={false}>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => go('versions', { left: v.version, right: 'current' })}
                        >
                          Compare
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={isCurrent}
                          onClick={() => restore(v.version)}
                        >
                          Restore
                        </Button>
                      </Toolbar>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        ) : (
          <Hint>
            No versions yet. Save the files above, or run them: a run names its version too.
          </Hint>
        )}
      </Section>

      {/* With one version and nothing changed, there is nothing to set beside it. */}
      {versions.length > 1 || (versions.length && current.changed) ? (
        <Compare
          ctx={ctx}
          left={route.params.get('left') ?? versions.at(-1)?.version ?? 'current'}
          right={route.params.get('right') ?? 'current'}
        />
      ) : null}
    </Screen>
  )
}

function SaveVersion({ ctx, unsavedFiles }: { ctx: Ctx; unsavedFiles: number }) {
  const { state, go, toast, reload } = ctx
  const { current } = state.versions
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!name.trim() || busy) return
    setBusy(true)
    try {
      const saved = await api.saveVersion(name, note)
      await reload()
      setName('')
      setNote('')
      toast(`Saved ${saved.version} · ${saved.name}`)
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen width="form">
      <form
        className="contents"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <FormSection
          title={`Save ${current.version}`}
          hint="A copy of SKILL.md and references/ as they are on disk, to compare and restore later."
        >
          {unsavedFiles ? (
            <Hint tone="destructive">
              {plural(unsavedFiles, 'file')} in Write {unsavedFiles === 1 ? 'has' : 'have'} unsaved
              changes. A version keeps the saved files only.{' '}
              <Button
                type="button"
                variant="link-muted"
                size="inline-sm"
                onClick={() => go('edit')}
              >
                Go to Write
              </Button>
            </Hint>
          ) : null}
          <Field>
            <Label htmlFor="version-name">Name</Label>
            <Input
              id="version-name"
              value={name}
              autoComplete="off"
              placeholder="Tighter word limit"
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field>
            <Label htmlFor="version-note">What changed, and why</Label>
            <TextArea
              id="version-note"
              value={note}
              placeholder="Cut the intro rule; the judge kept flagging length."
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault()
                  save()
                }
              }}
            />
          </Field>
          <Toolbar>
            <Button type="submit" disabled={!name.trim() || busy}>
              {busy ? 'Saving…' : `Save as ${current.version}`}
            </Button>
          </Toolbar>
        </FormSection>
      </form>
    </Screen>
  )
}

/** Two versions (or the files now), diffed file by file. */
function Compare({ ctx, left, right }: { ctx: Ctx; left: string; right: string }) {
  const { state, route, go } = ctx
  const { versions, current } = state.versions
  const [showAll, setShowAll] = useState(false)
  const a = useFetch(() => api.skillFiles(left), [left, state.versions.current.hash])
  const b = useFetch(() => api.skillFiles(right), [right, state.versions.current.hash])
  const section = useRef<HTMLElement>(null)
  /** The pair a Compare click asked for; empty when the reader came to the screen itself. */
  const asked = route.params.has('left') ? `${left}…${right}` : ''

  // A Compare click in the history brings the diff into view.
  useEffect(() => {
    if (asked) section.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [asked])

  const options = [
    {
      value: 'current',
      label: current.changed ? `Files now (${current.version}, not saved)` : 'Files now',
    },
    ...[...versions]
      .reverse()
      .map((v) => ({ value: v.version, label: `${v.version}${v.name ? ` · ${v.name}` : ''}` })),
  ]
  const labelOf = (value: string) => options.find((o) => o.value === value)?.label ?? value
  const pick = (side: 'left' | 'right', value: string) =>
    go('versions', {
      left: side === 'left' ? value : left,
      right: side === 'right' ? value : right,
    })
  const from = a.data?.files
  const to = b.data?.files
  const diffs =
    from && to
      ? [...new Set([...Object.keys(from), ...Object.keys(to)])].sort().map((file) => {
          const before = from[file] ?? ''
          const after = to[file] ?? ''
          return { file, before, after, lines: lineDiff(before, after) }
        })
      : null

  return (
    <Section ref={section} className="scroll-mt-6">
      <SectionHead>
        <Heading level={2}>Compare</Heading>
      </SectionHead>
      <Toolbar>
        <InlineField label="From">
          <SelectBox
            aria-label="From"
            width="wide"
            value={left}
            onChange={(v) => pick('left', v)}
            options={options}
          />
        </InlineField>
        <InlineField label="To">
          <SelectBox
            aria-label="To"
            width="wide"
            value={right}
            onChange={(v) => pick('right', v)}
            options={options}
          />
        </InlineField>
        <Spacer />
        <Toggle variant="outline" size="sm" pressed={showAll} onPressedChange={setShowAll}>
          Show unchanged files
        </Toggle>
      </Toolbar>
      {a.error || b.error ? <Hint tone="destructive">{a.error ?? b.error}</Hint> : null}
      {!diffs && !a.error && !b.error ? <Hint>Loading…</Hint> : null}
      {diffs?.map(({ file, before, after, lines }) => {
        if (!lines.length && !showAll) return null
        return (
          <Disclosure
            key={`${left}-${right}-${file}`}
            variant="card"
            defaultOpen={lines.length > 0}
            summary={
              <>
                <Text font="mono">{file}</Text>{' '}
                <Text tone="muted" size="xs" tabular>
                  {!before
                    ? 'added'
                    : !after
                      ? 'removed'
                      : lines.length
                        ? `${lines.filter((l) => l.op === 'ins').length} added, ${lines.filter((l) => l.op === 'del').length} removed`
                        : 'unchanged'}
                </Text>
              </>
            }
          >
            {lines.length ? <DiffLines lines={lines} /> : <pre className="diff-lines">{after}</pre>}
          </Disclosure>
        )
      })}
      {diffs && !diffs.some((d) => d.lines.length) ? (
        <Hint>
          No differences: {labelOf(left)} and {labelOf(right)} hold the same files.
        </Hint>
      ) : null}
    </Section>
  )
}
