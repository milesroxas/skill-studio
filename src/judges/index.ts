/** Server-side registry of judge packs; `scorers.ts` holds their pure halves for the browser. */
import { codePack } from './code/index.ts'
import { designPack } from './design/index.ts'
import { genericPack } from './generic/index.ts'
import type { JudgePack } from './types.ts'
import { workflowPack } from './workflow/index.ts'

const packs: JudgePack[] = [genericPack, codePack, workflowPack, designPack]

export const packById = (id: string): JudgePack | undefined => packs.find((p) => p.id === id)

/** The version of every pack's questions, by pack id: what a grading made now asks. */
export const packVersions = (): Record<string, number> =>
  Object.fromEntries(packs.map((p) => [p.id, p.version]))

export type { JudgePack } from './types.ts'
