/**
 * The shell. With no skill open it shows the library. With one open it shows
 * that skill's workspace: five tabs in the order of the loop (write the skill,
 * write cases, run, review, tune the bench), each with its status, and one
 * button for the next step.
 */
import type { BenchConfig } from '@core/schemas.ts'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, currentSkill, type Job, type State, setSkill } from './api.ts'
import { JobsStrip } from './components/Jobs.tsx'
import type { Ctx } from './ctx.ts'
import { useRoute, useToast } from './hooks.ts'
import { mergedConfig, outputsOf, plural } from './model.ts'
import { Blind } from './screens/Blind.tsx'
import { Cases } from './screens/Cases.tsx'
import { Compare } from './screens/Compare.tsx'
import { Editor } from './screens/Editor.tsx'
import { Generate } from './screens/Generate.tsx'
import { Insights } from './screens/Insights.tsx'
import { Knobs } from './screens/Knobs.tsx'
import { LibraryScreen } from './screens/Library.tsx'
import { Overview } from './screens/Overview.tsx'
import { SkillDiff } from './screens/SkillDiff.tsx'
import { Transcript } from './screens/Transcript.tsx'

interface Group {
  id: string
  label: string
  screens: Array<[string, string]>
}

/** The loop, left to right. A tab with more than one screen shows them as a segmented control. */
const GROUPS: Group[] = [
  {
    id: 'skill',
    label: 'Skill',
    screens: [
      ['edit', 'Write'],
      ['skill', 'Changes'],
    ],
  },
  { id: 'cases', label: 'Cases', screens: [['cases', 'Cases']] },
  {
    id: 'runs',
    label: 'Runs',
    screens: [
      ['overview', 'Results'],
      ['generate', 'New run'],
    ],
  },
  {
    id: 'review',
    label: 'Review',
    screens: [
      ['blind', 'Rate blind'],
      ['compare', 'Compare'],
      ['transcript', 'Transcripts'],
    ],
  },
  {
    id: 'bench',
    label: 'Bench',
    screens: [
      ['insights', 'Agreement'],
      ['knobs', 'Scoring'],
    ],
  },
]
const groupOf = (screen: string): Group | undefined =>
  GROUPS.find((g) => g.screens.some(([id]) => id === screen))

export function App() {
  const [skillPath, setSkillPath] = useState(currentSkill)
  const [state, setState] = useState<State | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [config, setConfig] = useState<BenchConfig | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [route, go] = useRoute()
  const [message, toast] = useToast()
  /** The screen last shown in each tab, so a tab click returns to it. */
  const lastIn = useRef<Record<string, string>>({})

  const reload = useCallback(async () => {
    if (!currentSkill()) return
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
    setState(null)
    setConfig(null)
    setError(null)
    lastIn.current = {}
    reload()
  }, [skillPath, reload])

  const openSkill = useCallback(
    (path: string, screen = 'home') => {
      setSkillPath(path)
      go(screen)
    },
    [go],
  )

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

  useEffect(() => {
    const group = groupOf(route.screen)
    if (group) lastIn.current[group.id] = route.screen
  }, [route.screen])

  const inLibrary = !skillPath || route.screen === 'library'
  const toastBar = (
    <div className={`toast${message ? ' show' : ''}`} role="status">
      {message}
    </div>
  )

  if (inLibrary)
    return (
      <div className="app">
        <header className="masthead">
          <div className="topbar">
            <h1>skill-tester</h1>
            <nav className="crumbs" aria-label="Location">
              <span aria-current="page">Library</span>
            </nav>
            <span className="spacer" />
            {skillPath && state ? (
              <button type="button" className="ghost" onClick={() => go('home')}>
                Return to {state.skill.name}
              </button>
            ) : null}
          </div>
        </header>
        <JobsStrip jobs={jobs} />
        <main className="stage">
          <LibraryScreen openSkill={openSkill} toast={toast} />
        </main>
        {toastBar}
      </div>
    )

  if (error && !state)
    return (
      <div className="empty">
        <h2>Could not open this skill</h2>
        <p className="help">{error}</p>
        <div className="actions">
          <button type="button" className="primary" onClick={() => openSkill('', 'library')}>
            Go to the library
          </button>
          <button type="button" onClick={reload}>
            Try again
          </button>
        </div>
      </div>
    )
  if (!state || !config)
    return (
      <div className="empty">
        <p className="help">Loading…</p>
      </div>
    )

  const current = state.versions.current
  const unrated = outputs.filter((o) => o.result && !state.reviews.reviews[o.key]).length
  const home = !state.cases.length ? 'cases' : state.runs.length ? 'overview' : 'edit'
  const requested = route.screen === 'home' ? home : route.screen
  const screen = groupOf(requested) ? requested : home
  const group = groupOf(screen) as Group

  const ctx: Ctx = {
    state,
    config,
    setConfig,
    outputs,
    route,
    go,
    toast,
    reload,
    jobs,
    openSkill,
  }
  const dirty = JSON.stringify(config) !== JSON.stringify(mergedConfig(state.savedConfig))
  const running = jobs.some((j) => j.status === 'running')

  // The one suggested next step, in loop order. Hidden while a job runs or when already there.
  const next: { label: string; screen: string; params?: Record<string, string> } | null = running
    ? null
    : !state.cases.length
      ? { label: 'Add a case', screen: 'cases', params: { new: '1' } }
      : current.changed || !state.runs.length
        ? { label: `Run ${current.version}`, screen: 'generate' }
        : unrated
          ? { label: `Rate ${plural(unrated, 'output')}`, screen: 'blind' }
          : null

  const meta: Record<string, string | null> = {
    skill: current.changed && state.runs.length ? 'edited' : null,
    cases: String(state.cases.length),
    runs: state.runs.length ? String(state.runs.length) : null,
    review: unrated ? `${unrated} to rate` : null,
    bench: dirty ? 'not saved' : null,
  }

  return (
    <div className="app">
      <header className="masthead">
        <div className="topbar">
          <h1>skill-tester</h1>
          <nav className="crumbs" aria-label="Location">
            <button type="button" className="crumb" onClick={() => go('library')}>
              Library
            </button>
            <span className="crumb-sep" aria-hidden="true">
              /
            </span>
            <span className="skill-name" aria-current="page" title={state.skill.path}>
              {state.skill.name}
            </span>
          </nav>
          <span className="muted small tnum" title={`Skill hash ${current.hash}`}>
            {current.changed
              ? `${current.version}, not run yet`
              : `${current.version}${current.name ? ` · ${current.name}` : ''}`}
          </span>
          <span className="spacer" />
          {!state.jevKey ? (
            <span className="pill warn" title="Set TYPESAFE_API_KEY in .env to grade with Jev">
              Code checks only: no Jev key
            </span>
          ) : null}
          {next && next.screen !== screen ? (
            <button type="button" className="next" onClick={() => go(next.screen, next.params)}>
              <span className="next-kicker">Next</span>
              {next.label}
            </button>
          ) : null}
        </div>
        <nav className="tabs" aria-label="Steps">
          {GROUPS.map((g) => (
            <button
              key={g.id}
              type="button"
              aria-current={group.id === g.id ? 'page' : undefined}
              onClick={() => go(lastIn.current[g.id] ?? g.screens[0][0])}
            >
              {g.label}
              {meta[g.id] ? <span className="tab-meta">{meta[g.id]}</span> : null}
            </button>
          ))}
        </nav>
      </header>
      <JobsStrip jobs={jobs} />
      <main className="stage">
        {group.screens.length > 1 ? (
          <fieldset className="seg subnav" aria-label={`${group.label} views`}>
            {group.screens.map(([id, label]) => (
              <button key={id} type="button" aria-pressed={screen === id} onClick={() => go(id)}>
                {label}
              </button>
            ))}
          </fieldset>
        ) : null}
        {screen === 'edit' ? <Editor ctx={ctx} /> : null}
        {screen === 'skill' ? <SkillDiff ctx={ctx} /> : null}
        {screen === 'cases' ? <Cases ctx={ctx} /> : null}
        {screen === 'overview' ? <Overview ctx={ctx} /> : null}
        {screen === 'generate' ? <Generate ctx={ctx} /> : null}
        {screen === 'blind' ? <Blind ctx={ctx} /> : null}
        {screen === 'compare' ? <Compare ctx={ctx} /> : null}
        {screen === 'transcript' ? <Transcript ctx={ctx} /> : null}
        {screen === 'insights' ? <Insights ctx={ctx} /> : null}
        {screen === 'knobs' ? <Knobs ctx={ctx} /> : null}
      </main>
      {toastBar}
    </div>
  )
}
