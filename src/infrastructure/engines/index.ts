import type { EngineInfo } from '@domain/views.ts'
import { claudeEngine } from './claude.ts'
import { cursorEngine } from './cursor.ts'
import type { Engine } from './types.ts'

export const engines: Engine[] = [claudeEngine, cursorEngine]

export const engineById = (id: string): Engine | undefined => engines.find((e) => e.id === id)

export async function engineInfo(): Promise<EngineInfo[]> {
  return Promise.all(
    engines.map(async (engine) => {
      const available = engine.available()
      return {
        id: engine.id,
        label: engine.label,
        harness: engine.harness,
        efforts: engine.efforts,
        models: available ? await engine.models() : [],
        defaultModel: engine.defaultModel,
        available,
        hint: engine.hint,
      }
    }),
  )
}

export type { Engine } from './types.ts'
