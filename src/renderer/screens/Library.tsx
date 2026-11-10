/** Every skill on this machine: open one, create one, or install one for an agent. */

import {
  AGENTS,
  type AgentId,
  isInProgress,
  isInstalled,
  isPractice,
  type LibrarySkill,
} from '@domain/library.ts'
import { FolderOpenIcon, PlusIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { api, type Job } from '../api.ts'
import type { Confirm } from '../components/confirm.tsx'
import { Disclosure } from '../components/Disclosure.tsx'
import { Folders } from '../components/Folders.tsx'
import { RunningTag } from '../components/Jobs.tsx'
import {
  EmptyState,
  ListBar,
  Loading,
  RefreshButton,
  Screen,
  Section,
  SectionHead,
  Toolbar,
} from '../components/layout.tsx'
import { Segmented } from '../components/Segmented.tsx'
import { SelectBox } from '../components/SelectBox.tsx'
import { Invitation } from '../components/starters.tsx'
import { Heading, Hint, Text, VisuallyHidden } from '../components/text.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import {
  rowAction,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table.tsx'
import { Toggle } from '../components/ui/toggle.tsx'
import { type Reporter, useFetch } from '../hooks.ts'
import { REVEAL_LABEL } from '../keys.ts'
import { scanLibrary } from '../library-scan.ts'
import { plural, shortDate } from '../model.ts'
import { useStartPractice } from '../practice.ts'
import { NewSkill } from './NewSkill.tsx'

interface Props {
  /** The new-skill form is open: held in the route, so the sidebar can open it too. */
  creating: boolean
  /** A name to start the new skill with. */
  newName: string
  setCreating: (on: boolean) => void
  /** Open a skill; false when the reader chose to stay with the one in hand. */
  openSkill: (path: string, screen?: string) => Promise<boolean>
  /** Show a skill's folder in the file manager. Undefined in a browser, which cannot reach one. */
  reveal?: (path: string) => void
  report: Reporter
  confirm: Confirm
  /** The app's jobs, so a skill being run says so on its row. */
  jobs: readonly Job[]
}

/**
 * Run one change to the library and say what it did. `key` names what the
 * change is about, such as a skill's path: its controls stay busy until the
 * work lands, so nothing can be pressed twice.
 */
type Act = (work: Promise<unknown>, done: string, key?: string) => Promise<void>

/** Whose skills the list shows: written here, installed from elsewhere, or both. */
type View = 'yours' | 'installed' | 'all'

const VIEWS: ReadonlyArray<{ value: View; label: string; title: string }> = [
  { value: 'yours', label: 'Yours', title: 'Skills you wrote' },
  { value: 'installed', label: 'Installed', title: 'Skills installed from elsewhere' },
  { value: 'all', label: 'All', title: 'Every skill' },
]

const VIEW_HEADING: Record<View, string> = {
  yours: 'Your skills',
  installed: 'Installed skills',
  all: 'All skills',
}

export function LibraryScreen({
  creating,
  newName,
  setCreating,
  openSkill,
  reveal,
  report,
  confirm,
  jobs,
}: Props) {
  const lib = useFetch(scanLibrary, [])
  const [query, setQuery] = useState('')
  const [place, setPlace] = useState('')
  const [view, setView] = useState<View>('yours')
  /** The skills a change is on its way for, by path: each one's row waits for its own. */
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set())
  const [starting, startPractice] = useStartPractice((path) => void openSkill(path), report)

  // Skills are made and installed outside the app, so coming back to the window reads them again.
  const rescan = lib.reload
  useEffect(() => {
    window.addEventListener('focus', rescan)
    return () => window.removeEventListener('focus', rescan)
  }, [rescan])

  const data = lib.data
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (data?.skills ?? []).filter(
      (s) =>
        (!place || s.scope === place) &&
        (!q || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)),
    )
  }, [data, query, place])

  if (lib.error && !data)
    return (
      <EmptyState
        size="screen"
        title="Could not read the library"
        actions={
          <Button type="button" busy={lib.loading} busyLabel="Trying again…" onClick={lib.reload}>
            Try again
          </Button>
        }
      >
        {lib.error}
      </EmptyState>
    )
  if (!data) return <Loading size="screen" />

  const filtering = Boolean(query.trim() || place)
  const working = data.skills.filter(isInProgress)
  const anyInstalled = data.skills.some(isInstalled)
  const listed =
    view === 'all' ? matches : matches.filter((s) => isInstalled(s) === (view === 'installed'))
  const placeCount = new Set(listed.map((s) => s.scope)).size
  const practised = data.skills.some(isPractice)
  /** Nobody has run anything here yet: lead with the practice skill, and let New skill step back. */
  const inviting = !practised && !data.skills.some((s) => s.runs > 0)

  const act: Act = async (work, done, key) => {
    if (key) setPending((held) => new Set(held).add(key))
    try {
      await work
      report(done)
      lib.reload()
    } catch (e) {
      report(e as Error)
    } finally {
      if (key)
        setPending((held) => {
          const left = new Set(held)
          left.delete(key)
          return left
        })
    }
  }

  if (creating)
    return (
      <NewSkill
        key={newName}
        startName={newName}
        data={data}
        startPractice={practised ? null : startPractice}
        starting={starting}
        cancel={() => setCreating(false)}
        created={async (path) => {
          const opened = await openSkill(path, 'editor')
          // Staying here, the list is shown again: it should hold the skill just made.
          if (!opened) lib.reload()
          return opened
        }}
        report={report}
      />
    )

  return (
    <Screen>
      {inviting ? (
        <Invitation
          aria-label="Walkthrough"
          title="Learn the workflow with a walkthrough"
          action={
            <Button type="button" busy={starting} busyLabel="Starting…" onClick={startPractice}>
              Start the walkthrough
            </Button>
          }
        >
          Thank-you note is a finished skill with three cases. The walkthrough takes it round the
          loop: read it, run it, read what the notes missed, tighten one rule, run it again and
          compare. Nothing to type, and it is installed for no agent.
        </Invitation>
      ) : null}
      <ListBar
        filters={
          <>
            <Input
              type="search"
              enterKeyHint="search"
              aria-label="Search skills"
              placeholder="Search skills"
              value={query}
              width="search"
              onChange={(e) => setQuery(e.target.value)}
            />
            <SelectBox
              aria-label="Place"
              value={place}
              onChange={setPlace}
              none="Every place"
              options={data.places.map((p) => ({ value: p.scope, label: p.label }))}
            />
            {anyInstalled ? (
              <Segmented
                aria-label="Whose skills"
                size="default"
                value={view}
                onChange={(v) => v && setView(v)}
                options={VIEWS}
              />
            ) : null}
          </>
        }
        actions={
          <>
            <RefreshButton label="Look for skills again" onRefresh={rescan} />
            <Button
              type="button"
              variant={inviting ? 'outline' : 'default'}
              onClick={() => setCreating(true)}
            >
              <PlusIcon aria-hidden="true" />
              New skill
            </Button>
          </>
        }
      />

      {working.length &&
      working.length < data.skills.length &&
      !filtering &&
      view !== 'installed' ? (
        <Section>
          <SectionHead>
            <Heading level={2}>In progress</Heading>
            <Hint>Skills with cases or runs, and ones you opened here.</Hint>
          </SectionHead>
          <SkillTable
            jobs={jobs}
            skills={working}
            openSkill={openSkill}
            reveal={reveal}
            act={act}
            pending={pending}
            confirm={confirm}
          />
        </Section>
      ) : null}

      <Section>
        {/* An empty library has one thing to say, and the empty state under here says it. */}
        {data.skills.length ? (
          <SectionHead>
            <Heading level={2}>{filtering ? 'Matches' : VIEW_HEADING[view]}</Heading>
            {listed.length ? (
              <Text tone="muted" size="xs" tabular>
                {filtering ? listed.length : `${listed.length} in ${plural(placeCount, 'place')}`}
              </Text>
            ) : null}
          </SectionHead>
        ) : null}
        {listed.length ? (
          <SkillTable
            jobs={jobs}
            skills={listed}
            openSkill={openSkill}
            reveal={reveal}
            act={act}
            pending={pending}
            confirm={confirm}
          />
        ) : filtering ? (
          <EmptyState size="compact" title="No matches">
            Try another word, or every place.
          </EmptyState>
        ) : data.skills.length ? (
          <EmptyState
            size="compact"
            title={
              view === 'yours' ? 'No skills of your own yet' : 'Nothing installed from elsewhere'
            }
            actions={
              view === 'yours' ? (
                <Button type="button" onClick={() => setCreating(true)}>
                  New skill
                </Button>
              ) : null
            }
          >
            {view === 'yours'
              ? 'Every skill found here was installed from elsewhere. Those are under Installed.'
              : 'Skills from a lock file, and ones you mark as not yours, are listed here.'}
          </EmptyState>
        ) : (
          <EmptyState
            size="compact"
            title="No skills yet"
            actions={
              <Button
                type="button"
                variant={inviting ? 'outline' : 'default'}
                onClick={() => setCreating(true)}
              >
                New skill
              </Button>
            }
          >
            A skill is a SKILL.md an agent loads when a task calls for it. Start one here, or add a
            folder below where your skills already live.
          </EmptyState>
        )}
      </Section>

      <Places
        workspaces={data.workspaces}
        save={(list, done) =>
          // A failure is the list's to report, and its field keeps the path that did not land.
          api.setWorkspaces(list).then(() => {
            report(done)
            lib.reload()
          })
        }
        report={report}
      />
    </Screen>
  )
}

/** A long folder as its last two parts, so the table fits the pane; the full path is in the title. */
const shortPlace = (label: string): string => {
  if (label.length <= 32) return label
  const parts = label.split('/').filter(Boolean)
  return parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : label
}

const INSTALL_TITLE = {
  here: (agent: string) => `${agent}’s skills folder holds these files`,
  link: (agent: string) => `Installed for ${agent} by a link. Click to uninstall.`,
  copy: (agent: string) => `${agent} has its own copy. Edits here do not reach it.`,
  none: (agent: string) => `Install for ${agent}`,
}

function SkillTable({
  skills,
  openSkill,
  reveal,
  act,
  pending,
  confirm,
  jobs,
}: {
  skills: LibrarySkill[]
  openSkill: Props['openSkill']
  reveal: Props['reveal']
  act: Act
  /** The skill whose change is on its way, by path: its row's controls are busy. */
  pending: ReadonlySet<string>
  confirm: Confirm
  jobs: Props['jobs']
}) {
  const toggle = async (s: LibrarySkill, agent: AgentId, label: string) => {
    if (s.installs[agent] === null)
      return act(api.link(s.path, agent, s.scope), `Installed for ${label}`, s.path)
    const ok = await confirm({
      title: `Uninstall ${s.name} from ${label}?`,
      description: 'Only the link is removed.',
      action: 'Uninstall',
    })
    if (ok) act(api.unlink(s.path, agent, s.scope), `Removed from ${label}`, s.path)
  }

  return (
    <Table bleed layout="fixed">
      <TableHeader>
        <TableRow>
          <TableHead>Skill</TableHead>
          <TableHead col="lg" fold="second">
            Place
          </TableHead>
          <TableHead col="xl">Installed for</TableHead>
          <TableHead trailing col="md" fold="last">
            Evals
          </TableHead>
          <TableHead trailing col="xs" fold="last">
            Edited
          </TableHead>
          <TableHead trailing col={reveal ? 'lg' : 'sm'} fold="first">
            <VisuallyHidden>Actions</VisuallyHidden>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {skills.map((s) => (
          <TableRow
            key={s.path}
            align="baseline"
            interactive
            onClick={rowAction(() => void openSkill(s.path))}
          >
            <TableCell wrap>
              <Button
                type="button"
                variant="link"
                size="inline"
                title={s.path}
                onClick={() => void openSkill(s.path)}
              >
                {s.name}
              </Button>
              <RunningTag jobs={jobs} skillPath={s.path} />
              {s.description ? (
                <Text block tone="muted" size="xs" clamp>
                  {s.description}
                </Text>
              ) : null}
            </TableCell>
            <TableCell fold="second">
              <Text block truncate size="xs" title={s.scopeLabel}>
                {shortPlace(s.scopeLabel)}
              </Text>
              {s.source && s.source !== 'marked' ? (
                <Text block truncate tone="muted" size="xs" title={s.source}>
                  {s.source}
                </Text>
              ) : null}
            </TableCell>
            <TableCell>
              {isPractice(s) ? (
                <Text
                  tone="muted"
                  size="xs"
                  title="Kept in Skill Studio’s own folder, so no agent loads it."
                >
                  Stays in the app
                </Text>
              ) : (
                <Toolbar gap="xs" wrap={false}>
                  {AGENTS.map((a) => {
                    const state = s.installs[a.id]
                    const fixed = state === 'here' || state === 'copy' || s.scope === 'other'
                    return (
                      <Toggle
                        key={a.id}
                        variant="outline"
                        size="sm"
                        pressed={state === 'here' || state === 'link'}
                        disabled={pending.has(s.path)}
                        aria-busy={pending.has(s.path) || undefined}
                        aria-disabled={fixed || undefined}
                        title={INSTALL_TITLE[state ?? 'none'](a.label)}
                        onPressedChange={() => fixed || toggle(s, a.id, a.label)}
                      >
                        {a.label.replace(' Code', '')}
                        {state === 'copy' ? (
                          <Text tone="faint" size="xs">
                            copy
                          </Text>
                        ) : null}
                      </Toggle>
                    )
                  })}
                </Toolbar>
              )}
            </TableCell>
            <TableCell trailing fold="last">
              {s.cases || s.runs ? (
                <Text size="xs">{`${plural(s.cases, 'case')} · ${plural(s.runs, 'run')}`}</Text>
              ) : null}
            </TableCell>
            <TableCell trailing fold="last">
              <Text tone="muted" size="xs">
                {shortDate(s.modified)}
              </Text>
            </TableCell>
            <TableCell trailing fold="first">
              <Toolbar gap="xs" justify="end" wrap={false} line>
                {isPractice(s) || (s.source !== null && s.source !== 'marked') ? null : (
                  <Button
                    type="button"
                    variant="ghost-muted"
                    size="sm"
                    title={
                      s.source
                        ? 'List it with your own skills again'
                        : 'List it with the skills installed from elsewhere'
                    }
                    disabled={pending.has(s.path)}
                    aria-busy={pending.has(s.path) || undefined}
                    onClick={() =>
                      act(
                        api.mark(s.path, !s.source),
                        s.source ? 'Listed with your skills' : 'Listed with installed skills',
                        s.path,
                      )
                    }
                  >
                    {s.source ? 'Mine' : 'Not mine'}
                  </Button>
                )}
                {reveal ? (
                  <Button
                    type="button"
                    variant="ghost-muted"
                    size="icon-sm"
                    aria-label={`${REVEAL_LABEL}: ${s.name}`}
                    title={REVEAL_LABEL}
                    onClick={() => reveal(s.path)}
                  >
                    <FolderOpenIcon aria-hidden="true" />
                  </Button>
                ) : null}
              </Toolbar>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function Places({
  workspaces,
  save,
  report,
}: {
  workspaces: string[]
  /** Store the new list; rejects when it could not be stored. */
  save: (list: string[], done: string) => Promise<void>
  report: Reporter
}) {
  return (
    <Disclosure summary="Where skills are found">
      <Folders workspaces={workspaces} save={save} report={report} />
    </Disclosure>
  )
}
