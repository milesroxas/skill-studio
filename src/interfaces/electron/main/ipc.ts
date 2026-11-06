/**
 * The IPC handlers behind the preload's bridge. Every message checks the
 * sending frame's origin first: only the app's own top frame may call.
 */

import { isAbsolute, join } from 'node:path'
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
import { isFile } from '@infrastructure/fs.ts'
import { BrowserWindow, dialog, type IpcMainInvokeEvent, ipcMain, shell } from 'electron'
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
  /** Start the app over. Undefined in a copy that does not offer it, and the request is refused. */
  reset?: () => void
  /** Origins whose top frame may call: the app scheme, and the dev server while developing. */
  trusted: Set<string>
}

const ok = <T>(value: T): Reply<T> => ({ ok: true, value })
const fail = (error: unknown): Reply<never> => ({ ok: false, error: (error as Error).message })

const isTrusted = (event: IpcMainInvokeEvent, trusted: Set<string>): boolean => {
  const frame = event.senderFrame
  return frame !== null && frame === frame.top && trusted.has(frame.origin)
}

export function registerIpc({ backend, secrets, windows, updater, reset, trusted }: IpcDeps): void {
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

  ipcMain.handle(CHANNELS.reset, (event) => {
    if (!isTrusted(event, trusted)) return fail(new Error('Refused: unknown sender.'))
    if (!reset) return fail(new Error('This version of Skill Studio cannot start over.'))
    // After the reply: starting over closes the window that asked.
    setImmediate(reset)
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

  ipcMain.handle(CHANNELS.revealSkill, (event, path: unknown) => {
    if (!isTrusted(event, trusted)) return fail(new Error('Refused: unknown sender.'))
    // The page names the folder, so it is checked here: only a skill's folder is shown.
    if (typeof path !== 'string' || !isAbsolute(path) || !isFile(join(path, 'SKILL.md')))
      return fail(new Error(`No skill at ${String(path)}.`))
    shell.showItemInFolder(path)
    return ok(null)
  })

  ipcMain.handle(CHANNELS.chooseFolder, async (event) => {
    if (!isTrusted(event, trusted)) return fail(new Error('Refused: unknown sender.'))
    try {
      const options: Electron.OpenDialogOptions = {
        title: 'Choose a folder to look in',
        buttonLabel: 'Look here',
        properties: ['openDirectory', 'createDirectory'],
      }
      // Attached to the window that asked, so on macOS it drops down from its title bar.
      const parent = BrowserWindow.fromWebContents(event.sender)
      const { canceled, filePaths } = parent
        ? await dialog.showOpenDialog(parent, options)
        : await dialog.showOpenDialog(options)
      return ok(canceled ? null : (filePaths[0] ?? null))
    } catch (error) {
      return fail(error)
    }
  })
}
