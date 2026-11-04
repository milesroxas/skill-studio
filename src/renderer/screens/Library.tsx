/** Every skill on this machine: open one, create one, or install one for an agent. */

import {
  AGENTS,
  type AgentId,
  isInProgress,
  isInstalled,
  type Library,
  type LibrarySkill,
} from '@domain/library.ts'
import { rulesFromSkill } from '@domain/rules.ts'
import { TEMPLATES, type TemplateId, templateById } from '@domain/templates.ts'
import { isSlug, SLUG_RULE } from '@domain/text.ts'
import { useMemo, useState } from 'react'
import { api } from '../api.ts'
import type { Confirm } from '../components/confirm.tsx'
import { Disclosure } from '../components/Disclosure.tsx'
import { CheckRow } from '../components/forms.tsx'
import {
  EmptyState,
  Field,
  FormGrid,
  Panel,
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
  openSkill: (path: string, screen?: string) => void
  toast: (message: string) => void
  confirm: Confirm
}

type Act = (work: Promise<unknown>, done: string) => void

export function LibraryScreen({ openSkill, toast, confirm }: Props) {
  const lib = useFetch(() => api.library(), [])
  const [query, setQuery] = useState('')
  const [place, setPlace] = useState('')
  const [showInstalled, setShowInstalled] = useState(false)
  const [creating, setCreating] = useState(false)

  const data = lib.data
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (data?.skills ?? []).filter(
      (s) =>
        (!place || s.scope === place) &&
        (!q || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)),
    )
  }, [data, query, place])

  if (lib.error) return <Hint>{lib.error}</Hint>
  if (!data) return <Hint>Finding skills…</Hint>

  const filtering = Boolean(query.trim() || place)
  const working = data.skills.filter(isInProgress)
  const installedCount = matches.filter(isInstalled).length
  const listed = showInstalled ? matches : matches.filter((s) => !isInstalled(s))
  const placeCount = new Set(data.skills.map((s) => s.scope)).size

  const act: Act = async (work, done) => {
    try {
      await work
      toast(done)
      lib.reload()
    } catch (e) {
      toast((e as Error).message)
    }
  }

  return (
    <Screen>
      <SectionHead>
        <Heading level={2}>Skills</Heading>
        <Text tone="muted" size="xs" tabular>
          {data.skills.length} in {plural(placeCount, 'place')}
        </Text>
        <Spacer />
        {creating ? null : (
          <Button type="button" onClick={() => setCreating(true)}>
            New skill
          </Button>
        )}
      </SectionHead>

      {creating ? (
        <NewSkill
          data={data}
          cancel={() => setCreating(false)}
          created={(path) => openSkill(path, 'edit')}
          toast={toast}
        />
      ) : null}

      {working.length && working.length < data.skills.length && !filtering ? (
        <Section>
          <SectionHead>
            <Heading level={3}>In progress</Heading>
            <Hint>Skills with cases or runs, and ones you opened here.</Hint>
          </SectionHead>
          <SkillTable skills={working} openSkill={openSkill} act={act} confirm={confirm} />
        </Section>
      ) : null}

      <Section>
        <Heading level={3}>{filtering ? 'Matches' : 'All skills'}</Heading>
        <Toolbar>
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
        </Toolbar>
        {listed.length ? (
          <SkillTable skills={listed} openSkill={openSkill} act={act} confirm={confirm} />
        ) : (
          <EmptyState size="compact">
            {data.skills.length
              ? 'No skill matches. Try another word, or every place.'
              : 'No skills on this machine yet. Create the first one.'}
          </EmptyState>
        )}
      </Section>

      <Places workspaces={data.workspaces} act={act} />
    </Screen>
  )
}

const INSTALL_TITLE = {
  here: (agent: string) => `${agent}'s skills folder holds these files`,
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
          <TableHead>Place</TableHead>
          <TableHead>Installed for</TableHead>
          <TableHead numeric>Evals</TableHead>
          <TableHead numeric>Edited</TableHead>
          <TableHead numeric>
            <VisuallyHidden>Actions</VisuallyHidden>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {skills.map((s) => (
          <TableRow key={s.path} align="top">
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
            <TableCell>
              <Text size="xs">{s.scopeLabel}</Text>
              {s.source && s.source !== 'marked' ? (
                <Text block tone="muted" size="xs">
                  {s.source}
                </Text>
              ) : null}
            </TableCell>
            <TableCell>
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
                      className={state === 'copy' ? 'border-dashed' : undefined}
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
            </TableCell>
            <TableCell numeric>
              <Text size="xs">
                {s.cases || s.runs ? (
                  `${plural(s.cases, 'case')} · ${plural(s.runs, 'run')}`
                ) : (
                  <Text tone="faint">None</Text>
                )}
              </Text>
            </TableCell>
            <TableCell numeric>
              <Text size="xs">{shortDate(s.modified)}</Text>
            </TableCell>
            <TableCell numeric>
              <Toolbar gap="md" justify="end" wrap={false}>
                {s.source === null || s.source === 'marked' ? (
                  <RowAction
                    onClick={() =>
                      act(
                        api.mark(s.path, !s.source),
                        s.source ? 'Listed with your skills' : 'Hidden with installed skills',
                      )
                    }
                  >
                    {s.source ? 'Mine' : 'Not mine'}
                  </RowAction>
                ) : null}
                <Button type="button" variant="outline" size="sm" onClick={() => openSkill(s.path)}>
                  Open
                </Button>
              </Toolbar>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

/** A rare action: shown on the row being pointed at or tabbed into, always on touch. */
function RowAction(props: React.ComponentProps<typeof Button>) {
  return (
    <Button
      type="button"
      variant="link-muted"
      size="inline"
      className="text-xs opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100"
      {...props}
    />
  )
}

function NewSkill({
  data,
  cancel,
  created,
  toast,
}: {
  data: Library
  cancel: () => void
  created: (path: string) => void
  toast: Props['toast']
}) {
  const [name, setName] = useState('')
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
    <Panel width="form">
      <form
        className="contents"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Heading level={3}>New skill</Heading>
        <FormGrid align="start">
          <span id="ns-template-label">Start from</span>
          <Field>
            <Segmented
              aria-labelledby="ns-template-label"
              fill
              value={templateId}
              onChange={(v) => v && setTemplateId(v)}
              options={TEMPLATES.map((t) => ({ value: t.id, label: t.label }))}
            />
            <Hint>
              {template.summary}
              {template.cases.length
                ? ` Starts with ${plural(ruleCount, 'example rule')} to replace.`
                : ''}
            </Hint>
            {template.cases.length ? (
              <CheckRow size="sm" checked={samples} onCheckedChange={setSamples}>
                Add {plural(template.cases.length, 'sample case')} to run against
              </CheckRow>
            ) : null}
          </Field>

          <Label htmlFor="ns-name">Name</Label>
          <Field>
            <Input
              id="ns-name"
              value={name}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
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

          <Label htmlFor="ns-desc">Description</Label>
          <Field>
            <TextArea
              id="ns-desc"
              rows={3}
              value={description}
              placeholder={template.description}
              aria-describedby="ns-desc-help"
              onChange={(e) => setDescription(e.target.value)}
            />
            <Hint id="ns-desc-help">
              What it does and when to use it. Agents read this to decide when to load the skill.
            </Hint>
          </Field>

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

          <span>Install for</span>
          <Toolbar>
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
        </FormGrid>
        <Toolbar>
          <Button type="submit" disabled={busy || !name || Boolean(nameError) || taken}>
            Create skill
          </Button>
          <Button type="button" variant="ghost" onClick={cancel}>
            Cancel
          </Button>
        </Toolbar>
      </form>
    </Panel>
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
                  variant="link-muted"
                  size="inline-sm"
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
              Add folder
            </Button>
          </Toolbar>
        </form>
      </Stack>
    </Disclosure>
  )
}
