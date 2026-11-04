/**
 * The shell. With no skill open it shows the library. With one open it shows
 * that skill's workspace: five tabs in the order of the loop (write the skill,
 * write cases, run, review, tune the bench), each with its status, and one
 * button for the next step.
 */
import type { BenchConfig } from '@domain/schemas.ts'
import { ArrowRightIcon } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, currentSkill, type Job, type State, setSkill } from './api.ts'
import { useConfirm } from './components/confirm.tsx'
import { JobsStrip } from './components/Jobs.tsx'
import { EmptyState, Spacer, Stack } from './components/layout.tsx'
import { Crumbs, Masthead, StepTabs } from './components/Masthead.tsx'
import { Toast } from './components/Toast.tsx'
import { Hint, Text } from './components/text.tsx'
import { Badge } from './components/ui/badge.tsx'
import { Button } from './components/ui/button.tsx'
import { Tabs, TabsList, TabsTrigger } from './components/ui/tabs.tsx'
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

/** The guide and settings load only when opened. */
const Docs = lazy(() => import('./screens/Docs.tsx').then((m) => ({ default: m.Docs })))
const SettingsScreen = lazy(() =>
  import('./screens/Settings.tsx').then((m) => ({ default: m.SettingsScreen })),
)

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

/** The page frame: a column the height of the window, the stage filling what the header leaves. */
function Frame({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh flex-col">{children}</div>
}

function Stage({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex-1 px-[max(16px,env(safe-area-inset-right,0px))] pt-4 pb-10 md:pt-6 md:pb-[calc(48px+env(safe-area-inset-bottom,0px))]">
      {children}
    </main>
  )
}

export function App() {
  const [skillPath, setSkillPath] = useState(currentSkill)
  const [state, setState] = useState<State | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [config, setConfig] = useState<BenchConfig | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [route, go] = useRoute()
  const [message, toast] = useToast()
  const [confirm, confirmDialog] = useConfirm()
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

  // Follow the jobs: pushed by the desktop app, polled in a browser (quickly while one
  // runs). Reload state when a job finishes, including one that started and ended
  // between two polls (a Jev vote takes under a second).
  useEffect(() => {
    let finished: Set<number> | null = null
    const take = (list: Job[]) => {
      setJobs(list)
      const done = new Set(list.filter((j) => j.status !== 'running').map((j) => j.id))
      if (finished && [...done].some((id) => !finished?.has(id))) reload()
      finished = done
    }
    if (api.watchJobs) {
      api.jobs().then(take, () => {})
      return api.watchJobs(take)
    }
    let timer: ReturnType<typeof setTimeout>
    let live = true
    const tick = async () => {
      try {
        const list = await api.jobs()
        if (!live) return
        take(list)
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
  const overlays = (
    <>
      <Toast message={message} />
      {confirmDialog}
    </>
  )
  /** Open the guide or settings, remembering the screen to come back to. */
  const docsLink = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => go('docs', { from: route.screen })}
    >
      Docs
    </Button>
  )
  const settingsLink = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => go('settings', { from: route.screen })}
    >
      Settings
    </Button>
  )

  /** The guide and settings sit on top of wherever the reader was. */
  if (route.screen === 'docs' || route.screen === 'settings') {
    const from = route.params.get('from') || (skillPath ? 'home' : 'library')
    const backTo = from === 'library' || !skillPath ? 'Library' : (state?.skill.name ?? 'Back')
    const page = route.screen === 'docs' ? 'Guide' : 'Settings'
    return (
      <Frame>
        <Masthead>
          <Crumbs path={[{ label: backTo, go: () => go(from) }]} current={page} />
        </Masthead>
        <Stage>
          <Suspense fallback={<Hint>Loading…</Hint>}>
            {route.screen === 'docs' ? <Docs /> : <SettingsScreen toast={toast} onSaved={reload} />}
          </Suspense>
        </Stage>
        {overlays}
      </Frame>
    )
  }

  if (inLibrary)
    return (
      <Frame>
        <Masthead>
          <Crumbs path={[]} current="Library" />
          <Spacer />
          {docsLink}
          {settingsLink}
          {skillPath && state ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => go('home')}>
              Return to {state.skill.name}
            </Button>
          ) : null}
        </Masthead>
        <JobsStrip jobs={jobs} />
        <Stage>
          <LibraryScreen openSkill={openSkill} toast={toast} confirm={confirm} />
        </Stage>
        {overlays}
      </Frame>
    )

  if (error && !state)
    return (
      <EmptyState
        title="Could not open this skill"
        actions={
          <>
            <Button type="button" onClick={() => openSkill('', 'library')}>
              Go to the library
            </Button>
            <Button type="button" variant="outline" onClick={reload}>
              Try again
            </Button>
          </>
        }
      >
        {error}
      </EmptyState>
    )
  if (!state || !config) return <EmptyState>Loading…</EmptyState>

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
    confirm,
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
    <Frame>
      <Masthead
        tabs={
          <StepTabs
            steps={GROUPS.map((g) => ({ id: g.id, label: g.label, meta: meta[g.id] }))}
            value={group.id}
            onChange={(id) => {
              const g = GROUPS.find((x) => x.id === id)
              if (g) go(lastIn.current[g.id] ?? g.screens[0][0])
            }}
          />
        }
      >
        <Crumbs
          path={[{ label: 'Library', go: () => go('library') }]}
          current={state.skill.name}
          title={state.skill.path}
        />
        <Text tone="muted" size="xs" tabular title={`Skill hash ${current.hash}`}>
          {current.changed
            ? `${current.version}, not run yet`
            : `${current.version}${current.name ? ` · ${current.name}` : ''}`}
        </Text>
        <Spacer />
        {docsLink}
        {settingsLink}
        {!state.jevKey ? (
          <Badge variant="warning" asChild>
            <button
              type="button"
              title="Add a TypeSafe key in Settings to grade with Jev"
              onClick={() => go('settings', { from: route.screen })}
            >
              Code checks only: no Jev key
            </button>
          </Badge>
        ) : null}
        {next && next.screen !== screen ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => go(next.screen, next.params)}
          >
            <Text tone="muted" size="xs">
              Next
            </Text>
            <ArrowRightIcon aria-hidden="true" />
            {next.label}
          </Button>
        ) : null}
      </Masthead>
      <JobsStrip jobs={jobs} />
      <Stage>
        <Stack gap="lg">
          {group.screens.length > 1 ? (
            <Tabs value={screen} onValueChange={(id) => go(id)}>
              <TabsList aria-label={`${group.label} views`}>
                {group.screens.map(([id, label]) => (
                  <TabsTrigger key={id} value={id}>
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
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
        </Stack>
      </Stage>
      {overlays}
    </Frame>
  )
}
