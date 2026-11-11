/**
 * Graded as: what a skill's outputs are judged on beyond its rules and its
 * cases' checks, which every skill is graded on whatever it makes. Most skills
 * never change it. A kind of work adds parts of its own: how a page looks,
 * whether a check command passes, how the work was done.
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
import { extraKinds, gradedLine, kindHint, kindLabel, setByHand } from '../model.ts'
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

  const toggle = (id: string) =>
    setEdited(packs.includes(id) ? packs.filter((p) => p !== id) : [...packs, id])
  const save = () =>
    run(async () => {
      await api.gradedAs(packs)
      await reload()
      setEdited(null)
      report(gradedLine(packs))
    })
  const discard = async () => {
    if (await confirm({ title: 'Discard your change?', action: 'Discard', destructive: true }))
      setEdited(null)
  }

  return (
    <Stack gap="lg">
      <FormSection
        title="Kinds of work"
        hint="Every skill is graded on its rules and checks. Tick a kind of work to grade more."
      >
        <Stack gap="md">
          {extraKinds(scorers.map((pack) => pack.id)).map((id) => (
            <CheckRow
              key={id}
              checked={packs.includes(id)}
              disabled={busy}
              onCheckedChange={() => toggle(id)}
              description={kindHint(id)}
            >
              {kindLabel(id)}
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
          {dirty ? 'Unsaved change' : 'Saved'}
        </Text>
      </FormActions>
    </Stack>
  )
}
