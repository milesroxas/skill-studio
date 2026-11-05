/** Blind review: judge an output before its scores or its run are shown, then reveal and save. */

import type { AssistContext } from '@domain/assist.ts'
import type { QueueItem } from '@domain/queue.ts'
import type { Artifact } from '@domain/schemas.ts'
import { ChevronDownIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../api.ts'
import { caseContext, skillContext } from '../assist.ts'
import { AnchorForm } from '../components/AnchorForm.tsx'
import { ArtifactPicker, ArtifactView } from '../components/Artifact.tsx'
import { Disclosure } from '../components/Disclosure.tsx'
import {
  Column,
  ColumnFooter,
  ColumnSection,
  EmptyState,
  Field,
  List,
  Loading,
  Stack,
  Toolbar,
  Workbench,
} from '../components/layout.tsx'
import { NavButton } from '../components/NavButton.tsx'
import { CardFold, OutputCard, OutputCardHead } from '../components/OutputCard.tsx'
import { Flags, Layers, TotalChip } from '../components/Scores.tsx'
import { Segmented } from '../components/Segmented.tsx'
import { TextArea } from '../components/TextArea.tsx'
import { Hint, Text } from '../components/text.tsx'
import { Button } from '../components/ui/button.tsx'
import { Label } from '../components/ui/label.tsx'
import {
  Popover,
  PopoverContent,
  PopoverLabel,
  PopoverSection,
  PopoverTrigger,
} from '../components/ui/popover.tsx'
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
  /** The output the URL names, so Back returns to the one just rated; none means the head of the queue. */
  const key = route.params.get('key')
  const [revealed, setRevealed] = useState(false)
  const [rating, setRating] = useState<number | null>(null)
  const [marks, setMarks] = useState<Record<string, Mark>>({})
  const [note, setNote] = useState('')
  const [anchor, setAnchor] = useState(false)
  const [artifact, setArtifact] = useState<Artifact | null>(null)
  const [saving, setSaving] = useState(false)
  const layers = layersOf(config)

  const items = queue.data ?? []
  const reviewed = outputs.filter((o) => o.result && reviewOf(state, o.key))
  const current = key ?? items[0]?.key ?? null
  const output = outputByKey(outputs, current)
  const open = (next: string | null) => go('blind', next ? { key: next } : {})

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

  /** What the assistant reads to write a note: the skill, the case asked, and the output in view. */
  const noteContext = async (): Promise<AssistContext[]> => {
    if (!output) return []
    const asked = state.cases.find((c) => c.id === output.caseId)
    const readable = artifact && artifact.kind !== 'image'
    return [
      skillContext(state),
      ...(asked ? [caseContext(asked)] : []),
      ...(readable
        ? [
            {
              label: `The output (${artifact.file})`,
              text: await api.artifactText(output.run.name, output.sample.name, artifact.file),
            },
          ]
        : []),
    ]
  }

  if (queue.error && !queue.data)
    return (
      <EmptyState
        size="screen"
        title="Could not load the queue"
        actions={
          <Button type="button" onClick={queue.reload}>
            Try again
          </Button>
        }
      >
        {queue.error}
      </EmptyState>
    )
  if (!queue.data && !output) return <Loading size="screen" />
  if (!output)
    return (
      <EmptyState
        size="screen"
        title={
          items.length
            ? 'Pick an output to rate'
            : reviewed.length
              ? 'You rated every graded output'
              : 'Nothing to rate yet'
        }
        actions={
          state.runs.length ? (
            <Button type="button" variant="outline" onClick={() => go('overview')}>
              See results
            </Button>
          ) : (
            <Button type="button" onClick={() => go('generate')}>
              Start a run
            </Button>
          )
        }
        more={
          reviewed.length ? (
            <ReviewedList reviewed={reviewed} current={current} open={open} />
          ) : undefined
        }
      >
        You rate each output before you see its score, so the judge cannot sway you. The queue puts
        the outputs the judge was least sure of first. A new run adds more.
      </EmptyState>
    )

  const scored = scoreOf(output, config)
  const position = items.findIndex((i) => i.key === current)
  const next = () =>
    open((items[position + 1] ?? items.find((i) => i.key !== current))?.key ?? null)
  const save = async () => {
    setSaving(true)
    try {
      await api.review(output.key, { rating, layers: marks, note })
      toast('Saved')
      // Pin the output: it leaves the queue once rated.
      go('blind', { key: output.key }, { replace: true })
      setRevealed(true)
      await reload()
    } catch (e) {
      toast(`Not saved: ${(e as Error).message}`)
    } finally {
      setSaving(false)
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
    <Workbench layout="inspector">
      <Column>
        <OutputCard variant="flush">
          <OutputCardHead
            slot={
              <QueuePicker
                label={position >= 0 ? `${position + 1} of ${items.length}` : 'Rated'}
                items={items}
                reviewed={reviewed}
                current={current}
                open={open}
                state={state}
              />
            }
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
                    <List size="xs">
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
      </Column>

      <Column kind="inspector">
        <aside aria-label="Your review" className="contents">
          <ColumnSection inset="inspector" title="Your rating" hint="1 is unusable, 5 ships as is.">
            <Segmented
              aria-label="Your rating"
              fill
              tabular
              clearable
              options={RATINGS}
              value={rating === null ? null : String(rating)}
              onChange={(v) => setRating(v === null ? null : Number(v))}
            />
          </ColumnSection>
          <ColumnSection inset="inspector" title="By layer">
            <Stack gap="md">
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
          </ColumnSection>
          <ColumnSection inset="inspector">
            <Field>
              <Label htmlFor="review-note">Note</Label>
              <TextArea
                id="review-note"
                value={note}
                onValueChange={setNote}
                placeholder="What works, what you would change, what the skill should have done"
                assist={{ field: 'review.note', context: noteContext }}
              />
            </Field>
            {revealed ? (
              <Toolbar gap="md">
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
                  aria-expanded={anchor}
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
          </ColumnSection>
          <ColumnFooter inset="inspector">
            <Button type="button" size="sm" disabled={saving} onClick={save}>
              {saving ? 'Saving…' : revealed ? 'Save' : 'Save and reveal'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={next}
              disabled={saving || !canSkip}
            >
              {revealed ? 'Next' : 'Skip'}
            </Button>
          </ColumnFooter>
        </aside>
      </Column>
    </Workbench>
  )
}

/** The queue behind the position chip: what is left to rate, least certain first, and what is done. */
function QueuePicker({
  label,
  items,
  reviewed,
  current,
  open,
  state,
}: {
  label: string
  items: QueueItem[]
  reviewed: Output[]
  current: string | null
  open: (key: string) => void
  state: Ctx['state']
}) {
  const [shown, setShown] = useState(false)
  const pick = (key: string) => {
    setShown(false)
    open(key)
  }
  return (
    <Popover open={shown} onOpenChange={setShown}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="xs" aria-label={`${label}. Open the queue.`}>
          <Text tabular>{label}</Text>
          <ChevronDownIcon aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" size="menu">
        <PopoverSection scroll>
          <PopoverLabel>
            To rate · <Text tabular>{items.length}</Text>
          </PopoverLabel>
          {items.length ? (
            items.map((item) => (
              <NavButton
                key={item.key}
                current={item.key === current}
                onClick={() => pick(item.key)}
              >
                <Text size="ui">
                  {item.result.case ? caseTitle(state, item.result.case) : item.result.sample}
                </Text>
                <Text tone="muted" size="xs" tabular>
                  <Text font="mono">{item.result.sample}</Text>
                  {' · '}
                  {item.result.confidence === null
                    ? 'judge certainty unknown'
                    : `judge ${Math.round(item.result.confidence * 100)}% sure`}
                  {item.caseSpread ? ` · spread ${item.caseSpread}` : ''}
                </Text>
              </NavButton>
            ))
          ) : (
            <PopoverLabel>Every graded output has a rating.</PopoverLabel>
          )}
        </PopoverSection>
        {reviewed.length ? (
          <PopoverSection scroll>
            <PopoverLabel>
              Rated · <Text tabular>{reviewed.length}</Text>
            </PopoverLabel>
            <RatedItems reviewed={reviewed} current={current} open={pick} />
          </PopoverSection>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

/** Outputs already rated, folded under the empty queue. */
function ReviewedList({
  reviewed,
  current,
  open,
}: {
  reviewed: Output[]
  current: string | null
  open: (key: string) => void
}) {
  return (
    <Disclosure summary={`Rated (${reviewed.length})`}>
      <RatedScroll>
        <RatedItems reviewed={reviewed} current={current} open={open} />
      </RatedScroll>
    </Disclosure>
  )
}

function RatedItems({
  reviewed,
  current,
  open,
}: {
  reviewed: Output[]
  current: string | null
  open: (key: string) => void
}) {
  return reviewed.map((o) => (
    <NavButton key={o.key} current={o.key === current} onClick={() => open(o.key)}>
      <span>{o.caseId}</span>
      <Text tone="muted" size="xs">
        {outputLine(o)}
      </Text>
    </NavButton>
  ))
}

/** A long list scrolls on its own rather than pushing the empty state off the screen. */
function RatedScroll({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex max-h-80 flex-col gap-px overflow-y-auto overscroll-contain">
      {children}
    </div>
  )
}

/** One layer: its name, the judge’s score once revealed, and the good or bad toggle. */
function MarkRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2.5">{children}</div>
  )
}
