/** Server-side registry of judge packs; `scorers.ts` holds their pure halves for the browser. */
import { codePack } from './code/index.ts'
import { designPack } from './design/index.ts'
import { genericPack } from './generic/index.ts'
import type { JudgePack } from './types.ts'
import { workflowPack } from './workflow/index.ts'
import { writingPack } from './writing/index.ts'

const packs: JudgePack[] = [genericPack, writingPack, codePack, workflowPack, designPack]

export const packById = (id: string): JudgePack | undefined => packs.find((p) => p.id === id)

export type { JudgePack } from './types.ts'
