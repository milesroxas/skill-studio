/**
 * Graded as: the kinds of work a skill's outputs are judged as. Most skills
 * never change it. The default counts the rules followed and the checks met;
 * a skill whose work is of another kind (writing, code, a design, the way an
 * agent works) is graded on that kind's own parts.
 *
 * Jev's raw answers are stored, so a saved change rescores every output on
 * Results and nothing is run again. Whatever else `bench.json` sets, such as
 * the points per part or the threshold, is written by hand: the host changes
 * `packs` alone and writes every other key back as the file holds it.
 */
import { scorers } from '@judges/scorers.ts'
import { useState } from 'react'
import { api } from '../api.ts'
import type { Ctx } from '../ctx.ts'
import { useAction } from '../hooks.ts'
import { kindLabel, kindsLine, partLabel, setByHand } from '../model.ts'
import { CheckRow } from './forms.tsx'
import { FormActions, FormSection, Spacer, Stack } from './layout.tsx'
import { Code, Hint, Text } from './text.tsx'
import { Button } from './ui/button.tsx'

const sameKinds = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((id) => b.includes(id))

export function GradedAs({ ctx }: { ctx: Ctx }) {
  const { state, config, report, confirm, reload } = ctx
  const [busy, run] = useAction(report)
  /** The kinds as ticked here; null until one is changed. */
  const [edited, setEdited] = useState<string[] | null>(null)
  const packs = edited ?? config.packs
  const dirty = edited !== null && !sameKinds(edited, config.packs)
  const others = setByHand(state.savedConfig)

  const toggle = (id: string) => {
    const next = packs.includes(id) ? packs.filter((p) => p !== id) : [...packs, id]
    // A skill is always graded as something.
    if (next.length) setEdited(next)
  }
  const save = () =>
    run(async () => {
      await api.gradedAs(packs)
      await reload()
      setEdited(null)
      report(`Graded as ${kindsLine(packs)}`)
    })
  const discard = async () => {
    if (
      await confirm({
        title: 'Discard your change?',
        description: `The skill stays graded as ${kindsLine(config.packs)}.`,
        action: 'Discard',
        destructive: true,
      })
    )
      setEdited(null)
  }

  return (
    <Stack gap="lg">
      <FormSection
        title="Kinds of work"
        hint="What this skill does. Each kind is scored on its own parts: tick one or more."
      >
        <Stack gap="md">
          {scorers.map((pack) => (
            <CheckRow
              key={pack.id}
              checked={packs.includes(pack.id)}
              disabled={busy || (packs.length === 1 && packs.includes(pack.id))}
              onCheckedChange={() => toggle(pack.id)}
              description={pack.layers.map(partLabel).join(', ')}
            >
              {kindLabel(pack.id)}
            </CheckRow>
          ))}
          {others.length ? (
            <Hint>
              <Code>bench.json</Code> also sets{' '}
              {others.map((key, i) => (
                <span key={key}>
                  {i ? (i === others.length - 1 ? ' and ' : ', ') : null}
                  <Code>{key}</Code>
                </span>
              ))}
              . Saving keeps them as they are.
            </Hint>
          ) : null}
        </Stack>
      </FormSection>

      <FormActions>
        <Button
          type="button"
          disabled={!dirty}
          busy={busy}
          busyLabel="Saving…"
          onClick={() => void save()}
        >
          Save
        </Button>
        {dirty ? (
          <Button type="button" variant="ghost" disabled={busy} onClick={discard}>
            Discard
          </Button>
        ) : null}
        <Spacer />
        <Text tone="muted" size="xs" title={state.paths.bench}>
          {dirty ? 'Unsaved change' : `Saved in ${state.paths.bench}`}
        </Text>
      </FormActions>
    </Stack>
  )
}
