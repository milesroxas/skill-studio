/** Write new outputs: pick cases, writers, samples and the configuration; watch the job. */
import { practiceVersionName } from '@domain/practice.ts'
import { CONFIGURATIONS, type Configuration } from '@domain/schemas.ts'
import { cva, type VariantProps } from 'class-variance-authority'
import { PlayIcon, PlusIcon, XIcon } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { api } from '../api.ts'
import { ComboBox } from '../components/ComboBox.tsx'
import { CheckRow, NumberInput } from '../components/forms.tsx'
import { JobLogs, ProgressBar, runningJob } from '../components/Jobs.tsx'
import {
  Field,
  FormActions,
  FormSection,
  Screen,
  Section,
  Stack,
  Toolbar,
} from '../components/layout.tsx'
import { Segmented } from '../components/Segmented.tsx'
import { SelectBox } from '../components/SelectBox.tsx'
import { Heading, Hint, Text } from '../components/text.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { Label } from '../components/ui/label.tsx'
import type { Ctx } from '../ctx.ts'
import { useToggleSet } from '../hooks.ts'
import { capital, mergedConfig, plural, runStamp, shortDate, versionName } from '../model.ts'

interface WriterRow {
  id: number
  engine: string
  model: string
  effort: string
}

const CONFIG_LABEL: Record<Configuration, string> = {
  with_skill: 'This version',
  without_skill: 'No skill',
  old_skill: 'An earlier version',
}

const CONFIG_HELP: Record<Configuration, string> = {
  with_skill: 'The agent has the skill as it is now installed.',
  without_skill: 'No skill installed. Run this once to see whether the skill helps at all.',
  old_skill: 'A past run’s copy of the skill, to test an edit against the version before it.',
}

export function Generate({ ctx }: { ctx: Ctx }) {
  const { state, config, setConfig, jobs, report, go, reload } = ctx
  const engines = state.engines
  const first = engines.find((e) => e.available) ?? engines[0]
  const current = state.versions.current
  const withSkill = state.runs.filter((r) => r.hasSkill)
  /** The default case leads the list, so the row every run starts with is the first one. */
  const defaultCase = state.cases.find((c) => c.id === config.defaultCase) ?? null
  const ordered = defaultCase
    ? [defaultCase, ...state.cases.filter((c) => c !== defaultCase)]
    : state.cases
  // One case starts ticked, the default or else the first: running every case is a choice, not a default.
  const [cases, toggleCase] = useToggleSet(ordered[0] ? [ordered[0].id] : [])
  const [writers, setWriters] = useState<WriterRow[]>(
    first ? [{ id: 1, engine: first.id, model: first.defaultModel, effort: 'default' }] : [],
  )
  const [samples, setSamples] = useState(1)
  const [configuration, setConfiguration] = useState<Configuration>('with_skill')
  const [baseline, setBaseline] = useState(withSkill[0]?.name ?? '')
  // The practice skill's form needs no typing: its new version comes named.
  const [skillName, setSkillName] = useState(
    current.changed
      ? state.practice
        ? practiceVersionName(state.versions.versions.length)
        : ''
      : current.name,
  )
  const [note, setNote] = useState('')
  const [grade, setGrade] = useState(true)
  const [busy, setBusy] = useState(false)
  const fallbackName = `Edits of ${shortDate(new Date().toISOString())}`
  const count = cases.size * writers.length * samples
  const missing = engines.filter((e) => !e.available)
  /**
   * A run of this skill still going. The button that started it stays busy
   * until it is over: starting returns as soon as the job is queued, and a
   * button that came straight back would ask to be pressed again.
   */
  const running = runningJob(
    jobs.filter((j) => j.skillPath === state.skill.path),
    'generate',
  )
  const progress = running?.progress

  /**
   * Mark the case every new run starts with, or take the mark off. It is kept
   * in bench.json beside the scoring, written at once over what is saved there
   * so unsaved Scoring edits stay unsaved. The tick moves with it: the case
   * that led the list is unticked and the new one ticked, as a fresh run would
   * start. Either can still be changed by hand.
   */
  const setDefault = async (id: string | null) => {
    try {
      await api.config({ ...mergedConfig(state.savedConfig), defaultCase: id })
      setConfig({ ...config, defaultCase: id })
      const previous = ordered[0]?.id
      const next = id ?? state.cases[0]?.id
      if (previous && previous !== next && cases.has(previous)) toggleCase(previous)
      if (next && !cases.has(next)) toggleCase(next)
      await reload()
      const named = state.cases.find((c) => c.id === id)
      report(named ? `${named.title} is ticked on every new run` : 'No case is ticked by default')
    } catch (e) {
      report(e as Error)
    }
  }

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
      report(`Run started: ${plural(count, 'output')}`)
    } catch (e) {
      report(e as Error)
    } finally {
      setBusy(false)
    }
  }

  const pastRun = withSkill.find((r) => r.name === baseline) ?? null
  /** The version this run files its results under, named as the lead says it. */
  const versionTitle = current.changed
    ? `${current.version} · ${skillName.trim() || fallbackName}`
    : current.name
      ? `${current.version} · ${current.name}`
      : current.version
  const lead =
    configuration === 'without_skill'
      ? {
          title: 'No skill',
          hint: `A baseline: the same cases written without the skill, filed under ${current.version}. It is the score the skill has to beat.`,
        }
      : configuration === 'old_skill'
        ? {
            title: pastRun ? versionName(pastRun) : 'An earlier version',
            hint: pastRun
              ? `The copy of the skill from the run of ${runStamp(pastRun)}, to test the latest edit against.`
              : 'Pick the run whose copy of the skill to use.',
          }
        : {
            title: versionTitle,
            hint: current.changed
              ? `The skill changed since its last run, so this run saves it as ${current.version}.`
              : `Unchanged since its last run, so new results join ${current.version}’s.`,
          }
  const configurations = withSkill.length
    ? CONFIGURATIONS
    : CONFIGURATIONS.filter((c) => c !== 'old_skill')
  const ids = {
    config: 'gen-config',
    agent: 'gen-agent-1',
    model: 'gen-model-1',
    effort: 'gen-effort-1',
  }

  return (
    <Screen width="form">
      {/* What this run tests, first and largest: everything below is how. */}
      <Stack gap="sm">
        <Heading level={2} as="p">
          {lead.title}
        </Heading>
        <Hint>{lead.hint}</Hint>
      </Stack>

      <FormSection title="Skill" hint="What each writer is given.">
        <Field>
          <Label id={ids.config}>Write with</Label>
          <Segmented<Configuration>
            aria-labelledby={ids.config}
            value={configuration}
            onChange={(v) => v && setConfiguration(v)}
            options={configurations.map((c) => ({ value: c, label: CONFIG_LABEL[c] }))}
          />
          <Hint>{CONFIG_HELP[configuration]}</Hint>
        </Field>
        {configuration === 'old_skill' ? (
          <Field>
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
          </Field>
        ) : current.changed ? (
          <Field>
            <Label htmlFor="gen-name">What changed</Label>
            <Input
              id="gen-name"
              type="text"
              placeholder={fallbackName}
              value={skillName}
              onChange={(e) => setSkillName(e.target.value)}
            />
            <Hint>Names {current.version}, so you can tell versions apart later.</Hint>
          </Field>
        ) : null}
      </FormSection>

      <FormSection
        title="Cases"
        hint="The tasks to run. Each one is written once per writer and sample."
      >
        {!state.cases.length ? (
          <Stack gap="md" align="start">
            <Hint>No cases yet. A run needs at least one.</Hint>
            <Button type="button" variant="outline" onClick={() => go('cases', { new: '1' })}>
              <PlusIcon aria-hidden="true" />
              Add a case
            </Button>
          </Stack>
        ) : (
          <>
            <Stack gap="md">
              {ordered.map((c) => (
                <CheckRow
                  key={c.id}
                  checked={cases.has(c.id)}
                  onCheckedChange={() => toggleCase(c.id)}
                  description={c.title !== c.id ? <Text font="mono">{c.id}</Text> : undefined}
                >
                  {c.title}
                </CheckRow>
              ))}
            </Stack>
            {state.cases.length > 1 ? (
              <Field>
                <Label htmlFor="gen-default">Ticked on every new run</Label>
                <SelectBox
                  id="gen-default"
                  width="wide"
                  value={defaultCase?.id ?? ''}
                  none="The first in the list"
                  onChange={(id) => setDefault(id || null)}
                  options={state.cases.map((c) => ({ value: c.id, label: c.title }))}
                />
              </Field>
            ) : null}
          </>
        )}
      </FormSection>

      <FormSection
        title="Writers"
        hint="The agents that do the cases. Add up to four to compare agents or models."
      >
        <Stack gap="md">
          <WriterGrid head>
            <Label htmlFor={ids.agent}>Agent</Label>
            <Label htmlFor={ids.model}>Model</Label>
            <Label htmlFor={ids.effort}>Effort</Label>
          </WriterGrid>
          {writers.map((w, i) => {
            const engine = engines.find((e) => e.id === w.engine)
            const top = i === 0
            return (
              <WriterGrid key={w.id}>
                <SelectBox
                  id={top ? ids.agent : undefined}
                  aria-label={`Agent of writer ${i + 1}`}
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
                <ComboBox
                  id={top ? ids.model : undefined}
                  aria-label={`Model of writer ${i + 1}`}
                  noun="model"
                  value={w.model}
                  onChange={(model) => setWriter(i, { model })}
                  options={engine?.models ?? []}
                  placeholder={engine?.defaultModel ?? 'Model'}
                />
                <SelectBox
                  id={top ? ids.effort : undefined}
                  aria-label={`Effort of writer ${i + 1}`}
                  width="full"
                  value={w.effort}
                  onChange={(effort) => setWriter(i, { effort })}
                  options={[
                    { value: 'default', label: 'Default' },
                    // The engine lists its own default too; it is the first option already.
                    ...(engine?.efforts ?? [])
                      .filter((ef) => ef !== 'default')
                      .map((ef) => ({ value: ef, label: capital(ef) })),
                  ]}
                />
                {writers.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost-muted"
                    size="icon"
                    aria-label={`Remove writer ${i + 1}`}
                    title={`Remove writer ${i + 1}`}
                    onClick={() => setWriters((rows) => rows.filter((_, k) => k !== i))}
                  >
                    <XIcon aria-hidden="true" />
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
              <PlusIcon aria-hidden="true" />
              Add a writer
            </Button>
          </Toolbar>
          {missing.map((e) => (
            <Hint key={e.id}>
              {e.label} is not set up. {e.hint}
            </Hint>
          ))}
        </Stack>
      </FormSection>

      <FormSection title="Options" hint="The defaults suit a first run.">
        <Field>
          <Label htmlFor="gen-samples">Samples per case</Label>
          <NumberInput
            id="gen-samples"
            min={1}
            max={10}
            value={samples}
            onChange={(e) => setSamples(Math.max(1, Number(e.target.value) || 1))}
          />
          <Hint>
            An agent answers a little differently each time. Two or more show how steady the skill
            is.
          </Hint>
        </Field>
        <Field>
          <Label htmlFor="gen-note">Note</Label>
          <Input
            id="gen-note"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What this run is for"
          />
        </Field>
        <CheckRow
          checked={grade}
          onCheckedChange={setGrade}
          description={
            state.jevKey ? 'With Jev and the code checks.' : 'Code checks only: no Jev key.'
          }
        >
          Grade when done
        </CheckRow>
      </FormSection>

      {/*
       * The one step this screen exists for stays in view however long the form
       * above it, with what it will cost said first: a run's size is its price.
       */}
      <FormActions layout="summary" pinned>
        <Stack gap="xs" className="min-w-0 flex-1" role={running ? 'status' : undefined}>
          <Text weight="medium" tabular>
            {running
              ? progress
                ? `${progress.done} of ${plural(progress.total, 'output')} written`
                : `${running.title} is going`
              : count
                ? plural(count, 'output')
                : 'Nothing to run yet'}
          </Text>
          {running && progress ? <ProgressBar {...progress} /> : null}
          <Hint tabular>
            {running
              ? 'The next run can start when this one is done.'
              : !cases.size
                ? 'Tick at least one case.'
                : `${plural(cases.size, 'case')} × ${plural(writers.length, 'writer')} × ${plural(samples, 'sample')}${grade ? ', graded when done' : ''}`}
          </Hint>
        </Stack>
        <Button
          type="button"
          disabled={!cases.size || !writers.length}
          busy={busy || Boolean(running)}
          busyLabel={busy ? 'Starting…' : 'Running…'}
          onClick={submit}
        >
          <PlayIcon aria-hidden="true" />
          Start a run
        </Button>
      </FormActions>

      {jobs.length ? (
        <Section>
          <Heading level={2}>Jobs</Heading>
          <JobLogs jobs={jobs.slice(0, 6)} />
        </Section>
      ) : null}
    </Screen>
  )
}

const writerGrid = cva('grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_36px]', {
  variants: {
    /** The labels over the columns. On a narrow window the fields wrap, so each keeps its own name. */
    head: { true: 'max-md:hidden -mb-0.5', false: 'grid-cols-2' },
  },
  defaultVariants: { head: false },
})

/**
 * Agent, model, effort and remove in one row, under one row of labels; on a
 * narrow window they wrap two per line. The last column is the 36px remove button.
 */
function WriterGrid({ head, children }: VariantProps<typeof writerGrid> & { children: ReactNode }) {
  return <div className={writerGrid({ head })}>{children}</div>
}
