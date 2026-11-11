/**
 * What a generating agent is told. The same text for every engine, so a
 * difference between runs is the engine, the model or the skill, not the ask.
 */
export interface PromptParts {
  skillName: string
  /** Sample-relative path of the skill copy, when the agent sees one. */
  skillRel: string | null
  request: string
  /** Sample-relative paths of the input files. */
  files: string[]
}

export const OUTPUTS_DIR = 'outputs'
/** Where an agent writes what it would tell the user: its choices, what needs checking, what it could not do. */
export const NOTES_FILE = 'notes.md'
/** The page an agent writes beside an interface that does not open in a browser by itself, so Results can draw it. */
const PREVIEW_FILE = 'preview.html'

export function agentPrompt(parts: PromptParts): string {
  const lines: string[] = []
  if (parts.skillRel)
    lines.push(
      `Use the ${parts.skillName} skill: read ${parts.skillRel}/SKILL.md first and follow it, including the references it points to.`,
    )
  lines.push(
    `This is a benchmark run and nobody will answer a question: where you would ask, make the reasonable choice and record it in ${NOTES_FILE}.`,
    'Do not use MCP tools or the network, and do not read anything outside this directory.',
  )
  if (parts.files.length) lines.push(`Input files the request names: ${parts.files.join(', ')}.`)
  lines.push('', 'Request:', parts.request, '')
  lines.push(
    `Write every file you produce under ${OUTPUTS_DIR}/. A text deliverable goes in ${OUTPUTS_DIR}/output.md as Markdown unless the request names another file or format.`,
    `When the request is for an interface and what you write does not open in a browser by itself (a React component, for one), also write ${OUTPUTS_DIR}/${PREVIEW_FILE}: one page that shows it working in a browser with no network, its scripts and styles inline or in files beside it under ${OUTPUTS_DIR}/.`,
    `Write everything else you would tell the user (what needs checking, choices you made, caveats) to ${NOTES_FILE} in this directory, not under ${OUTPUTS_DIR}/.`,
    'Reply with one line when the files are written.',
  )
  return lines.join('\n')
}
