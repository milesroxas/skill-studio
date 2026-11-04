/** Write the cases a run is made of: the prompt, what a good answer does, and the judge's checks. */

import type { Case, CaseDraft } from '@domain/schemas.ts'
import { CHECK_EXAMPLES, EXAMPLE_KINDS, templateById, templateForPacks } from '@domain/templates.ts'
import { isSlug, SLUG_RULE, slug } from '@domain/text.ts'
import { useEffect, useMemo, useState } from 'react'
import { api } from '../api.ts'
import { CheckRow, InlineField, NumberInput } from '../components/forms.tsx'
import {
  Field,
  Fieldset,
  FormFooter,
  List,
  Panel,
  PlainList,
  SectionHead,
  Spacer,
  Split,
  Stack,
  Toolbar,
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
  const { state, config, route, go, toast, confirm, reload } = ctx
  const cases = state.cases
  /** Examples come from the kind of skill the bench grades, until the user picks another. */
  const [kindId, setKindId] = useState(() => templateForPacks(config.packs).id)
  const kind = templateById(kindId)
  const isNew = route.params.get('new') === '1' || !cases.length
  const selected = isNew ? null : (cases.find((c) => c.id === route.params.get('id')) ?? cases[0])
  const base = useMemo(() => (selected ? draftOf(selected) : blank()), [selected])
  // By content: state reloads after every job, and an unchanged case must keep unsaved edits.
  const baseJson = JSON.stringify(base)
  const [draft, setDraft] = useState(base)
  const [idTouched, setIdTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const dirty = JSON.stringify(draft) !== baseJson

  useEffect(() => {
    setDraft(JSON.parse(baseJson))
    setIdTouched(false)
  }, [baseJson])

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const pick = async (params: Record<string, string>) => {
    if (
      dirty &&
      !(await confirm({
        title: 'Leave this case?',
        description: 'Your changes are not saved.',
        action: 'Leave',
      }))
    )
      return
    go('cases', params)
  }

  const set = (patch: Partial<CaseDraft>) => setDraft((d) => ({ ...d, ...patch }))
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

  return (
    <Split layout="form">
      <form
        className="contents"
        onKeyDown={onKey}
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <Stack gap="lg">
          {!cases.length ? (
            <Stack>
              <Heading level={2}>Write the first case</Heading>
              <Hint>
                A case is one task an agent gets with {state.skill.name} installed, and what a good
                answer to it does. A run writes every case, then a judge checks each answer.
              </Hint>
            </Stack>
          ) : (
            <Heading level={2}>{isNew ? 'New case' : selected?.id}</Heading>
          )}
          {selected?.source === 'evals.json' ? (
            <Alert variant="muted">
              <AlertDescription>
                This case comes from evals.json. Saving writes it as a case folder, which then takes
                its place.
              </AlertDescription>
            </Alert>
          ) : null}
          {isNew ? (
            <Starter
              aria-label="Start from an example"
              title="Start from an example"
              hint="A finished case to edit: a prompt a user would type, what a good answer does, and checks the judge can mark. Pick the kind of skill, then a case."
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
                  sub: `${c.graders.length} ${c.graders.length === 1 ? 'check' : 'checks'}${
                    c.words ? ` · ${c.words[0]} to ${c.words[1]} words` : ''
                  }`,
                  onPick: () => fillFrom(c),
                }))}
              />
            </Starter>
          ) : null}

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
              rows={8}
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
              rows={3}
              value={draft.expectedOutcome}
              placeholder={kind.cases[0]?.expectedOutcome}
              aria-describedby="case-expected-help"
              onChange={(e) => set({ expectedOutcome: e.target.value })}
            />
            <Hint id="case-expected-help">
              One or two sentences on what it does. You see this when you rate; the judge reads it
              too.
            </Hint>
          </Field>

          <Fieldset
            legend="Checks"
            hint="One statement per line that a good answer makes true. The judge marks each one. Weight counts a check more."
          >
            <GuideBox summary="What the judge can mark">
              <PairList pairs={CHECK_EXAMPLES} />
            </GuideBox>
            {draft.graders.length ? (
              <CheckLine aria-hidden="true" head>
                <span />
                <Text tone="muted" size="xs">
                  Statement
                </Text>
                <Text tone="muted" size="xs" className="w-14">
                  Weight
                </Text>
                <span className="w-16.5" />
              </CheckLine>
            ) : null}
            <PlainList as="ol" gap="md">
              {draft.graders.map((g, i) => (
                <CheckLine key={g.id ?? `new-${i}`} as="li" index={i + 1}>
                  <Input
                    aria-label={`Check ${i + 1}`}
                    value={g.statement}
                    placeholder={
                      kind.cases[0]?.graders[i]?.statement ?? kind.cases[0]?.graders[0]?.statement
                    }
                    onChange={(e) => setGrader(i, { statement: e.target.value })}
                  />
                  <NumberInput
                    aria-label={`Weight of check ${i + 1}`}
                    min={1}
                    max={5}
                    value={g.weight}
                    className="w-14"
                    onChange={(e) => setGrader(i, { weight: Number(e.target.value) || 1 })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={`Remove check ${i + 1}`}
                    onClick={() => set({ graders: draft.graders.filter((_, k) => k !== i) })}
                  >
                    Remove
                  </Button>
                </CheckLine>
              ))}
            </PlainList>
            <div>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  set({ graders: [...draft.graders, { id: null, statement: '', weight: 1 }] })
                }
              >
                Add a check
              </Button>
            </div>
          </Fieldset>

          <Fieldset legend="Length">
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
                <Text tone="muted" size="xs">
                  words
                </Text>
              </Toolbar>
            ) : null}
            {wordsError ? <Hint tone="destructive">{wordsError}</Hint> : null}
          </Fieldset>

          {selected?.files.length ? (
            <Field>
              <Heading level={3} as="span">
                Input files
              </Heading>
              <List size="xs" font="mono">
                {selected.files.map((f) => (
                  <li key={f}>{f.split('/').at(-1)}</li>
                ))}
              </List>
              <Hint>The agent finds these in files/ next to the prompt.</Hint>
            </Field>
          ) : null}

          <FormFooter>
            <Button type="submit" disabled={!canSave} title="Cmd/Ctrl+S">
              {isNew ? 'Add case' : 'Save case'}
            </Button>
            {dirty && !isNew ? (
              <Button type="button" variant="ghost" onClick={() => setDraft(base)}>
                Revert
              </Button>
            ) : null}
            {isNew && cases.length ? (
              <Button type="button" variant="ghost" onClick={() => pick({})}>
                Cancel
              </Button>
            ) : null}
            <Spacer />
            {selected?.dir ? (
              <Button type="button" variant="destructive-ghost" onClick={remove}>
                Delete case
              </Button>
            ) : null}
          </FormFooter>
        </Stack>
      </form>

      {cases.length ? (
        <Panel sticky>
          <aside className="contents">
            <SectionHead>
              <Heading level={3} as="span">
                Cases
              </Heading>
              <Text tone="muted" size="xs" tabular>
                {cases.length}
              </Text>
              <Spacer />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => pick({ new: '1' })}
                disabled={isNew}
              >
                New case
              </Button>
            </SectionHead>
            <PlainList gap="xs">
              {cases.map((c) => (
                <li key={c.id}>
                  <NavButton current={selected?.id === c.id} onClick={() => pick({ id: c.id })}>
                    <Text font="mono" size="xs">
                      {c.id}
                    </Text>
                    <Text tone="muted" size="xs">
                      {c.title !== c.id ? `${c.title} · ` : ''}
                      {c.graders.length} {c.graders.length === 1 ? 'check' : 'checks'}
                    </Text>
                  </NavButton>
                </li>
              ))}
            </PlainList>
          </aside>
        </Panel>
      ) : null}
    </Split>
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
      className={`grid grid-cols-[20px_minmax(0,1fr)_auto_auto] items-center gap-1.5${head ? ' -mb-0.5' : ''}`}
      {...props}
    >
      {head ? null : (
        <Text tone="faint" font="mono" size="xs" weight="medium" align="end">
          {index}
        </Text>
      )}
      {children}
    </Comp>
  )
}
