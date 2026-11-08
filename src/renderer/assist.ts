/**
 * What a screen tells the assistant beside the field it writes for: the skill
 * and its rules, the case in hand, what changed since the last version. Each
 * is a named text, built when the request is sent.
 */
import { type AssistContext, weightNote } from '@domain/assist.ts'
import type { CaseDraft } from '@domain/schemas.ts'
import { api, type State } from './api.ts'
import { diffLineText, lineDiff } from './diff.ts'

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

/** The saved files against a version's, file by file; against nothing, the files themselves. */
export async function changesContext(since: string | null): Promise<AssistContext[]> {
  const [before, after] = await Promise.all([
    since ? api.skillFiles(since).then((v) => v.files) : {},
    api.skillFiles('current').then((v) => v.files),
  ])
  const paths = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
  return paths.flatMap((path) => {
    const was: string | undefined = (before as Record<string, string>)[path]
    const now: string | undefined = after[path]
    if (was === now) return []
    if (!since || was === undefined) return [{ label: `${path} (new)`, text: now ?? '' }]
    return [
      {
        label: `Changes to ${path} since ${since}`,
        text:
          now === undefined
            ? 'The file was deleted.'
            : lineDiff(was, now).map(diffLineText).join('\n'),
      },
    ]
  })
}
