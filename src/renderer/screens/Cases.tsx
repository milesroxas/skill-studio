/**
 * Write the cases a run is made of. A case starts as a prompt: what you would
 * really ask the agent. That is enough to run it. What a good answer does, and
 * the checks Jev marks, are easier to write once an output is in front of you,
 * so they are optional here and can be added from Results. Edits are kept as
 * drafts per case, so moving between cases, screens or skills never loses
 * typing.
 */

import { assistItems } from '@domain/assist.ts'
import {
  blankDraft,
  DOUBLE,
  draftOf,
  newCaseId,
  newCheck,
  picturesOf,
  weightMark,
} from '@domain/case-draft.ts'
import { addImages, type ImageRef, MAX_IMAGES } from '@domain/image.ts'
import { type CaseDraft, NEW_CASE_KEY } from '@domain/schemas.ts'
import {
  CASE_PROMPT_HINT,
  CHECK_EXAMPLES,
  EXAMPLE_KINDS,
  templateById,
  templateForPacks,
} from '@domain/templates.ts'
import { PenLineIcon, PlusIcon, XIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api.ts'
import { caseContext, skillContext } from '../assist.ts'
import { Assist, type AssistSpec, assistTitle } from '../components/Assist.tsx'
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
  ListHeader,
  PlainList,
  Stack,
  Toolbar,
  Workbench,
} from '../components/layout.tsx'
import { NavButton } from '../components/NavButton.tsx'
import { PicturePicker, PictureStrip, usePictureDrop } from '../components/Pictures.tsx'
import { Segmented } from '../components/Segmented.tsx'
import { ExampleList, GuideBox, PairList, Starter } from '../components/starters.tsx'
import { TextArea } from '../components/TextArea.tsx'
import { Heading, Hint, Text } from '../components/text.tsx'
import { Alert, AlertDescription } from '../components/ui/alert.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { Label } from '../components/ui/label.tsx'
import { Toggle } from '../components/ui/toggle.tsx'
import type { Ctx } from '../ctx.ts'
import { useAddPictures } from '../images.ts'
import { shortcut } from '../keys.ts'
import { CHECK_READERS, checksGraded, kindLabel, plural } from '../model.ts'
import { caseKey } from '../route.ts'

const nameOf = (path: string): string => path.split('/').at(-1) ?? path

/** Kinds of work as a spoken list: "Generic, Code and Design". */
const names = (ids: string[]): string => {
  const list = ids.map(kindLabel)
  return list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list.at(-1)}` : (list[0] ?? '')
}

/**
 * A draft stored before cases held pictures has none listed. It keeps the
 * pictures the saved case has, so saving it does not remove them.
 */
const withPictures = (stored: CaseDraft, base: CaseDraft): CaseDraft => ({
  ...stored,
  images: stored.images ?? base.images,
  graders: stored.graders.map((g) => ({
    ...g,
    image:
      g.image === undefined ? (base.graders.find((b) => b.id === g.id)?.image ?? null) : g.image,
  })),
})

export function Cases({ ctx }: { ctx: Ctx }) {
  const { state, config, route, go, report, confirm, reload, drafts } = ctx
  const cases = state.cases
  /** Examples come from the kind of work the skill is graded as, until the user picks another. */
  const [kindId, setKindId] = useState(() => templateForPacks(config.packs).id)
  const kind = templateById(kindId)
  /** Where this case's draft is kept: its id, or one slot for the case not saved yet. */
  const key = caseKey(
    route.params,
    cases.map((c) => c.id),
  )
  const isNew = key === NEW_CASE_KEY
  const selected = isNew ? null : (cases.find((c) => c.id === key) ?? null)
  const base = useMemo(() => (selected ? draftOf(selected) : blankDraft()), [selected])
  const baseJson = JSON.stringify(base)
  const stored = drafts.cases[key]
  const draft = useMemo(() => (stored ? withPictures(stored, base) : base), [stored, base])
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const dirty = JSON.stringify(draft) !== baseJson

  /** Another case. The one being left keeps its draft, so there is nothing to confirm. */
  const pick = (params: Record<string, string>) => go('cases', params)

  /** Keep the edit as a draft, or drop the draft once the case matches what is saved again. */
  const setDraft = (next: CaseDraft) =>
    drafts.setCase(key, JSON.stringify(next) === baseJson ? null : next)
  const set = (patch: Partial<CaseDraft>) => setDraft({ ...draft, ...patch })
  const setGrader = (i: number, patch: Partial<CaseDraft['graders'][number]>) =>
    set({ graders: draft.graders.map((g, k) => (k === i ? { ...g, ...patch } : g)) })

  /** The form as it stands when an Undo is taken, which may be a few edits after it was offered. */
  const live = useRef({ key, draft, setDraft })
  live.current = { key, draft, setDraft }

  /**
   * Adding or removing a check moves the keyboard with it: to the new check's
   * statement, or to the check that took the removed one's place. With no check
   * left it goes to the button that adds one, so focus never falls off the list.
   */
  const statements = useRef<Array<HTMLTextAreaElement | null>>([])
  const addCheckButton = useRef<HTMLButtonElement>(null)
  const checkTools = useRef<HTMLDivElement>(null)
  const [focusCheck, setFocusCheck] = useState<number | null>(null)
  useEffect(() => {
    if (focusCheck === null) return
    const field = statements.current[focusCheck]
    if (field) {
      field.focus()
      field.setSelectionRange(field.value.length, field.value.length)
    } else addCheckButton.current?.focus()
    setFocusCheck(null)
  }, [focusCheck])
  const addCheck = (at: number) => {
    set({ graders: [...draft.graders.slice(0, at), newCheck(), ...draft.graders.slice(at)] })
    setFocusCheck(at)
  }
  /** Checks the assistant wrote join the list, in place of any row left blank. */
  const addChecks = (statements: string[]) =>
    set({
      graders: [
        ...draft.graders.filter((g) => g.statement.trim() || g.image),
        ...statements.map((statement) => ({ ...newCheck(), statement })),
      ],
    })
  /** Take a check out. One with a statement can come back: a slip costs a sentence otherwise. */
  const removeCheck = (i: number, focus: 'next' | 'previous') => {
    const removed = draft.graders[i]
    const graders = draft.graders.filter((_, k) => k !== i)
    set({ graders })
    setFocusCheck(focus === 'previous' ? Math.max(i - 1, 0) : Math.min(i, graders.length - 1))
    if (!removed?.statement.trim()) return
    report(`Removed check ${i + 1}`, {
      undo: () => {
        // Only into the case it came from; elsewhere the offer has passed.
        const now = live.current
        if (now.key !== key) return
        const back = [...now.draft.graders]
        back.splice(i, 0, removed)
        now.setDraft({ ...now.draft, graders: back })
      },
    })
  }
  /**
   * A check is one statement, so the list is typed like one: Enter starts the
   * next check, and Backspace on an empty one takes it away. Shift+Enter still
   * breaks the line.
   */
  const onCheckKey = (i: number) => (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const check = draft.graders[i]
    if (!check || e.nativeEvent.isComposing) return
    if (e.key === 'Enter' && !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault()
      if (check.statement.trim()) addCheck(i + 1)
    } else if (
      e.key === 'Backspace' &&
      !check.statement &&
      !check.image &&
      draft.graders.length > 1
    ) {
      e.preventDefault()
      removeCheck(i, 'previous')
    }
  }

  /** Fill the form from an example, with an id no existing case holds. */
  const fillFrom = async (example: CaseDraft) => {
    if (
      dirty &&
      !(await confirm({ title: 'Replace what you typed with this example?', action: 'Replace' }))
    )
      return
    let id = example.id
    for (let n = 2; cases.some((c) => c.id === id); n += 1) id = `${example.id}-${n}`
    setDraft({ ...example, id, graders: example.graders.map((g) => ({ ...g })) })
  }

  /** What the assistant reads beside any field of this case: the skill, the case as typed, its pictures. */
  const context = () => [skillContext(state), caseContext(draft)]
  const assist = { context, images: () => draft.images }

  const pictures = useAddPictures(draft.images.length, (added) =>
    set({ images: addImages(draft.images, added) }),
  )
  /** A picture dropped anywhere on the case joins its pictures. */
  const drop = usePictureDrop(pictures.add)

  const wordsError =
    draft.words && !(draft.words[0] >= 0 && draft.words[1] >= draft.words[0])
      ? 'The minimum must not be above the maximum.'
      : ''
  const canSave = dirty && draft.prompt.trim() && !wordsError && !busy && !deleting

  const save = async () => {
    if (!canSave) return
    setBusy(true)
    try {
      // A new case is named after its title, or its prompt: the id is its folder, never typed.
      const ids = cases.map((c) => c.id)
      const id = isNew && (!draft.id || ids.includes(draft.id)) ? newCaseId(draft, ids) : draft.id
      await api.saveCase({ ...draft, id }, isNew)
      drafts.setCase(key, null)
      await reload()
      report(isNew ? `Added ${draft.title.trim() || id}` : `Saved ${id}`)
      go('cases', { id }, { replace: true })
    } catch (e) {
      report(e as Error)
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
    setDeleting(true)
    try {
      await api.deleteCase(selected.id)
      drafts.setCase(selected.id, null)
      await reload()
      report(`Deleted ${selected.id}`)
      go('cases', {}, { replace: true })
    } catch (e) {
      report(e as Error)
    } finally {
      setDeleting(false)
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
    )
      drafts.setCase(key, null)
  }

  const heading = isNew ? draft.title.trim() || 'New case' : draft.title.trim() || draft.id
  /** Whether checks are graded for this skill at all: writing and workflow are scored on other things. */
  const checksRead = checksGraded(config)
  /** The case's input files that are not its pictures, which the form shows above. */
  const otherFiles = selected ? selected.files.filter((f) => !picturesOf(selected).includes(f)) : []

  return (
    <Workbench layout={cases.length ? 'list' : 'single'}>
      {cases.length ? (
        <Column kind="list">
          <nav aria-label="Cases" className="contents">
            <ListHeader
              title="Cases"
              count={cases.length}
              addLabel="Add a case"
              addDisabled={isNew}
              onAdd={() => pick({ new: '1' })}
            />
            <ColumnBody inset="list">
              <PlainList gap="none">
                {drafts.cases[NEW_CASE_KEY] && !isNew ? (
                  <li>
                    <NavButton onClick={() => pick({ new: '1' })}>
                      <Text size="ui">
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
                      <Text size="ui" truncate block>
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
          {...drop.handlers}
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
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy || deleting}
                onClick={discard}
              >
                Discard
              </Button>
            ) : isNew && cases.length ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => pick({})}>
                Cancel
              </Button>
            ) : null}
            <Button
              type="submit"
              size="sm"
              disabled={!canSave}
              busy={busy}
              busyLabel="Saving…"
              title={shortcut('S')}
            >
              {isNew ? 'Add case' : 'Save case'}
            </Button>
          </ColumnHeader>
          <ColumnBody width="form">
            {!cases.length ? (
              <Hint>
                A case is one task an agent gets with {state.skill.name} installed. Write what you
                would really ask: the prompt is enough to run it. A run writes an output for every
                case, and reading it shows what to check.
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
                <Label htmlFor="case-prompt">Prompt</Label>
                <TextArea
                  id="case-prompt"
                  rows={6}
                  value={draft.prompt}
                  placeholder={kind.cases[0]?.prompt}
                  aria-describedby="case-prompt-help"
                  onValueChange={(prompt) => set({ prompt })}
                  assist={{ field: 'case.prompt', ...assist }}
                />
                <Hint id="case-prompt-help">{CASE_PROMPT_HINT}</Hint>
              </Field>

              <Field>
                <Label htmlFor="case-title">Title</Label>
                <Input
                  id="case-title"
                  value={draft.title}
                  placeholder="Release note for the export change"
                  aria-describedby={isNew ? 'case-title-help' : undefined}
                  onChange={(e) => set({ title: e.target.value })}
                />
                {isNew ? (
                  <Hint id="case-title-help">
                    A short name for the lists. Left empty, the case is named after its prompt.
                  </Hint>
                ) : null}
              </Field>

              <Field role="group" aria-labelledby="case-pictures">
                <Label id="case-pictures">Pictures</Label>
                <PictureStrip
                  label="Pictures of this case"
                  images={draft.images}
                  adding={pictures.adding}
                  onRemove={(image) => set({ images: draft.images.filter((i) => i !== image) })}
                >
                  <PicturePicker
                    label="Add pictures"
                    disabled={draft.images.length + pictures.adding >= MAX_IMAGES}
                    onFiles={pictures.add}
                  />
                </PictureStrip>
                {pictures.error ? (
                  <Hint tone="destructive" role="alert">
                    {pictures.error}
                  </Hint>
                ) : (
                  <Hint>
                    {drop.over
                      ? 'Drop to add it to this case.'
                      : 'A screenshot, a mock-up or a photo the prompt is about. The agent gets each one as a file, and Jev sees them beside the prompt.'}
                  </Hint>
                )}
              </Field>

              <Field>
                <Label htmlFor="case-expected">A good answer</Label>
                <TextArea
                  id="case-expected"
                  rows={2}
                  value={draft.expectedOutcome}
                  placeholder={kind.cases[0]?.expectedOutcome}
                  onValueChange={(expectedOutcome) => set({ expectedOutcome })}
                  assist={{ field: 'case.expected', ...assist }}
                />
              </Field>
            </FormSection>

            {checksRead ? (
              <FormSection
                layout="stacked"
                title="Checks"
                hint="Statements a good answer makes true. Jev marks each one. They can wait: run the case first, and what an output gets wrong becomes a check, here or on Results. A check can be about a picture, such as a mock-up the output should match."
              >
                <GuideBox summary="What Jev can mark">
                  <PairList pairs={CHECK_EXAMPLES} />
                </GuideBox>
                <Stack gap="md">
                  <PlainList as="ol" gap="md">
                    {draft.graders.map((g, i) => (
                      <CheckLine key={g.id ?? `new-${i}`} index={i + 1}>
                        <CheckStatement
                          index={i + 1}
                          fieldRef={(el) => {
                            statements.current[i] = el
                          }}
                          statement={g.statement}
                          image={g.image}
                          placeholder={
                            kind.cases[0]?.graders[i]?.statement ??
                            kind.cases[0]?.graders[0]?.statement
                          }
                          onKeyDown={onCheckKey(i)}
                          onStatement={(statement) => setGrader(i, { statement })}
                          onImage={(image) => setGrader(i, { image })}
                          onError={report}
                          assist={{ field: 'case.check', ...assist }}
                        />
                        <span className="flex h-9 items-center">
                          <Toggle
                            variant="outline"
                            size="sm"
                            pressed={g.weight > 1}
                            aria-label={`Check ${i + 1} counts double`}
                            title="Counts double"
                            onPressedChange={(on) => setGrader(i, { weight: on ? DOUBLE : 1 })}
                          >
                            {weightMark(g.weight > 1 ? g.weight : DOUBLE)}
                          </Toggle>
                        </span>
                        <Button
                          type="button"
                          variant="ghost-muted"
                          size="icon"
                          aria-label={`Remove check ${i + 1}`}
                          title="Remove"
                          onClick={() => removeCheck(i, 'next')}
                        >
                          <XIcon aria-hidden="true" />
                        </Button>
                      </CheckLine>
                    ))}
                  </PlainList>
                  <Toolbar ref={checkTools}>
                    <Button
                      ref={addCheckButton}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => addCheck(draft.graders.length)}
                    >
                      <PlusIcon aria-hidden="true" />
                      Add a check
                    </Button>
                    <Assist
                      field="case.checks"
                      value=""
                      // It opens under the row of buttons, never over the checks it adds to.
                      anchor={checkTools}
                      {...assist}
                      onApply={(text) => addChecks(assistItems(text))}
                    >
                      <Button type="button" variant="ghost" size="sm">
                        <PenLineIcon aria-hidden="true" />
                        {assistTitle('case.checks')}
                      </Button>
                    </Assist>
                  </Toolbar>
                </Stack>
              </FormSection>
            ) : (
              <FormSection
                layout="stacked"
                title="Checks"
                hint={`This skill is graded as ${names(config.packs)}, which is scored on other things than checks. A skill graded as ${names(CHECK_READERS.map((p) => p.id)).replace(/ and /, ' or ')} has its checks marked: change it under Scoring, on Results.`}
              >
                <Toolbar>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => go('results', { view: 'all' })}
                  >
                    Open Results
                  </Button>
                </Toolbar>
              </FormSection>
            )}

            <FormSection layout="stacked" title="Length">
              <CheckRow
                checked={Boolean(draft.words)}
                onCheckedChange={(on) => set({ words: on ? [50, 300] : null })}
              >
                Score the output’s length in words
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
                  <Text tone="muted" size="ui">
                    words
                  </Text>
                </Toolbar>
              ) : null}
              {wordsError ? <Hint tone="destructive">{wordsError}</Hint> : null}
            </FormSection>

            {otherFiles.length ? (
              <FormSection
                layout="stacked"
                title="Input files"
                hint="The agent finds these in files/ next to the prompt."
              >
                <List size="xs" font="mono">
                  {otherFiles.map((f) => (
                    <li key={f}>{nameOf(f)}</li>
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
                <Toolbar>
                  <Button
                    type="button"
                    variant="destructive-outline"
                    size="sm"
                    disabled={busy}
                    busy={deleting}
                    busyLabel="Deleting…"
                    onClick={remove}
                  >
                    Delete case
                  </Button>
                </Toolbar>
              </FormSection>
            ) : null}
          </ColumnBody>
        </form>
      </Column>
    </Workbench>
  )
}

/**
 * What a check is: its statement, and the picture it is about when it has one.
 * The field's corner adds the picture, beside "write with AI", because both
 * are about the statement's content; the ×2 mark and the remove button are the
 * row's and sit outside it. An added picture sits inside the field under the
 * statement, within its edge, and the corner button goes, since a check is
 * about one picture.
 */
function CheckStatement({
  index,
  fieldRef,
  statement,
  image,
  placeholder,
  onKeyDown,
  onStatement,
  onImage,
  onError,
  assist,
}: {
  index: number
  fieldRef: (el: HTMLTextAreaElement | null) => void
  statement: string
  image: ImageRef | null
  placeholder: string | undefined
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onStatement: (statement: string) => void
  onImage: (image: ImageRef | null) => void
  onError: (message: string) => void
  assist: AssistSpec
}) {
  const { adding, error, add } = useAddPictures(0, ([added]) => onImage(added))
  // Told once per failure, whatever the caller's function is on a later render.
  const report = useRef(onError)
  report.current = onError
  useEffect(() => {
    if (error) report.current(error)
  }, [error])
  const has = Boolean(image) || adding > 0
  return (
    <TextArea
      ref={fieldRef}
      variant="line"
      rows={1}
      aria-label={`Check ${index}`}
      onKeyDown={onKeyDown}
      value={statement}
      placeholder={placeholder}
      onValueChange={onStatement}
      assist={assist}
      corner={
        has ? null : (
          <PicturePicker
            variant="corner"
            single
            label={`Add a picture check ${index} is about`}
            onFiles={(files) => add(files.slice(0, 1))}
          />
        )
      }
      foot={
        has ? (
          <PictureStrip
            size="sm"
            label={`Picture for check ${index}`}
            images={image ? [image] : []}
            adding={adding}
            onRemove={() => onImage(null)}
          />
        ) : null
      }
    />
  )
}

/**
 * Statement, ×2 mark and remove, in columns that line up from row to row. The
 * statement starts on the column's edge, with the check's number hung in the
 * margin before it; its picture, when it has one, sits inside the field under
 * the text. The row reaches 10px past the far edge, which puts the remove icon
 * on that edge, not its 36px box.
 */
const checkLine = 'relative -mr-2.5 grid grid-cols-[minmax(0,1fr)_auto_36px] items-start gap-2'

/** The check's number, in the margin, centred on the first line of its 36px controls. */
const checkIndex = 'absolute top-0 right-full mr-2 flex h-9 items-center'

function CheckLine({ index, children }: { index: number; children: React.ReactNode }) {
  return (
    <li className={checkLine}>
      <span className={checkIndex}>
        <Text tone="faint" font="mono" size="xs" weight="medium" tabular>
          {index}
        </Text>
      </span>
      {children}
    </li>
  )
}
