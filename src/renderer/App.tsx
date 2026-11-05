/**
 * The shell. A sidebar holds the open skill (switch with ⌘K), every screen of
 * its loop in one flat list with each one's status, and the library, guide and
 * settings. The top bar names the screen and offers the one suggested next
 * step. Library, guide and settings open in the same pane, so the skill in
 * hand stays one click away.
 */
import type { BenchConfig } from '@domain/schemas.ts'
import {
  ArrowRightIcon,
  BookOpenIcon,
  ChartColumnIcon,
  Columns2Icon,
  EyeOffIcon,
  HistoryIcon,
  LibraryIcon,
  ListChecksIcon,
  type LucideIcon,
  MenuIcon,
  PencilLineIcon,
  PlayIcon,
  ScaleIcon,
  ScrollTextIcon,
  SettingsIcon,
  SlidersHorizontalIcon,
} from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { api, currentSkill, type Job, type State, setSkill } from './api.ts'
import { useConfirm } from './components/confirm.tsx'
import { JobsIndicator } from './components/Jobs.tsx'
import { EmptyState, Loading, Spacer } from './components/layout.tsx'
import {
  AppFrame,
  NavItem,
  Pane,
  Sidebar,
  SidebarBody,
  SidebarFooter,
  SidebarSection,
  TopBar,
  Workspace,
} from './components/Shell.tsx'
import { SkillSwitcher } from './components/SkillSwitcher.tsx'
import { Toast } from './components/Toast.tsx'
import { Heading, Text } from './components/text.tsx'
import { Badge } from './components/ui/badge.tsx'
import { Button } from './components/ui/button.tsx'
import { Popover, PopoverContent, PopoverTrigger } from './components/ui/popover.tsx'
import type { Ctx } from './ctx.ts'
import { useDrafts } from './drafts.ts'
import { useRoute, useToast } from './hooks.ts'
import { mergedConfig, outputsOf, plural, versionScore } from './model.ts'
import { Blind } from './screens/Blind.tsx'
import { Cases } from './screens/Cases.tsx'
import { Compare } from './screens/Compare.tsx'
import { Generate } from './screens/Generate.tsx'
import { Insights } from './screens/Insights.tsx'
import { Knobs } from './screens/Knobs.tsx'
import { LibraryScreen } from './screens/Library.tsx'
import { Overview } from './screens/Overview.tsx'
import { Transcript } from './screens/Transcript.tsx'
import { Versions } from './screens/Versions.tsx'

/** The guide, settings and the file editor (CodeMirror, about 110 KB gzipped) load only when opened. */
const Docs = lazy(() => import('./screens/Docs.tsx').then((m) => ({ default: m.Docs })))
const Editor = lazy(() => import('./screens/Editor.tsx').then((m) => ({ default: m.Editor })))
const SettingsScreen = lazy(() =>
  import('./screens/Settings.tsx').then((m) => ({ default: m.SettingsScreen })),
)

interface Place {
  screen: string
  label: string
  icon: LucideIcon
}

interface Section {
  label?: string
  places: Place[]
}

/** The loop, top to bottom: write the skill and its cases, run them, review, tune the bench. */
const SECTIONS: Section[] = [
  {
    places: [
      { screen: 'edit', label: 'Write', icon: PencilLineIcon },
      { screen: 'versions', label: 'Versions', icon: HistoryIcon },
      { screen: 'cases', label: 'Cases', icon: ListChecksIcon },
    ],
  },
  {
    label: 'Runs',
    places: [
      { screen: 'generate', label: 'New run', icon: PlayIcon },
      { screen: 'overview', label: 'Results', icon: ChartColumnIcon },
    ],
  },
  {
    label: 'Review',
    places: [
      { screen: 'blind', label: 'Rate blind', icon: EyeOffIcon },
      { screen: 'compare', label: 'Compare', icon: Columns2Icon },
      { screen: 'transcript', label: 'Transcripts', icon: ScrollTextIcon },
    ],
  },
  {
    label: 'Bench',
    places: [
      { screen: 'insights', label: 'Agreement', icon: ScaleIcon },
      { screen: 'knobs', label: 'Scoring', icon: SlidersHorizontalIcon },
    ],
  },
]

const APP_PLACES: Place[] = [
  { screen: 'library', label: 'Library', icon: LibraryIcon },
  { screen: 'docs', label: 'Guide', icon: BookOpenIcon },
  { screen: 'settings', label: 'Settings', icon: SettingsIcon },
]

/** Screens built as a workbench of columns that scroll on their own, not as one scrolling page. */
const WORKBENCH = new Set(['edit', 'cases', 'blind', 'knobs'])

const placeOf = (screen: string): Place | undefined =>
  [...SECTIONS.flatMap((s) => s.places), ...APP_PLACES].find((p) => p.screen === screen)
const isSkillScreen = (screen: string): boolean =>
  SECTIONS.some((s) => s.places.some((p) => p.screen === screen))

/** Status beside each place, from the loaded skill. */
interface PlaceStatus {
  meta: Record<string, string | null>
  dot: Record<string, boolean>
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
    reload()
  }, [skillPath, reload])
  const drafts = useDrafts(skillPath)

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
  // Scores every output, so it must not rerun on each keystroke of a draft.
  const currentVersion = state?.versions.current.version
  const score = useMemo(
    () => (config && currentVersion ? versionScore(outputs, config, currentVersion) : null),
    [outputs, config, currentVersion],
  )
  const overlays = (
    <>
      <Toast message={message} />
      {confirmDialog}
    </>
  )

  const loaded = skillPath && state && config ? { state, config } : null
  const current = loaded?.state.versions.current
  const unrated = loaded
    ? outputs.filter((o) => o.result && !loaded.state.reviews.reviews[o.key]).length
    : 0
  const home = !loaded
    ? 'library'
    : !loaded.state.cases.length
      ? 'cases'
      : loaded.state.runs.length
        ? 'overview'
        : 'edit'
  const requested = route.screen === 'home' ? home : route.screen
  // A skill screen with no skill open falls back to the library.
  const screen = !skillPath && isSkillScreen(requested) ? 'library' : requested
  const place = placeOf(screen) ?? placeOf(home)
  const running = jobs.some((j) => j.status === 'running')

  const status: PlaceStatus = { meta: {}, dot: {} }
  if (loaded && current) {
    const dirty =
      JSON.stringify(loaded.config) !== JSON.stringify(mergedConfig(loaded.state.savedConfig))
    status.meta = {
      versions: loaded.state.versions.versions.length
        ? String(loaded.state.versions.versions.length)
        : null,
      cases: String(loaded.state.cases.length),
      overview: loaded.state.runs.length ? String(loaded.state.runs.length) : null,
      blind: unrated ? String(unrated) : null,
    }
    status.dot = {
      edit: Object.keys(drafts.files).length > 0,
      versions: current.changed,
      cases: Object.keys(drafts.cases).length > 0,
      knobs: dirty,
    }
  }

  // The one suggested next step, in loop order. Hidden while a job runs or when already there.
  const next: { label: string; screen: string; params?: Record<string, string> } | null =
    !loaded || !current || running
      ? null
      : !loaded.state.cases.length
        ? { label: 'Add a case', screen: 'cases', params: { new: '1' } }
        : current.changed || !loaded.state.runs.length
          ? { label: `Run ${current.version}`, screen: 'generate' }
          : unrated
            ? { label: `Rate ${plural(unrated, 'output')}`, screen: 'blind' }
            : null

  /** The open version, and how it scores: the line every screen shows under the skill's name. */
  const versionLine = current
    ? current.changed
      ? `${current.version} · not saved yet`
      : `${current.version}${current.name ? ` · ${current.name}` : ''}${score === null ? '' : ` · mean ${Math.round(score)}`}`
    : skillPath
      ? 'Loading…'
      : undefined

  const sidebar = (
    <>
      <SkillSwitcher
        name={skillPath ? (state?.skill.name ?? skillPath.split('/').pop() ?? null) : null}
        detail={versionLine}
        onOpen={(path) => openSkill(path)}
        onLibrary={() => go('library')}
      />
      <SidebarBody>
        {skillPath
          ? SECTIONS.map((section) => (
              <SidebarSection key={section.label ?? 'skill'} label={section.label}>
                {section.places.map((p) => (
                  <NavItem
                    key={p.screen}
                    icon={<p.icon aria-hidden="true" />}
                    label={p.label}
                    meta={status.meta[p.screen]}
                    dot={status.dot[p.screen]}
                    current={screen === p.screen}
                    onClick={() => go(p.screen)}
                  />
                ))}
              </SidebarSection>
            ))
          : null}
      </SidebarBody>
      <SidebarFooter>
        <JobsIndicator jobs={jobs} />
        {APP_PLACES.map((p) => (
          <NavItem
            key={p.screen}
            icon={<p.icon aria-hidden="true" />}
            label={p.label}
            current={screen === p.screen}
            onClick={() => go(p.screen)}
          />
        ))}
      </SidebarFooter>
    </>
  )

  const ctx: Ctx | null = loaded
    ? {
        state: loaded.state,
        config: loaded.config,
        setConfig,
        outputs,
        route,
        go,
        toast,
        confirm,
        reload,
        jobs,
        drafts,
        openSkill,
      }
    : null

  const body = (() => {
    if (screen === 'docs')
      return (
        <Suspense fallback={<Loading size="screen" />}>
          <Docs />
        </Suspense>
      )
    if (screen === 'settings')
      return (
        <Suspense fallback={<Loading size="screen" />}>
          <SettingsScreen toast={toast} onSaved={reload} />
        </Suspense>
      )
    if (screen === 'library')
      return <LibraryScreen openSkill={openSkill} toast={toast} confirm={confirm} />
    if (error && !state)
      return (
        <EmptyState
          size="screen"
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
    if (!ctx) return <Loading size="screen" />
    switch (screen) {
      case 'edit':
        return (
          <Suspense fallback={<Loading size="screen" />}>
            <Editor ctx={ctx} />
          </Suspense>
        )
      case 'versions':
        return <Versions ctx={ctx} />
      case 'cases':
        return <Cases ctx={ctx} />
      case 'generate':
        return <Generate ctx={ctx} />
      case 'blind':
        return <Blind ctx={ctx} />
      case 'compare':
        return <Compare ctx={ctx} />
      case 'transcript':
        return <Transcript ctx={ctx} />
      case 'insights':
        return <Insights ctx={ctx} />
      case 'knobs':
        return <Knobs ctx={ctx} />
      default:
        return <Overview ctx={ctx} />
    }
  })()

  return (
    <AppFrame>
      <Sidebar>{sidebar}</Sidebar>
      <Workspace>
        <TopBar>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="sm:hidden"
                aria-label="Menu"
              >
                <MenuIcon aria-hidden="true" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" size="nav">
              {sidebar}
            </PopoverContent>
          </Popover>
          <Heading level="page" className="truncate">
            {place?.label ?? ''}
          </Heading>
          <Spacer />
          {loaded && !loaded.state.jevKey ? (
            <Badge variant="warning" asChild>
              <button
                type="button"
                title="Add a TypeSafe key in Settings to grade with Jev"
                onClick={() => go('settings')}
              >
                No Jev key
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
              <Text tone="muted">Next</Text>
              {next.label}
              <ArrowRightIcon aria-hidden="true" />
            </Button>
          ) : null}
        </TopBar>
        <Pane layout={ctx && WORKBENCH.has(screen) ? 'flush' : 'page'}>{body}</Pane>
      </Workspace>
      {overlays}
    </AppFrame>
  )
}
