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
import { TextArea } from '../components/TextArea.tsx'
import { useFetch } from '../hooks.ts'
import { plural, shortDate } from '../model.ts'

interface Props {
  openSkill: (path: string, screen?: string) => void
  toast: (message: string) => void
}

type Act = (work: Promise<unknown>, done: string) => void

export function LibraryScreen({ openSkill, toast }: Props) {
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

  if (lib.error) return <p className="help">{lib.error}</p>
  if (!data) return <p className="help">Finding skills…</p>

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
    <div className="screen library">
      <div className="section-head">
        <h2>Skills</h2>
        <span className="muted small tnum">
          {data.skills.length} in {plural(placeCount, 'place')}
        </span>
        <span className="spacer" />
        {creating ? null : (
          <button type="button" className="primary" onClick={() => setCreating(true)}>
            New skill
          </button>
        )}
      </div>

      {creating ? (
        <NewSkill
          data={data}
          cancel={() => setCreating(false)}
          created={(path) => openSkill(path, 'edit')}
          toast={toast}
        />
      ) : null}

      {working.length && working.length < data.skills.length && !filtering ? (
        <section className="section">
          <div className="section-head">
            <h3>In progress</h3>
            <p className="help">Skills with cases or runs, and ones you opened here.</p>
          </div>
          <SkillTable skills={working} openSkill={openSkill} act={act} />
        </section>
      ) : null}

      <section className="section">
        <h3>{filtering ? 'Matches' : 'All skills'}</h3>
        <div className="toolbar">
          <input
            type="search"
            enterKeyHint="search"
            className="search"
            aria-label="Search skills"
            placeholder="Search by name or description"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select aria-label="Place" value={place} onChange={(e) => setPlace(e.target.value)}>
            <option value="">Every place</option>
            {data.places.map((p) => (
              <option key={p.scope} value={p.scope}>
                {p.label}
              </option>
            ))}
          </select>
          {installedCount ? (
            <label className="check-row small">
              <input
                type="checkbox"
                checked={showInstalled}
                onChange={(e) => setShowInstalled(e.target.checked)}
              />
              Show {plural(installedCount, 'skill')} installed from elsewhere
            </label>
          ) : null}
        </div>
        {listed.length ? (
          <SkillTable skills={listed} openSkill={openSkill} act={act} />
        ) : (
          <div className="empty compact">
            <p className="help">
              {data.skills.length
                ? 'No skill matches. Try another word, or every place.'
                : 'No skills on this machine yet. Create the first one.'}
            </p>
          </div>
        )}
      </section>

      <Places workspaces={data.workspaces} act={act} />
    </div>
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
}: {
  skills: LibrarySkill[]
  openSkill: Props['openSkill']
  act: Act
}) {
  const toggle = (s: LibrarySkill, agent: AgentId, label: string) => {
    if (s.installs[agent] === null) act(api.link(s.path, agent, s.scope), `Installed for ${label}`)
    else if (window.confirm(`Uninstall ${s.name} from ${label}? Only the link is removed.`))
      act(api.unlink(s.path, agent, s.scope), `Removed from ${label}`)
  }

  return (
    <div className="scroll-x">
      <table className="grid-table library-table">
        <thead>
          <tr>
            <th>Skill</th>
            <th>Place</th>
            <th>Installed for</th>
            <th className="num">Evals</th>
            <th className="num">Edited</th>
            <th className="num">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {skills.map((s) => (
            <tr key={s.path}>
              <td className="skill-cell">
                <button
                  type="button"
                  className="link skill-link"
                  title={s.path}
                  onClick={() => openSkill(s.path)}
                >
                  {s.name}
                </button>
                {s.description ? <span className="sub clamp">{s.description}</span> : null}
              </td>
              <td className="small nowrap">
                {s.scopeLabel}
                {s.source && s.source !== 'marked' ? <span className="sub">{s.source}</span> : null}
              </td>
              <td>
                <span className="agents">
                  {AGENTS.map((a) => {
                    const state = s.installs[a.id]
                    const fixed = state === 'here' || state === 'copy' || s.scope === 'other'
                    return (
                      <button
                        key={a.id}
                        type="button"
                        className={`agent${state === 'copy' ? ' copy' : ''}`}
                        aria-pressed={state === 'here' || state === 'link'}
                        aria-disabled={fixed || undefined}
                        title={INSTALL_TITLE[state ?? 'none'](a.label)}
                        onClick={() => fixed || toggle(s, a.id, a.label)}
                      >
                        {a.label.replace(' Code', '')}
                        {state === 'copy' ? <span className="agent-note">copy</span> : null}
                      </button>
                    )
                  })}
                </span>
              </td>
              <td className="num small tnum">
                {s.cases || s.runs ? (
                  `${plural(s.cases, 'case')} · ${plural(s.runs, 'run')}`
                ) : (
                  <span className="faint">None</span>
                )}
              </td>
              <td className="num small tnum">{shortDate(s.modified)}</td>
              <td className="num">
                <span className="actions">
                  {s.source === null || s.source === 'marked' ? (
                    <button
                      type="button"
                      className="link muted small row-extra"
                      onClick={() =>
                        act(
                          api.mark(s.path, !s.source),
                          s.source ? 'Listed with your skills' : 'Hidden with installed skills',
                        )
                      }
                    >
                      {s.source ? 'Mine' : 'Not mine'}
                    </button>
                  ) : null}
                  <button type="button" onClick={() => openSkill(s.path)}>
                    Open
                  </button>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
    <form
      className="panel new-skill"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <h3>New skill</h3>
      <div className="form-grid">
        <span id="ns-template-label">Start from</span>
        <div className="field">
          <fieldset className="seg fill" aria-labelledby="ns-template-label">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={t.id === templateId}
                onClick={() => setTemplateId(t.id)}
              >
                {t.label}
              </button>
            ))}
          </fieldset>
          <span className="help">
            {template.summary}
            {template.cases.length
              ? ` Starts with ${plural(ruleCount, 'example rule')} to replace.`
              : ''}
          </span>
          {template.cases.length ? (
            <label className="check-row small">
              <input
                type="checkbox"
                checked={samples}
                onChange={(e) => setSamples(e.target.checked)}
              />
              Add {plural(template.cases.length, 'sample case')} to run against
            </label>
          ) : null}
        </div>

        <label htmlFor="ns-name">Name</label>
        <div className="field">
          <input
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
          <span id="ns-name-help" className={`help${nameError || taken ? ' bad' : ''}`}>
            {nameError ||
              (taken
                ? 'A skill with this name is already in that place.'
                : `Saved in .agents/skills/${name || 'name'} (${placeLabel})`)}
          </span>
        </div>

        <label htmlFor="ns-desc">Description</label>
        <div className="field">
          <TextArea
            id="ns-desc"
            rows={3}
            value={description}
            placeholder={template.description}
            aria-describedby="ns-desc-help"
            onChange={(e) => setDescription(e.target.value)}
          />
          <span id="ns-desc-help" className="help">
            What it does and when to use it. Agents read this to decide when to load the skill.
          </span>
        </div>

        <label htmlFor="ns-place">Place</label>
        <select id="ns-place" value={scope} onChange={(e) => setScope(e.target.value)}>
          {data.places.map((p) => (
            <option key={p.scope} value={p.scope}>
              {p.scope === 'user' ? 'User (every project)' : p.label}
            </option>
          ))}
        </select>

        <span>Install for</span>
        <div className="actions">
          {AGENTS.map((a) => (
            <label key={a.id} className="check-row">
              <input
                type="checkbox"
                checked={agents.has(a.id)}
                onChange={() => toggleAgent(a.id)}
              />
              {a.label}
            </label>
          ))}
        </div>
      </div>
      <div className="actions">
        <button
          type="submit"
          className="primary"
          disabled={busy || !name || Boolean(nameError) || taken}
        >
          Create skill
        </button>
        <button type="button" className="ghost" onClick={cancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function Places({ workspaces, act }: { workspaces: string[]; act: Act }) {
  const [adding, setAdding] = useState('')
  const save = (list: string[], done: string) => act(api.setWorkspaces(list), done)
  return (
    <details className="places">
      <summary className="small">Where skills are found</summary>
      <div className="stack">
        <p className="help">
          Your user folders (~/.agents, ~/.claude, ~/.cursor and ~/.codex skills), plus every
          project with a skills folder up to three levels inside these folders:
        </p>
        <ul className="place-list">
          {workspaces.map((w) => (
            <li key={w}>
              <span className="mono">{w}</span>
              <button
                type="button"
                className="link muted small"
                onClick={() =>
                  save(
                    workspaces.filter((x) => x !== w),
                    `Stopped looking in ${w}`,
                  )
                }
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <form
          className="actions"
          onSubmit={(e) => {
            e.preventDefault()
            const folder = adding.trim()
            if (!folder) return
            save([...workspaces, folder], `Looking in ${folder}`)
            setAdding('')
          }}
        >
          <input
            aria-label="Folder to look in"
            placeholder="~/Projects"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
          />
          <button type="submit" disabled={!adding.trim()}>
            Add folder
          </button>
        </form>
      </div>
    </details>
  )
}
