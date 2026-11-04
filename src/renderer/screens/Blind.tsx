/** Blind review: judge an output before its scores or its run are shown, then reveal and save. */

import type { Artifact } from '@domain/schemas.ts'
import { useEffect, useState } from 'react'
import { api } from '../api.ts'
import { AnchorForm } from '../components/AnchorForm.tsx'
import { ArtifactPicker, ArtifactView } from '../components/Artifact.tsx'
import { Disclosure } from '../components/Disclosure.tsx'
import {
  EmptyState,
  Field,
  Fieldset,
  List,
  Panel,
  Split,
  Stack,
  Toolbar,
} from '../components/layout.tsx'
import { NavButton } from '../components/NavButton.tsx'
import { CardFold, OutputCard, OutputCardHead, Slot } from '../components/OutputCard.tsx'
import { Flags, Layers, TotalChip } from '../components/Scores.tsx'
import { Segmented } from '../components/Segmented.tsx'
import { TextArea } from '../components/TextArea.tsx'
import { Heading, Hint, Text } from '../components/text.tsx'
import { Button } from '../components/ui/button.tsx'
import { Label } from '../components/ui/label.tsx'
import type { Ctx } from '../ctx.ts'
import { useFetch } from '../hooks.ts'
import {
  capital,
  caseTitle,
  layersOf,
  type Output,
  outputByKey,
  outputLine,
  primaryOf,
  reviewOf,
  scoreOf,
  sizeLine,
  versionName,
} from '../model.ts'

type Mark = 'good' | 'bad'

const RATINGS = ['1', '2', '3', '4', '5'].map((n) => ({ value: n, label: n }))
const MARKS = [
  { value: 'good', label: 'Good', tone: 'success' },
  { value: 'bad', label: 'Bad', tone: 'destructive' },
] as const

export function Blind({ ctx }: { ctx: Ctx }) {
  const { state, config, outputs, toast, reload, route, go } = ctx
  const queue = useFetch(() => api.queue(), [state])
  const wanted = route.params.get('key')
  const [key, setKey] = useState<string | null>(wanted)
  const [revealed, setRevealed] = useState(false)
  const [rating, setRating] = useState<number | null>(null)
  const [marks, setMarks] = useState<Record<string, Mark>>({})
  const [note, setNote] = useState('')
  const [anchor, setAnchor] = useState(false)
  const [artifact, setArtifact] = useState<Artifact | null>(null)
  const layers = layersOf(config)

  const items = queue.data ?? []
  const reviewed = outputs.filter((o) => o.result && reviewOf(state, o.key))
  const current = key ?? items[0]?.key ?? null
  const output = outputByKey(outputs, current)
  const open = (next: string | null) => {
    setKey(next)
    go('blind', next ? { key: next } : {})
  }

  useEffect(() => {
    if (!current) return
    const saved = reviewOf(state, current)
    setRating(saved?.rating ?? null)
    setMarks(saved?.layers ?? {})
    setNote(saved?.note ?? '')
    setRevealed(Boolean(saved))
    setAnchor(false)
  }, [current, state])
  useEffect(() => setArtifact(output ? primaryOf(output) : null), [output])

  if (!output)
    return (
      <EmptyState
        title={
          items.length
            ? 'Pick an output to rate'
            : reviewed.length
              ? 'You rated every graded output'
              : 'Nothing to rate yet'
        }
        actions={
          <Button
            type="button"
            variant="outline"
            onClick={() => go(state.runs.length ? 'overview' : 'generate')}
          >
            {state.runs.length ? 'See runs' : 'Start a run'}
          </Button>
        }
      >
        You rate each answer before you see its score, so the judge cannot sway you. The queue puts
        the answers the judge was least sure of first. A new run adds more.
        <ReviewedList reviewed={reviewed} current={current} open={open} />
      </EmptyState>
    )

  const scored = scoreOf(output, config)
  const position = items.findIndex((i) => i.key === current)
  const next = () =>
    open((items[position + 1] ?? items.find((i) => i.key !== current))?.key ?? null)
  const save = async () => {
    try {
      await api.review(output.key, { rating, layers: marks, note })
      toast('Saved')
      // Pin the output: it leaves the queue once reviewed.
      setKey(output.key)
      setRevealed(true)
      await reload()
    } catch (e) {
      toast(`Not saved: ${(e as Error).message}`)
    }
  }
  const mark = (layer: string, value: Mark | null) =>
    setMarks((prev) => {
      const marked = { ...prev }
      if (value === null || marked[layer] === value) delete marked[layer]
      else marked[layer] = value
      return marked
    })
  const testCase = state.cases.find((c) => c.id === output.caseId)
  const size = sizeLine(output)
  const canSkip = items.some((i) => i.key !== current)

  return (
    <Split layout="aside">
      <OutputCard>
        <OutputCardHead
          slot={<Slot>{position >= 0 ? `${position + 1} of ${items.length}` : 'Reviewed'}</Slot>}
          title={
            revealed ? (
              <>
                {versionName(output.run)} <Text tone="muted">· {outputLine(output)}</Text>
              </>
            ) : (
              <>
                {caseTitle(state, output.caseId)}{' '}
                <Text tone="muted" font="mono" size="xs">
                  {output.caseId}
                </Text>
              </>
            )
          }
          total={revealed ? <TotalChip total={scored?.scores.total} /> : null}
          meta={
            size || !revealed ? (
              <>
                {!revealed ? <span>Scores and writer stay hidden until you save</span> : null}
                {size ? <span>{size}</span> : null}
              </>
            ) : null
          }
        />
        {revealed && scored ? (
          <>
            <Layers scored={scored} layers={layers} />
            <Flags flags={scored.flags} />
          </>
        ) : null}
        {testCase ? (
          <CardFold>
            <Disclosure
              summary={`The prompt${testCase.graders.length ? ' and what the case checks' : ''}`}
            >
              <Stack gap="md">
                <Text as="p" font="mono" size="xs" wrap="pre">
                  {testCase.prompt}
                </Text>
                {testCase.expectedOutcome ? (
                  <Hint>Expected: {testCase.expectedOutcome}</Hint>
                ) : null}
                {testCase.graders.length ? (
                  <List>
                    {testCase.graders.map((g) => (
                      <li key={g.id}>{g.statement}</li>
                    ))}
                  </List>
                ) : null}
              </Stack>
            </Disclosure>
          </CardFold>
        ) : null}
        <ArtifactPicker
          artifacts={output.sample.artifacts}
          value={artifact}
          onChange={setArtifact}
        />
        <ArtifactView run={output.run.name} sample={output.sample.name} artifact={artifact} />
      </OutputCard>
      <Panel sticky>
        <aside className="contents">
          <Fieldset legend="Your rating">
            <Segmented
              aria-label="Your rating"
              fill
              tabular
              clearable
              options={RATINGS}
              value={rating === null ? null : String(rating)}
              onChange={(v) => setRating(v === null ? null : Number(v))}
            />
            <Hint>1 is unusable, 5 ships as is.</Hint>
          </Fieldset>
          <Fieldset legend="By layer">
            <Stack>
              {layers.map((layer) => (
                <MarkRow key={layer}>
                  <span>{capital(layer)}</span>
                  <Text tone="muted" size="xs" tabular>
                    {revealed ? (scored?.scores[layer] ?? '–') : ''}
                  </Text>
                  <Segmented
                    aria-label={capital(layer)}
                    clearable
                    options={MARKS}
                    value={marks[layer] ?? null}
                    onChange={(v) => mark(layer, v)}
                  />
                </MarkRow>
              ))}
            </Stack>
          </Fieldset>
          <Field>
            <Label htmlFor="review-note">Note</Label>
            <TextArea
              id="review-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What works, what you would change, what the skill should have done"
            />
          </Field>
          <Field>
            <Toolbar>
              <Button type="button" onClick={save}>
                {revealed ? 'Save' : 'Save and reveal'}
              </Button>
              <Button type="button" variant="outline" onClick={next} disabled={!canSkip}>
                {revealed ? 'Next' : 'Skip'}
              </Button>
            </Toolbar>
            {revealed ? (
              <Toolbar>
                <Button
                  type="button"
                  variant="link-muted"
                  size="inline-sm"
                  onClick={() => go('compare', { a: output.key })}
                >
                  Compare with another output
                </Button>
                <Button
                  type="button"
                  variant="link-muted"
                  size="inline-sm"
                  onClick={() => setAnchor((a) => !a)}
                >
                  Make it an anchor
                </Button>
              </Toolbar>
            ) : (
              <Toolbar>
                <Button
                  type="button"
                  variant="link-muted"
                  size="inline-sm"
                  onClick={() => setRevealed(true)}
                >
                  Reveal without saving
                </Button>
              </Toolbar>
            )}
            {revealed && anchor ? (
              <AnchorForm
                output={output}
                layers={layers}
                badLayers={Object.entries(marks)
                  .filter(([, v]) => v === 'bad')
                  .map(([l]) => l)}
                about={note}
                onDone={(m) => {
                  toast(m)
                  setAnchor(false)
                  reload()
                }}
              />
            ) : null}
          </Field>
          <Field>
            <Heading level={3}>
              Queue{' '}
              <Text tone="muted" tabular>
                {items.length}
              </Text>
            </Heading>
            {items.length ? (
              <Queue>
                {items.map((item) => (
                  <NavButton
                    key={item.key}
                    current={item.key === current}
                    onClick={() => open(item.key)}
                  >
                    <span>{item.result.case ?? item.result.sample}</span>
                    <Text tone="muted" size="xs">
                      {item.result.confidence === null
                        ? 'Judge certainty unknown'
                        : `Judge ${Math.round(item.result.confidence * 100)}% sure`}
                      {item.caseSpread ? ` · spread ${item.caseSpread}` : ''}
                    </Text>
                  </NavButton>
                ))}
              </Queue>
            ) : (
              <Hint>Empty: every graded output has a review.</Hint>
            )}
            <ReviewedList reviewed={reviewed} current={current} open={open} />
          </Field>
        </aside>
      </Panel>
    </Split>
  )
}

/** A list of outputs to open; scrolls on its own except on touch, where the page scrolls. */
function Queue({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-2 flex max-h-[40svh] flex-col gap-0.5 overflow-auto pointer-coarse:max-h-none pointer-coarse:overflow-visible">
      {children}
    </div>
  )
}

function ReviewedList({
  reviewed,
  current,
  open,
}: {
  reviewed: Output[]
  current: string | null
  open: (key: string) => void
}) {
  if (!reviewed.length) return null
  return (
    <Disclosure summary={`Reviewed (${reviewed.length})`}>
      <Queue>
        {reviewed.map((o) => (
          <NavButton key={o.key} current={o.key === current} onClick={() => open(o.key)}>
            <span>{o.caseId}</span>
            <Text tone="muted" size="xs">
              {outputLine(o)}
            </Text>
          </NavButton>
        ))}
      </Queue>
    </Disclosure>
  )
}

/** One layer: its name, the bench score once revealed, and the good or bad toggle. */
function MarkRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2.5">{children}</div>
  )
}
