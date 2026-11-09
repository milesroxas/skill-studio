/**
 * One case, two outputs side by side: the version before on the left, the
 * latest on the right. It is what the whole loop is for. Each side carries its
 * score, the parts it is counted from and what it missed, so a difference in
 * the number is read as a difference in the text.
 *
 * Jev answers facts: whether a rule was followed, whether a check was met. The
 * reader answers which output is better, and that pick is the last word.
 * Where the two point opposite ways, Jev's facts do not hold what the reader
 * saw, and each way out is something they already know how to change: a
 * verdict to correct, a check to add, a rule to edit.
 */

import { draftOf, newCheck } from '@domain/case-draft.ts'
import type { Verdict } from '@domain/pack.ts'
import { pickBetween, pickStanding } from '@domain/picks.ts'
import type { Case, Vote } from '@domain/schemas.ts'
import { copyOf } from '@domain/text.ts'
import { useEffect, useState } from 'react'
import { api } from '../api.ts'
import { caseContext, skillContext } from '../assist.ts'
import type { Ctx } from '../ctx.ts'
import { wordDiffHtml } from '../diff.ts'
import { useFetch } from '../hooks.ts'
import {
  caseTitle,
  checksGraded,
  configurationTail,
  layersOf,
  money,
  type Output,
  outputLine,
  primaryOf,
  runStamp,
  sampleTail,
  scoreOf,
  sizeLine,
  totalOf,
  versionName,
  writerName,
} from '../model.ts'
import { ArtifactPicker, ArtifactView, type OutputView } from './Artifact.tsx'
import { Disclosure } from './Disclosure.tsx'
import { InlineField } from './forms.tsx'
import { runningJob } from './Jobs.tsx'
import {
  ColumnBody,
  ColumnFooter,
  ColumnHeader,
  Columns,
  ColumnTitle,
  EmptyState,
  Field,
  FormSection,
  List,
  Loading,
  Stack,
  Toolbar,
} from './layout.tsx'
import { OutputCard, OutputCardHead, Slot } from './OutputCard.tsx'
import { CheckWeight, Delta, Parts, TotalChip } from './Scores.tsx'
import { Segmented } from './Segmented.tsx'
import { SelectBox } from './SelectBox.tsx'
import { Status } from './Status.tsx'
import { TextArea } from './TextArea.tsx'
import { TranscriptList } from './TranscriptList.tsx'
import { Heading, Hint, Text } from './text.tsx'
import { Button } from './ui/button.tsx'
import { Label } from './ui/label.tsx'
import { Verdicts } from './Verdicts.tsx'

const VOTES = [
  { value: 'a', label: 'A is better' },
  { value: 'tie', label: 'Tie' },
  { value: 'b', label: 'B is better' },
] as const satisfies ReadonlyArray<{ value: Vote; label: string }>

const SLOT_LABEL = { a: 'A', b: 'B' } as const

/** How long Regrade stays busy after the call returns while its job has not shown in the list, which a browser polls. */
const ASKED_FOR_MS = 5000

const VIEWS = [
  { value: 'side', label: 'Side by side' },
  { value: 'diff', label: 'Word diff' },
] as const

export function Comparison({
  ctx,
  caseId,
  a,
  b,
}: {
  ctx: Ctx
  caseId: string
  /** The earlier side; null when the case has one output to read. */
  a: Output | null
  /** The later side. */
  b: Output | null
}) {
  const { state, config, outputs, go, report, reload, jobs } = ctx
  const [diff, setDiff] = useState(false)
  const [voting, setVoting] = useState(false)
  const testCase = state.cases.find((c) => c.id === caseId) ?? null
  const candidates = outputs.filter((o) => o.caseId === caseId)
  const layers = layersOf(config)
  // Both keys always go in the address, so a side left empty stays empty.
  const show = (pair: { a: Output | null; b: Output | null }) =>
    go('results', { case: caseId, a: pair.a?.key ?? '', b: pair.b?.key ?? '' })
  const both = a && b ? { a, b } : null
  const vote = both ? pickBetween(state.reviews.preferences, both.a.key, both.b.key) : null
  const totals = both ? { a: totalOf(both.a, config), b: totalOf(both.b, config) } : null
  const standing = totals ? pickStanding(vote, totals.a, totals.b) : null

  const pick = async (v: Vote) => {
    if (!both || voting) return
    setVoting(true)
    try {
      await api.pick(both.a.key, both.b.key, v)
      report('Pick saved')
      await reload()
    } catch (e) {
      report(`Not saved: ${(e as Error).message}`, { tone: 'destructive' })
    } finally {
      setVoting(false)
    }
  }

  /**
   * The runs whose grade was asked for and has not shown in the jobs yet: the
   * button is busy from the press, not from the first poll that lists the job.
   */
  const [asked, setAsked] = useState<string[]>([])
  const graded = (run: string) => Boolean(runningJob(jobs, 'grade', `Grade ${run}`))
  useEffect(() => {
    setAsked((list) => {
      const left = list.filter((run) => !runningJob(jobs, 'grade', `Grade ${run}`))
      return left.length === list.length ? list : left
    })
  }, [jobs])
  useEffect(() => {
    if (!asked.length) return
    // A job that never shows, such as one refused before it was listed, does not hold the button for good.
    const timer = setTimeout(() => setAsked([]), ASKED_FOR_MS)
    return () => clearTimeout(timer)
  }, [asked])

  /** Grade the runs these outputs came from again: each run is graded whole. */
  const regrade = async (runs: string[]) => {
    const names = [...new Set(runs)]
    if (asked.length) return
    setAsked(names)
    try {
      for (const run of names) await api.grade(run, state.jevKey)
      report(
        names.length > 1
          ? 'Grading both runs'
          : runs.length > 1
            ? 'Grading the run'
            : `Grading ${names[0]}`,
      )
    } catch (e) {
      report(e as Error)
      setAsked([])
    }
  }
  const grading = (run: string) => asked.includes(run) || graded(run)

  const sides = [a, b].filter((o): o is Output => o !== null)

  return (
    <>
      <ColumnHeader>
        <ColumnTitle>
          <Heading level={2} as="h2">
            {caseTitle(state, caseId)}
          </Heading>
          {testCase && testCase.title !== caseId ? (
            <Text font="mono" tone="muted" size="xs">
              {caseId}
            </Text>
          ) : null}
        </ColumnTitle>
        {both ? (
          <Segmented
            aria-label="View"
            options={VIEWS}
            value={diff ? 'diff' : 'side'}
            onChange={(v) => setDiff(v === 'diff')}
          />
        ) : null}
        {testCase ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => go('cases', { id: caseId })}
          >
            Edit case
          </Button>
        ) : null}
      </ColumnHeader>
      <ColumnBody>
        {candidates.length > 1 || testCase ? (
          <Stack gap="md">
            {candidates.length > 1 ? (
              <Toolbar>
                <Picker
                  slot="a"
                  outputs={candidates}
                  value={a}
                  onChange={(o) => show({ a: o, b })}
                />
                {/* B and Swap wrap as one, so Swap never stands on a line of its own. */}
                <Toolbar>
                  <Picker
                    slot="b"
                    outputs={candidates}
                    value={b}
                    onChange={(o) => show({ a, b: o })}
                  />
                  {both ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => show({ a: b, b: a })}
                    >
                      Swap
                    </Button>
                  ) : null}
                </Toolbar>
              </Toolbar>
            ) : null}
            {testCase ? <Asked testCase={testCase} /> : null}
          </Stack>
        ) : null}
        {!sides.length ? (
          <EmptyState title="Pick an output to read">
            Pick one for A and one for B above to read them side by side.
          </EmptyState>
        ) : diff && both ? (
          <DiffCard a={both.a} b={both.b} />
        ) : (
          <Columns count={both ? 2 : 1}>
            {a ? (
              <Side
                ctx={ctx}
                output={a}
                other={null}
                slot="a"
                layers={layers}
                grading={grading(a.run.name)}
                onRegrade={() => regrade([a.run.name])}
              />
            ) : null}
            {b ? (
              <Side
                ctx={ctx}
                output={b}
                other={a}
                slot={a ? 'b' : null}
                layers={layers}
                grading={grading(b.run.name)}
                onRegrade={() => regrade([b.run.name])}
              />
            ) : null}
          </Columns>
        )}
        {testCase && checksGraded(config) ? (
          <AddCheck
            ctx={ctx}
            testCase={testCase}
            onRegrade={() => regrade(sides.map((o) => o.run.name))}
          />
        ) : null}
      </ColumnBody>
      {both && totals ? (
        <ColumnFooter aria-label="Your pick">
          <Heading level={3} as="h2">
            Which is better?
          </Heading>
          <Segmented
            aria-label="Your pick"
            options={VOTES}
            value={vote}
            disabled={voting}
            onChange={(v) => v && pick(v)}
          />
          {standing === 'differs' ? (
            <Status
              tone="warning"
              size="ui"
              detail="Mark the verdict Jev got wrong, or add what it missed as a check."
            >
              Jev scores {totals.a !== null && totals.b !== null && totals.a > totals.b ? 'A' : 'B'}{' '}
              higher
            </Status>
          ) : totals.a !== null && totals.b !== null ? (
            <Hint as="span" tabular>
              Jev scores A {totals.a} and B {totals.b}. Your pick is the last word.
            </Hint>
          ) : null}
        </ColumnFooter>
      ) : null}
    </>
  )
}

function Picker({
  slot,
  outputs,
  value,
  onChange,
}: {
  slot: 'a' | 'b'
  outputs: Output[]
  value: Output | null
  onChange: (output: Output | null) => void
}) {
  return (
    <InlineField label={<Slot variant={slot}>{SLOT_LABEL[slot]}</Slot>}>
      <SelectBox
        aria-label={`Output ${SLOT_LABEL[slot]}`}
        width="wide"
        size="sm"
        value={value?.key ?? ''}
        onChange={(key) => onChange(outputs.find((o) => o.key === key) ?? null)}
        none="None"
        options={outputs.map((o) => ({
          value: o.key,
          label: `${versionName(o.run)}${configurationTail(o.run)} · ${outputLine(o)} · ${runStamp(o.run)}`,
        }))}
      />
    </InlineField>
  )
}

/** What the agent was asked, and what a good answer does: folded, since both sides answer the same case. */
function Asked({ testCase }: { testCase: Case }) {
  return (
    <Disclosure summary={`The prompt${testCase.graders.length ? ' and its checks' : ''}`}>
      <Stack gap="md">
        <Text as="p" font="mono" size="xs" wrap="pre">
          {testCase.prompt}
        </Text>
        {testCase.expectedOutcome ? <Hint>A good answer: {testCase.expectedOutcome}</Hint> : null}
        {testCase.graders.length ? (
          <List size="xs">
            {testCase.graders.map((g) => (
              <li key={g.id}>
                {g.statement}
                <CheckWeight weight={g.weight} />
              </li>
            ))}
          </List>
        ) : null}
      </Stack>
    </Disclosure>
  )
}

function Side({
  ctx,
  output,
  other,
  slot,
  layers,
  grading,
  onRegrade,
}: {
  ctx: Ctx
  output: Output
  /** The earlier side, which this one's score is set against. */
  other: Output | null
  /** Its letter; null when it is the only output shown. */
  slot: 'a' | 'b' | null
  layers: string[]
  /** A grade of this output's run is going. */
  grading: boolean
  onRegrade: () => void
}) {
  const { state, config, go, report, reload } = ctx
  const scored = scoreOf(output, config)
  const otherScored = other ? scoreOf(other, config) : null
  // The artifact in view, kept by the output's key: a reload after a correction
  // or a pick brings a new output object for the same output, and the view holds.
  const [picked, setPicked] = useState<{ key: string; view: OutputView | null } | null>(null)
  const view = picked?.key === output.key ? picked.view : primaryOf(output)
  const setView = (next: OutputView | null) => setPicked({ key: output.key, view: next })
  const [pending, setPending] = useState<string | null>(null)
  const delta =
    scored?.scores.total != null && otherScored?.scores.total != null
      ? scored.scores.total - otherScored.scores.total
      : null
  const size = sizeLine(output)
  const meta = output.run.meta?.samples.find((s) => s.dir === output.sample.name) ?? null
  const rules = new Set(state.rules.map((r) => r.text))

  const correct = async (verdict: Verdict, met: boolean | null) => {
    setPending(verdict.id)
    try {
      await api.correct(output.key, verdict.id, met)
      await reload()
      report(
        met === null ? 'Jev’s answer stands again' : `Marked as ${met ? 'met' : 'missed'}`,
        met === null
          ? undefined
          : { undo: () => void api.correct(output.key, verdict.id, null).then(reload, report) },
      )
    } catch (e) {
      report(e as Error)
    } finally {
      setPending(null)
    }
  }

  return (
    <OutputCard>
      <OutputCardHead
        slot={slot ? <Slot variant={slot}>{SLOT_LABEL[slot]}</Slot> : <Slot>Output</Slot>}
        title={`${versionName(output.run)}${configurationTail(output.run)}`}
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
            {size ? <span>{size}</span> : null}
            {meta ? (
              <span>
                {meta.seconds}s{meta.costUsd === null ? '' : ` · ${money(meta.costUsd)}`}
              </span>
            ) : null}
            <Button
              type="button"
              variant="link-muted"
              size="inline-sm"
              busy={grading}
              busyLabel="Grading…"
              onClick={onRegrade}
            >
              {scored ? 'Regrade' : 'Grade'}
            </Button>
          </>
        }
      />
      {meta?.error ? (
        <Hint inset tone="destructive">
          {meta.error}
        </Hint>
      ) : null}
      {scored ? (
        <>
          <Parts scored={scored} layers={layers} other={otherScored} />
          <Verdicts
            verdicts={scored.verdicts}
            pending={pending}
            ruleStands={(text) => rules.has(text)}
            onOpenRule={(text) => go('editor', { file: 'SKILL.md', rule: text })}
            onCorrect={correct}
          />
        </>
      ) : (
        <Hint inset>Not graded yet.</Hint>
      )}
      <ArtifactPicker
        artifacts={output.sample.artifacts}
        value={view}
        onChange={setView}
        transcript={output.sample.hasTranscript}
      />
      {view === 'transcript' ? (
        <TranscriptList
          run={output.run.name}
          sample={output.sample.name}
          root={output.sample.path}
          meta={meta}
        />
      ) : (
        <ArtifactView run={output.run.name} sample={output.sample.name} artifact={view} />
      )}
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
        title={`${versionName(a.run)} to ${versionName(b.run)}`}
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

/**
 * What an output gets wrong that nothing names yet, turned into a check. A
 * check written after reading an output is about something that happened; one
 * written before is a guess. It joins the case's checks, and Jev marks it from
 * the next grading on.
 */
function AddCheck({
  ctx,
  testCase,
  onRegrade,
}: {
  ctx: Ctx
  testCase: Case
  onRegrade: () => void
}) {
  const { state, go, report, reload, drafts } = ctx
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const title = testCase.title || testCase.id

  const add = async () => {
    const statement = text.trim()
    if (!statement || busy) return
    setBusy(true)
    try {
      const unsaved = drafts.cases[testCase.id]
      if (unsaved) {
        // The case has edits waiting on Cases: the check joins them, so saving there keeps both.
        drafts.setCase(testCase.id, {
          ...unsaved,
          graders: [
            ...unsaved.graders.filter((g) => g.statement.trim() || g.image),
            { ...newCheck(), statement },
          ],
        })
        report(`Added to your unsaved edits of ${title}. Save the case to keep it.`, {
          action: { label: 'Open', run: () => go('cases', { id: testCase.id }) },
        })
      } else {
        const saved = draftOf(testCase)
        await api.saveCase(
          { ...saved, graders: [...saved.graders, { ...newCheck(), statement }] },
          false,
        )
        await reload()
        report(
          `Added a check to ${title}`,
          state.jevKey ? { action: { label: 'Regrade', run: onRegrade } } : undefined,
        )
      }
      setText('')
    } catch (e) {
      report(e as Error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormSection
      layout="stacked"
      title="Add a check"
      hint="Something an output gets wrong that nothing above names. Say what a good answer does. Jev marks it on every run from now on, and on these outputs once you regrade."
    >
      <Field>
        <Label htmlFor="new-check">A good answer makes this true</Label>
        <TextArea
          id="new-check"
          variant="line"
          rows={1}
          value={text}
          placeholder="The note has exactly two sentences."
          onValueChange={setText}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void add()
            }
          }}
          assist={{
            field: 'case.check',
            context: () => [skillContext(state), caseContext(draftOf(testCase))],
          }}
        />
      </Field>
      <Toolbar>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!text.trim()}
          busy={busy}
          busyLabel="Adding…"
          onClick={add}
        >
          Add check
        </Button>
      </Toolbar>
    </FormSection>
  )
}
