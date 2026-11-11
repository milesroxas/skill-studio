/**
 * The shell. A sidebar holds the open skill (switch with ⌘K), the three
 * screens of its loop (write the skill, write its cases, compare the results)
 * with each one's status, and the library, guide and settings. The top bar
 * goes back and forward through the screens visited, names the one in view,
 * offers the one suggested next step and holds Run, the step between writing
 * and comparing. Library, guide and settings open in the same pane, so the
 * skill in hand stays one click away.
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
import { isLookStep, type LookStep } from '@domain/practice.ts'
import { NEW_CASE_KEY } from '@domain/schemas.ts'
import { ArrowRightIcon, MenuIcon, MessageCircleIcon } from 'lucide-react'
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { clearImprove, useImprove } from './ai.ts'
import { api, currentSkill } from './api.ts'
import { unsavedFiles } from './changes.ts'
import { ChatPanel } from './components/Chat.tsx'
import { useConfirm } from './components/confirm.tsx'
import { HelpButton, ScreenHint } from './components/Help.tsx'
import { ImprovePanel } from './components/Improve.tsx'
import { JobsIndicator } from './components/Jobs.tsx'
import { EmptyState, Loading, Spacer } from './components/layout.tsx'
import { PracticeGuide } from './components/PracticeGuide.tsx'
import { RunButton } from './components/Run.tsx'
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
import { orphanCases, unsavedCases } from './draft-edits.ts'
import { useDrafts } from './drafts.ts'
import { SCREEN_HELP } from './help.ts'
import { back, forward, navigate, usePaneScroll, useRoute } from './history.ts'
import { useNotice } from './hooks.ts'
import { shortcut } from './keys.ts'
import { outputsOf, versionScore } from './model.ts'
import { atTarget, nextStep, screenFor } from './next-step.ts'
import { APP_PLACES, isSkillScreen, placeFor, SKILL_PLACES, WORKBENCH } from './places.ts'
import {
  practiceGuide,
  practiceHome,
  practiceWalk,
  useRestartPractice,
  useStartPractice,
} from './practice.ts'
import { savePreference, setPreferences, usePreferences } from './preferences.ts'
import { markResultsSeen, newestRun, resultsUnread, useResultsSeen } from './results-seen.ts'
import { Cases } from './screens/Cases.tsx'
import { LibraryScreen } from './screens/Library.tsx'
import { Results } from './screens/Results.tsx'
import { Welcome } from './screens/Welcome.tsx'
import { useSkillState } from './skill-state.ts'
import { watchFailures } from './transport.ts'
import { useUpdateNotices, useUpdateStep } from './updates.ts'
import { useJobs } from './use-jobs.ts'

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
  const [asked, go] = useRoute()
  const [notice, report, dismissNotice] = useNotice()
  /**
   * The route in view. Back or Forward to a place seen in another skill waits
   * on the place the reader is on until that skill is open, so no screen shows
   * one skill's place with another's data.
   */
  const shown = useRef(asked)
  const crossing = asked.arrival === 'return' && Boolean(asked.skill) && asked.skill !== skillPath
  const route = crossing ? shown.current : asked
  useLayoutEffect(() => {
    shown.current = route
  })
  const { state, config, error, reload, files } = useSkillState(skillPath, report)
  const jobs = useJobs(reload)
  const [confirm, confirmDialog] = useConfirm()
  const [assistant, setAssistant] = useAssistant()
  /** Run, in the top bar, is open: what the next run will do, over the button that starts it. */
  const [runOpen, setRunOpen] = useState(false)
  const openRun = useCallback(() => setRunOpen(true), [])
  const { thread: improving } = useImprove()
  // A rule sent from the Editor opens the panel on its conversation.
  const improveStarted = improving?.messages[0]?.at ?? null
  useEffect(() => {
    if (improveStarted) setAssistant(true)
  }, [improveStarted, setAssistant])
  const preferences = usePreferences()
  // An update that finishes downloading, or was just installed, says so once.
  useUpdateNotices(report, useUpdateStep(confirm, report))
  // A failure no caller awaits, such as a window that would not open, lands on the status line.
  useEffect(() => watchFailures(report), [report])

  /**
   * Open a skill. Another one closes Run, and the notice about the last one
   * goes, with any Undo it offered, before the skill opens: a step that says
   * what it did once the skill is open, such as making it, is said after.
   */
  const enter = useCallback(
    (path: string) => {
      if (path !== currentSkill()) {
        setRunOpen(false)
        dismissNotice()
      }
      setSkillPath(path)
    },
    [dismissNotice],
  )
  const drafts = useDrafts(skillPath)
  /** The files with unsaved text: a draft that differs from the file on disk. */
  const unsaved = useMemo(
    () => unsavedFiles(files.saved, drafts.files),
    [files.saved, drafts.files],
  )

  const openSkill = useCallback(
    async (path: string, screen = 'home'): Promise<boolean> => {
      enter(path)
      // The entry names its skill itself: the open one changes only once this renders.
      navigate(screen, {}, { skill: path })
      return true
    },
    [enter],
  )
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
  useEffect(() => api.watchOpen?.((path) => void openSkill(path)), [openSkill])
  /** The welcome is shown in this page: the host has no window of its own to give it. */
  const inline = !api.openWelcome
  const openWelcome = () => (api.openWelcome ? api.openWelcome() : go('welcome'))
  /** Show a skill's folder in the file manager; undefined where the host has none to show it in. */
  const revealSkill = api.revealSkill
  const reveal = revealSkill ? (path: string) => void revealSkill(path).catch(report) : undefined
  // Back and Forward return to the skill a place was seen in. An entry made with
  // no skill open keeps the one in hand.
  useEffect(() => {
    const skill = asked.skill
    if (asked.arrival === 'return' && skill && skill !== currentSkill()) enter(skill)
  }, [asked, enter])

  const outputs = useMemo(() => (state ? outputsOf(state) : []), [state])
  // Scores every output, so it must not rerun on each keystroke of a draft.
  const currentVersion = state?.versions.current.version
  const score = useMemo(
    () => (config && currentVersion ? versionScore(outputs, config, currentVersion) : null),
    [outputs, config, currentVersion],
  )

  const loaded = skillPath && state && config ? { state, config } : null
  const current = loaded?.state.versions.current
  /** A job of the open skill is running: its next step waits, and so does its walkthrough. */
  const running = jobs.some((j) => j.status === 'running' && j.skillPath === state?.skill.path)
  /** A job of any skill is running: resetting the app would end it. */
  const anyRunning = jobs.some((j) => j.status === 'running')
  // The practice skill is walked round the whole loop, past the point where the next step is plain.
  const walk = loaded?.state.practice ? practiceWalk(loaded.state, outputs) : null

  // In a browser, before anything else was opened, the app opens on the welcome.
  // A skill opens on the Editor, whatever it holds, so switching skills always
  // lands in the same place. The practice skill opens where its next step
  // happens instead, so the first thing in view is the one thing to do.
  const home =
    inline && !preferences.welcomed && !skillPath
      ? 'welcome'
      : !loaded
        ? 'library'
        : walk
          ? practiceHome(walk)
          : 'editor'
  // The desktop app's welcome has its own window: here its route is only another name for home.
  const requested =
    route.screen === 'home' || (route.screen === 'welcome' && !inline)
      ? home
      : // A name the app has no screen for, typed or from an old link, is home too.
        screenFor(route.screen, home, (name) => placeFor(name) !== undefined)
  // A skill screen with no skill open falls back to the library.
  const screen = !skillPath && isSkillScreen(requested) ? 'library' : requested
  const place = placeFor(screen) ?? placeFor(home)
  const pane = usePaneScroll(route, screen)
  // The look step this visit to a screen marked done, and where: the guide
  // keeps to it until the reader moves on, and coming back does not revive it.
  const [reading, setReading] = useState<{ step: LookStep; at: string } | null>(null)
  const at = `${skillPath ?? ''} ${screen}`
  useEffect(() => setReading((r) => (r && r.at !== at ? null : r)), [at])
  const practice =
    loaded && walk
      ? practiceGuide(loaded.state, outputs, walk, {
          screen,
          params: route.params,
          reading: reading?.at === at ? reading.step : null,
          unsaved: unsaved.includes('SKILL.md'),
          running,
        })
      : null

  // `home` follows the walkthrough, which moves on as soon as a look step's
  // screen opens. Once the skill has loaded, the entry takes the screen `home`
  // chose, so the reader stays on it instead of being carried to the next step.
  const settled = loaded ? home : null
  useEffect(() => {
    if (settled && route.screen === 'home') navigate(settled, {}, { replace: true })
  }, [settled, route.screen])

  // A walkthrough step that only asks to look at a screen is done once that
  // screen opens, though not while a run is still writing what there is to read.
  // The guide goes on showing the step for as long as the screen is in view.
  const looking =
    practice?.step &&
    isLookStep(practice.step) &&
    practice.here &&
    !running &&
    !loaded?.state.practiceSeen.includes(practice.step)
      ? practice.step
      : null
  useEffect(() => {
    if (!looking) return
    setReading({ step: looking, at })
    void api.practiceSeen(looking).then(reload, () => {})
  }, [looking, at, reload])

  // The welcome is where a first visit lands. Going anywhere else, or opening a
  // skill, is the reader moving on: from then on the app opens on the library.
  // In the desktop app this window opening is itself the reader moving on.
  const movedOn = !inline || Boolean(skillPath) || !['home', 'welcome'].includes(route.screen)
  useEffect(() => {
    if (!preferences.welcomed && movedOn) void setPreferences({ welcomed: true }).catch(() => {})
  }, [preferences.welcomed, movedOn])

  // A draft of a case the skill no longer has is shown nowhere, so nothing could clear it: it goes.
  const caseDrafts = drafts.cases
  const dropCaseDraft = drafts.setCase
  const draftsRead = drafts.status !== 'loading'
  useEffect(() => {
    if (!state || state.skill.path !== currentSkill() || !draftsRead) return
    const ids = state.cases.map((c) => c.id)
    for (const key of orphanCases(caseDrafts, ids, NEW_CASE_KEY)) dropCaseDraft(key, null)
  }, [state, caseDrafts, draftsRead, dropCaseDraft])

  /** The cases with unsaved work: a draft that says what the case on disk says is none. */
  const draftedCases = useMemo(
    () => (state ? unsavedCases(state.cases, drafts.cases) : []),
    [state, drafts.cases],
  )
  const status: PlaceStatus = { meta: {}, dot: {} }
  if (loaded && current) {
    status.meta = { cases: String(loaded.state.cases.length) }
    status.dot = { editor: unsaved.length > 0, cases: draftedCases.length > 0 }
  }

  // A run is read once Results has been open since it finished, though not while a job still
  // writes or grades it: what it says is not settled until then.
  const newest = state ? newestRun(state.runs) : null
  const seenAt = useResultsSeen(loaded ? loaded.state.skill.path : null)
  const unread = resultsUnread(newest, seenAt)
  const readingResults = Boolean(loaded) && screen === 'results' && !running && unread
  useEffect(() => {
    if (readingResults && state && newest) markResultsSeen(state.skill.path, newest)
  }, [readingResults, state, newest])

  // The one suggested next step, in loop order: write, run, read the results. None while a job runs.
  const next = nextStep(
    loaded && current
      ? {
          running,
          practice: practice && { next: practice.next },
          cases: loaded.state.cases.length,
          runs: loaded.state.runs.length,
          changed: current.changed,
          unread,
        }
      : null,
  )

  /** The open version, and how it scores: the line every screen shows under the skill's name. */
  const versionLine = current
    ? current.changed
      ? `${current.version} · not run yet`
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
          (practice.steps.some((s) => s.done) || unsaved.length + draftedCases.length > 0)
            ? () => void restartPractice()
            : undefined
        }
      />
      <SidebarBody
        foot={
          practice ? (
            <PracticeGuide
              guide={practice}
              // A step with no screen is the Run button's: open it where it stands.
              onGo={(target) =>
                target.screen === null ? openRun() : go(target.screen, target.params)
              }
              onNew={() => go('library', { new: '1' })}
            />
          ) : null
        }
      >
        {skillPath ? (
          <SidebarSection>
            {SKILL_PLACES.map((p) => (
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
        ) : null}
      </SidebarBody>
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

  // One object while nothing in it changes, so a screen that takes it renders again only when something did.
  const ctx = useMemo<Ctx | null>(
    () =>
      skillPath && state && config
        ? {
            state,
            config,
            outputs,
            route,
            go,
            report,
            confirm,
            reload,
            jobs,
            drafts,
            files,
            openSkill,
            openRun,
          }
        : null,
    [
      skillPath,
      state,
      config,
      outputs,
      route,
      go,
      report,
      confirm,
      reload,
      jobs,
      drafts,
      files,
      openSkill,
      openRun,
    ],
  )

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
            running={anyRunning}
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
              <Button type="button" onClick={() => void openSkill('', 'library')}>
                Go to the library
              </Button>
              <Button type="button" variant="outline" onClick={() => void reload()}>
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
      case 'cases':
        return <Cases ctx={ctx} />
      default:
        return <Results ctx={ctx} />
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
  const keep = (patch: Parameters<typeof setPreferences>[0]) => savePreference(patch, report)

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
          {next?.kind === 'go' && !atTarget(next, screen, route.params) ? (
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
          {/* Run is the step between writing and comparing. It is yellow when it is the next one. */}
          {loaded?.state.cases.length ? (
            <RunButton
              key={loaded.state.skill.path}
              state={loaded.state}
              jobs={jobs}
              report={report}
              open={runOpen}
              onOpenChange={setRunOpen}
              next={next?.kind === 'run'}
              unsaved={unsaved.length}
            />
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
          {improving ? (
            <ImprovePanel
              onBack={() => void clearImprove().catch(report)}
              onClose={() => setAssistant(false)}
            />
          ) : (
            <ChatPanel
              screen={place?.label ?? ''}
              skill={skillPath ? (state?.skill.name ?? null) : null}
              ctx={ctx}
              confirm={confirm}
              onClose={() => setAssistant(false)}
            />
          )}
        </AssistantPane>
      ) : null}
      {confirmDialog}
    </AppFrame>
  )
}
