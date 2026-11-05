/**
 * The app's keys, kept by the desktop app with the OS keychain through
 * `safeStorage`. A key in the environment at launch wins over a stored one.
 * This is the shell's `SecretStore`: it runs in main, where safeStorage lives.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { SecretStore } from '@application/api/operations.ts'
import { SECRET_IDS, SECRETS, type SecretId, type Settings, statusOfEach } from '@domain/secrets.ts'
import { safeStorage } from 'electron'

/** Each stored key, encrypted and base64, under the variable the backend reads it from. */
type Stored = Record<string, string | undefined>

/** What the backend's environment should hold: a value per variable, `undefined` to clear it. */
export type SecretEnv = Record<string, string | undefined>

export class KeychainSecrets implements SecretStore {
  private readonly launch: Partial<Record<SecretId, string>>
  private readonly file: string
  /** Told when the effective keys change, so the backend's environment follows. */
  private readonly onChange: (env: SecretEnv) => void

  constructor(file: string, onChange: (env: SecretEnv) => void) {
    this.file = file
    this.launch = Object.fromEntries(
      SECRET_IDS.map((id) => [id, process.env[SECRETS[id].launchEnv] || undefined]),
    )
    this.onChange = onChange
  }

  private canStore(): Promise<boolean> {
    return safeStorage.isAsyncEncryptionAvailable()
  }

  private saved(): Stored {
    return existsSync(this.file) ? (JSON.parse(readFileSync(this.file, 'utf8')) as Stored) : {}
  }

  private async stored(id: SecretId): Promise<string | undefined> {
    const encrypted = this.saved()[SECRETS[id].env]
    if (!encrypted || !(await this.canStore())) return undefined
    const { result } = await safeStorage.decryptStringAsync(Buffer.from(encrypted, 'base64'))
    return result || undefined
  }

  /** The keys the backend should run with: the environment's, else the stored ones. */
  async effective(): Promise<SecretEnv> {
    const env: SecretEnv = {}
    for (const id of SECRET_IDS) env[SECRETS[id].env] = this.launch[id] ?? (await this.stored(id))
    return env
  }

  async read(): Promise<Settings> {
    const stored = Object.fromEntries(
      await Promise.all(SECRET_IDS.map(async (id) => [id, await this.stored(id)] as const)),
    )
    return {
      canStore: await this.canStore(),
      keys: statusOfEach((id) => ({
        set: Boolean(this.launch[id] ?? stored[id]),
        source: this.launch[id] ? 'environment' : stored[id] ? 'stored' : null,
      })),
    }
  }

  async write(id: SecretId, value: string): Promise<Settings> {
    const { env, launchEnv } = SECRETS[id]
    if (!(await this.canStore()))
      throw new Error(`This system has no keychain the app can use. Set ${launchEnv} instead.`)
    const saved = this.saved()
    if (value) saved[env] = (await safeStorage.encryptStringAsync(value)).toString('base64')
    else delete saved[env]
    if (Object.keys(saved).length) {
      mkdirSync(dirname(this.file), { recursive: true })
      writeFileSync(this.file, `${JSON.stringify(saved, null, 2)}\n`, { mode: 0o600 })
    } else rmSync(this.file, { force: true })
    this.onChange(await this.effective())
    return this.read()
  }
}
