/**
 * Run: the button in the top bar that has an agent do the skill's cases. It is
 * a button and not a place, because a run is one step between writing and
 * comparing. Pressing it opens what the run will do, said first because a run
 * costs money, with the one button that starts it under that. What rarely
 * changes (which cases, which agent, how many samples) waits under Options,
 * below the button, so opening it never moves the button away.
 *
 * A run tests the skill as its files are saved. When they changed since the
 * last run, the run keeps a copy of them as the next version, so every score
 * stays tied to the text behind it and nothing has to be saved by hand.
 *
 * The button is yellow when running is the next step of the loop, and plain
 * otherwise. While a run of this skill goes on, it says so and waits.
 */
import { practiceVersionName } from '@domain/practice.ts'
import { CONFIGURATIONS, type Configuration } from '@domain/schemas.ts'
import { PlayIcon } from 'lucide-react'
import { useState } from 'react'
import { api, type Job, type State } from '../api.ts'
import { type Reporter, useToggleSet } from '../hooks.ts'
import { capital, plural, runStamp, shortDate, versionName } from '../model.ts'
import { RUN } from '../places.ts'
import { ComboBox } from './ComboBox.tsx'
import { Disclosure } from './Disclosure.tsx'
import { CheckRow, NumberInput } from './forms.tsx'
import { runningJob } from './Jobs.tsx'
import { Field, Stack } from './layout.tsx'
import { SelectBox } from './SelectBox.tsx'
import { Status } from './Status.tsx'
import { Heading, Hint } from './text.tsx'
import { Button } from './ui/button.tsx'
import { Input } from './ui/input.tsx'
import { Label } from './ui/label.tsx'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover.tsx'

const CONFIG_LABEL: Record<Configuration, string> = {
  with_skill: 'This version',
  without_skill: 'No skill',
  old_skill: 'An earlier version',
}

const CONFIG_HELP: Record<Configuration, string> = {
  with_skill: 'The agent has the skill as its files are saved now.',
  without_skill: 'No skill installed. Run this once to see whether the skill helps at all.',
  old_skill: 'A past run’s copy of the skill, to test an edit against the version before it.',
}

interface Writer {
  engine: string
  model: string
  effort: string
}

export function RunButton({
  state,
  jobs,
  report,
  open,
  onOpenChange,
  next,
  unsaved,
}: {
  state: State
  jobs: Job[]
  report: Reporter
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Running is the next step of the loop: the button is the window's one yellow control. */
  next: boolean
  /** Skill files with edits not saved yet: a run tests the files as saved, so it says so. */
  unsaved: number
}) {
  const engines = state.engines
  const current = state.versions.current
  const withSkill = state.runs.filter((r) => r.hasSkill)
  // The agent the last run used, so a second run compares like with like.
  const last = state.runs
    .flatMap((r) => (r.meta ? [r.meta] : []))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.writer
  const first =
    engines.find((e) => e.id === last?.engine && e.available) ??
    engines.find((e) => e.available) ??
    engines[0]
  const [writer, setWriter] = useState<Writer | null>(null)
  const chosen: Writer | null =
    writer ??
    (first
      ? {
          engine: first.id,
          model:
            first.id === last?.engine ? (last.model ?? first.defaultModel) : first.defaultModel,
          effort: first.id === last?.engine ? (last.effort ?? 'default') : 'default',
        }
      : null)
  const engine = engines.find((e) => e.id === chosen?.engine)
  // Every case runs unless it is left out: a version is compared case by case.
  const [skipped, toggleCase] = useToggleSet<string>([])
  const cases = state.cases.filter((c) => !skipped.has(c.id))
  const [samples, setSamples] = useState(1)
  const [configuration, setConfiguration] = useState<Configuration>('with_skill')
  const [baseline, setBaseline] = useState('')
  const [name, setName] = useState('')
  const [starting, setStarting] = useState(false)
  /** No version yet: this run keeps the first one, and there is no change to name. */
  const firstVersion = !state.versions.versions.length
  // The practice skill's run needs no typing: its new version comes named.
  const fallbackName = state.practice
    ? practiceVersionName(state.versions.versions.length)
    : firstVersion
      ? 'First version'
      : `Edits of ${shortDate(new Date().toISOString())}`
  const count = cases.length * samples
  /**
   * A run of this skill still going. The button stays busy until it is over:
   * starting returns as soon as the job is queued, and a button that came
   * straight back would ask to be pressed again.
   */
  const running = runningJob(
    jobs.filter((j) => j.skillPath === state.skill.path),
    'generate',
  )
  const pastRun = withSkill.find((r) => r.name === baseline) ?? withSkill[0] ?? null
  const usable = Boolean(chosen && engine?.available)

  const start = async () => {
    if (!chosen) return
    setStarting(true)
    try {
      await api.generate({
        cases: cases.map((c) => c.id),
        configs: [chosen],
        samples,
        configuration,
        baselineRun: configuration === 'old_skill' ? (pastRun?.name ?? null) : null,
        skillName: name.trim() || (current.changed ? fallbackName : null),
        note: '',
        grade: true,
      })
      report(`Run started: ${plural(count, 'output')}`)
      setName('')
      onOpenChange(false)
    } catch (e) {
      report(e as Error)
    } finally {
      setStarting(false)
    }
  }

  const lead =
    configuration === 'without_skill'
      ? {
          title: 'Run without the skill',
          hint: `The same cases with no skill installed, filed under ${current.version}. It is the score the skill has to beat.`,
        }
      : configuration === 'old_skill'
        ? {
            title: pastRun ? `Run ${versionName(pastRun)}` : 'Run an earlier version',
            hint: pastRun
              ? `The copy of the skill from the run of ${runStamp(pastRun)}, to test the latest edit against.`
              : 'No earlier run kept a copy of the skill.',
          }
        : {
            title: `Run ${current.version}`,
            hint: !current.changed
              ? `Unchanged since its last run, so new outputs join ${current.version}’s.`
              : firstVersion
                ? `The first run keeps the skill as ${current.version}, so every score stays tied to the text behind it.`
                : `The skill changed since its last run, so this run keeps it as ${current.version}.`,
          }
  const configurations = withSkill.length
    ? CONFIGURATIONS
    : CONFIGURATIONS.filter((c) => c !== 'old_skill')
  const missing = engines.filter((e) => !e.available)

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={next ? 'signal' : 'outline'}
          size="sm"
          busy={Boolean(running)}
          busyLabel="Running…"
        >
          <RUN.icon aria-hidden="true" />
          {RUN.label} {current.version}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        size="form"
        aria-label="Run"
        className="max-h-(--radix-popover-content-available-height) overflow-y-auto overscroll-contain"
      >
        <Stack gap="xs">
          <Heading level={3} as="h2">
            {lead.title}
          </Heading>
          <Hint>{lead.hint}</Hint>
        </Stack>
        {configuration === 'with_skill' && current.changed && !firstVersion && !state.practice ? (
          <Field>
            <Label htmlFor="run-name">What changed</Label>
            <Input
              id="run-name"
              type="text"
              placeholder={fallbackName}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Hint>Names {current.version}, so you can tell versions apart later.</Hint>
          </Field>
        ) : null}
        {unsaved && configuration === 'with_skill' ? (
          <Status
            tone="warning"
            size="ui"
            detail="A run tests the files as saved. Save them on the Skill screen first."
          >
            {plural(unsaved, 'file')} with unsaved edits
          </Status>
        ) : null}
        <Stack gap="md">
          <Hint tabular>
            {!usable
              ? 'No agent is set up to write the outputs.'
              : !cases.length
                ? 'Tick at least one case under Options.'
                : `${plural(count, 'output')}: ${plural(cases.length, 'case')} × ${plural(samples, 'sample')}, graded ${state.jevKey ? 'by Jev' : 'by code checks only: no Jev key'}. Each output is an agent session.`}
          </Hint>
          <Button
            type="button"
            disabled={!usable || !cases.length || (configuration === 'old_skill' && !pastRun)}
            busy={starting}
            busyLabel="Starting…"
            onClick={start}
          >
            <PlayIcon aria-hidden="true" />
            Start a run
          </Button>
        </Stack>
        <Disclosure summary="Options">
          <Stack gap="lg">
            <Field role="group" aria-labelledby="run-cases">
              <Label id="run-cases">Cases</Label>
              <Stack gap="md">
                {state.cases.map((c) => (
                  <CheckRow
                    key={c.id}
                    size="sm"
                    checked={!skipped.has(c.id)}
                    onCheckedChange={() => toggleCase(c.id)}
                  >
                    {c.title}
                  </CheckRow>
                ))}
              </Stack>
            </Field>
            <Field>
              <Label htmlFor="run-with">Write with</Label>
              <SelectBox
                id="run-with"
                width="full"
                value={configuration}
                onChange={(v) => setConfiguration(v as Configuration)}
                options={configurations.map((c) => ({ value: c, label: CONFIG_LABEL[c] }))}
              />
              <Hint>{CONFIG_HELP[configuration]}</Hint>
            </Field>
            {configuration === 'old_skill' ? (
              <Field>
                <Label htmlFor="run-baseline">Copy from</Label>
                <SelectBox
                  id="run-baseline"
                  width="full"
                  value={pastRun?.name ?? ''}
                  onChange={setBaseline}
                  options={withSkill.map((r) => ({
                    value: r.name,
                    label: `${versionName(r)} · ${runStamp(r)}`,
                  }))}
                />
              </Field>
            ) : null}
            <Field>
              <Label htmlFor="run-agent">Agent</Label>
              <SelectBox
                id="run-agent"
                width="full"
                value={chosen?.engine ?? ''}
                onChange={(id) => {
                  const picked = engines.find((x) => x.id === id)
                  setWriter({ engine: id, model: picked?.defaultModel ?? '', effort: 'default' })
                }}
                options={engines.map((e) => ({
                  value: e.id,
                  label: `${e.label}${e.available ? '' : ' (not set up)'}`,
                  disabled: !e.available,
                }))}
              />
            </Field>
            <Field>
              <Label htmlFor="run-model">Model</Label>
              <ComboBox
                id="run-model"
                noun="model"
                value={chosen?.model ?? ''}
                onChange={(model) => chosen && setWriter({ ...chosen, model })}
                options={engine?.models ?? []}
                placeholder={engine?.defaultModel ?? 'Model'}
              />
            </Field>
            <Field>
              <Label htmlFor="run-effort">Effort</Label>
              <SelectBox
                id="run-effort"
                width="full"
                value={chosen?.effort ?? 'default'}
                onChange={(effort) => chosen && setWriter({ ...chosen, effort })}
                options={[
                  { value: 'default', label: 'Default' },
                  // The engine lists its own default too; it is the first option already.
                  ...(engine?.efforts ?? [])
                    .filter((ef) => ef !== 'default')
                    .map((ef) => ({ value: ef, label: capital(ef) })),
                ]}
              />
            </Field>
            <Field>
              <Label htmlFor="run-samples">Samples per case</Label>
              <NumberInput
                id="run-samples"
                min={1}
                max={10}
                value={samples}
                onChange={(e) => setSamples(Math.min(10, Math.max(1, Number(e.target.value) || 1)))}
              />
              <Hint>
                An agent answers a little differently each time. Two or more show how steady the
                skill is.
              </Hint>
            </Field>
          </Stack>
        </Disclosure>
        {missing.map((e) => (
          <Hint key={e.id}>
            {e.label} is not set up. {e.hint}
          </Hint>
        ))}
      </PopoverContent>
    </Popover>
  )
}
