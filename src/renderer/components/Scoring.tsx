/**
 * Scoring: how Jev's answers become a score. Most skills never open it. The
 * defaults count the rules followed and the checks met, half each. It is here
 * for a skill whose work is of another kind (writing, code, a design, the way
 * an agent works) and for the one who wants a part to count more.
 *
 * Jev's raw answers are stored, so every score on Results follows a setting as
 * it moves and nothing is run again. Nothing is kept until Save.
 */
import { DEFAULT_CONFIG } from '@domain/config.ts'
import type { BenchConfig } from '@domain/schemas.ts'
import { scorers } from '@judges/scorers.ts'
import { useState } from 'react'
import { api } from '../api.ts'
import type { Ctx } from '../ctx.ts'
import { capital, kindLabel, layersOf, mergedConfig, partLabel } from '../model.ts'
import { Disclosure } from './Disclosure.tsx'
import { CheckRow, Knob } from './forms.tsx'
import { FormActions, FormSection, List, Spacer, Stack } from './layout.tsx'
import { Code, Hint, Text } from './text.tsx'
import { Button } from './ui/button.tsx'

type Setting = number | Record<string, number>

/** Keys every skill's scoring has; they are shown in sections of their own. */
const RESERVED = new Set(Object.keys(DEFAULT_CONFIG))

/** Each kind's numeric settings and their defaults, so a slider's range follows its default, not its current value. */
const KIND_SETTINGS: Array<{ pack: string; key: string; defaults: Setting }> = scorers.flatMap(
  (pack) =>
    Object.entries(pack.defaults).flatMap(([key, value]) =>
      !RESERVED.has(key) && isSetting(value) ? [{ pack: pack.id, key, defaults: value }] : [],
    ),
)

export function ScoringForm({ ctx }: { ctx: Ctx }) {
  const { state, config, setConfig, report, confirm, reload } = ctx
  const [busy, setBusy] = useState(false)
  const saved = mergedConfig(state.savedConfig)
  const layers = layersOf(config)
  const dirty = JSON.stringify(config) !== JSON.stringify(saved)
  const set = (patch: Partial<BenchConfig>) => setConfig({ ...config, ...patch })
  const toggleKind = (id: string) => {
    const packs = config.packs.includes(id)
      ? config.packs.filter((p) => p !== id)
      : [...config.packs, id]
    if (!packs.length) return
    // Merged again, so the kind's own settings come and go with it.
    setConfig(mergedConfig({ ...config, packs }))
  }
  const save = async () => {
    setBusy(true)
    try {
      await api.config(config)
      report('Saved the scoring')
      await reload()
    } catch (e) {
      report(e as Error)
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
  const settings = Object.entries(config).flatMap(([key, value]) =>
    !RESERVED.has(key) && isSetting(value)
      ? [{ key, value, known: KIND_SETTINGS.find((k) => k.key === key) ?? null }]
      : [],
  )

  return (
    <Stack gap="lg">
      <FormSection
        title="Graded as"
        hint="The kind of work this skill does. Each kind is scored on its own parts."
      >
        <Stack gap="md">
          {scorers.map((pack) => (
            <CheckRow
              key={pack.id}
              checked={config.packs.includes(pack.id)}
              disabled={config.packs.length === 1 && config.packs.includes(pack.id)}
              onCheckedChange={() => toggleKind(pack.id)}
              description={pack.layers.map(partLabel).join(', ')}
            >
              {kindLabel(pack.id)}
            </CheckRow>
          ))}
        </Stack>
      </FormSection>

      <FormSection
        title="Points"
        hint="How much each part counts in a score. A part with no score drops out and the rest rescale."
      >
        <Stack gap="lg">
          {layers.map((layer) => (
            <Knob
              key={layer}
              label={partLabel(layer)}
              value={config.weights[layer] ?? 0}
              min={0}
              max={60}
              step={1}
              onChange={(v) => set({ weights: { ...config.weights, [layer]: v } })}
            />
          ))}
        </Stack>
      </FormSection>

      <FormSection title="Threshold">
        <Knob
          label="Met at"
          about="Jev answers each rule and each check with a probability. At this or above, it counts as met."
          value={config.yes}
          min={0.3}
          max={0.8}
          step={0.05}
          onChange={(v) => set({ yes: v })}
        />
      </FormSection>

      {settings.length ? (
        <FormSection title="Settings of its kind">
          <Stack gap="lg">
            {settings.map(({ key, value, known }) =>
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
                      ? `${kindLabel(known.pack)}: ${humanize(key)}`
                      : humanize(key)}
                  </Text>
                  {Object.entries(value).map(([sub, v]) => {
                    const base =
                      known && typeof known.defaults === 'object' ? known.defaults[sub] : undefined
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
        </FormSection>
      ) : null}

      <FormSection title="Rules">
        <Disclosure
          summary={
            config.rules
              ? `${config.rules.length} chosen in bench.json`
              : `${state.rules.length} read from the bullets of SKILL.md`
          }
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
      </FormSection>

      <FormActions>
        <Button type="button" disabled={!dirty} busy={busy} busyLabel="Saving…" onClick={save}>
          Save scoring
        </Button>
        {dirty ? (
          <Button type="button" variant="ghost" disabled={busy} onClick={discard}>
            Discard
          </Button>
        ) : null}
        <Spacer />
        <Text tone="muted" size="xs" title={state.paths.bench}>
          {dirty ? 'Unsaved changes' : `Saved in ${state.paths.bench}`}
        </Text>
      </FormActions>
    </Stack>
  )
}

function isSetting(value: unknown): value is Setting {
  if (typeof value === 'number') return true
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.values(value).every((v) => typeof v === 'number')
  )
}

/** Whole-number settings (counts, seconds, characters) step by 1; fractions step by 0.05. */
function rangeOf(base: number): { min: number; max: number; step: number } {
  if (Number.isInteger(base) && base >= 1)
    return { min: 0, max: Math.max(10, Math.ceil((base * 2.5) / 10) * 10), step: 1 }
  return { min: 0, max: base > 1 ? Math.ceil(base * 2) : 1, step: 0.05 }
}

/** "maxRetries" reads as "Max retries". */
const humanize = (key: string): string =>
  capital(key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase())
