/**
 * The new-skill form, opened from the Library and from the skill switcher.
 */
import { AGENTS, type AgentId, type Library } from '@domain/library.ts'
import { DESCRIPTION_HINT, TEMPLATES, type TemplateId, templateById } from '@domain/templates.ts'
import { isSlug, SLUG_RULE } from '@domain/text.ts'
import { useEffect, useRef, useState } from 'react'
import { api } from '../api.ts'
import { Disclosure } from '../components/Disclosure.tsx'
import { CheckRow } from '../components/forms.tsx'
import {
  Field,
  Fieldset,
  FormActions,
  FormSection,
  Screen,
  SectionHead,
  Stack,
  Toolbar,
} from '../components/layout.tsx'
import { Segmented } from '../components/Segmented.tsx'
import { SelectBox } from '../components/SelectBox.tsx'
import { TextArea } from '../components/TextArea.tsx'
import { Code, Heading, Hint, Text } from '../components/text.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { Label } from '../components/ui/label.tsx'
import { type Reporter, useAction } from '../hooks.ts'
import { plural } from '../model.ts'

/** A place's name in the form: the user's home is every project. */
const placeName = (place: Library['places'][number]): string =>
  place.scope === 'user' ? 'User (every project)' : place.label

/**
 * The new-skill form, in the order the questions are usually answered: what it
 * is, what to start from, then where it goes. The name has focus on open, so
 * from the switcher a skill is a name and two Returns away. Where it lives is
 * one line until opened: the defaults suit most skills, and the Library can
 * change both later.
 */
export function NewSkill({
  startName,
  data,
  startPractice,
  starting,
  cancel,
  created,
  report,
}: {
  startName: string
  data: Library
  /** Open the practice skill instead; null once it exists. */
  startPractice: (() => void) | null
  /** The walkthrough is being written, so its link waits. */
  starting: boolean
  cancel: () => void
  /** Open the skill just made; false when the reader chose to stay where they were. */
  created: (path: string) => Promise<boolean>
  report: Reporter
}) {
  const [name, setName] = useState(startName)
  const [description, setDescription] = useState('')
  const [scope, setScope] = useState('user')
  const [agents, setAgents] = useState<Set<AgentId>>(() => new Set(['claude']))
  const [templateId, setTemplateId] = useState<TemplateId>('blank')
  const [samples, setSamples] = useState(true)
  const [busy, run] = useAction(report)
  const nameField = useRef<HTMLInputElement>(null)
  useEffect(() => {
    nameField.current?.focus()
  }, [])
  const nameError = name && !isSlug(name) ? SLUG_RULE : ''
  const taken = data.skills.some((s) => s.scope === scope && s.path.endsWith(`/${name}`))
  const place = data.places.find((p) => p.scope === scope)
  const template = templateById(templateId)
  const installed = AGENTS.filter((a) => agents.has(a.id)).map((a) => a.label)

  const toggleAgent = (id: AgentId) =>
    setAgents((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })

  const submit = () =>
    void run(async () => {
      const skill = await api.createSkill({
        scope,
        name,
        description,
        agents: [...agents],
        template: templateId,
        samples: samples && template.cases.length > 0,
      })
      // The reader may choose to stay with the skill in hand: the form comes back, and the new skill is in the library.
      const opened = await created(skill.path)
      // Said once the skill is open: opening another skill clears the notice about the last one.
      report(`Created ${skill.name}`)
      if (!opened) cancel()
    })

  return (
    <Screen width="form">
      <SectionHead>
        <Heading level={2}>New skill</Heading>
        {startPractice ? (
          <Hint>
            New here?{' '}
            <Button
              type="button"
              variant="link-muted"
              size="inline-sm"
              disabled={starting}
              onClick={startPractice}
            >
              Take the walkthrough
            </Button>{' '}
            on a sample skill first.
          </Hint>
        ) : null}
      </SectionHead>
      <form
        className="contents"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <FormSection
          title="About it"
          hint="The name and description decide when the skill gets used."
        >
          <Field>
            <Label htmlFor="ns-name">Name</Label>
            <Input
              ref={nameField}
              id="ns-name"
              value={name}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="done"
              font="mono"
              aria-invalid={Boolean(nameError || taken) || undefined}
              aria-describedby="ns-name-help"
              onChange={(e) => setName(e.target.value)}
            />
            <Hint id="ns-name-help" tone={nameError || taken ? 'destructive' : 'default'}>
              {nameError ||
                (taken ? 'A skill with this name is already in that place.' : SLUG_RULE)}
            </Hint>
          </Field>
          <Field>
            <Label htmlFor="ns-desc">Description</Label>
            <TextArea
              id="ns-desc"
              rows={3}
              value={description}
              placeholder={template.description || DESCRIPTION_HINT}
              onValueChange={setDescription}
              assist={{
                field: 'skill.description',
                context: () => [
                  {
                    label: 'The new skill',
                    text: `Name: ${name || 'not named yet'}\nKind: ${template.label}. ${template.summary}`,
                  },
                ],
              }}
            />
          </Field>
        </FormSection>

        <FormSection
          title="Start from"
          hint="A template gives you example rules to replace and sample cases to test with."
        >
          <Field>
            <Label id="ns-template">Template</Label>
            <Segmented
              aria-labelledby="ns-template"
              fill
              value={templateId}
              onChange={(v) => v && setTemplateId(v)}
              options={TEMPLATES.map((t) => ({ value: t.id, label: t.label }))}
            />
            <Hint>{template.summary}</Hint>
          </Field>
          {template.cases.length ? (
            <CheckRow checked={samples} onCheckedChange={setSamples}>
              Add {plural(template.cases.length, 'sample case')} to run against
            </CheckRow>
          ) : null}
        </FormSection>

        <FormSection title="Where it lives" hint="Both can be changed later from the Library.">
          <Stack gap="md">
            <Text as="p" size="ui">
              Saved in <Code>.agents/skills/{name || 'name'}</Code>
              {place ? ` in ${placeName(place)}` : ''}.{' '}
              {installed.length
                ? `Installed for ${installed.join(', ')}.`
                : 'Installed for no agent yet.'}
            </Text>
            <Disclosure summary="Change the place or the agents">
              <Stack gap="lg">
                <Field>
                  <Label htmlFor="ns-place">Place</Label>
                  <SelectBox
                    id="ns-place"
                    value={scope}
                    onChange={setScope}
                    options={data.places.map((p) => ({ value: p.scope, label: placeName(p) }))}
                  />
                </Field>
                <Fieldset legend="Install for">
                  <Toolbar gap="md">
                    {AGENTS.map((a) => (
                      <CheckRow
                        key={a.id}
                        checked={agents.has(a.id)}
                        onCheckedChange={() => toggleAgent(a.id)}
                      >
                        {a.label}
                      </CheckRow>
                    ))}
                  </Toolbar>
                </Fieldset>
              </Stack>
            </Disclosure>
          </Stack>
        </FormSection>

        <FormActions>
          <Button
            type="submit"
            disabled={!name || Boolean(nameError) || taken}
            busy={busy}
            busyLabel="Creating…"
          >
            Create skill
          </Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={cancel}>
            Cancel
          </Button>
        </FormActions>
      </form>
    </Screen>
  )
}
