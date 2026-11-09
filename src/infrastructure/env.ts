/** The environment a child of the backend runs with: `@domain/env.ts` says what is left out. */
import { agentEnv as pure } from '@domain/env.ts'

export const agentEnv = (source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv => pure(source)
