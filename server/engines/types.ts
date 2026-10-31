import type { Tokens } from '@core/schemas.ts'
import type { TranscriptWriter } from '../transcript.ts'

export interface EngineRequest {
  /** The sample directory: the agent's working directory. */
  cwd: string
  prompt: string
  model: string | null
  effort: string | null
  /** Tool names the agent may use without asking; null for the engine's default. */
  allowedTools: string[] | null
  timeoutMs: number
  transcript: TranscriptWriter
  log: (line: string) => void
}

export interface EngineResult {
  /** The process ended on its own with a success status. */
  ok: boolean
  error: string | null
  costUsd: number | null
  tokens: Tokens | null
  /** The model the engine reported, when it did. */
  model: string | null
  /** The agent's last message. */
  finalText: string | null
}

/** What the UI and CLI show about an engine. */
export interface EngineInfo {
  id: string
  label: string
  harness: 'agent' | 'api'
  efforts: string[]
  models: string[]
  defaultModel: string
  available: boolean
  hint: string
}

export interface Engine {
  id: string
  label: string
  harness: 'agent' | 'api'
  efforts: string[]
  defaultModel: string
  hint: string
  available(): boolean
  /** Model ids the engine accepts; read from the tool when it can list them. */
  models(): Promise<string[]>
  run(request: EngineRequest): Promise<EngineResult>
}
