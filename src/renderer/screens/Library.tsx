/** Every skill on this machine: open one, create one, or install one for an agent. */

import {
  AGENTS,
  type AgentId,
  isInProgress,
  isInstalled,
  isPractice,
  type Library,
  type LibrarySkill,
} from '@domain/library.ts'
import { rulesFromSkill } from '@domain/rules.ts'
import { TEMPLATES, type TemplateId, templateById } from '@domain/templates.ts'
import { isSlug, SLUG_RULE } from '@domain/text.ts'
import { FolderOpenIcon, PlusIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { api, type Job } from '../api.ts'
import type { Confirm } from '../components/confirm.tsx'
import { Disclosure } from '../components/Disclosure.tsx'
import { Folders } from '../components/Folders.tsx'
import { CheckRow } from '../components/forms.tsx'
import { RunningTag } from '../components/Jobs.tsx'
import {
  EmptyState,
  Field,
  Fieldset,
  FormActions,
  FormSection,
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
import { TextArea } from '../components/TextArea.tsx'
import { Heading, Hint, Text, VisuallyHidden } from '../components/text.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { Label } from '../components/ui/label.tsx'
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
import { useFetch } from '../hooks.ts'
import { REVEAL_LABEL } from '../keys.ts'
import { plural, shortDate } from '../model.ts'
import { useStartPractice } from '../practice.ts'

interface Props {
  /** The new-skill form is open: held in the route, so the sidebar can open it too. */
  creating: boolean
  /** A name to start the new skill with. */
  newName: string
  setCreating: (on: boolean) => void
  openSkill: (path: string, screen?: string) => void
  /** Show a skill's folder in the file manager. Undefined in a browser, which cannot reach one. */
  reveal?: (path: string) => void
  toast: (message: string) => void
  confirm: Confirm
  /** The app's jobs, so a skill being run says so on its row. */
  jobs: readonly Job[]
}

type Act = (work: Promise<unknown>, done: string) => void

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
  toast,
  confirm,
  jobs,
}: Props) {
  const lib = useFetch(() => api.library(), [])
  const [query, setQuery] = useState('')
  const [place, setPlace] = useState('')
  const [view, setView] = useState<View>('yours')
  const [starting, startPractice] = useStartPractice(openSkill, toast)

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
          <Button type="button" onClick={lib.reload}>
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

  const act: Act = async (work, done) => {
    try {
      await work
      toast(done)
      lib.reload()
    } catch (e) {
      toast((e as Error).message)
    }
  }

  if (creating)
    return (
      <NewSkill
        key={newName}
        startName={newName}
        data={data}
        startPractice={practised ? null : startPractice}
        cancel={() => setCreating(false)}
        created={(path) => openSkill(path, 'edit')}
        toast={toast}
      />
    )

  return (
    <Screen>
      {inviting ? (
        <Invitation
          aria-label="Practice"
          title="Learn the loop on a practice skill"
          action={
            <Button type="button" disabled={starting} onClick={startPractice}>
              {starting ? 'Starting…' : 'Start practice'}
            </Button>
          }
        >
          Thank-you note is a finished skill with three cases. Run it, rate what the agent wrote,
          tighten one rule and run it again: a few minutes, nothing to type. It stays inside Skill
          Studio and is installed for no agent.
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

      <Places workspaces={data.workspaces} act={act} toast={toast} />
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
  confirm,
  jobs,
}: {
  skills: LibrarySkill[]
  openSkill: Props['openSkill']
  reveal: Props['reveal']
  act: Act
  confirm: Confirm
  jobs: Props['jobs']
}) {
  const toggle = async (s: LibrarySkill, agent: AgentId, label: string) => {
    if (s.installs[agent] === null)
      return act(api.link(s.path, agent, s.scope), `Installed for ${label}`)
    const ok = await confirm({
      title: `Uninstall ${s.name} from ${label}?`,
      description: 'Only the link is removed.',
      action: 'Uninstall',
    })
    if (ok) act(api.unlink(s.path, agent, s.scope), `Removed from ${label}`)
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
            onClick={rowAction(() => openSkill(s.path))}
          >
            <TableCell wrap>
              <Button
                type="button"
                variant="link"
                size="inline"
                title={s.path}
                onClick={() => openSkill(s.path)}
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
                    onClick={() =>
                      act(
                        api.mark(s.path, !s.source),
                        s.source ? 'Listed with your skills' : 'Listed with installed skills',
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

function NewSkill({
  startName,
  data,
  startPractice,
  cancel,
  created,
  toast,
}: {
  startName: string
  data: Library
  /** Open the practice skill instead; null once it exists. */
  startPractice: (() => void) | null
  cancel: () => void
  created: (path: string) => void
  toast: Props['toast']
}) {
  const [name, setName] = useState(startName)
  const [description, setDescription] = useState('')
  const [scope, setScope] = useState('user')
  const [agents, setAgents] = useState<Set<AgentId>>(() => new Set(['claude']))
  const [templateId, setTemplateId] = useState<TemplateId>('blank')
  const [samples, setSamples] = useState(true)
  const [busy, setBusy] = useState(false)
  const nameError = name && !isSlug(name) ? SLUG_RULE : ''
  const taken = data.skills.some((s) => s.scope === scope && s.path.endsWith(`/${name}`))
  const placeLabel = data.places.find((p) => p.scope === scope)?.label ?? ''
  const template = templateById(templateId)
  const ruleCount = rulesFromSkill(template.body).length

  const toggleAgent = (id: AgentId) =>
    setAgents((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })

  const submit = async () => {
    setBusy(true)
    try {
      const skill = await api.createSkill({
        scope,
        name,
        description,
        agents: [...agents],
        template: templateId,
        samples: samples && template.cases.length > 0,
      })
      toast(`Created ${skill.name}`)
      created(skill.path)
    } catch (e) {
      toast((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Screen width="form">
      <SectionHead>
        <Heading level={2}>New skill</Heading>
        {startPractice ? (
          <Hint>
            New to the loop?{' '}
            <Button type="button" variant="link-muted" size="inline-sm" onClick={startPractice}>
              Start with the practice skill
            </Button>
            , a finished one with three cases to run.
          </Hint>
        ) : null}
      </SectionHead>
      <form
        className="contents"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <FormSection title="Start from" hint={template.summary}>
          <Segmented
            aria-label="Start from"
            fill
            value={templateId}
            onChange={(v) => v && setTemplateId(v)}
            options={TEMPLATES.map((t) => ({ value: t.id, label: t.label }))}
          />
          {template.cases.length ? (
            <CheckRow
              checked={samples}
              onCheckedChange={setSamples}
              description={`The template starts with ${plural(ruleCount, 'example rule')} to replace.`}
            >
              Add {plural(template.cases.length, 'sample case')} to run against
            </CheckRow>
          ) : null}
        </FormSection>

        <FormSection
          title="About it"
          hint="Agents read the name and description to decide when to load the skill."
        >
          <Field>
            <Label htmlFor="ns-name">Name</Label>
            <Input
              id="ns-name"
              value={name}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              font="mono"
              aria-invalid={Boolean(nameError || taken) || undefined}
              aria-describedby="ns-name-help"
              onChange={(e) => setName(e.target.value)}
            />
            <Hint id="ns-name-help" tone={nameError || taken ? 'destructive' : 'default'}>
              {nameError ||
                (taken
                  ? 'A skill with this name is already in that place.'
                  : `Saved in .agents/skills/${name || 'name'} (${placeLabel})`)}
            </Hint>
          </Field>
          <Field>
            <Label htmlFor="ns-desc">Description</Label>
            <TextArea
              id="ns-desc"
              rows={3}
              value={description}
              placeholder={template.description}
              onValueChange={setDescription}
              assist={{
                field: 'skill.description',
                context: () => [
                  {
                    label: 'The new skill',
                    text: `Name: ${name || 'not named yet'}\nKind: ${template.label}. ${template.summary}`,
                  },
                ],
              }}
            />
          </Field>
        </FormSection>

        <FormSection title="Where it lives">
          <Field>
            <Label htmlFor="ns-place">Place</Label>
            <SelectBox
              id="ns-place"
              value={scope}
              onChange={setScope}
              options={data.places.map((p) => ({
                value: p.scope,
                label: p.scope === 'user' ? 'User (every project)' : p.label,
              }))}
            />
          </Field>
          <Fieldset legend="Install for">
            <Toolbar gap="md">
              {AGENTS.map((a) => (
                <CheckRow
                  key={a.id}
                  checked={agents.has(a.id)}
                  onCheckedChange={() => toggleAgent(a.id)}
                >
                  {a.label}
                </CheckRow>
              ))}
            </Toolbar>
          </Fieldset>
        </FormSection>

        <FormActions>
          <Button type="submit" disabled={busy || !name || Boolean(nameError) || taken}>
            {busy ? 'Creating…' : 'Create skill'}
          </Button>
          <Button type="button" variant="ghost" onClick={cancel}>
            Cancel
          </Button>
        </FormActions>
      </form>
    </Screen>
  )
}

function Places({
  workspaces,
  act,
  toast,
}: {
  workspaces: string[]
  act: Act
  toast: (message: string) => void
}) {
  return (
    <Disclosure summary="Where skills are found">
      <Folders
        workspaces={workspaces}
        save={(list, done) => act(api.setWorkspaces(list), done)}
        toast={toast}
      />
    </Disclosure>
  )
}
