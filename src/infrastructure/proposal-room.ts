/**
 * The folder the assistant reads a case's answers in to propose checks: a
 * copy of the request and its files, the case's "A good answer" note, the
 * checks it has, and each answer under a letter, with a sheet of what to
 * read and what was proposed for it before, when it was. It holds no part
 * of the skill: a check proposed from the skill's rules would measure
 * obedience again, so the session never sees them. For
 * the same reason an answer's `notes.md` stays out: what an agent tells the
 * person often says which rule it followed. The letters say nothing of which
 * version wrote an answer, or whether it had the skill.
 *
 * Made as `st read`'s room is (`reading-room.ts`): under the system's
 * temporary folder with nothing above it, every file a copy.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inputName } from '@domain/case-draft.ts'
import { isEveryCase } from '@domain/every-case.ts'
import {
  type EarlierProposal,
  earlierSheet,
  type ProposalRoom,
  proposalSheet,
} from '@domain/proposal.ts'
import type { Case } from '@domain/schemas.ts'
import type { Sample } from '@domain/views.ts'
import { assertInside, isDir, isFile, treeFiles, writeText } from './fs.ts'
import { put, putPage } from './reading-room.ts'

/** How each room's own folder under the system's temporary folder begins. */
const PROPOSAL_ROOM_PREFIX = 'skill-studio-proposing-'

export interface ProposalRoomInput {
  skillDir: string
  /** The case, with the checks for every case after its own (`withEveryCase`). */
  testCase: Case
  /** The answers, each under its letter. */
  answers: ReadonlyArray<{ letter: string; sample: Sample }>
  /** The checks the person turned down for this case, by their words. */
  dropped: readonly string[]
  max: number
  /** What was proposed for the case before (`earlierSheet`); none for a case read the first time. */
  earlier?: { kept: readonly EarlierProposal[]; overreach: readonly EarlierProposal[] }
}

export interface MadeProposalRoom extends ProposalRoom {
  /** Where a session is started. */
  dir: string
  dispose(): void
}

/** Make the room for one case. The caller disposes of it. */
export function makeProposalRoom(input: ProposalRoomInput): MadeProposalRoom {
  const parent = mkdtempSync(join(tmpdir(), PROPOSAL_ROOM_PREFIX))
  const made = join(parent, 'room')
  mkdirSync(made)
  const dir = realpathSync.native(made)
  const files: Record<string, string> = {}
  const own = (rel: string, text: string) => {
    writeText(join(dir, rel), text)
    files[rel] = text
  }
  try {
    const { testCase, skillDir } = input
    own('request.md', `${testCase.prompt.trim()}\n`)
    own('note.md', testCase.expectedOutcome.trim() ? `${testCase.expectedOutcome.trim()}\n` : '')
    // The checks are no source for a quote: a proposal's quote shows a fault, or what the request asks.
    writeText(
      join(dir, 'checks.md'),
      testCase.graders.length
        ? `${testCase.graders.map((g, i) => `- C${i + 1}: ${g.statement.trim()}${isEveryCase(g) ? ' (asked of every request of this kind)' : ''}`).join('\n')}\n`
        : 'This request has no checks yet.\n',
    )
    for (const rel of testCase.files) {
      const from = assertInside(skillDir, join(skillDir, rel))
      const name = `inputs/${inputName(testCase, rel)}`
      if (isFile(from)) put(dir, name, from, files)
      else if (isDir(from))
        for (const file of treeFiles(from, { hidden: true }))
          put(dir, `${name}/${file.rel}`, file.real, files)
    }
    const sheet = input.answers.map(({ letter, sample }) => {
      for (const artifact of sample.artifacts) {
        const from = assertInside(sample.path, join(sample.path, artifact.file))
        if (isFile(from)) put(dir, `${letter}/${artifact.file}`, from, files)
      }
      putPage(dir, letter, sample.path, files)
      const paths = treeFiles(join(dir, letter)).map(({ rel }) => `${letter}/${rel}`)
      return { letter, paths }
    })
    writeText(
      join(dir, 'sheet.md'),
      proposalSheet({ answers: sheet, dropped: input.dropped, max: input.max }),
    )
    // Like checks.md, no source for a quote: a proposal kept from before is quoted afresh.
    const earlier = input.earlier ? earlierSheet(input.earlier) : ''
    if (earlier) writeText(join(dir, 'earlier.md'), `${earlier}\n`)
    return {
      dir,
      letters: input.answers.map((a) => a.letter),
      files,
      checks: testCase.graders.map((g) => g.statement.trim()),
      dispose: () => rmSync(parent, { recursive: true, force: true }),
    }
  } catch (error) {
    rmSync(parent, { recursive: true, force: true })
    throw error
  }
}
