/** Promote an output to `evals/anchors/` with a label and the layers a bad anchor must fail. */
import { useState } from 'react'
import { api } from '../api.ts'
import { useToggleSet } from '../hooks.ts'
import { capital, type Output, primaryOf } from '../model.ts'
import { CheckRow } from './forms.tsx'
import { Fieldset, Stack, Toolbar } from './layout.tsx'
import { Segmented } from './Segmented.tsx'
import { Button } from './ui/button.tsx'
import { Input } from './ui/input.tsx'

interface Props {
  output: Output
  layers: string[]
  badLayers?: string[]
  about?: string
  onDone: (message: string) => void
}

type Label = 'good' | 'bad'

const LABELS = [
  { value: 'good', label: 'Good example', tone: 'success' },
  { value: 'bad', label: 'Bad example', tone: 'destructive' },
] as const

export function AnchorForm({ output, layers, badLayers = [], about = '', onDone }: Props) {
  const [label, setLabel] = useState<Label>(badLayers.length ? 'bad' : 'good')
  const [tests, toggle] = useToggleSet(badLayers.length ? [...badLayers, 'total'] : [])
  const [note, setNote] = useState(about.split('\n')[0])
  const [busy, setBusy] = useState(false)
  const primary = primaryOf(output)
  const submit = async () => {
    if (!primary) return
    setBusy(true)
    try {
      const { saved } = await api.anchor({
        run: output.run.name,
        sample: output.sample.name,
        file: primary.file,
        case: output.caseId,
        label,
        tests: label === 'bad' ? [...tests] : [],
        about: note,
      })
      onDone(`Anchor saved: ${saved}`)
    } catch (e) {
      onDone(`Not saved: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Stack gap="md">
      <Segmented
        aria-label="Anchor label"
        fill
        options={LABELS}
        value={label}
        onChange={(v) => v && setLabel(v)}
      />
      {label === 'bad' ? (
        <Fieldset
          legend="Must fail on"
          hint="A bad anchor must score below the case’s good anchor on each layer ticked."
        >
          <Toolbar>
            {[...layers, 'total'].map((layer) => (
              <CheckRow
                key={layer}
                size="sm"
                checked={tests.has(layer)}
                onCheckedChange={() => toggle(layer)}
              >
                {capital(layer)}
              </CheckRow>
            ))}
          </Toolbar>
        </Fieldset>
      ) : null}
      <Input
        type="text"
        aria-label="What it shows"
        placeholder="What it shows, in a line"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <Toolbar>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!primary}
          busy={busy}
          busyLabel="Saving…"
          onClick={submit}
        >
          Save anchor
        </Button>
      </Toolbar>
    </Stack>
  )
}
