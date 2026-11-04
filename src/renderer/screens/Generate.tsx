/** Write new outputs: pick cases, writers, samples and the configuration; watch the job. */
import { CONFIGURATIONS, type Configuration } from '@domain/schemas.ts'
import { useState } from 'react'
import { api } from '../api.ts'
import { CheckRow, NumberInput } from '../components/forms.tsx'
import { JobLogs } from '../components/Jobs.tsx'
import {
  Field,
  Fieldset,
  FormGrid,
  Panel,
  Section,
  Split,
  Stack,
  Toolbar,
} from '../components/layout.tsx'
import { SelectBox } from '../components/SelectBox.tsx'
import { Heading, Hint, Text } from '../components/text.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { Label } from '../components/ui/label.tsx'
import type { Ctx } from '../ctx.ts'
import { useToggleSet } from '../hooks.ts'
import { capital, plural, runStamp, shortDate, versionName } from '../model.ts'

interface WriterRow {
  id: number
  engine: string
  model: string
  effort: string
}

const CONFIG_HELP: Record<Configuration, string> = {
  with_skill: 'The agent has this skill installed.',
  without_skill: 'No skill installed: the baseline the skill has to beat.',
  old_skill: "A past run's copy of the skill, to test an edit against the version before it.",
}

export function Generate({ ctx }: { ctx: Ctx }) {
  const { state, jobs, toast, go } = ctx
  const engines = state.engines
  const first = engines.find((e) => e.available) ?? engines[0]
  const current = state.versions.current
  const withSkill = state.runs.filter((r) => r.hasSkill)
  const [cases, toggleCase] = useToggleSet(state.cases.map((c) => c.id))
  const [writers, setWriters] = useState<WriterRow[]>(
    first ? [{ id: 1, engine: first.id, model: first.defaultModel, effort: 'default' }] : [],
  )
  const [samples, setSamples] = useState(1)
  const [configuration, setConfiguration] = useState<Configuration>('with_skill')
  const [baseline, setBaseline] = useState(withSkill[0]?.name ?? '')
  const [skillName, setSkillName] = useState(current.changed ? '' : current.name)
  const [note, setNote] = useState('')
  const [grade, setGrade] = useState(true)
  const [busy, setBusy] = useState(false)
  const fallbackName = `Edits of ${shortDate(new Date().toISOString())}`
  const count = cases.size * writers.length * samples
  const missing = engines.filter((e) => !e.available)

  const setWriter = (i: number, patch: Partial<WriterRow>) =>
    setWriters((w) => w.map((row, k) => (k === i ? { ...row, ...patch } : row)))
  const submit = async () => {
    setBusy(true)
    try {
      await api.generate({
        cases: [...cases],
        configs: writers.map(({ engine, model, effort }) => ({ engine, model, effort })),
        samples,
        configuration,
        baselineRun: configuration === 'old_skill' ? baseline || null : null,
        skillName: skillName.trim() || (current.changed ? fallbackName : null),
        note,
        grade,
      })
      toast('Started')
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Split layout={jobs.length ? 'even' : 'single'}>
      <Panel>
        <Field>
          <Heading level={3}>Skill version</Heading>
          {current.changed ? (
            <>
              <Hint as="label" htmlFor="gen-name">
                The skill changed since the last run, so this run starts {current.version}. Say what
                changed, so you can tell versions apart later.
              </Hint>
              <Input
                id="gen-name"
                type="text"
                placeholder={fallbackName}
                value={skillName}
                onChange={(e) => setSkillName(e.target.value)}
              />
            </>
          ) : (
            <Hint>
              Runs use {current.version}
              {current.name ? ` · ${current.name}` : ''}, unchanged since its last run.
            </Hint>
          )}
        </Field>

        <Fieldset legend="Cases">
          {!state.cases.length ? (
            <Hint>
              No cases yet.{' '}
              <Button
                type="button"
                variant="link-muted"
                size="inline"
                onClick={() => go('cases', { new: '1' })}
              >
                Add one
              </Button>{' '}
              to run.
            </Hint>
          ) : null}
          {state.cases.map((c) => (
            <CheckRow key={c.id} checked={cases.has(c.id)} onCheckedChange={() => toggleCase(c.id)}>
              {c.title}{' '}
              <Text font="mono" tone="muted" size="xs">
                {c.id}
              </Text>
            </CheckRow>
          ))}
        </Fieldset>

        <Fieldset legend="Writers">
          {writers.map((w, i) => {
            const engine = engines.find((e) => e.id === w.engine)
            return (
              <WriterGrid key={w.id}>
                <SelectBox
                  aria-label="Agent"
                  width="full"
                  value={w.engine}
                  onChange={(id) => {
                    const next = engines.find((x) => x.id === id)
                    setWriter(i, {
                      engine: id,
                      model: next?.defaultModel ?? '',
                      effort: 'default',
                    })
                  }}
                  options={engines.map((e) => ({
                    value: e.id,
                    label: `${e.label}${e.available ? '' : ' (not set up)'}`,
                    disabled: !e.available,
                  }))}
                />
                <Input
                  aria-label="Model"
                  list={`models-${w.id}`}
                  value={w.model}
                  onChange={(e) => setWriter(i, { model: e.target.value })}
                  placeholder="Model"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
                <datalist id={`models-${w.id}`}>
                  {(engine?.models ?? []).map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
                <SelectBox
                  aria-label="Effort"
                  width="full"
                  value={w.effort}
                  onChange={(effort) => setWriter(i, { effort })}
                  options={[
                    { value: 'default', label: 'Default effort' },
                    ...(engine?.efforts ?? []).map((ef) => ({
                      value: ef,
                      label: `${capital(ef)} effort`,
                    })),
                  ]}
                />
                {writers.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={`Remove writer ${i + 1}`}
                    onClick={() => setWriters((rows) => rows.filter((_, k) => k !== i))}
                  >
                    Remove
                  </Button>
                ) : (
                  <span />
                )}
              </WriterGrid>
            )
          })}
          <Toolbar>
            <Button
              type="button"
              variant="outline"
              disabled={writers.length >= 4 || !first}
              onClick={() =>
                first &&
                setWriters((w) => [
                  ...w,
                  {
                    id: Math.max(0, ...w.map((x) => x.id)) + 1,
                    engine: first.id,
                    model: first.defaultModel,
                    effort: 'default',
                  },
                ])
              }
            >
              Add a writer
            </Button>
          </Toolbar>
          {missing.map((e) => (
            <Hint key={e.id}>
              {e.label} is not set up. {e.hint}
            </Hint>
          ))}
        </Fieldset>

        <FormGrid>
          <Label htmlFor="gen-samples">Samples per case</Label>
          <NumberInput
            id="gen-samples"
            min={1}
            max={10}
            value={samples}
            onChange={(e) => setSamples(Math.max(1, Number(e.target.value) || 1))}
          />
          <Label htmlFor="gen-config">Skill</Label>
          <Stack>
            <SelectBox
              id="gen-config"
              value={configuration}
              onChange={(v) => setConfiguration(v as Configuration)}
              options={CONFIGURATIONS.map((c) => ({
                value: c,
                label: capital(c.replace('_', ' ')),
              }))}
            />
            <Hint as="span">{CONFIG_HELP[configuration]}</Hint>
          </Stack>
          {configuration === 'old_skill' ? (
            <>
              <Label htmlFor="gen-baseline">Copy from</Label>
              <SelectBox
                id="gen-baseline"
                width="wide"
                value={baseline}
                onChange={setBaseline}
                options={withSkill.map((r) => ({
                  value: r.name,
                  label: `${versionName(r)} · ${runStamp(r)}`,
                }))}
              />
            </>
          ) : null}
          <Label htmlFor="gen-note">Note</Label>
          <Input
            id="gen-note"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What this run is for"
          />
          <span />
          <CheckRow checked={grade} onCheckedChange={setGrade}>
            Grade when done{' '}
            <Text tone="muted">{state.jevKey ? 'with Jev' : '(code checks only: no Jev key)'}</Text>
          </CheckRow>
        </FormGrid>

        <Toolbar>
          <Button type="button" disabled={busy || !cases.size || !writers.length} onClick={submit}>
            Start run: {plural(count, 'output')}
          </Button>
          {!cases.size ? (
            <Hint>Pick at least one case.</Hint>
          ) : (
            <Hint>
              {plural(cases.size, 'case')} × {plural(writers.length, 'writer')} ×{' '}
              {plural(samples, 'sample')}
            </Hint>
          )}
        </Toolbar>
      </Panel>
      {jobs.length ? (
        <Section>
          <Heading level={2}>Jobs</Heading>
          <JobLogs jobs={jobs.slice(0, 6)} />
        </Section>
      ) : null}
    </Split>
  )
}

/** Agent, model and effort in one row; on a phone they wrap to two per line. */
function WriterGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-1.5 md:grid-cols-[1fr_1fr_1fr_auto]">{children}</div>
}
