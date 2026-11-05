/**
 * The keys the app works with: the TypeSafe key Jev grades with, and the
 * Anthropic and OpenAI keys the assistant writes with. One list, so every host
 * stores, reads and reports them the same way. Pure data and functions.
 */

export const SECRET_IDS = ['jev', 'anthropic', 'openai'] as const
export type SecretId = (typeof SECRET_IDS)[number]

export interface SecretDef {
  /** The variable the backend reads the key from. */
  env: string
  /**
   * The variable a key set outside the app arrives in. A key the app stores
   * goes to the backend under `env` only, so an agent it starts (Claude Code,
   * Codex) never finds a stored key in the name it bills against.
   */
  launchEnv: string
  /** How such a key starts, shown in the empty field. */
  placeholder: string
}

export const SECRETS: Record<SecretId, SecretDef> = {
  jev: {
    env: 'TYPESAFE_API_KEY',
    launchEnv: 'TYPESAFE_API_KEY',
    placeholder: 'ts_…',
  },
  anthropic: {
    env: 'SKILL_STUDIO_ANTHROPIC_API_KEY',
    launchEnv: 'ANTHROPIC_API_KEY',
    placeholder: 'sk-ant-…',
  },
  openai: {
    env: 'SKILL_STUDIO_OPENAI_API_KEY',
    launchEnv: 'OPENAI_API_KEY',
    placeholder: 'sk-…',
  },
}

/** The key in an environment: the one the app passed on, else the one set outside it. */
export const secretOf = (
  id: SecretId,
  env: Readonly<Record<string, string | undefined>>,
): string | undefined => env[SECRETS[id].env] || env[SECRETS[id].launchEnv] || undefined

/** Whether a key is in reach, and where it comes from. */
export interface SecretStatus {
  set: boolean
  source: 'environment' | 'stored' | null
}

/** Every key's status, and whether this host can keep one itself. */
export interface Settings {
  canStore: boolean
  keys: Record<SecretId, SecretStatus>
}

/** The status of every key, from one function that knows a single key's. */
export const statusOfEach = (status: (id: SecretId) => SecretStatus): Settings['keys'] =>
  Object.fromEntries(SECRET_IDS.map((id) => [id, status(id)])) as Settings['keys']
