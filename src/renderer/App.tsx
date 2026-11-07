/**
 * The shell. A sidebar holds the open skill (switch with ⌘K), every screen of
 * its loop in one flat list with each one's status, and the library, guide and
 * settings. The top bar goes back and forward through the screens visited,
 * names the one in view and offers the one suggested next step. Library, guide
 * and settings open in the same pane, so the skill in hand stays one click away.
 *
 * Help is part of the shell, so it is the same on every screen: each screen
 * says what it is for in one line the first time it opens, and the help button
 * at the end of the top bar says it again, with the screen's words and the way
 * to the guide and the welcome.
 *
 * The welcome is not part of the shell. The desktop app shows it in a small
 * window of its own before this one opens; a browser, which has one page and
 * no windows to give, shows it in place of the shell.
 */
import { isLookStep } from '@domain/practice.ts'
import type { BenchConfig } from '@domain/schemas.ts'
import { ArrowRightIcon, MenuIcon, MessageCircleIcon } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { api, currentSkill, type Job, type State, setSkill } from './api.ts'
import { ChatPanel } from './components/Chat.tsx'
import { useConfirm } from './components/confirm.tsx'
import { HelpButton, ScreenHint } from './components/Help.tsx'
import { JobsIndicator } from './components/Jobs.tsx'
import { EmptyState, Loading, Spacer } from './components/layout.tsx'
import { PracticeGuide } from './components/PracticeGuide.tsx'
import {
  AppFrame,
  AssistantPane,
  HistoryNav,
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
import { StatusLine } from './components/StatusLine.tsx'
import { Heading } from './components/text.tsx'
import { UpdateControl } from './components/Update.tsx'
import { Badge } from './components/ui/badge.tsx'
import { Button } from './components/ui/button.tsx'
import { Popover, PopoverContent, PopoverTrigger } from './components/ui/popover.tsx'
import { Toggle } from './components/ui/toggle.tsx'
import type { Ctx } from './ctx.ts'
import { useDrafts } from './drafts.ts'
import { SCREEN_HELP } from './help.ts'
import { back, forward, navigate, usePaneScroll, useRoute } from './history.ts'
import { useNotice } from './hooks.ts'
import { shortcut } from './keys.ts'
import { mergedConfig, outputsOf, plural, versionScore } from './model.ts'
import { APP_PLACES, isSkillScreen, placeFor, SECTIONS, WORKBENCH } from './places.ts'
import { practiceGuide, useRestartPractice, useStartPractice } from './practice.ts'
import { setPreferences, usePreferences } from './preferences.ts'
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
import { Welcome } from './screens/Welcome.tsx'
import { useUpdateNotices, useUpdateStep } from './updates.ts'

/** The guide, settings and the file editor (CodeMirror, about 110 KB gzipped) load only when opened. */
const Docs = lazy(() => import('./screens/Docs.tsx').then((m) => ({ default: m.Docs })))
const Editor = lazy(() => import('./screens/Editor.tsx').then((m) => ({ default: m.Editor })))
const SettingsScreen = lazy(() =>
  import('./screens/Settings.tsx').then((m) => ({ default: m.SettingsScreen })),
)

const ASSISTANT_KEY = 'skill-studio.assistant'

/** Whether the assistant's panel is open, remembered across reloads, and ⌘J to toggle it. */
function useAssistant(): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(() => localStorage.getItem(ASSISTANT_KEY) === 'open')
  const set = useCallback((next: boolean) => {
    setOpen(next)
    if (next) localStorage.setItem(ASSISTANT_KEY, 'open')
    else localStorage.removeItem(ASSISTANT_KEY)
  }, [])
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'j' || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return
      e.preventDefault()
      set(!open)
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [open, set])
  return [open, set]
}

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
  const [notice, report, dismissNotice] = useNotice()
  const [confirm, confirmDialog] = useConfirm()
  const [assistant, setAssistant] = useAssistant()
  const preferences = usePreferences()
  // An update that finishes downloading, or was just installed, says so once.
  useUpdateNotices(report, useUpdateStep(confirm, report))

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

  const openSkill = useCallback((path: string, screen = 'home') => {
    setSkillPath(path)
    // The entry names its skill itself: the open one changes only once this renders.
    navigate(screen, {}, { skill: path })
  }, [])
  const [starting, startPractice] = useStartPractice(openSkill, report)
  // Starting over lands on the guide's first step, as opening the practice skill does.
  const [restarting, restartPractice] = useRestartPractice(
    confirm,
    drafts.discard,
    async () => {
      await reload()
      go('home')
    },
    report,
  )
  // The desktop app's Help menu opens the guide, and its welcome hands over the practice skill.
  useEffect(() => api.watchGo?.((screen) => navigate(screen)), [])
  useEffect(() => api.watchOpen?.((path) => openSkill(path)), [openSkill])
  /** The welcome is shown in this page: the host has no window of its own to give it. */
  const inline = !api.openWelcome
  const openWelcome = () => (api.openWelcome ? api.openWelcome() : go('welcome'))
  /** Show a skill's folder in the file manager; undefined where the host has none to show it in. */
  const revealSkill = api.revealSkill
  const reveal = revealSkill ? (path: string) => void revealSkill(path).catch(report) : undefined
  // Back and Forward return to the skill a place was seen in. An entry made with
  // no skill open keeps the one in hand.
  useEffect(() => {
    if (route.arrival === 'return' && route.skill) setSkillPath(route.skill)
  }, [route])

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

  const loaded = skillPath && state && config ? { state, config } : null
  const current = loaded?.state.versions.current
  const unrated = loaded
    ? outputs.filter((o) => o.result && !loaded.state.reviews.reviews[o.key]).length
    : 0
  const running = jobs.some((j) => j.status === 'running')
  // The practice skill is walked round the whole loop, past the point where the next step is plain.
  const practice = loaded?.state.practice
    ? practiceGuide(loaded.state, outputs, {
        unsaved: drafts.files['SKILL.md'] !== undefined,
        running,
      })
    : null

  // In a browser, before anything else was opened, the app opens on the welcome.
  // A skill opens on the Editor, whatever it holds, so switching skills always
  // lands in the same place. The practice skill opens on the step in hand
  // instead, so the first thing in view is the one thing to do.
  const home =
    inline && !preferences.welcomed && !skillPath
      ? 'welcome'
      : !loaded
        ? 'library'
        : (practice?.target?.screen ?? 'editor')
  // The desktop app's welcome has its own window: here its route is only another name for home.
  const requested =
    route.screen === 'home' || (route.screen === 'welcome' && !inline) ? home : route.screen
  // A skill screen with no skill open falls back to the library.
  const screen = !skillPath && isSkillScreen(requested) ? 'library' : requested
  const place = placeFor(screen) ?? placeFor(home)
  const pane = usePaneScroll(route, screen)

  // `home` follows the guide, and the guide moves on as soon as a look step's
  // screen opens. Once the skill has loaded, the entry takes the screen `home`
  // chose, so the reader stays on it instead of being carried to the next step.
  const settled = loaded ? home : null
  useEffect(() => {
    if (settled && route.screen === 'home') navigate(settled, {}, { replace: true })
  }, [settled, route.screen])

  // A walkthrough step that only asks to look at a screen is done once that screen opens.
  const looking =
    practice?.step && isLookStep(practice.step) && !running && screen === practice.target?.screen
      ? practice.step
      : null
  useEffect(() => {
    if (looking) void api.practiceSeen(looking).then(reload, () => {})
  }, [looking, reload])

  // The welcome is where a first visit lands. Going anywhere else, or opening a
  // skill, is the reader moving on: from then on the app opens on the library.
  // In the desktop app this window opening is itself the reader moving on.
  const movedOn = !inline || Boolean(skillPath) || !['home', 'welcome'].includes(route.screen)
  useEffect(() => {
    if (!preferences.welcomed && movedOn) void setPreferences({ welcomed: true }).catch(() => {})
  }, [preferences.welcomed, movedOn])

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
      editor: Object.keys(drafts.files).length > 0,
      versions: current.changed,
      cases: Object.keys(drafts.cases).length > 0,
      knobs: dirty,
    }
  }

  // The one suggested next step, in loop order. Hidden while a job runs or when already there.
  const next: { label: string; screen: string; params?: Record<string, string> } | null =
    !loaded || !current || running
      ? null
      : practice
        ? practice.target
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
        onNew={(name) => go('library', name ? { new: '1', name } : { new: '1' })}
        onLibrary={() => go('library')}
        onReveal={skillPath && reveal ? () => reveal(skillPath) : undefined}
        // Rarely wanted, so it waits in this menu. Only once there is something to undo, and never mid-run.
        onRestartPractice={
          practice &&
          !running &&
          !restarting &&
          (practice.steps.some((s) => s.done) ||
            Object.keys(drafts.files).length + Object.keys(drafts.cases).length > 0)
            ? () => void restartPractice()
            : undefined
        }
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
                    title={SCREEN_HELP[p.screen]?.short}
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
      {practice ? (
        <PracticeGuide guide={practice} onGo={go} onNew={() => go('library', { new: '1' })} />
      ) : null}
      <SidebarFooter lead={<UpdateControl confirm={confirm} report={report} />}>
        <JobsIndicator jobs={jobs} />
        {APP_PLACES.map((p) => (
          <NavItem
            key={p.screen}
            icon={<p.icon aria-hidden="true" />}
            label={p.label}
            title={SCREEN_HELP[p.screen]?.short}
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
        report,
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
          {/* Going back to the guide returns to where it was read, not to the section it opened on. */}
          <Docs section={route.arrival === 'step' ? route.params.get('section') : null} />
        </Suspense>
      )
    if (screen === 'settings')
      return (
        <Suspense fallback={<Loading size="screen" />}>
          <SettingsScreen
            running={running}
            report={report}
            onSaved={reload}
            onWelcome={openWelcome}
          />
        </Suspense>
      )
    if (screen === 'library')
      return (
        <LibraryScreen
          creating={route.params.get('new') === '1'}
          newName={route.params.get('name') ?? ''}
          // Leaving the form takes its place in the history: Back never reopens it.
          setCreating={(on) => go('library', on ? { new: '1' } : {}, { replace: !on })}
          openSkill={openSkill}
          reveal={reveal}
          report={report}
          confirm={confirm}
          jobs={jobs}
        />
      )
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
      case 'editor':
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

  const help = SCREEN_HELP[screen] ?? null
  const seen = preferences.hintsSeen
  // Each screen of the loop says what it is for on a first visit, once its skill
  // has loaded and not over a spinner or an error. The library needs no line:
  // on a first visit it already offers the practice skill.
  const hinted = isSkillScreen(screen) && ctx !== null
  const hint =
    help && hinted && preferences.hints === 'show' && !seen.includes(screen) ? help.what : null
  const keep = (patch: Parameters<typeof setPreferences>[0]) =>
    void setPreferences(patch).catch((e: Error) =>
      report(`Not saved: ${e.message}`, { tone: 'destructive' }),
    )

  // The welcome stands alone, with none of the shell around it.
  if (screen === 'welcome')
    return (
      <>
        <Welcome
          first={!preferences.welcomed}
          starting={starting}
          onStart={startPractice}
          // Opened again from the help, it closes back to where it was opened from.
          onLeave={() => (preferences.welcomed && route.index > 0 ? back() : go('library'))}
          report={report}
          notice={notice}
          onDismiss={dismissNotice}
        />
        {confirmDialog}
      </>
    )

  return (
    <AppFrame assistant={assistant}>
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
          {/* A browser has its own Back and Forward. */}
          {api.platform === 'web' ? null : (
            <HistoryNav
              canBack={route.index > 0}
              canForward={route.index < route.last}
              onBack={back}
              onForward={forward}
            />
          )}
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
              variant="signal"
              size="sm"
              onClick={() => go(next.screen, next.params)}
            >
              Next: {next.label}
              <ArrowRightIcon aria-hidden="true" />
            </Button>
          ) : null}
          <HelpButton
            label={place?.label ?? ''}
            help={help}
            hintsOff={preferences.hints === 'hide' || seen.length > 0}
            onGuide={(section) => go('docs', section ? { section } : {})}
            onWelcome={openWelcome}
            onAsk={() => setAssistant(true)}
            onShowHints={() => {
              keep({ hints: 'show', hintsSeen: [] })
              report('Each screen shows its hint again')
            }}
          />
          <Toggle
            size="icon-sm"
            aria-label="Assistant"
            title={`Assistant (${shortcut('J')})`}
            pressed={assistant}
            onPressedChange={setAssistant}
          >
            <MessageCircleIcon aria-hidden="true" />
          </Toggle>
        </TopBar>
        {hint ? (
          <ScreenHint onDismiss={() => keep({ hintsSeen: [...seen, screen] })}>{hint}</ScreenHint>
        ) : null}
        <Pane ref={pane} layout={ctx && WORKBENCH.has(screen) ? 'flush' : 'page'}>
          {body}
        </Pane>
        <StatusLine notice={notice} onDismiss={dismissNotice} />
      </Workspace>
      {assistant ? (
        <AssistantPane>
          <ChatPanel
            screen={place?.label ?? ''}
            skill={skillPath ? (state?.skill.name ?? null) : null}
            confirm={confirm}
            onClose={() => setAssistant(false)}
          />
        </AssistantPane>
      ) : null}
      {confirmDialog}
    </AppFrame>
  )
}
