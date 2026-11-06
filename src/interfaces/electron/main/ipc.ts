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
import { isUpdateRequest, type UpdateRequest } from '@domain/update.ts'
import { BrowserWindow, type IpcMainInvokeEvent, ipcMain, shell } from 'electron'
import { CHANNELS } from '../channels.ts'
import type { Backend } from './backend.ts'
import type { Updater } from './updater.ts'
import { applyTheme, openArtifactWindow } from './window.ts'
import type { Windows } from './windows.ts'

export interface IpcDeps {
  backend: Backend
  secrets: SecretStore
  windows: Windows
  updater: Updater
  /** Origins whose top frame may call: the app scheme, and the dev server while developing. */
  trusted: Set<string>
}

const ok = <T>(value: T): Reply<T> => ({ ok: true, value })
const fail = (error: unknown): Reply<never> => ({ ok: false, error: (error as Error).message })

const isTrusted = (event: IpcMainInvokeEvent, trusted: Set<string>): boolean => {
  const frame = event.senderFrame
  return frame !== null && frame === frame.top && trusted.has(frame.origin)
}

export function registerIpc({ backend, secrets, windows, updater, trusted }: IpcDeps): void {
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
      // The backend stores preferences; the theme and the updates are the shell's to follow.
      if (name === 'preferences.write' && reply.ok) {
        const { theme, updates } = preferencesOf(reply.value)
        applyTheme(theme)
        updater.follow(updates)
      }
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

  ipcMain.handle(CHANNELS.openWelcome, (event) => {
    if (!isTrusted(event, trusted)) return fail(new Error('Refused: unknown sender.'))
    windows.openWelcome()
    return ok(null)
  })

  ipcMain.handle(CHANNELS.enterApp, (event, skill: unknown) => {
    if (!isTrusted(event, trusted)) return fail(new Error('Refused: unknown sender.'))
    if (skill !== null && typeof skill !== 'string') return fail(new Error('Not a skill.'))
    windows.enterApp(skill ? { skill } : {})
    return ok(null)
  })

  /** A click in a window is someone asking, so a check from here shows its failure. */
  const updateSteps: Record<UpdateRequest, () => void> = {
    state: () => {},
    check: () => updater.check(true),
    download: () => updater.download(),
    install: () => updater.install(),
  }

  ipcMain.handle(CHANNELS.update, (event, request: unknown) => {
    if (!isTrusted(event, trusted)) return fail(new Error('Refused: unknown sender.'))
    if (!isUpdateRequest(request)) return fail(new Error('Not an update request.'))
    updateSteps[request]()
    return ok(updater.state())
  })

  ipcMain.handle(CHANNELS.openChangelog, (event) => {
    if (!isTrusted(event, trusted)) return fail(new Error('Refused: unknown sender.'))
    windows.openChangelog()
    return ok(null)
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
