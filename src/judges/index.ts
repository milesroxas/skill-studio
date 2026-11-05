/** Server-side registry of judge packs; `scorers.ts` holds their pure halves for the browser. */
import type { ArtifactKind } from '@domain/schemas.ts'
import { codePack } from './code/index.ts'
import { designPack } from './design/index.ts'
import { genericPack } from './generic/index.ts'
import type { JudgePack } from './types.ts'
import { workflowPack } from './workflow/index.ts'
import { writingPack } from './writing/index.ts'

const packs: JudgePack[] = [genericPack, writingPack, codePack, workflowPack, designPack]

export const packById = (id: string): JudgePack | undefined => packs.find((p) => p.id === id)

/**
 * The pack that votes on two outputs of `kind`: the first of `ids` that can
 * compare and judges that kind. One pack votes, so a skill with two packs does
 * not ask Jev twice and keep only the second answer.
 */
export const pairwisePack = (ids: string[], kind: ArtifactKind | null): JudgePack | undefined =>
  ids
    .map(packById)
    .find(
      (p) =>
        p?.pairwise && (p.artifacts.length === 0 || (kind !== null && p.artifacts.includes(kind))),
    )

export type { JudgeInput, JudgePack } from './types.ts'
