/**
 * The bridge between the page and the main process. Runs sandboxed, so it is
 * plain CommonJS with `electron` as its only import. It exposes one function
 * per message and never the IPC objects themselves.
 */
import type { StudioBridge } from '@application/api/contract.ts'
import type { AiRun } from '@domain/ai.ts'
import type { UpdateState } from '@domain/update.ts'
import type { Job } from '@domain/views.ts'
import { contextBridge, ipcRenderer } from 'electron'
import { CHANNELS, RESET_ARGUMENT, VERSION_ARGUMENT } from '../channels.ts'

/** Listen on a channel the main process pushes to; the listener never sees the IPC event. */
const subscribe =
  <T>(channel: string) =>
  (listener: (value: T) => void) => {
    const handler = (_event: unknown, value: T) => listener(value)
    ipcRenderer.on(channel, handler)
    return () => {
      ipcRenderer.removeListener(channel, handler)
    }
  }

const version =
  process.argv
    .find((argument) => argument.startsWith(VERSION_ARGUMENT))
    ?.slice(VERSION_ARGUMENT.length) ?? ''

const bridge: StudioBridge = {
  platform: process.platform,
  version,
  call: (name, input) => ipcRenderer.invoke(CHANNELS.call, name, input),
  onJobs: subscribe<Job[]>(CHANNELS.jobs),
  onAi: subscribe<AiRun>(CHANNELS.ai),
  onGo: subscribe<string>(CHANNELS.go),
  onOpen: subscribe<string>(CHANNELS.open),
  openWelcome: () => ipcRenderer.invoke(CHANNELS.openWelcome),
  enterApp: (skill) => ipcRenderer.invoke(CHANNELS.enterApp, skill),
  openArtifact: (url) => ipcRenderer.invoke(CHANNELS.openArtifact, url),
  openExternal: (url) => ipcRenderer.invoke(CHANNELS.openExternal, url),
  revealSkill: (path) => ipcRenderer.invoke(CHANNELS.revealSkill, path),
  chooseFolder: () => ipcRenderer.invoke(CHANNELS.chooseFolder),
  update: (request) => ipcRenderer.invoke(CHANNELS.update, request),
  onUpdate: subscribe<UpdateState>(CHANNELS.updateState),
  openChangelog: () => ipcRenderer.invoke(CHANNELS.openChangelog),
  canReset: process.argv.includes(RESET_ARGUMENT),
  reset: () => ipcRenderer.invoke(CHANNELS.reset),
}

contextBridge.exposeInMainWorld('studio', bridge)
