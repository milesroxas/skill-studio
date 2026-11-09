/**
 * What a screen tells the assistant beside the field it writes for: the skill
 * and its rules, and the case in hand. Each is a named text, built when the
 * request is sent.
 */
import { type AssistContext, weightNote } from '@domain/assist.ts'
import type { CaseDraft } from '@domain/schemas.ts'
import type { State } from './api.ts'

export const skillContext = ({ skill, rules }: State): AssistContext => ({
  label: 'The skill',
  text: [
    `Name: ${skill.name}`,
    skill.description ? `Description: ${skill.description}` : '',
    rules.length ? `Its rules:\n${rules.map((rule) => `- ${rule.text}`).join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n'),
})

export const caseContext = (
  draft: Pick<CaseDraft, 'title' | 'prompt' | 'expectedOutcome'> & {
    graders: ReadonlyArray<{ statement: string; weight: number }>
  },
): AssistContext => ({
  label: 'The case',
  text: [
    draft.title ? `Title: ${draft.title}` : '',
    draft.prompt ? `Prompt: ${draft.prompt}` : '',
    draft.expectedOutcome ? `A good answer: ${draft.expectedOutcome}` : '',
    ...draft.graders
      .filter((g) => g.statement.trim())
      .map((g) => `Check${weightNote(g.weight)}: ${g.statement}`),
  ]
    .filter(Boolean)
    .join('\n'),
})
