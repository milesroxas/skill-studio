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
import { PlusIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { api } from '../api.ts'
import type { Confirm } from '../components/confirm.tsx'
import { Disclosure } from '../components/Disclosure.tsx'
import { CheckRow } from '../components/forms.tsx'
import {
  EmptyState,
  Field,
  Fieldset,
  FormActions,
  FormSection,
  Loading,
  PlainList,
  Screen,
  Section,
  SectionHead,
  Spacer,
  Stack,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table.tsx'
import { Toggle } from '../components/ui/toggle.tsx'
import { useFetch } from '../hooks.ts'
import { plural, shortDate } from '../model.ts'

interface Props {
  /** The new-skill form is open: held in the route, so the sidebar can open it too. */
  creating: boolean
  /** A name to start the new skill with. */
  newName: string
  setCreating: (on: boolean) => void
  openSkill: (path: string, screen?: string) => void
  toast: (message: string) => void
  confirm: Confirm
}

type Act = (work: Promise<unknown>, done: string) => void

export function LibraryScreen({
  creating,
  newName,
  setCreating,
  openSkill,
  toast,
  confirm,
}: Props) {
  const lib = useFetch(() => api.library(), [])
  const [query, setQuery] = useState('')
  const [place, setPlace] = useState('')
  const [showInstalled, setShowInstalled] = useState(false)
  const [starting, setStarting] = useState(false)

  /** Open the practice skill, written with its cases on the first call. */
  const startPractice = async () => {
    setStarting(true)
    try {
      const skill = await api.practice()
      openSkill(skill.path)
    } catch (e) {
      toast((e as Error).message)
      setStarting(false)
    }
  }

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
  const installedCount = matches.filter(isInstalled).length
  const listed = showInstalled ? matches : matches.filter((s) => !isInstalled(s))
  const placeCount = new Set(data.skills.map((s) => s.scope)).size
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
      <Toolbar gap="md">
        <Input
          type="search"
          enterKeyHint="search"
          aria-label="Search skills"
          placeholder="Search by name or description"
          value={query}
          width="wide"
          onChange={(e) => setQuery(e.target.value)}
        />
        <SelectBox
          aria-label="Place"
          value={place}
          onChange={setPlace}
          none="Every place"
          options={data.places.map((p) => ({ value: p.scope, label: p.label }))}
        />
        {installedCount ? (
          <CheckRow size="sm" checked={showInstalled} onCheckedChange={setShowInstalled}>
            Show {plural(installedCount, 'skill')} installed from elsewhere
          </CheckRow>
        ) : null}
        <Spacer />
        <Button
          type="button"
          variant={inviting ? 'outline' : 'default'}
          onClick={() => setCreating(true)}
        >
          <PlusIcon aria-hidden="true" />
          New skill
        </Button>
      </Toolbar>

      {working.length && working.length < data.skills.length && !filtering ? (
        <Section>
          <SectionHead>
            <Heading level={2}>In progress</Heading>
            <Hint>Skills with cases or runs, and ones you opened here.</Hint>
          </SectionHead>
          <SkillTable skills={working} openSkill={openSkill} act={act} confirm={confirm} />
        </Section>
      ) : null}

      <Section>
        <SectionHead>
          <Heading level={2}>{filtering ? 'Matches' : 'All skills'}</Heading>
          <Text tone="muted" size="xs" tabular>
            {filtering ? listed.length : `${data.skills.length} in ${plural(placeCount, 'place')}`}
          </Text>
        </SectionHead>
        {listed.length ? (
          <SkillTable skills={listed} openSkill={openSkill} act={act} confirm={confirm} />
        ) : data.skills.length ? (
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
            A skill is a SKILL.md an agent loads when a task calls for it. Start one here, or add a
            folder below where your skills already live.
          </EmptyState>
        )}
      </Section>

      <Places workspaces={data.workspaces} act={act} />
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
  act,
  confirm,
}: {
  skills: LibrarySkill[]
  openSkill: Props['openSkill']
  act: Act
  confirm: Confirm
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
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Skill</TableHead>
          <TableHead optional>Place</TableHead>
          <TableHead>Installed for</TableHead>
          <TableHead numeric optional>
            Evals
          </TableHead>
          <TableHead numeric optional>
            Edited
          </TableHead>
          <TableHead numeric>
            <VisuallyHidden>Actions</VisuallyHidden>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {skills.map((s) => (
          <TableRow key={s.path} align="top" interactive>
            <TableCell wrap wide>
              <Button
                type="button"
                variant="link"
                size="inline"
                title={s.path}
                onClick={() => openSkill(s.path)}
              >
                {s.name}
              </Button>
              {s.description ? (
                <Text block tone="muted" size="xs" clamp>
                  {s.description}
                </Text>
              ) : null}
            </TableCell>
            <TableCell wrap optional>
              <Text size="xs" wrap="anywhere" title={s.scopeLabel}>
                {shortPlace(s.scopeLabel)}
              </Text>
              {s.source && s.source !== 'marked' ? (
                <Text block tone="muted" size="xs">
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
            <TableCell numeric optional>
              <Text size="xs" tabular>
                {s.cases || s.runs ? (
                  `${plural(s.cases, 'case')} · ${plural(s.runs, 'run')}`
                ) : (
                  <Text tone="faint">None</Text>
                )}
              </Text>
            </TableCell>
            <TableCell numeric optional>
              <Text size="xs" tabular>
                {shortDate(s.modified)}
              </Text>
            </TableCell>
            <TableCell numeric>
              {isPractice(s) ? null : s.source === null || s.source === 'marked' ? (
                <Button
                  type="button"
                  variant="ghost"
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
              ) : null}
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

function Places({ workspaces, act }: { workspaces: string[]; act: Act }) {
  const [adding, setAdding] = useState('')
  const save = (list: string[], done: string) => act(api.setWorkspaces(list), done)
  return (
    <Disclosure summary="Where skills are found">
      <Stack>
        <Hint>
          Your user folders (~/.agents, ~/.claude, ~/.cursor and ~/.codex skills), plus every
          project with a skills folder up to three levels inside these folders:
        </Hint>
        <PlainList>
          {workspaces.map((w) => (
            <li key={w}>
              <Toolbar gap="md">
                <Text font="mono">{w}</Text>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Stop looking in ${w}`}
                  onClick={() =>
                    save(
                      workspaces.filter((x) => x !== w),
                      `Stopped looking in ${w}`,
                    )
                  }
                >
                  Remove
                </Button>
              </Toolbar>
            </li>
          ))}
        </PlainList>
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault()
            const folder = adding.trim()
            if (!folder) return
            save([...workspaces, folder], `Looking in ${folder}`)
            setAdding('')
          }}
        >
          <Toolbar>
            <Input
              aria-label="Folder to look in"
              placeholder="~/Projects"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="done"
              value={adding}
              width="auto"
              onChange={(e) => setAdding(e.target.value)}
            />
            <Button type="submit" variant="outline" disabled={!adding.trim()}>
              <PlusIcon aria-hidden="true" />
              Add folder
            </Button>
          </Toolbar>
        </form>
      </Stack>
    </Disclosure>
  )
}
