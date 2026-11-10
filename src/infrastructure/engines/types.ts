import type { Tokens } from '@domain/schemas.ts'
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
  /** Ends the agent when aborted, as the timeout would; the job it belongs to was stopped. */
  signal?: AbortSignal
  transcript: TranscriptWriter
  /** Told what went wrong beside the run itself, such as a transcript that could not be written. */
  log?: (line: string) => void
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
