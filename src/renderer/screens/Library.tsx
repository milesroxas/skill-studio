/** Every skill on this machine: open one, create one, or install one for an agent. */

import {
  AGENTS,
  type AgentId,
  isInProgress,
  isPractice,
  type LibrarySkill,
} from '@domain/library.ts'
import { CheckIcon, FolderOpenIcon, PlusIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
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
import { ContextActions, RowAction, RowActions } from '../components/RowActions.tsx'
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
 * work lands, so nothing can be pressed twice. True when it landed.
 */
type Act = (
  work: Promise<unknown>,
  done: string,
  key?: string,
  undo?: () => void,
) => Promise<boolean>

/** Take a skill out of In progress (`done`), or put it back. */
type MarkDone = (skill: LibrarySkill, done: boolean) => Promise<void>

/** The set without `path`. */
const without = (held: ReadonlySet<string>, path: string): ReadonlySet<string> => {
  const left = new Set(held)
  left.delete(path)
  return left
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
  /** The skills a change is on its way for, by path: each one's row waits for its own. */
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set())
  /** Rows fading out of In progress while their change is saved. */
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(() => new Set())
  /** The row that just moved between lists, written in where it lands. */
  const [arrived, setArrived] = useState<string | null>(null)
  const [starting, startPractice] = useStartPractice((path) => void openSkill(path), report)

  // Skills are made and installed outside the app, so coming back to the window reads them again.
  const rescan = lib.reload
  useEffect(() => {
    window.addEventListener('focus', rescan)
    return () => window.removeEventListener('focus', rescan)
  }, [rescan])

  /** Read when a scan lands, so a row still being saved keeps its fade. */
  const saving = useRef(pending)
  saving.current = pending

  const data = lib.data
  // A row leaves its list once the scan without it lands: until then it stays faded.
  useEffect(() => {
    if (data) setLeaving((held) => new Set([...held].filter((path) => saving.current.has(path))))
  }, [data])
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
  /** Split into In progress and the rest, so each skill is listed once. A search lists every match. */
  const working = filtering ? [] : data.skills.filter(isInProgress)
  const listed = filtering ? matches : data.skills.filter((s) => !isInProgress(s))
  const placeCount = new Set(listed.map((s) => s.scope)).size
  const practised = data.skills.some(isPractice)
  /** Nobody has run anything here yet: lead with the practice skill, and let New skill step back. */
  const inviting = !practised && !data.skills.some((s) => s.runs > 0)

  const act: Act = async (work, done, key, undo) => {
    if (key) setPending((held) => new Set(held).add(key))
    try {
      await work
      report(done, undo ? { undo } : undefined)
      lib.reload()
      return true
    } catch (e) {
      report(e as Error)
      return false
    } finally {
      if (key) setPending((held) => without(held, key))
    }
  }

  const markDone: MarkDone = async (skill, done) => {
    if (done) setLeaving((held) => new Set(held).add(skill.path))
    const landed = await act(
      api.markDone(skill.path, done),
      done ? `Marked ${skill.name} done` : `${skill.name} is back in progress`,
      skill.path,
      done ? () => void markDone(skill, false) : undefined,
    )
    if (landed) setArrived(skill.path)
    // A failed save brings the row back: its fade is a transition, so it turns round.
    else setLeaving((held) => without(held, skill.path))
  }

  /** What each table needs to draw a row moving between lists. */
  const motion = {
    leaving,
    arrived,
    settle: (path: string) => setArrived((now) => (now === path ? null : now)),
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
          title="Learn how it works on a sample skill"
          action={
            <Button type="button" busy={starting} busyLabel="Starting…" onClick={startPractice}>
              Start the walkthrough
            </Button>
          }
        >
          It runs a finished sample skill, shows what its answers missed and has you fix one rule.
          Nothing to type.
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

      {working.length ? (
        <Section>
          <SectionHead>
            <Heading level={2}>In progress</Heading>
            <Hint>Skills you have worked on. Mark one done to move it below.</Hint>
          </SectionHead>
          <SkillTable
            jobs={jobs}
            skills={working}
            openSkill={openSkill}
            reveal={reveal}
            act={act}
            pending={pending}
            confirm={confirm}
            motion={motion}
            markDone={markDone}
          />
        </Section>
      ) : null}

      {/* Every skill is in progress: the list above holds them all. */}
      {listed.length || filtering || !data.skills.length ? (
        <Section>
          {/* An empty library has one thing to say, and the empty state under here says it. */}
          {data.skills.length ? (
            <SectionHead>
              <Heading level={2}>
                {filtering ? 'Matches' : working.length ? 'Other skills' : 'All skills'}
              </Heading>
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
              motion={motion}
            />
          ) : filtering ? (
            <EmptyState size="compact" title="No matches">
              Try another word, or every place.
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
              A skill is a page of instructions an AI agent follows for one kind of task. Start one
              here, or add a folder below where your skills already are.
            </EmptyState>
          )}
        </Section>
      ) : null}

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
  link: (agent: string) => `Installed for ${agent}. Click to uninstall.`,
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
  motion,
  markDone,
}: {
  skills: LibrarySkill[]
  openSkill: Props['openSkill']
  reveal: Props['reveal']
  act: Act
  /** The skill whose change is on its way, by path: its row's controls are busy. */
  pending: ReadonlySet<string>
  confirm: Confirm
  jobs: Props['jobs']
  motion: {
    leaving: ReadonlySet<string>
    arrived: string | null
    /** The arrived row has finished writing itself in. */
    settle: (path: string) => void
  }
  /** In progress only: each row can be marked done. */
  markDone?: MarkDone
}) {
  const toggle = async (s: LibrarySkill, agent: AgentId, label: string): Promise<void> => {
    if (s.installs[agent] === null) {
      await act(api.link(s.path, agent, s.scope), `Installed for ${label}`, s.path)
      return
    }
    const ok = await confirm({
      title: `Uninstall ${s.name} from ${label}?`,
      description: 'Your skill is not deleted.',
      action: 'Uninstall',
    })
    if (ok) await act(api.unlink(s.path, agent, s.scope), `Removed from ${label}`, s.path)
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
          <TableHead trailing col={reveal ? 'lg' : 'sm'} fold="menu">
            <VisuallyHidden>Actions</VisuallyHidden>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {skills.map((s) => {
          // Written once: the row's buttons, its "More actions" menu and its right-click all draw these.
          const actions = (
            <>
              {markDone ? (
                <RowAction
                  icon={<CheckIcon aria-hidden="true" />}
                  title="Move it out of In progress. Editing or running it brings it back."
                  busy={pending.has(s.path)}
                  onSelect={() => void markDone(s, true)}
                >
                  Mark done
                </RowAction>
              ) : null}
              {reveal ? (
                <RowAction
                  icon={<FolderOpenIcon aria-hidden="true" />}
                  show="icon"
                  onSelect={() => reveal(s.path)}
                >
                  {REVEAL_LABEL}
                </RowAction>
              ) : null}
            </>
          )
          return (
            <ContextActions key={s.path} subject={s.name} actions={actions}>
              <TableRow
                align="baseline"
                interactive
                motion={
                  markDone && motion.leaving.has(s.path)
                    ? 'leaving'
                    : motion.arrived === s.path
                      ? 'arrived'
                      : 'none'
                }
                onAnimationEnd={(e) => e.target === e.currentTarget && motion.settle(s.path)}
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
                  {s.source ? (
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
                      title="Kept inside Skill Studio, so no agent uses it."
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
                <TableCell trailing fold="menu">
                  <RowActions subject={s.name}>{actions}</RowActions>
                </TableCell>
              </TableRow>
            </ContextActions>
          )
        })}
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
