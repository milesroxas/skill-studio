/** The skill's files: the working tree or any run's snapshot, diffed file by file. */
import { useState } from 'react'
import { api } from '../api.ts'
import { Disclosure } from '../components/Disclosure.tsx'
import { InlineField } from '../components/forms.tsx'
import { Screen, Toolbar } from '../components/layout.tsx'
import { SelectBox } from '../components/SelectBox.tsx'
import { Hint, Text } from '../components/text.tsx'
import { Toggle } from '../components/ui/toggle.tsx'
import type { Ctx } from '../ctx.ts'
import { type DiffLine, lineDiff } from '../diff.ts'
import { useFetch } from '../hooks.ts'
import { runStamp, versionName } from '../model.ts'

export function SkillDiff({ ctx }: { ctx: Ctx }) {
  const { state, route, go } = ctx
  const withSkill = state.runs.filter((r) => r.hasSkill)
  const left = route.params.get('left') ?? withSkill.at(-1)?.name ?? 'current'
  const right = route.params.get('right') ?? 'current'
  const [showAll, setShowAll] = useState(false)
  const a = useFetch(() => api.skillFiles(left), [left])
  const b = useFetch(() => api.skillFiles(right), [right])
  const options = [
    { value: 'current', label: `Working tree (${state.versions.current.version})` },
    ...withSkill.map((r) => ({ value: r.name, label: `${versionName(r)} · ${runStamp(r)}` })),
  ]
  const pick = (side: 'left' | 'right', value: string) =>
    go('skill', { left: side === 'left' ? value : left, right: side === 'right' ? value : right })
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
    <Screen>
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
        <Toggle variant="outline" pressed={showAll} onPressedChange={setShowAll}>
          Show unchanged files
        </Toggle>
      </Toolbar>
      {a.error || b.error ? <Hint>{a.error ?? b.error}</Hint> : null}
      {!diffs ? <Hint>Loading…</Hint> : null}
      {diffs?.map(({ file, before, after, lines }) => {
        if (!lines.length && !showAll) return null
        return (
          <Disclosure
            key={file}
            variant="card"
            defaultOpen={lines.length > 0}
            summary={
              <>
                <Text font="mono">{file}</Text>{' '}
                <Text tone="muted" size="xs">
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
          No differences: {options.find((o) => o.value === left)?.label ?? left} and{' '}
          {options.find((o) => o.value === right)?.label ?? right} hold the same files.
        </Hint>
      ) : null}
    </Screen>
  )
}

/** A line diff as a listing: added lines tinted green, removed red, folds muted. */
export function DiffLines({ lines }: { lines: DiffLine[] }) {
  return (
    <pre className="diff-lines">
      {lines.map((line) => (
        <span key={line.n} className={line.op}>
          {line.op === 'fold'
            ? '   …'
            : `${line.op === 'ins' ? '+ ' : line.op === 'del' ? '- ' : '  '}${line.text}`}
          {'\n'}
        </span>
      ))}
    </pre>
  )
}
