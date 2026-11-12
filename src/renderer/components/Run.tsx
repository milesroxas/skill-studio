/**
 * Run: the button in the top bar that has an agent do the skill's cases. It is
 * a button and not a place, because a run is one step between writing and
 * comparing. Pressing it opens what the run will test, in words a first-time
 * reader knows, and one button that names what it will do ("Run 3 cases"),
 * because a run costs money. Under the button, one line says who does the
 * work. What rarely changes (which cases, which agent, how many attempts)
 * waits under Options, below the button, so opening it never moves the button
 * away, and ticking a case or changing a count changes only the button's words.
 *
 * A run tests the skill as its files are saved. When they changed since the
 * last run, the run keeps a copy of them as the next version, so every score
 * stays tied to the text behind it and nothing has to be saved by hand.
 *
 * The button is yellow when running is the next step of the loop, and plain
 * otherwise. Its label names what pressing it tests: "Run v2", or "Run without
 * skill" before the first run, when the app suggests a run with no skill at all
 * to set the score to beat. That run is a suggestion: the panel offers to test
 * the skill instead, in one press. While a run of this skill goes on, the
 * button says so and waits.
 */
import { practiceVersionName } from '@domain/practice.ts'
import { CONFIGURATIONS, type Configuration } from '@domain/schemas.ts'
import { PlayIcon } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { api, type Job, type State } from '../api.ts'
import { type Reporter, useToggleSet } from '../hooks.ts'
import { useJobStart } from '../job-start.ts'
import { capital, plural, runStamp, shortDate, versionName } from '../model.ts'
import { RUN } from '../places.ts'
import { ComboBox } from './ComboBox.tsx'
import { Disclosure } from './Disclosure.tsx'
import { CheckRow, NumberInput } from './forms.tsx'
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
  with_skill: 'The skill as its files are saved now.',
  without_skill: 'No skill at all. Run this once to see whether the skill helps.',
  old_skill: 'A copy an earlier run kept, to test an edit against the version before it.',
}

/** "3 cases", or "3 cases, 2 attempts each": what the run does, said once on its button. */
const runSize = (cases: number, attempts: number): string =>
  attempts > 1 ? `${plural(cases, 'case')}, ${attempts} attempts each` : plural(cases, 'case')

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
  withoutSkill,
  unsaved,
}: {
  state: State
  jobs: Job[]
  report: Reporter
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Running is the next step of the loop: the button is the window's one yellow control. */
  next: boolean
  /** No run yet: the run to suggest is one without the skill, the score the skill has to beat. */
  withoutSkill: boolean
  /** Skill files with edits not saved yet: a run tests the files as saved, so it says so. */
  unsaved: number
}) {
  const titleId = useId()
  const reasonId = useId()
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
  // Null until the reader picks: the suggested run, which is without the skill before any run.
  const [picked, setConfiguration] = useState<Configuration | null>(null)
  const configuration: Configuration = picked ?? (withoutSkill ? 'without_skill' : 'with_skill')
  const [baseline, setBaseline] = useState('')
  const [name, setName] = useState('')
  /** No version yet: this run keeps the first one, and there is no change to name. */
  const firstVersion = !state.versions.versions.length
  // The practice skill's run needs no typing: its new version comes named.
  const fallbackName = state.practice
    ? practiceVersionName(state.versions.versions.length)
    : firstVersion
      ? 'First version'
      : `Edits of ${shortDate(new Date().toISOString())}`
  const size = runSize(cases.length, samples)
  /**
   * A run of this skill, from the press that starts it until it is over. The
   * button stays busy all that time: starting returns as soon as the job is
   * queued, and a button that came straight back would ask to be pressed again.
   */
  const skillPath = state.skill.path
  const mine = useMemo(() => jobs.filter((j) => j.skillPath === skillPath), [jobs, skillPath])
  const run = useJobStart(mine, 'generate', report)
  const starting = run.starting()
  const running = run.busy()
  // Runs list oldest first: the copy to test an edit against is the newest run's, the version before the edit.
  const pastRun = withSkill.find((r) => r.name === baseline) ?? withSkill.at(-1) ?? null
  const usable = Boolean(chosen && engine?.available)

  const start = () => {
    if (!chosen) return
    void run.start([], async () => {
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
      report(`Run started: ${size}`)
      setName('')
      // The next press runs what is suggested then: the skill, once the run without it is done.
      setConfiguration(null)
      onOpenChange(false)
    })
  }

  // What the run tests and what comes of it, in the reader's words: no file, copy or folder.
  const lead =
    configuration === 'without_skill'
      ? {
          title: withoutSkill ? 'First, test without the skill' : 'Test without the skill',
          hint: 'The same cases with no skill at all. It sets the score your skill has to beat.',
        }
      : configuration === 'old_skill'
        ? {
            title: 'Test an earlier version',
            hint: pastRun
              ? `${versionName(pastRun)}, as it was on ${runStamp(pastRun)}. Compare your latest edits against it.`
              : 'No earlier run kept a copy of the skill.',
          }
        : firstVersion
          ? {
              title: 'Test this skill',
              hint: `Saves it as ${current.version}, so you can compare later edits with it.`,
            }
          : current.changed
            ? {
                title: 'Test your edits',
                hint: `Saves the skill as ${current.version}, so you can compare it with the version before.`,
              }
            : {
                title: `Test ${current.version} again`,
                hint: `Nothing changed since its last run. The new results add to ${current.version}’s.`,
              }
  const configurations = withSkill.length
    ? CONFIGURATIONS
    : CONFIGURATIONS.filter((c) => c !== 'old_skill')
  const missing = engines.filter((e) => !e.available)
  const who = engine?.label ?? 'The agent'

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={next ? 'signal' : 'outline'}
          size="sm"
          busy={running}
          busyLabel="Running…"
        >
          <RUN.icon aria-hidden="true" />
          {configuration === 'without_skill'
            ? `${RUN.label} without skill`
            : `${RUN.label} ${current.version}`}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        size="form"
        aria-labelledby={titleId}
        className="max-h-(--radix-popover-content-available-height) overflow-y-auto overscroll-contain"
      >
        <Stack gap="xs">
          <Heading level={3} as="h2" id={titleId}>
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
        {(unsaved && configuration === 'with_skill') || !state.jevKey ? (
          <Stack gap="sm">
            {unsaved && configuration === 'with_skill' ? (
              <Status
                tone="warning"
                size="ui"
                detail="The run tests the files as saved. Save them on the Skill screen first."
              >
                {plural(unsaved, 'file')} not saved
              </Status>
            ) : null}
            {state.jevKey ? null : (
              <Status
                tone="warning"
                size="ui"
                detail="No rule or check will be marked in this run. Add a key in Settings."
              >
                No Jev key
              </Status>
            )}
          </Stack>
        ) : null}
        <Stack gap="md">
          <Button
            type="button"
            disabled={!usable || !cases.length || (configuration === 'old_skill' && !pastRun)}
            busy={running}
            busyLabel={starting ? 'Starting…' : 'Running…'}
            aria-describedby={usable ? undefined : reasonId}
            onClick={start}
          >
            <PlayIcon aria-hidden="true" />
            {cases.length ? `Run ${size}` : 'Tick a case to run'}
          </Button>
          {usable ? (
            <Hint>
              {state.jevKey
                ? `${who} answers each case, and Jev grades the results.`
                : `${who} answers each case.`}
            </Hint>
          ) : (
            <Status tone="warning" size="ui" id={reasonId} detail="See Agent under Options.">
              No agent is set up
            </Status>
          )}
          {withoutSkill && configuration === 'without_skill' ? (
            // The run without the skill is suggested, never required: one press goes straight to the skill.
            <Button
              type="button"
              variant="link-muted"
              size="inline-sm"
              className="self-start"
              disabled={running}
              onClick={() => setConfiguration('with_skill')}
            >
              Test the skill instead
            </Button>
          ) : null}
        </Stack>
        <Disclosure summary="Options" defaultOpen={!usable}>
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
              <Label htmlFor="run-with">Skill</Label>
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
                <Label htmlFor="run-baseline">Version</Label>
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
              {missing.map((e) => (
                <Hint key={e.id}>
                  {e.label} is not set up. {e.hint}
                </Hint>
              ))}
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
              <Label htmlFor="run-samples">Attempts per case</Label>
              <NumberInput
                id="run-samples"
                min={1}
                max={10}
                value={samples}
                onChange={(e) => setSamples(Math.min(10, Math.max(1, Number(e.target.value) || 1)))}
              />
              <Hint>
                An agent answers a little differently each time. Two or more attempts show whether a
                result was luck.
              </Hint>
            </Field>
          </Stack>
        </Disclosure>
      </PopoverContent>
    </Popover>
  )
}
