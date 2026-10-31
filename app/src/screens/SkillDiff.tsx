/** The skill's files: the working tree or any run's snapshot, diffed file by file. */
import { useState } from 'react'
import { api } from '../api.ts'
import type { Ctx } from '../ctx.ts'
import { lineDiff } from '../diff.ts'
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
    <div className="screen">
      <div className="toolbar">
        <label className="picker">
          <span className="small muted">From</span>
          <select value={left} onChange={(e) => pick('left', e.target.value)}>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="picker">
          <span className="small muted">To</span>
          <select value={right} onChange={(e) => pick('right', e.target.value)}>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" aria-pressed={showAll} onClick={() => setShowAll((s) => !s)}>
          Show unchanged files
        </button>
      </div>
      {a.error || b.error ? <p className="help">{a.error ?? b.error}</p> : null}
      {!diffs ? <p className="help">Loading…</p> : null}
      {diffs?.map(({ file, before, after, lines }) => {
        if (!lines.length && !showAll) return null
        return (
          <details key={file} className="diff-file" open={lines.length > 0}>
            <summary>
              <span className="mono">{file}</span>{' '}
              <small className="muted">
                {!before
                  ? 'added'
                  : !after
                    ? 'removed'
                    : lines.length
                      ? `${lines.filter((l) => l.op === 'ins').length} added, ${lines.filter((l) => l.op === 'del').length} removed`
                      : 'unchanged'}
              </small>
            </summary>
            {lines.length ? (
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
            ) : (
              <pre className="diff-lines">{after}</pre>
            )}
          </details>
        )
      })}
      {diffs && !diffs.some((d) => d.lines.length) ? (
        <p className="help">
          No differences: {options.find((o) => o.value === left)?.label ?? left} and{' '}
          {options.find((o) => o.value === right)?.label ?? right} hold the same files.
        </p>
      ) : null}
    </div>
  )
}
