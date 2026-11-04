/**
 * The Jev key, kept by the desktop app with the OS keychain through
 * `safeStorage`. A key in the environment at launch wins over a stored one.
 * This is the shell's `SecretStore`: it runs in main, where safeStorage lives.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { SecretStore } from '@application/api/operations.ts'
import type { Settings } from '@domain/views.ts'
import { safeStorage } from 'electron'

export const JEV_KEY = 'TYPESAFE_API_KEY'

interface Stored {
  /** The encrypted key, base64. */
  [JEV_KEY]?: string
}

export class KeychainSecrets implements SecretStore {
  private readonly launchKey: string | undefined
  private readonly file: string
  /** Told when the effective key changes, so the backend's environment follows. */
  private readonly onChange: (value: string | undefined) => void

  constructor(file: string, onChange: (value: string | undefined) => void) {
    this.file = file
    this.launchKey = process.env[JEV_KEY] || undefined
    this.onChange = onChange
  }

  private canStore(): Promise<boolean> {
    return safeStorage.isAsyncEncryptionAvailable()
  }

  private async stored(): Promise<string | undefined> {
    if (!existsSync(this.file)) return undefined
    const saved = JSON.parse(readFileSync(this.file, 'utf8')) as Stored
    const encrypted = saved[JEV_KEY]
    if (!encrypted || !(await this.canStore())) return undefined
    const { result } = await safeStorage.decryptStringAsync(Buffer.from(encrypted, 'base64'))
    return result || undefined
  }

  /** The key the backend should run with: the environment's, else the stored one. */
  async effective(): Promise<string | undefined> {
    return this.launchKey ?? (await this.stored())
  }

  async read(): Promise<Settings> {
    const stored = await this.stored()
    return {
      jevKey: Boolean(this.launchKey ?? stored),
      source: this.launchKey ? 'environment' : stored ? 'stored' : null,
      canStore: await this.canStore(),
    }
  }

  async write(value: string): Promise<Settings> {
    if (!(await this.canStore()))
      throw new Error('This system has no keychain the app can use. Set TYPESAFE_API_KEY instead.')
    if (value) {
      const encrypted = await safeStorage.encryptStringAsync(value)
      mkdirSync(dirname(this.file), { recursive: true })
      const saved: Stored = { [JEV_KEY]: encrypted.toString('base64') }
      writeFileSync(this.file, `${JSON.stringify(saved, null, 2)}\n`, { mode: 0o600 })
    } else rmSync(this.file, { force: true })
    this.onChange(await this.effective())
    return this.read()
  }
}
