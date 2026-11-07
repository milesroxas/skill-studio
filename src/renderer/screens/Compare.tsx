/** Two outputs side by side: scores, the artifacts, a word diff, votes and the leaderboard. */
import { isCounted, type Rating } from '@domain/bradley-terry.ts'
import { OVERALL, type Preference, type Vote } from '@domain/schemas.ts'
import { copyOf } from '@domain/text.ts'
import { useEffect, useState } from 'react'
import { api } from '../api.ts'
import { ArtifactPicker, ArtifactView } from '../components/Artifact.tsx'
import { InlineField } from '../components/forms.tsx'
import { runningJob } from '../components/Jobs.tsx'
import {
  ActionBar,
  Columns,
  EmptyState,
  Loading,
  Screen,
  Section,
  SectionHead,
  Spacer,
  Stack,
  Toolbar,
} from '../components/layout.tsx'
import { OutputCard, OutputCardHead, Slot } from '../components/OutputCard.tsx'
import { Delta, Flags, Layers, TotalChip } from '../components/Scores.tsx'
import { Segmented } from '../components/Segmented.tsx'
import { SelectBox } from '../components/SelectBox.tsx'
import { Heading, Hint, Text } from '../components/text.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table.tsx'
import type { Ctx } from '../ctx.ts'
import { wordDiffHtml } from '../diff.ts'
import { useFetch } from '../hooks.ts'
import {
  caseTitle,
  configurationTail,
  layersOf,
  type Output,
  outputByKey,
  outputLine,
  primaryOf,
  runLabel,
  runStamp,
  sampleTail,
  scoreOf,
  sizeLine,
  totalOf,
  versionName,
  writerName,
} from '../model.ts'

const VOTES = [
  { value: 'a', label: 'A is better' },
  { value: 'tie', label: 'Tie' },
  { value: 'b', label: 'B is better' },
] as const satisfies ReadonlyArray<{ value: Vote; label: string }>

const SLOT_LABEL = { a: 'A', b: 'B' } as const

const VIEWS = [
  { value: 'side', label: 'Side by side' },
  { value: 'diff', label: 'Word diff' },
] as const

/** With no pair in the URL, open the first graded output against another output of its case. */
function defaultPair(outputs: Output[]): [Output | null, Output | null] {
  const graded = outputs.filter((o) => o.result)
  for (const a of graded) {
    const b = graded.find((o) => o.caseId === a.caseId && o.key !== a.key)
    if (b) return [a, b]
  }
  return [graded[0] ?? outputs[0] ?? null, null]
}

export function Compare({ ctx }: { ctx: Ctx }) {
  const { state, config, outputs, route, go, report, reload, jobs } = ctx
  const pinned = route.params.has('a') || route.params.has('b')
  const [fallbackA, fallbackB] = pinned ? [null, null] : defaultPair(outputs)
  const a = pinned ? outputByKey(outputs, route.params.get('a')) : fallbackA
  const b = pinned ? outputByKey(outputs, route.params.get('b')) : fallbackB
  const [diff, setDiff] = useState(false)
  const [criterion, setCriterion] = useState(OVERALL)
  const [voting, setVoting] = useState(false)
  const [asking, setAsking] = useState(false)
  const board = useFetch(() => api.leaderboard(), [state])
  const layers = layersOf(config)
  // Both keys always go in the URL, so an empty B stays empty instead of falling back.
  const set = (slot: 'a' | 'b', key: string) =>
    go('compare', {
      a: slot === 'a' ? key : (a?.key ?? ''),
      b: slot === 'b' ? key : (b?.key ?? ''),
    })
  const name = criterion.trim() || OVERALL

  const human =
    a && b
      ? state.reviews.preferences.find(
          (p) => p.by === 'human' && p.criterion === name && sameTwo(p.a, p.b, a.key, b.key),
        )
      : null
  const humanVote: Vote | null = human ? (human.a === a?.key ? human.vote : flip(human.vote)) : null
  const jevVotes =
    a && b
      ? state.reviews.preferences.filter((p) => p.by === 'jev' && sameTwo(p.a, p.b, a.key, b.key))
      : []

  const vote = async (v: Vote) => {
    if (!a || !b || voting) return
    setVoting(true)
    try {
      await api.preference(a.key, b.key, name, v)
      report('Vote saved')
      await reload()
    } catch (e) {
      report(`Not saved: ${(e as Error).message}`, { tone: 'destructive' })
    } finally {
      setVoting(false)
    }
  }
  const askJev = async () => {
    if (!a || !b || asking) return
    setAsking(true)
    try {
      await api.pairwise(a.key, b.key, [name])
      report('Jev is voting')
    } catch (e) {
      report(e as Error)
    } finally {
      setAsking(false)
    }
  }
  /** Jev is still voting on this pair: the button stays busy until the vote lands, however the pair is ordered. */
  const jevBusy =
    asking ||
    (a && b
      ? Boolean(
          runningJob(jobs, 'pairwise', `Jev: ${a.key} vs ${b.key}`) ??
            runningJob(jobs, 'pairwise', `Jev: ${b.key} vs ${a.key}`),
        )
      : false)
  const boards = board.data ? Object.entries(board.data.boards) : []
  const sameCase = !a || !b || a.caseId === b.caseId

  if (!outputs.length)
    return (
      <EmptyState
        size="screen"
        title="Nothing to compare yet"
        actions={
          <Button type="button" onClick={() => go('generate')}>
            Start a run
          </Button>
        }
      >
        Compare puts two outputs side by side, so you can read them together and vote for the better
        one. A run makes the outputs.
      </EmptyState>
    )

  return (
    <Screen>
      <Toolbar>
        <Picker label="A" outputs={outputs} value={a} onChange={(k) => set('a', k)} ctx={ctx} />
        <Picker label="B" outputs={outputs} value={b} onChange={(k) => set('b', k)} ctx={ctx} />
        {a && b ? (
          <>
            <Segmented
              aria-label="View"
              options={VIEWS}
              value={diff ? 'diff' : 'side'}
              onChange={(v) => setDiff(v === 'diff')}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => go('compare', { a: b.key, b: a.key })}
            >
              Swap
            </Button>
          </>
        ) : null}
      </Toolbar>
      {!a ? (
        <EmptyState title="Pick an output for A">
          Then pick one for B to read them side by side and vote.
        </EmptyState>
      ) : diff && b ? (
        <DiffCard a={a} b={b} />
      ) : (
        <Columns count={b ? 2 : 1}>
          <Card output={a} other={b} slot="a" layers={layers} ctx={ctx} showCase={!sameCase} />
          {b ? (
            <Card output={b} other={a} slot="b" layers={layers} ctx={ctx} showCase={!sameCase} />
          ) : null}
        </Columns>
      )}
      {boards.length && board.data ? (
        <Section>
          <SectionHead>
            <Heading level={2}>Leaderboard</Heading>
            <Hint>
              Strength from pairwise votes. Jev and you agree on {board.data.agreement.agreed} of{' '}
              {board.data.agreement.compared} pairs you both voted on.
            </Hint>
          </SectionHead>
          {boards.map(([crit, { jev, human: hb }]) => (
            <Stack key={crit} gap="md">
              <Heading level={3}>{crit}</Heading>
              <Columns count={2}>
                <Board title="Your votes" rows={hb} ctx={ctx} />
                <Board title="Jev’s votes" rows={jev} ctx={ctx} />
              </Columns>
            </Stack>
          ))}
        </Section>
      ) : null}
      {a && b ? (
        <ActionBar aria-label="Your vote">
          <Heading level={3} as="h2">
            Which is better?
          </Heading>
          <Segmented
            aria-label="Your vote"
            options={VOTES}
            value={humanVote}
            disabled={voting}
            onChange={(v) => v && vote(v)}
          />
          <InlineField label="on">
            <Input
              type="text"
              value={criterion}
              onChange={(e) => setCriterion(e.target.value)}
              aria-label="Criterion"
              width="narrow"
              size="sm"
            />
          </InlineField>
          <ScorePick a={a} b={b} ctx={ctx} />
          {jevVotes.map((p) => (
            <Hint key={`${p.criterion}${p.at}`}>{jevLine(p, a.key, config.sure)}</Hint>
          ))}
          <Spacer />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!state.jevKey}
            busy={jevBusy}
            busyLabel="Jev is voting…"
            title={state.jevKey ? undefined : 'Add a TypeSafe key in Settings to ask Jev'}
            onClick={askJev}
          >
            Ask Jev
          </Button>
        </ActionBar>
      ) : null}
    </Screen>
  )
}

const otherSlot = (slot: 'a' | 'b'): 'a' | 'b' => (slot === 'a' ? 'b' : 'a')

/** Jev's vote on the pair in one sentence. A vote under the `sure` threshold says it is not counted. */
function jevLine(p: Preference, aKey: string, sure: number): string {
  const pick = p.vote === 'tie' ? 'a tie' : SLOT_LABEL[p.a === aKey ? p.vote : otherSlot(p.vote)]
  const percent = p.confidence === undefined ? null : Math.round(p.confidence * 100)
  if (!isCounted(p, sure))
    return `On ${p.criterion}, Jev leaned to ${pick} but was unsure (${percent}%), so its vote is not counted.`
  return `On ${p.criterion}, Jev picked ${pick}${percent === null ? '' : `, ${percent}% sure`}.`
}
const flip = (v: Vote): Vote => (v === 'tie' ? 'tie' : otherSlot(v))
const sameTwo = (x: string, y: string, p: string, q: string) =>
  (x === p && y === q) || (x === q && y === p)

function Picker({
  label,
  outputs,
  value,
  onChange,
  ctx,
}: {
  label: 'A' | 'B'
  outputs: Output[]
  value: Output | null
  onChange: (key: string) => void
  ctx: Ctx
}) {
  const groups = new Map<string, Output[]>()
  for (const o of outputs) groups.set(o.caseId, [...(groups.get(o.caseId) ?? []), o])
  return (
    <InlineField label={<Slot variant={label === 'A' ? 'a' : 'b'}>{label}</Slot>}>
      <SelectBox
        aria-label={`Output ${label}`}
        width="wide"
        value={value?.key ?? ''}
        onChange={onChange}
        none="None"
        groups={[...groups.entries()].map(([caseId, list]) => ({
          label: `${caseId} · ${caseTitle(ctx.state, caseId)}`,
          options: list.map((o) => ({
            value: o.key,
            label: `${versionName(o.run)} · ${outputLine(o)}${configurationTail(o.run)} · ${runStamp(o.run)}`,
          })),
        }))}
      />
    </InlineField>
  )
}

function Card({
  output,
  other,
  slot,
  layers,
  ctx,
  showCase,
}: {
  output: Output
  other: Output | null
  slot: 'a' | 'b'
  layers: string[]
  ctx: Ctx
  showCase: boolean
}) {
  const { config, go } = ctx
  const scored = scoreOf(output, config)
  const otherScored = other ? scoreOf(other, config) : null
  const [artifact, setArtifact] = useState(primaryOf(output))
  useEffect(() => setArtifact(primaryOf(output)), [output])
  const delta =
    slot === 'b' && scored?.scores.total != null && otherScored?.scores.total != null
      ? scored.scores.total - otherScored.scores.total
      : null
  const size = sizeLine(output)
  return (
    <OutputCard>
      <OutputCardHead
        slot={<Slot variant={slot}>{SLOT_LABEL[slot]}</Slot>}
        title={versionName(output.run)}
        total={
          <>
            <TotalChip total={scored?.scores.total} />
            <Delta value={delta} />
          </>
        }
        meta={
          <>
            <span>
              {writerName(output.run.meta?.writer)} · {runStamp(output.run)}
              {sampleTail(output)}
            </span>
            {showCase ? <span>Case {output.caseId}</span> : null}
            {size ? <span>{size}</span> : null}
            <Button
              type="button"
              variant="link-muted"
              size="inline-sm"
              onClick={() => go('blind', { key: output.key })}
            >
              Rate blind
            </Button>
            {output.sample.hasTranscript ? (
              <Button
                type="button"
                variant="link-muted"
                size="inline-sm"
                onClick={() =>
                  go('transcript', { run: output.run.name, sample: output.sample.name })
                }
              >
                Transcript
              </Button>
            ) : null}
          </>
        }
      />
      {scored ? (
        <>
          <Layers scored={scored} layers={layers} other={slot === 'b' ? otherScored : null} />
          <Flags flags={scored.flags} />
        </>
      ) : (
        <Hint inset>Not graded.</Hint>
      )}
      <ArtifactPicker artifacts={output.sample.artifacts} value={artifact} onChange={setArtifact} />
      <ArtifactView run={output.run.name} sample={output.sample.name} artifact={artifact} />
    </OutputCard>
  )
}

function DiffCard({ a, b }: { a: Output; b: Output }) {
  const pa = primaryOf(a)
  const pb = primaryOf(b)
  const textual = pa && pb && pa.kind !== 'image' && pb.kind !== 'image'
  const html = useFetch(async () => {
    if (!textual) return null
    const [x, y] = await Promise.all([
      api.artifactText(a.run.name, a.sample.name, pa.file),
      api.artifactText(b.run.name, b.sample.name, pb.file),
    ])
    return wordDiffHtml(copyOf(x), copyOf(y))
  }, [a.key, b.key])
  return (
    <OutputCard>
      <OutputCardHead
        slot={<Slot>Diff</Slot>}
        title={`${runLabel(a.run)} to ${runLabel(b.run)}`}
        meta="Text only in A is struck through. Text only in B is marked."
      />
      {!textual ? (
        <Hint inset>Word diff needs a text output on both sides.</Hint>
      ) : html.error ? (
        <Hint inset tone="destructive">
          {html.error}
        </Hint>
      ) : html.data === null ? (
        <Loading />
      ) : (
        // biome-ignore lint/security/noDangerouslySetInnerHtml: diff output is escaped
        <div className="diff" dangerouslySetInnerHTML={{ __html: html.data }} />
      )}
    </OutputCard>
  )
}

/** What the scores alone say about the pair, beside your vote. */
function ScorePick({ a, b, ctx }: { a: Output; b: Output; ctx: Ctx }) {
  const sa = totalOf(a, ctx.config)
  const sb = totalOf(b, ctx.config)
  if (sa === null || sb === null) return null
  const pick = sa === sb ? 'call it a tie' : `favor ${sa > sb ? 'A' : 'B'}`
  return (
    <Hint>
      The scores {pick}: <Text tabular>{sa}</Text> against <Text tabular>{sb}</Text>.
    </Hint>
  )
}

function Board({ title, rows, ctx }: { title: string; rows: Rating[]; ctx: Ctx }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{title}</TableHead>
          <TableHead numeric>Strength</TableHead>
          <TableHead numeric>Wins</TableHead>
          <TableHead numeric>Losses</TableHead>
          <TableHead numeric>Ties</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length ? (
          rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell wrap>
                <Button
                  type="button"
                  variant="link-muted"
                  size="inline"
                  onClick={() => ctx.go('compare', { a: r.id })}
                >
                  {r.id}
                </Button>
              </TableCell>
              <TableCell numeric>{r.score.toFixed(2)}</TableCell>
              <TableCell numeric>{r.wins}</TableCell>
              <TableCell numeric>{r.losses}</TableCell>
              <TableCell numeric>{r.ties}</TableCell>
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={5}>
              <Text tone="muted">No votes yet</Text>
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}
