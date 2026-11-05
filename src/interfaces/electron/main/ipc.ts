/**
 * The IPC handlers behind the preload's bridge. Every message checks the
 * sending frame's origin first: only the app's own top frame may call.
 */

import type { Reply, ShellOperation } from '@application/api/contract.ts'
import {
  isOperation,
  isShellOperation,
  parsers,
  record,
  type SecretStore,
} from '@application/api/operations.ts'
import { preferencesOf } from '@domain/preferences.ts'
import type { Settings } from '@domain/secrets.ts'
import { BrowserWindow, type IpcMainInvokeEvent, ipcMain, shell } from 'electron'
import { CHANNELS } from '../channels.ts'
import type { Backend } from './backend.ts'
import { applyTheme, openArtifactWindow } from './window.ts'

export interface IpcDeps {
  backend: Backend
  secrets: SecretStore
  /** Origins whose top frame may call: the app scheme, and the dev server while developing. */
  trusted: Set<string>
}

const ok = <T>(value: T): Reply<T> => ({ ok: true, value })
const fail = (error: unknown): Reply<never> => ({ ok: false, error: (error as Error).message })

const isTrusted = (event: IpcMainInvokeEvent, trusted: Set<string>): boolean => {
  const frame = event.senderFrame
  return frame !== null && frame === frame.top && trusted.has(frame.origin)
}

export function registerIpc({ backend, secrets, trusted }: IpcDeps): void {
  /** The settings operations run here, next to the keychain; everything else goes to the backend. */
  const shellCall = (name: ShellOperation, input: unknown): Promise<Settings> => {
    switch (name) {
      case 'settings.read':
        return secrets.read()
      case 'settings.key': {
        const { id, value } = parsers['settings.key'](record(input))
        return secrets.write(id, value)
      }
    }
  }

  ipcMain.handle(CHANNELS.call, async (event, name: unknown, input: unknown) => {
    if (!isTrusted(event, trusted)) return fail(new Error('Refused: unknown sender.'))
    if (!isOperation(name)) return fail(new Error(`No operation ${String(name)}.`))
    if (!isShellOperation(name)) {
      const reply = await backend.call(name, input)
      // The backend stores preferences; the theme is the shell's to apply.
      if (name === 'preferences.write' && reply.ok) applyTheme(preferencesOf(reply.value).theme)
      return reply
    }
    try {
      return ok(await shellCall(name, input))
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle(CHANNELS.openArtifact, (event, url: unknown) => {
    if (!isTrusted(event, trusted)) return fail(new Error('Refused: unknown sender.'))
    try {
      const parent = BrowserWindow.fromWebContents(event.sender)
      if (typeof url !== 'string' || !parent) throw new Error('Not an artifact.')
      openArtifactWindow(url, parent)
      return ok(null)
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle(CHANNELS.openExternal, async (event, url: unknown) => {
    if (!isTrusted(event, trusted)) return fail(new Error('Refused: unknown sender.'))
    try {
      if (typeof url !== 'string' || !/^https?:$/.test(new URL(url).protocol))
        throw new Error('Only web links open outside the app.')
      await shell.openExternal(url)
      return ok(null)
    } catch (error) {
      return fail(error)
    }
  })
}
