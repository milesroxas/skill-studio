/** The scoring settings: weights, thresholds, packs and pack keys. Every output rescores as they move. */
import { DEFAULT_CONFIG } from '@domain/config.ts'
import type { BenchConfig } from '@domain/schemas.ts'
import { scorers } from '@judges/scorers.ts'
import { useState } from 'react'
import { api } from '../api.ts'
import { Disclosure } from '../components/Disclosure.tsx'
import { CheckRow, Knob } from '../components/forms.tsx'
import {
  Column,
  ColumnBody,
  ColumnFooter,
  ColumnHeader,
  ColumnSection,
  ColumnTitle,
  EmptyState,
  List,
  Spacer,
  Stack,
  Workbench,
} from '../components/layout.tsx'
import { Delta, TotalChip } from '../components/Scores.tsx'
import { Code, Heading, Hint, Text } from '../components/text.tsx'
import { Button } from '../components/ui/button.tsx'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table.tsx'
import type { Ctx } from '../ctx.ts'
import {
  capital,
  layersOf,
  mergedConfig,
  type Output,
  runLabel,
  runStamp,
  scoreBand,
  scoreOf,
} from '../model.ts'

type KnobValue = number | Record<string, number>

/** Keys every bench has; Knobs shows them in their own groups, not as pack knobs. */
const RESERVED = new Set(Object.keys(DEFAULT_CONFIG))

/** Each pack's numeric knobs and their defaults, so a knob's range follows its default, not its current value. */
const PACK_KNOBS: Array<{ pack: string; key: string; defaults: KnobValue }> = scorers.flatMap(
  (pack) =>
    Object.entries(pack.defaults).flatMap(([key, value]) =>
      !RESERVED.has(key) && isKnob(value) ? [{ pack: pack.id, key, defaults: value }] : [],
    ),
)

export function Knobs({ ctx }: { ctx: Ctx }) {
  const { state, config, setConfig, outputs, toast, confirm, reload } = ctx
  const [busy, setBusy] = useState(false)
  const saved = mergedConfig(state.savedConfig)
  const layers = layersOf(config)
  const dirty = JSON.stringify(config) !== JSON.stringify(saved)
  const set = (patch: Partial<BenchConfig>) => setConfig({ ...config, ...patch })
  const setWeight = (layer: string, value: number) =>
    set({ weights: { ...config.weights, [layer]: value } })
  const togglePack = (id: string) => {
    const packs = config.packs.includes(id)
      ? config.packs.filter((p) => p !== id)
      : [...config.packs, id]
    if (!packs.length) return
    // Re-merge so the pack's defaults come and go with it.
    setConfig(mergedConfig({ ...config, packs }))
  }
  const save = async () => {
    setBusy(true)
    try {
      const { saved: path } = await api.config(config)
      toast(`Saved ${path}`)
      await reload()
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const discard = async () => {
    if (
      await confirm({
        title: 'Discard your scoring changes?',
        description: `The settings go back to what ${state.paths.bench} holds.`,
        action: 'Discard',
        destructive: true,
      })
    )
      setConfig(saved)
  }
  const knobs = Object.entries(config).flatMap(([key, value]) =>
    !RESERVED.has(key) && isKnob(value)
      ? [{ key, value, known: PACK_KNOBS.find((k) => k.key === key) ?? null }]
      : [],
  )
  const graded = outputs.filter((o) => o.result)

  return (
    <Workbench layout="inspector">
      <Column>
        <ColumnHeader>
          <ColumnTitle>
            <Heading level={2} as="h2">
              Rescored
            </Heading>
            <Hint as="span">
              {dirty
                ? 'Every graded output under these settings, with the change from the saved ones.'
                : 'Every graded output under the saved settings. Move one and they rescore at once.'}
            </Hint>
          </ColumnTitle>
        </ColumnHeader>
        <ColumnBody>
          {graded.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Output</TableHead>
                  {layers.map((l) => (
                    <TableHead key={l} numeric>
                      {capital(l)}
                    </TableHead>
                  ))}
                  <TableHead numeric>Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {graded.map((o) => (
                  <Row key={o.key} output={o} config={config} saved={saved} layers={layers} />
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState size="compact" title="No graded outputs yet">
              Start a run with grading on, and every output shows here under these settings.
            </EmptyState>
          )}
        </ColumnBody>
      </Column>

      <Column kind="inspector">
        <ColumnSection inset="inspector" title="Packs">
          <Stack gap="md">
            {scorers.map((pack) => (
              <CheckRow
                key={pack.id}
                checked={config.packs.includes(pack.id)}
                disabled={config.packs.length === 1 && config.packs.includes(pack.id)}
                onCheckedChange={() => togglePack(pack.id)}
                description={pack.layers.map(capital).join(', ')}
              >
                {capital(pack.id)}
              </CheckRow>
            ))}
          </Stack>
        </ColumnSection>

        <ColumnSection
          inset="inspector"
          title="Layer weights"
          hint="Points per layer. A layer with no score drops out and the rest rescale."
        >
          <Stack gap="lg">
            {layers.map((layer) => (
              <Knob
                key={layer}
                label={capital(layer)}
                value={config.weights[layer] ?? 0}
                min={0}
                max={60}
                step={1}
                onChange={(v) => setWeight(layer, v)}
              />
            ))}
          </Stack>
        </ColumnSection>

        <ColumnSection inset="inspector" title="Thresholds">
          <Stack gap="lg">
            <Knob
              label="Yes at"
              about="A judge answer reads as yes at this probability or above."
              value={config.yes}
              min={0.3}
              max={0.8}
              step={0.05}
              onChange={(v) => set({ yes: v })}
            />
            <Knob
              label="Unsure below"
              about="Verdicts less certain than this are listed as unsure, and a Jev vote less certain than this is not counted."
              value={config.sure}
              min={0.3}
              max={0.9}
              step={0.05}
              onChange={(v) => set({ sure: v })}
            />
            <Knob
              label="Good at"
              about="Agreement counts a layer score this high or higher as good."
              value={config.agreeAt}
              min={40}
              max={95}
              step={5}
              onChange={(v) => set({ agreeAt: v })}
            />
          </Stack>
        </ColumnSection>

        {knobs.length ? (
          <ColumnSection inset="inspector" title="Judge pack settings">
            <Stack gap="lg">
              {knobs.map(({ key, value, known }) =>
                typeof value === 'number' ? (
                  <Knob
                    key={key}
                    label={humanize(key)}
                    title={key}
                    value={value}
                    {...rangeOf(typeof known?.defaults === 'number' ? known.defaults : value)}
                    onChange={(v) => set({ [key]: v })}
                  />
                ) : (
                  <Stack key={key} gap="lg">
                    <Text tone="muted" size="xs" weight="medium" title={key}>
                      {known && known.key !== known.pack
                        ? `${capital(known.pack)}: ${humanize(key)}`
                        : humanize(key)}
                    </Text>
                    {Object.entries(value).map(([sub, v]) => {
                      const base =
                        known && typeof known.defaults === 'object'
                          ? known.defaults[sub]
                          : undefined
                      return (
                        <Knob
                          key={sub}
                          label={humanize(sub)}
                          title={`${key}.${sub}`}
                          value={v}
                          {...rangeOf(base ?? v)}
                          onChange={(n) => set({ [key]: { ...value, [sub]: n } })}
                        />
                      )
                    })}
                  </Stack>
                ),
              )}
            </Stack>
          </ColumnSection>
        ) : null}

        <ColumnSection inset="inspector">
          <Disclosure
            summary={`Rules: ${
              config.rules
                ? `${config.rules.length} chosen in bench.json`
                : `${state.rules.length} read from SKILL.md bullets`
            }`}
          >
            <Stack>
              {config.rules ? null : (
                <Hint>
                  Set <Code>rules</Code> in <Code>bench.json</Code> to choose them by hand.
                </Hint>
              )}
              <List variant="number" size="xs">
                {state.rules.map((r) => (
                  <li key={r.id}>
                    {r.text} <Text tone="muted">({r.section})</Text>
                  </li>
                ))}
              </List>
            </Stack>
          </Disclosure>
        </ColumnSection>

        <ColumnFooter inset="inspector">
          <Button type="button" size="sm" disabled={!dirty || busy} onClick={save}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
          {dirty ? (
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={discard}>
              Discard
            </Button>
          ) : null}
          <Spacer />
          <Text tone="muted" size="xs" title={state.paths.bench}>
            {dirty ? 'Unsaved changes' : `Saved in ${state.paths.bench}`}
          </Text>
        </ColumnFooter>
      </Column>
    </Workbench>
  )
}

const CELL_TONE = {
  hi: 'default',
  mid: 'default',
  lo: 'warning',
  vlo: 'destructive',
  na: 'muted',
} as const

function Row({
  output,
  config,
  saved,
  layers,
}: {
  output: Output
  config: BenchConfig
  saved: BenchConfig
  layers: string[]
}) {
  const now = scoreOf(output, config)
  const was = scoreOf(output, saved)
  const delta =
    now?.scores.total != null && was?.scores.total != null ? now.scores.total - was.scores.total : 0
  return (
    <TableRow>
      <TableCell wrap>
        {runLabel(output.run)}
        <Text block tone="muted" size="xs">
          {output.caseId} · {runStamp(output.run)}
          {output.samples > 1 ? ` · sample ${output.index}` : ''}
        </Text>
      </TableCell>
      {layers.map((l) => (
        <TableCell key={l} numeric>
          <Text tone={CELL_TONE[scoreBand(now?.scores[l])]}>{now?.scores[l] ?? '–'}</Text>
        </TableCell>
      ))}
      <TableCell numeric>
        <TotalChip total={now?.scores.total} />
        <Delta value={delta} />
      </TableCell>
    </TableRow>
  )
}

function isKnob(value: unknown): value is KnobValue {
  if (typeof value === 'number') return true
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.values(value).every((v) => typeof v === 'number')
  )
}

/** Whole-number knobs (counts, seconds, characters) step by 1; fractions step by 0.05. */
function rangeOf(base: number): { min: number; max: number; step: number } {
  if (Number.isInteger(base) && base >= 1)
    return { min: 0, max: Math.max(10, Math.ceil((base * 2.5) / 10) * 10), step: 1 }
  return { min: 0, max: base > 1 ? Math.ceil(base * 2) : 1, step: 0.05 }
}

/** "maxRetries" reads as "Max retries". */
const humanize = (key: string): string =>
  capital(key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase())
