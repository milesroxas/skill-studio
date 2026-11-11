/**
 * Write the cases a run is made of. A case starts as a prompt: what you would
 * really ask the agent. That is enough to run it. What a good answer does, and
 * the checks Jev marks, are easier to write once an output is in front of you,
 * so they are optional here and can be added from Results. A new case shows
 * the task alone, with one button that opens the rest; a saved case, or one
 * filled from an example, shows it all. Edits are kept as drafts per case, so
 * moving between cases, screens or skills never loses typing.
 */

import { blankDraft, draftOf, newCaseId, picturesOf, sizeProblem } from '@domain/case-draft.ts'
import { addImages, MAX_IMAGES } from '@domain/image.ts'
import { type CaseDraft, NEW_CASE_KEY } from '@domain/schemas.ts'
import {
  CASE_PROMPT_HINT,
  CHECK_EXAMPLES,
  EXAMPLE_KINDS,
  fittingTemplate,
  templateById,
  templateForPacks,
} from '@domain/templates.ts'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { api, currentSkill } from '../api.ts'
import { caseContext, skillContext } from '../assist.ts'
import { CheckList } from '../components/CheckList.tsx'
import { Disclosure } from '../components/Disclosure.tsx'
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
  Loading,
  PlainList,
  Stack,
  Toolbar,
  Workbench,
} from '../components/layout.tsx'
import { NavButton, NavButtonTitle } from '../components/NavButton.tsx'
import { PicturePicker, PictureStrip, usePictureDrop } from '../components/Pictures.tsx'
import { Segmented } from '../components/Segmented.tsx'
import { ExampleList, GuideBox, PairList } from '../components/starters.tsx'
import { TextArea } from '../components/TextArea.tsx'
import { Heading, Hint, Text } from '../components/text.tsx'
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { Label } from '../components/ui/label.tsx'
import type { Ctx } from '../ctx.ts'
import { caseUnsaved, formDraft, unsavedCases } from '../draft-edits.ts'
import { useAction } from '../hooks.ts'
import { useAddPictures } from '../images.ts'
import { shortcut } from '../keys.ts'
import { checksGraded, kindsLine, plural } from '../model.ts'
import { caseKey } from '../route.ts'

const nameOf = (path: string): string => path.split('/').at(-1) ?? path
/** An input file as the agent finds it: by its path inside the case's `files/`, or its name when it is kept elsewhere. */
const inputName = (path: string, filesDir: string | null): string =>
  filesDir && path.startsWith(filesDir) ? path.slice(filesDir.length) : nameOf(path)

/** The host's refusal of a save over a case that was written since the draft began. */
const CHANGED_ON_DISK = /changed on disk/

/**
 * When a case was saved, where the host says. A draft keeps the stamp of the
 * case it began on, and a save sends it back: the host refuses the save when
 * the case on disk is newer.
 */
const savedAtOf = (saved: object | null | undefined): string | null =>
  saved && 'savedAt' in saved && typeof saved.savedAt === 'string' ? saved.savedAt : null

export const Cases = memo(function Cases({ ctx }: { ctx: Ctx }) {
  const { state, config, route, go, report, confirm, reload, drafts } = ctx
  const cases = state.cases
  /**
   * Examples come from the kind of work the skill is graded as. A skill graded
   * as generic fits no kind, so only then does the reader pick one.
   */
  const fitting = fittingTemplate(config.packs)
  const [kindId, setKindId] = useState(() => templateForPacks(config.packs).id)
  const kind = fitting ?? templateById(kindId)
  /** Where this case's draft is kept: its id, or one slot for the case not saved yet. */
  const key = caseKey(
    route.params,
    cases.map((c) => c.id),
  )
  const isNew = key === NEW_CASE_KEY
  const selected = isNew ? null : (cases.find((c) => c.id === key) ?? null)
  const base = useMemo(() => (selected ? draftOf(selected) : blankDraft()), [selected])
  const baseJson = JSON.stringify(base)
  /** The case's draft. One that says what the case on disk says is none: there is nothing in it to save. */
  const held = caseUnsaved(drafts.cases[key], base) ? drafts.cases[key] : undefined
  const draft = useMemo(() => formDraft(held, base), [held, base])
  const [busy, runSave] = useAction(report)
  const [deleting, runDelete] = useAction(report)
  /** The skill this case belongs to: a step that ends after another was opened leaves that one alone. */
  const skill = state.skill.path
  const dirty = held !== undefined
  /** When the case was saved, as last read, and when it was as its draft began. */
  const savedAt = savedAtOf(selected)
  const began = drafts.caseBases[key]
  /** The case changed on disk after its draft began: saving would write over what changed. */
  const changedOnDisk = dirty && !isNew && began !== undefined && began !== savedAt
  // A draft read back from disk began on a case this window never saw: it is taken as begun on the
  // case as it is when first shown, so an edit made outside from then on is caught.
  const unbased = dirty && began === undefined
  useEffect(() => {
    if (unbased) drafts.baseCase(key, savedAt)
  }, [unbased, drafts, key, savedAt])
  /** The cases with unsaved work, which the list marks. */
  const unsaved = useMemo(() => new Set(unsavedCases(cases, drafts.cases)), [cases, drafts.cases])

  /** Another case. The one being left keeps its draft, so there is nothing to confirm. */
  const pick = (params: Record<string, string>) => go('cases', params)

  /** Keep the edit as a draft, or drop the draft once the case matches what is saved again. A new draft keeps the case's stamp. */
  const setDraft = (next: CaseDraft) =>
    drafts.setCase(key, JSON.stringify(next) === baseJson ? null : next, held ? undefined : savedAt)
  const set = (patch: Partial<CaseDraft>) => setDraft({ ...draft, ...patch })

  /** The case in view, for a step that ends later: it goes on only where it began. */
  const inView = useRef(key)
  inView.current = key

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

  /**
   * The form of the case under `at`, as it stands now, and the stamp a draft
   * begun on it keeps (undefined when it has a draft already); null for a case
   * that is gone.
   */
  const formOf = (
    at: string,
  ): { base: CaseDraft; draft: CaseDraft; stamp: string | null | undefined } | null => {
    if (at === key) return { base, draft, stamp: held ? undefined : savedAt }
    const saved = at === NEW_CASE_KEY ? null : cases.find((c) => c.id === at)
    if (saved === undefined) return null
    const savedBase = saved ? draftOf(saved) : blankDraft()
    const kept = caseUnsaved(drafts.cases[at], savedBase) ? drafts.cases[at] : undefined
    return {
      base: savedBase,
      draft: formDraft(kept, savedBase),
      stamp: kept ? undefined : savedAtOf(saved),
    }
  }
  // A picture takes a moment to read. It joins the case it was picked for, by then in view or not,
  // and never another skill's.
  const pictures = useAddPictures(
    draft.images.length,
    (added, scope) => {
      const [forSkill = '', at = ''] = scope.split('\n')
      const form = forSkill === currentSkill() ? formOf(at) : null
      if (!form) return
      const next = { ...form.draft, images: addImages(form.draft.images, added) }
      drafts.setCase(
        at,
        JSON.stringify(next) === JSON.stringify(form.base) ? null : next,
        form.stamp,
      )
    },
    `${skill}\n${key}`,
  )
  /** A picture dropped anywhere on the case joins its pictures. */
  const drop = usePictureDrop(pictures.add)

  /**
   * The case whose good answer, checks and length were opened by their button.
   * Leaving it closes them again: a new case come back to starts as new.
   */
  const [moreFor, setMoreFor] = useState<string | null>(null)
  useEffect(() => {
    if (moreFor !== null && moreFor !== key) setMoreFor(null)
  }, [moreFor, key])
  const expectedField = useRef<HTMLTextAreaElement>(null)
  /** The button goes as the parts it opens arrive, so the keyboard moves on to the first of them. */
  const [focusMore, setFocusMore] = useState(false)
  useEffect(() => {
    if (!focusMore) return
    expectedField.current?.focus()
    setFocusMore(false)
  }, [focusMore])
  const showMore = () => {
    setMoreFor(key)
    setFocusMore(true)
  }

  const wordsError =
    draft.words && !(draft.words[0] >= 0 && draft.words[1] >= draft.words[0])
      ? 'The minimum must not be above the maximum.'
      : ''
  const sizeError = sizeProblem(draft.size) ?? ''
  /** Size matters to a skill that makes pages or pictures, and to a case that already names one. */
  const drawn = config.packs.includes('design') || Boolean(draft.size) || Boolean(draft.phone)
  const canSave =
    dirty &&
    draft.prompt.trim() &&
    !wordsError &&
    !sizeError &&
    !busy &&
    !deleting &&
    !changedOnDisk

  const save = () => {
    if (!canSave) return
    const form = draft
    /** The draft as it stands now: what is typed while the case is written is kept over it. */
    const sent = held
    /** The case the draft began on: the host refuses the save when the one on disk is newer. */
    const over = began === undefined ? savedAt : began
    void runSave(async () => {
      // A new case is named after its title, or its prompt: the id is its folder, never typed.
      const ids = cases.map((c) => c.id)
      const id = isNew && (!form.id || ids.includes(form.id)) ? newCaseId(form, ids) : form.id
      let stamp: string | null
      try {
        stamp = (await api.saveCase({ ...form, id }, isNew, over)).savedAt
      } catch (e) {
        if (!CHANGED_ON_DISK.test((e as Error).message)) throw e
        if (currentSkill() !== skill) return
        // Read again, the case is newer than the one the draft began on: the form says so.
        drafts.baseCase(key, over)
        await reload()
        return
      }
      // The draft goes once the saved case is read, so the form never steps back to the case
      // from before the save.
      if (currentSkill() === skill) await reload()
      // Cleared in the drafts of the skill it was saved in, open or not: left, it would be saved twice.
      const elsewhere = currentSkill() !== skill
      drafts.savedCase(key, sent, id, stamp, elsewhere ? skill : undefined)
      if (elsewhere) return
      report(isNew ? `Added ${form.title.trim() || id}` : `Saved ${id}`)
      // Only from the case that was saved: the reader may be on another by now.
      if (inView.current === key) go('cases', { id }, { replace: true })
    })
  }

  const remove = async () => {
    if (!selected) return
    const gone = selected.id
    const ok = await confirm({
      title: `Delete the case ${gone}?`,
      description: 'Its folder goes too. Past runs keep their outputs.',
      action: 'Delete',
      destructive: true,
    })
    if (!ok) return
    void runDelete(async () => {
      await api.deleteCase(gone)
      if (currentSkill() !== skill) return
      drafts.setCase(gone, null)
      await reload()
      report(`Deleted ${gone}`)
      if (inView.current === key) go('cases', {}, { replace: true })
    })
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
  /**
   * The parts past the task: a good answer, checks, length and size. A new case
   * keeps them behind one button until it is pressed or something fills them,
   * such as an example; a saved case always shows them.
   */
  const extras =
    !isNew ||
    moreFor === key ||
    Boolean(draft.expectedOutcome.trim()) ||
    draft.graders.some((g) => g.statement.trim() || g.image) ||
    Boolean(draft.words) ||
    Boolean(draft.size) ||
    Boolean(draft.phone)
  /** The case's input files that are not its pictures, which the form shows above. */
  const otherFiles = selected ? selected.files.filter((f) => !picturesOf(selected).includes(f)) : []
  /** The saved case's own `files/` folder, in the skill: where another input file goes. */
  const caseDir = selected?.dir ?? null
  const filesDir = caseDir ? `${caseDir}/files/` : null
  const { openCaseFiles } = api

  // The stored drafts are still being read: the form waits, so nothing is typed over a draft not shown yet.
  if (drafts.status === 'loading') return <Loading size="screen" />

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
                {unsaved.has(NEW_CASE_KEY) && !isNew ? (
                  <li>
                    <NavButton onClick={() => pick({ new: '1' })}>
                      <NavButtonTitle unsaved>New case</NavButtonTitle>
                      <Text tone="muted" size="xs">
                        Not added yet
                      </Text>
                    </NavButton>
                  </li>
                ) : null}
                {cases.map((c) => (
                  <li key={c.id}>
                    <NavButton current={selected?.id === c.id} onClick={() => pick({ id: c.id })}>
                      <NavButtonTitle unsaved={unsaved.has(c.id)}>
                        {c.title !== c.id ? c.title : c.id}
                      </NavButtonTitle>
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
      <Column over={drop.over}>
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
            {/* Filled only when pressing it saves something, as Save on the Skill screen. */}
            <Button
              type="submit"
              variant={canSave || busy ? 'default' : 'ghost'}
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
            {changedOnDisk ? (
              <Alert variant="warning" role="status">
                <AlertTitle>{draft.id} changed on disk since this draft began</AlertTitle>
                <AlertDescription>
                  <p>Keep your draft to save over the case, or take the case as it is now.</p>
                  <Toolbar>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => drafts.baseCase(key, savedAt)}
                    >
                      Keep my draft
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => drafts.setCase(key, null)}
                    >
                      Use the case on disk
                    </Button>
                  </Toolbar>
                </AlertDescription>
              </Alert>
            ) : null}
            {selected?.source === 'evals.json' ? (
              <Alert variant="muted">
                <AlertDescription>
                  This case comes from evals.json. Saving writes a case folder in its place.
                </AlertDescription>
              </Alert>
            ) : null}

            <FormSection
              layout="stacked"
              title="Task"
              hint={
                cases.length
                  ? undefined
                  : 'A case is one task you would give an agent. The prompt is enough to run it.'
              }
            >
              <Field>
                <Label htmlFor="case-prompt">Prompt</Label>
                <TextArea
                  id="case-prompt"
                  rows={6}
                  value={draft.prompt}
                  placeholder="What would you ask the agent?"
                  aria-describedby="case-prompt-help"
                  onValueChange={(prompt) => set({ prompt })}
                  assist={{ field: 'case.prompt', ...assist }}
                />
                <Hint id="case-prompt-help">{CASE_PROMPT_HINT}</Hint>
              </Field>

              {isNew ? (
                <Disclosure summary="Start from an example">
                  <Stack gap="md">
                    {fitting ? null : (
                      <Segmented
                        aria-label="Kind of skill"
                        value={kindId}
                        onChange={(v) => v && setKindId(v)}
                        options={EXAMPLE_KINDS.map((t) => ({ value: t.id, label: t.label }))}
                      />
                    )}
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
                  </Stack>
                </Disclosure>
              ) : null}

              <Field>
                <Label htmlFor="case-title" optional>
                  Title
                </Label>
                <Input
                  id="case-title"
                  value={draft.title}
                  placeholder="Named after the prompt"
                  onChange={(e) => set({ title: e.target.value })}
                />
              </Field>

              <Field role="group" aria-labelledby="case-pictures">
                <Label id="case-pictures" optional>
                  Pictures
                </Label>
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
                  <Hint>Screenshots or mock-ups the prompt is about. Drop them anywhere here.</Hint>
                )}
              </Field>

              {extras ? (
                <Field>
                  <Label htmlFor="case-expected" optional>
                    A good answer
                  </Label>
                  <TextArea
                    ref={expectedField}
                    id="case-expected"
                    rows={2}
                    value={draft.expectedOutcome}
                    placeholder="What it says first and what it must include"
                    onValueChange={(expectedOutcome) => set({ expectedOutcome })}
                    assist={{ field: 'case.expected', ...assist }}
                  />
                </Field>
              ) : (
                <Toolbar>
                  <Button type="button" variant="outline" size="sm" onClick={showMore}>
                    Describe a good answer
                  </Button>
                </Toolbar>
              )}
            </FormSection>

            {extras && checksRead ? (
              <FormSection
                layout="stacked"
                title="Checks"
                hint="Statements a good answer makes true. Jev marks each one. Optional: easier to write after a first run."
              >
                <GuideBox summary="What Jev can mark">
                  <PairList pairs={CHECK_EXAMPLES} />
                </GuideBox>
                <CheckList
                  key={`${skill}\n${key}`}
                  graders={draft.graders}
                  onChange={(graders) => set({ graders })}
                  examples={kind.cases[0]?.graders.map((g) => g.statement) ?? []}
                  assist={assist}
                  report={report}
                />
              </FormSection>
            ) : null}
            {extras && !checksRead ? (
              <FormSection
                layout="stacked"
                title="Checks"
                hint={`A skill graded as ${kindsLine(config.packs)} is not scored on checks. Graded as, on Results, changes that.`}
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
            ) : null}

            {extras ? (
              <FormSection layout="stacked" title={drawn ? 'Length and size' : 'Length'}>
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

                {drawn ? (
                  <>
                    <CheckRow
                      checked={Boolean(draft.size)}
                      onCheckedChange={(on) => set({ size: on ? [1280, 800] : null })}
                      description="A picture must be exactly this size. A page is drawn at it."
                    >
                      Check the output’s size in pixels
                    </CheckRow>
                    {draft.size ? (
                      <Toolbar>
                        <InlineField label="Width">
                          <NumberInput
                            aria-label="Width in pixels"
                            min={1}
                            value={draft.size[0]}
                            onChange={(e) =>
                              set({ size: [Number(e.target.value), draft.size?.[1] ?? 0] })
                            }
                          />
                        </InlineField>
                        <InlineField label="by">
                          <NumberInput
                            aria-label="Height in pixels"
                            min={1}
                            value={draft.size[1]}
                            onChange={(e) =>
                              set({ size: [draft.size?.[0] ?? 0, Number(e.target.value)] })
                            }
                          />
                        </InlineField>
                        <Text tone="muted" size="ui">
                          px
                        </Text>
                      </Toolbar>
                    ) : null}
                    {sizeError ? <Hint tone="destructive">{sizeError}</Hint> : null}
                    <CheckRow
                      checked={draft.phone ?? false}
                      onCheckedChange={(on) => set({ phone: on })}
                    >
                      Check that a page works on a phone too, 390 px wide
                    </CheckRow>
                  </>
                ) : null}
              </FormSection>
            ) : null}

            {filesDir || otherFiles.length ? (
              <FormSection
                layout="stacked"
                title="Input files"
                hint="The agent sees only the skill, the prompt and these files, never your project. Copy in anything the prompt is about."
              >
                {otherFiles.length ? (
                  <List size="xs" font="mono">
                    {otherFiles.map((f) => (
                      <li key={f}>{inputName(f, filesDir)}</li>
                    ))}
                  </List>
                ) : null}
                {caseDir && openCaseFiles ? (
                  <Toolbar>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void openCaseFiles(skill, caseDir).catch(report)}
                    >
                      Show folder
                    </Button>
                  </Toolbar>
                ) : filesDir ? (
                  <Hint>The folder is {filesDir.slice(0, -1)}, in the skill.</Hint>
                ) : null}
              </FormSection>
            ) : null}

            {selected?.dir ? (
              <FormSection layout="stacked" title="Delete this case">
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
})
