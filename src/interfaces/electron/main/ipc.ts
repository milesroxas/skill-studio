/**
 * The IPC handlers behind the preload's bridge. Every message checks the
 * sending frame's origin first: only the app's own top frame may call.
 */

import { mkdirSync } from 'node:fs'
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
import { assertInside, isFile } from '@infrastructure/fs.ts'
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
  /**
   * Answer a channel. Every handler goes through here, so none can skip the
   * check of who is asking, and whatever one throws goes back as a failed reply.
   */
  const handle = (
    channel: string,
    answer: (
      event: IpcMainInvokeEvent,
      ...args: unknown[]
    ) => Reply<unknown> | Promise<Reply<unknown>>,
  ): void => {
    ipcMain.handle(channel, async (event, ...args: unknown[]) => {
      if (!isTrusted(event, trusted)) return fail(new Error('Refused: unknown sender.'))
      try {
        return await answer(event, ...args)
      } catch (error) {
        return fail(error)
      }
    })
  }

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

  handle(CHANNELS.call, async (_event, name, input) => {
    if (!isOperation(name)) throw new Error(`No operation ${String(name)}.`)
    if (isShellOperation(name)) return ok(await shellCall(name, input))
    const reply = await backend.call(name, input)
    // The backend stores preferences; the theme and the updates are the shell's to follow.
    if (name === 'preferences.write' && reply.ok) {
      const { theme, updates } = preferencesOf(reply.value)
      applyTheme(theme)
      updater.follow(updates)
    }
    return reply
  })

  handle(CHANNELS.openArtifact, (event, url) => {
    const parent = BrowserWindow.fromWebContents(event.sender)
    if (typeof url !== 'string' || !parent) throw new Error('Not an artifact.')
    openArtifactWindow(url, parent)
    return ok(null)
  })

  handle(CHANNELS.openWelcome, () => {
    windows.openWelcome()
    return ok(null)
  })

  handle(CHANNELS.enterApp, (_event, skill) => {
    if (skill !== null && typeof skill !== 'string') throw new Error('Not a skill.')
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

  handle(CHANNELS.update, (_event, request) => {
    if (!isUpdateRequest(request)) throw new Error('Not an update request.')
    updateSteps[request]()
    return ok(updater.state())
  })

  handle(CHANNELS.openChangelog, () => {
    windows.openChangelog()
    return ok(null)
  })

  handle(CHANNELS.reset, () => {
    if (!reset) throw new Error('This version of Skill Studio cannot start over.')
    // After the reply: starting over closes the window that asked.
    setImmediate(reset)
    return ok(null)
  })

  handle(CHANNELS.openExternal, async (_event, url) => {
    if (typeof url !== 'string' || !/^https?:$/.test(new URL(url).protocol))
      throw new Error('Only web links open outside the app.')
    await shell.openExternal(url)
    return ok(null)
  })

  handle(CHANNELS.revealSkill, (_event, path) => {
    // The page names the folder, so it is checked here: only a skill's folder is shown.
    if (typeof path !== 'string' || !isAbsolute(path) || !isFile(join(path, 'SKILL.md')))
      throw new Error(`No skill at ${String(path)}.`)
    shell.showItemInFolder(path)
    return ok(null)
  })

  handle(CHANNELS.openCaseFiles, async (_event, skill, dir) => {
    // The page names both, so both are checked here: only a case's own folder, inside its skill.
    if (typeof skill !== 'string' || !isAbsolute(skill) || !isFile(join(skill, 'SKILL.md')))
      throw new Error(`No skill at ${String(skill)}.`)
    if (typeof dir !== 'string' || !isFile(assertInside(skill, join(skill, dir, 'prompt.md'))))
      throw new Error(`No case at ${String(dir)}.`)
    const files = assertInside(skill, join(skill, dir, 'files'))
    mkdirSync(files, { recursive: true })
    const problem = await shell.openPath(files)
    if (problem) throw new Error(problem)
    return ok(null)
  })

  handle(CHANNELS.chooseFolder, async (event) => {
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
  })
}
