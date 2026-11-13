/**
 * The model the assistant writes with and how hard it works, as one pair of
 * controls. Settings shows them in full; the side panel and every "write with
 * AI" control open them from a chip. All of them read and set the same
 * preference, so the model named anywhere is the model used everywhere.
 */
import { AI_PROVIDERS, type AiProviderId, effortFor, effortLabel } from '@domain/ai.ts'
import { ChevronDownIcon } from 'lucide-react'
import { useId } from 'react'
import { useAi } from '../ai.ts'
import { Field } from './layout.tsx'
import { SelectBox } from './SelectBox.tsx'
import { Hint } from './text.tsx'
import { Button } from './ui/button.tsx'
import { Label } from './ui/label.tsx'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover.tsx'

/** A model named with its provider, since two providers may offer the same model. */
const keyOf = (provider: AiProviderId, model: string): string => `${provider}:${model}`

/** The two fields, model then effort. The effort list is the chosen model's own. */
export function ModelControls({ size }: { size?: 'sm' | 'default' }) {
  const { providers, choice, model, choose } = useAi()
  const ids = { model: useId(), effort: useId() }
  if (!providers || !choice) return null
  const connected = providers.filter((p) => p.connected && p.models.length)
  const efforts = model?.efforts ?? []

  const pick = (value: string) => {
    const at = value.indexOf(':')
    const provider = value.slice(0, at) as AiProviderId
    const next = connected
      .find((p) => p.id === provider)
      ?.models.find((m) => keyOf(provider, m.id) === value)
    if (next) choose({ provider, model: next.id, effort: effortFor(next, choice.effort) })
  }

  return (
    <>
      <Field>
        <Label htmlFor={ids.model}>Model</Label>
        <SelectBox
          id={ids.model}
          size={size}
          width="full"
          value={keyOf(choice.provider, choice.model)}
          onChange={pick}
          groups={connected.map((p) => ({
            label: AI_PROVIDERS[p.id].label,
            options: p.models.map((m) => ({ value: keyOf(p.id, m.id), label: m.label })),
          }))}
        />
      </Field>
      <Field>
        <Label htmlFor={ids.effort}>Effort</Label>
        <SelectBox
          id={ids.effort}
          size={size}
          width="full"
          disabled={!efforts.length}
          value={choice.effort}
          onChange={(effort) => choose({ ...choice, effort })}
          none={effortLabel('')}
          options={efforts.map((effort) => ({ value: effort, label: effortLabel(effort) }))}
        />
        <Hint>
          {efforts.length
            ? 'Higher effort thinks longer: better on hard requests, slower and more costly.'
            : 'This model takes no effort setting.'}
        </Hint>
      </Field>
    </>
  )
}

/** The model in use, in a few words, opening the controls that change it. */
export function ModelChip() {
  const { choice, model } = useAi()
  if (!choice) return null
  /** Who runs the model, such as Claude Code. */
  const runner = AI_PROVIDERS[choice.provider].label
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          // The name starts with the words on the button, so what is read out is what is seen.
          aria-label={`${model?.label ?? choice.model}, ${runner}${choice.effort ? `, ${effortLabel(choice.effort)}` : ''}. Change the model and effort.`}
        >
          <span className="max-w-40 truncate">{model?.label ?? choice.model}</span>
          {/* The model's own name may be another provider's too: the provider says which. */}
          <span className="font-normal text-muted-foreground">{runner}</span>
          {choice.effort ? (
            <span className="font-normal text-muted-foreground">{effortLabel(choice.effort)}</span>
          ) : null}
          <ChevronDownIcon aria-hidden="true" className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" size="form">
        <ModelControls size="sm" />
      </PopoverContent>
    </Popover>
  )
}
