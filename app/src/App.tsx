/** The shell: loads /api/state, keeps the live knobs, polls jobs and routes to one screen. */
import type { BenchConfig } from '@core/schemas.ts'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, type Job, type State, setSkill } from './api.ts'
import { JobsStrip } from './components/Jobs.tsx'
import type { Ctx } from './ctx.ts'
import { useRoute, useToast } from './hooks.ts'
import { mergedConfig, outputsOf } from './model.ts'
import { Blind } from './screens/Blind.tsx'
import { Compare } from './screens/Compare.tsx'
import { Editor } from './screens/Editor.tsx'
import { Generate } from './screens/Generate.tsx'
import { Insights } from './screens/Insights.tsx'
import { Knobs } from './screens/Knobs.tsx'
import { Overview } from './screens/Overview.tsx'
import { SkillDiff } from './screens/SkillDiff.tsx'
import { Transcript } from './screens/Transcript.tsx'

/** Reading and judging first, then the tools that tune the bench, then the one that spends money. */
const SCREENS: Array<[string, string]> = [
  ['overview', 'Overview'],
  ['blind', 'Blind review'],
  ['compare', 'Compare'],
  ['insights', 'Insights'],
  ['knobs', 'Knobs'],
  ['edit', 'Edit skill'],
  ['skill', 'Skill diff'],
  ['transcript', 'Transcript'],
  ['generate', 'Generate'],
]
const GROUP_START = new Set(['knobs', 'generate'])

export function App() {
  const [state, setState] = useState<State | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [config, setConfig] = useState<BenchConfig | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [route, go] = useRoute()
  const [message, toast] = useToast()
  const [skillPath, setSkillPath] = useState('')

  const reload = useCallback(async () => {
    try {
      const next = await api.state()
      setState(next)
      setError(null)
      setConfig((current) => {
        const saved = mergedConfig(next.savedConfig)
        return current && JSON.stringify(current) !== JSON.stringify(saved) ? current : saved
      })
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    setSkill(skillPath)
    setConfig(null)
    reload()
  }, [skillPath, reload])

  // Poll jobs; quickly while one runs. Reload state when a job finishes, including
  // one that started and ended between two polls (a Jev vote takes under a second).
  useEffect(() => {
    let finished: Set<number> | null = null
    let timer: ReturnType<typeof setTimeout>
    let live = true
    const tick = async () => {
      try {
        const list = await api.jobs()
        if (!live) return
        setJobs(list)
        const done = new Set(list.filter((j) => j.status !== 'running').map((j) => j.id))
        if (finished && [...done].some((id) => !finished?.has(id))) reload()
        finished = done
        const running = list.some((j) => j.status === 'running')
        timer = setTimeout(tick, running ? 1500 : 3000)
      } catch {
        if (live) timer = setTimeout(tick, 8000)
      }
    }
    tick()
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [reload])

  const outputs = useMemo(() => (state ? outputsOf(state) : []), [state])

  if (error && !state)
    return (
      <div className="empty">
        <h2>Could not reach the server</h2>
        <p className="help">{error}. Start it, then reload this page.</p>
        <pre className="help">pnpm st serve &lt;skill-dir&gt;</pre>
      </div>
    )
  if (!state || !config)
    return (
      <div className="empty">
        <p className="help">Loading…</p>
      </div>
    )

  const ctx: Ctx = { state, config, setConfig, outputs, route, go, toast, reload, jobs }
  const screen = SCREENS.some(([id]) => id === route.screen) ? route.screen : 'overview'
  const dirty = JSON.stringify(config) !== JSON.stringify(mergedConfig(state.savedConfig))
  const current = state.versions.current

  return (
    <div className="app">
      <header className="masthead">
        <div className="topbar">
          <h1>skill-tester</h1>
          {state.skills.length > 1 ? (
            <select
              aria-label="Skill"
              value={skillPath}
              onChange={(e) => setSkillPath(e.target.value)}
            >
              {state.skills.map((s) => (
                <option key={s.path} value={s.path === state.skills[0].path ? '' : s.path}>
                  {s.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="skill-name" title={state.skill.path}>
              {state.skill.name}
            </span>
          )}
          <span className="muted small" title={`Skill hash ${current.hash}`}>
            {current.changed
              ? `Edited since the last run: becomes ${current.version}`
              : `${current.version}${current.name ? ` · ${current.name}` : ''}`}
          </span>
          <span className="spacer" />
          {dirty ? (
            <button type="button" className="pill warn" onClick={() => go('knobs')}>
              Knobs not saved
            </button>
          ) : null}
          {!state.jevKey ? (
            <span className="pill warn" title="Set TYPESAFE_API_KEY in .env to grade with Jev">
              Code checks only: no Jev key
            </span>
          ) : null}
        </div>
        <nav className="tabs" aria-label="Screens">
          {SCREENS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={GROUP_START.has(id) ? 'group-start' : undefined}
              aria-current={screen === id ? 'page' : undefined}
              onClick={() => go(id)}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>
      <JobsStrip jobs={jobs} />
      <main className="stage">
        {screen === 'overview' ? <Overview ctx={ctx} /> : null}
        {screen === 'blind' ? <Blind ctx={ctx} /> : null}
        {screen === 'compare' ? <Compare ctx={ctx} /> : null}
        {screen === 'insights' ? <Insights ctx={ctx} /> : null}
        {screen === 'knobs' ? <Knobs ctx={ctx} /> : null}
        {screen === 'edit' ? <Editor ctx={ctx} /> : null}
        {screen === 'skill' ? <SkillDiff ctx={ctx} /> : null}
        {screen === 'generate' ? <Generate ctx={ctx} /> : null}
        {screen === 'transcript' ? <Transcript ctx={ctx} /> : null}
      </main>
      <div className={`toast${message ? ' show' : ''}`} role="status">
        {message}
      </div>
    </div>
  )
}
