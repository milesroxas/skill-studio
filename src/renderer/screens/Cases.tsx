/**
 * Write the cases a run is made of: the prompt, what a good answer does, and
 * the judge's checks. Edits are kept as drafts per case, so moving between
 * cases, screens or skills never loses typing.
 */

import { type Case, type CaseDraft, NEW_CASE_KEY } from '@domain/schemas.ts'
import { CHECK_EXAMPLES, EXAMPLE_KINDS, templateById, templateForPacks } from '@domain/templates.ts'
import { isSlug, SLUG_RULE, slug } from '@domain/text.ts'
import { PlusIcon, XIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { api } from '../api.ts'
import { DraftNote } from '../components/DraftNote.tsx'
import { CheckRow, InlineField, NumberInput } from '../components/forms.tsx'
import {
  Column,
  ColumnBody,
  ColumnHeader,
  ColumnTitle,
  Field,
  FormSection,
  List,
  PlainList,
  Spacer,
  Stack,
  Toolbar,
  Workbench,
} from '../components/layout.tsx'
import { NavButton } from '../components/NavButton.tsx'
import { Segmented } from '../components/Segmented.tsx'
import { ExampleList, GuideBox, PairList, Starter } from '../components/starters.tsx'
import { TextArea } from '../components/TextArea.tsx'
import { Heading, Hint, Text } from '../components/text.tsx'
import { Alert, AlertDescription } from '../components/ui/alert.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { Label } from '../components/ui/label.tsx'
import type { Ctx } from '../ctx.ts'
import { shortcut } from '../keys.ts'
import { plural } from '../model.ts'

const draftOf = (c: Case): CaseDraft => ({
  id: c.id,
  title: c.title === c.id ? '' : c.title,
  prompt: c.prompt,
  expectedOutcome: c.expectedOutcome,
  words: c.bench.words ?? null,
  graders: c.graders.map((g) => ({ id: g.id, statement: g.statement, weight: g.weight })),
})

const blank = (): CaseDraft => ({
  id: '',
  title: '',
  prompt: '',
  expectedOutcome: '',
  words: null,
  graders: [{ id: null, statement: '', weight: 1 }],
})

export function Cases({ ctx }: { ctx: Ctx }) {
  const { state, config, route, go, toast, confirm, reload, drafts } = ctx
  const cases = state.cases
  /** Examples come from the kind of skill the bench grades, until the user picks another. */
  const [kindId, setKindId] = useState(() => templateForPacks(config.packs).id)
  const kind = templateById(kindId)
  const isNew = route.params.get('new') === '1' || !cases.length
  const selected = isNew ? null : (cases.find((c) => c.id === route.params.get('id')) ?? cases[0])
  const base = useMemo(() => (selected ? draftOf(selected) : blank()), [selected])
  const baseJson = JSON.stringify(base)
  /** Where this case's draft is kept: its id, or one slot for the case not saved yet. */
  const key = selected ? selected.id : NEW_CASE_KEY
  const draft = drafts.cases[key] ?? base
  const [idTouched, setIdTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const dirty = JSON.stringify(draft) !== baseJson

  /** Another case. The one being left keeps its draft, so there is nothing to confirm. */
  const pick = (params: Record<string, string>) => {
    setIdTouched(false)
    go('cases', params)
  }

  /** Keep the edit as a draft, or drop the draft once the case matches what is saved again. */
  const setDraft = (next: CaseDraft) =>
    drafts.setCase(key, JSON.stringify(next) === baseJson ? null : next)
  const set = (patch: Partial<CaseDraft>) => setDraft({ ...draft, ...patch })
  const setTitle = (title: string) =>
    set(isNew && !idTouched ? { title, id: slug(title, 40) } : { title })
  const setGrader = (i: number, patch: Partial<CaseDraft['graders'][number]>) =>
    set({ graders: draft.graders.map((g, k) => (k === i ? { ...g, ...patch } : g)) })

  /** Fill the form from an example, with an id no existing case holds. */
  const fillFrom = async (example: CaseDraft) => {
    if (
      dirty &&
      !(await confirm({ title: 'Replace what you typed with this example?', action: 'Replace' }))
    )
      return
    let id = example.id
    for (let n = 2; cases.some((c) => c.id === id); n += 1) id = `${example.id}-${n}`
    setIdTouched(true)
    setDraft({ ...example, id, graders: example.graders.map((g) => ({ ...g })) })
  }

  const idError = draft.id && !isSlug(draft.id) ? SLUG_RULE : ''
  const taken = isNew && cases.some((c) => c.id === draft.id)
  const wordsError =
    draft.words && !(draft.words[0] >= 0 && draft.words[1] >= draft.words[0])
      ? 'The minimum must not be above the maximum.'
      : ''
  const canSave =
    dirty && draft.id && !idError && !taken && draft.prompt.trim() && !wordsError && !busy

  const save = async () => {
    if (!canSave) return
    setBusy(true)
    try {
      await api.saveCase(draft, isNew)
      drafts.setCase(key, null)
      await reload()
      toast(`Saved ${draft.id}`)
      go('cases', { id: draft.id })
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!selected) return
    const ok = await confirm({
      title: `Delete the case ${selected.id}?`,
      description: 'Its folder goes too. Past runs keep their outputs.',
      action: 'Delete',
      destructive: true,
    })
    if (!ok) return
    try {
      await api.deleteCase(selected.id)
      drafts.setCase(selected.id, null)
      await reload()
      toast(`Deleted ${selected.id}`)
      go('cases')
    } catch (e) {
      toast((e as Error).message)
    }
  }

  const onKey = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault()
      save()
    }
  }

  const discard = async () => {
    if (
      await confirm({
        title: isNew ? 'Discard this new case?' : `Discard your changes to ${selected?.id}?`,
        description: isNew ? 'What you typed goes.' : 'The case stays as it was last saved.',
        action: 'Discard',
        destructive: true,
      })
    ) {
      drafts.setCase(key, null)
      setIdTouched(false)
    }
  }

  const heading = isNew ? draft.title.trim() || 'New case' : draft.title.trim() || draft.id

  return (
    <Workbench layout={cases.length ? 'list' : 'single'}>
      {cases.length ? (
        <Column kind="list">
          <nav aria-label="Cases" className="contents">
            <ColumnHeader inset="list">
              <Heading level={3} as="h2">
                Cases
              </Heading>
              <Text tone="muted" size="xs" tabular>
                {cases.length}
              </Text>
              <Spacer />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => pick({ new: '1' })}
                disabled={isNew}
              >
                <PlusIcon aria-hidden="true" />
                New
              </Button>
            </ColumnHeader>
            <ColumnBody inset="list">
              <PlainList gap="none">
                {drafts.cases[NEW_CASE_KEY] && !isNew ? (
                  <li>
                    <NavButton onClick={() => pick({ new: '1' })}>
                      <Text size="sm">
                        New case <Text tone="warning">•</Text>
                      </Text>
                      <Text tone="muted" size="xs">
                        Not added yet
                      </Text>
                    </NavButton>
                  </li>
                ) : null}
                {cases.map((c) => (
                  <li key={c.id}>
                    <NavButton current={selected?.id === c.id} onClick={() => pick({ id: c.id })}>
                      <Text size="sm" truncate block>
                        {c.title !== c.id ? c.title : c.id}
                        {drafts.cases[c.id] ? <Text tone="warning"> •</Text> : null}
                      </Text>
                      <Text tone="muted" size="xs">
                        {c.title !== c.id ? <Text font="mono">{c.id}</Text> : null}
                        {c.title !== c.id ? ' · ' : ''}
                        {plural(c.graders.length, 'check')}
                      </Text>
                    </NavButton>
                  </li>
                ))}
              </PlainList>
            </ColumnBody>
          </nav>
        </Column>
      ) : null}
      <Column>
        <form
          className="contents"
          onKeyDown={onKey}
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <ColumnHeader>
            <ColumnTitle>
              <Heading level={2} as="h2">
                {heading}
              </Heading>
              {!isNew && heading !== draft.id ? (
                <Text font="mono" tone="muted" size="xs">
                  {draft.id}
                </Text>
              ) : null}
              <DraftNote drafts={drafts} dirty={dirty} saved={isNew ? '' : 'Saved'} />
            </ColumnTitle>
            {dirty ? (
              <Button type="button" variant="ghost" size="sm" onClick={discard}>
                Discard
              </Button>
            ) : isNew && cases.length ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => pick({})}>
                Cancel
              </Button>
            ) : null}
            <Button type="submit" size="sm" disabled={!canSave} title={shortcut('S')}>
              {busy ? 'Saving…' : isNew ? 'Add case' : 'Save case'}
            </Button>
          </ColumnHeader>
          <ColumnBody width="form">
            {!cases.length ? (
              <Hint>
                A case is one task an agent gets with {state.skill.name} installed, and what a good
                answer to it does. A run writes every case, then a judge checks each answer.
              </Hint>
            ) : null}
            {selected?.source === 'evals.json' ? (
              <Alert variant="muted">
                <AlertDescription>
                  This case comes from evals.json. Saving writes it as a case folder, which then
                  takes its place.
                </AlertDescription>
              </Alert>
            ) : null}
            {isNew ? (
              <Starter
                aria-label="Start from an example"
                title="Start from an example"
                hint="A finished case to edit. Pick the kind of skill, then a case."
              >
                <Segmented
                  aria-label="Kind of skill"
                  value={kindId}
                  onChange={(v) => v && setKindId(v)}
                  options={EXAMPLE_KINDS.map((t) => ({ value: t.id, label: t.label }))}
                />
                <ExampleList
                  items={kind.cases.map((c) => ({
                    key: c.id,
                    title: c.title,
                    sub: `${plural(c.graders.length, 'check')}${
                      c.words ? ` · ${c.words[0]} to ${c.words[1]} words` : ''
                    }`,
                    onPick: () => fillFrom(c),
                  }))}
                />
              </Starter>
            ) : null}

            <FormSection layout="stacked" title="Task">
              <Field>
                <Label htmlFor="case-title">Title</Label>
                <Input
                  id="case-title"
                  value={draft.title}
                  placeholder="Release note for the export change"
                  onChange={(e) => setTitle(e.target.value)}
                />
              </Field>

              {isNew ? (
                <Field>
                  <Label htmlFor="case-id">Id</Label>
                  <Input
                    id="case-id"
                    value={draft.id}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    font="mono"
                    aria-invalid={Boolean(idError || taken) || undefined}
                    aria-describedby="case-id-help"
                    onChange={(e) => {
                      setIdTouched(true)
                      set({ id: e.target.value })
                    }}
                  />
                  <Hint id="case-id-help" tone={idError || taken ? 'destructive' : 'default'}>
                    {idError ||
                      (taken
                        ? 'A case with this id exists.'
                        : 'The folder name. It cannot change later.')}
                  </Hint>
                </Field>
              ) : null}

              <Field>
                <Label htmlFor="case-prompt">Prompt</Label>
                <TextArea
                  id="case-prompt"
                  rows={6}
                  value={draft.prompt}
                  placeholder={kind.cases[0]?.prompt}
                  aria-describedby="case-prompt-help"
                  onChange={(e) => set({ prompt: e.target.value })}
                />
                <Hint id="case-prompt-help">
                  Exactly what the agent is asked, as a user would ask it. Do not mention the skill.
                </Hint>
              </Field>

              <Field>
                <Label htmlFor="case-expected">A good answer</Label>
                <TextArea
                  id="case-expected"
                  rows={2}
                  value={draft.expectedOutcome}
                  placeholder={kind.cases[0]?.expectedOutcome}
                  onChange={(e) => set({ expectedOutcome: e.target.value })}
                />
              </Field>
            </FormSection>

            <FormSection
              layout="stacked"
              title="Checks"
              hint="Statements a good answer makes true. The judge marks each one; weight counts a check more."
            >
              <GuideBox summary="What the judge can mark">
                <PairList pairs={CHECK_EXAMPLES} />
              </GuideBox>
              <Stack gap="md">
                {draft.graders.length ? (
                  <CheckLine aria-hidden="true" head>
                    <span />
                    <Text tone="muted" size="xs">
                      Statement
                    </Text>
                    <Text tone="muted" size="xs">
                      Weight
                    </Text>
                    <span />
                  </CheckLine>
                ) : null}
                <PlainList as="ol" gap="md">
                  {draft.graders.map((g, i) => (
                    <CheckLine key={g.id ?? `new-${i}`} as="li" index={i + 1}>
                      <TextArea
                        variant="line"
                        rows={1}
                        aria-label={`Check ${i + 1}`}
                        value={g.statement}
                        placeholder={
                          kind.cases[0]?.graders[i]?.statement ??
                          kind.cases[0]?.graders[0]?.statement
                        }
                        onChange={(e) => setGrader(i, { statement: e.target.value })}
                      />
                      <NumberInput
                        aria-label={`Weight of check ${i + 1}`}
                        min={1}
                        max={5}
                        width="narrow"
                        value={g.weight}
                        onChange={(e) => setGrader(i, { weight: Number(e.target.value) || 1 })}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove check ${i + 1}`}
                        title="Remove"
                        onClick={() => set({ graders: draft.graders.filter((_, k) => k !== i) })}
                      >
                        <XIcon aria-hidden="true" />
                      </Button>
                    </CheckLine>
                  ))}
                </PlainList>
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      set({ graders: [...draft.graders, { id: null, statement: '', weight: 1 }] })
                    }
                  >
                    <PlusIcon aria-hidden="true" />
                    Add a check
                  </Button>
                </div>
              </Stack>
            </FormSection>

            <FormSection layout="stacked" title="Length">
              <CheckRow
                checked={Boolean(draft.words)}
                onCheckedChange={(on) => set({ words: on ? [50, 300] : null })}
              >
                Score the answer's length in words
              </CheckRow>
              {draft.words ? (
                <Toolbar>
                  <InlineField label="From">
                    <NumberInput
                      aria-label="Fewest words"
                      min={0}
                      value={draft.words[0]}
                      onChange={(e) =>
                        set({ words: [Number(e.target.value), draft.words?.[1] ?? 0] })
                      }
                    />
                  </InlineField>
                  <InlineField label="to">
                    <NumberInput
                      aria-label="Most words"
                      min={0}
                      value={draft.words[1]}
                      onChange={(e) =>
                        set({ words: [draft.words?.[0] ?? 0, Number(e.target.value)] })
                      }
                    />
                  </InlineField>
                  <Text tone="muted" size="sm">
                    words
                  </Text>
                </Toolbar>
              ) : null}
              {wordsError ? <Hint tone="destructive">{wordsError}</Hint> : null}
            </FormSection>

            {selected?.files.length ? (
              <FormSection
                layout="stacked"
                title="Input files"
                hint="The agent finds these in files/ next to the prompt."
              >
                <List size="xs" font="mono">
                  {selected.files.map((f) => (
                    <li key={f}>{f.split('/').at(-1)}</li>
                  ))}
                </List>
              </FormSection>
            ) : null}

            {selected?.dir ? (
              <FormSection
                layout="stacked"
                title="Delete this case"
                hint="Its folder goes too. Past runs keep their outputs."
              >
                <div>
                  <Button type="button" variant="destructive-ghost" size="sm" onClick={remove}>
                    Delete case
                  </Button>
                </div>
              </FormSection>
            ) : null}
          </ColumnBody>
        </form>
      </Column>
    </Workbench>
  )
}

/** One check: its number, the statement, the weight and the remove button, in aligned columns. */
function CheckLine({
  as: Comp = 'div',
  index,
  head = false,
  children,
  ...props
}: Omit<React.HTMLAttributes<HTMLElement>, 'children'> & {
  as?: 'div' | 'li'
  index?: number
  head?: boolean
  children: React.ReactNode
}) {
  return (
    <Comp
      className={`grid grid-cols-[20px_minmax(0,1fr)_56px_36px] gap-2 ${head ? 'items-end' : 'items-start'}`}
      {...props}
    >
      {head ? null : (
        <Text tone="faint" font="mono" size="xs" weight="medium" align="end" className="pt-[11px]">
          {index}
        </Text>
      )}
      {children}
    </Comp>
  )
}
