/**
 * The bridge between the page and the main process. Runs sandboxed, so it is
 * plain CommonJS with `electron` as its only import. It exposes one function
 * per message and never the IPC objects themselves.
 */
import type { StudioBridge } from '@application/api/contract.ts'
import type { AiRun } from '@domain/ai.ts'
import type { Job } from '@domain/views.ts'
import { contextBridge, ipcRenderer } from 'electron'
import { CHANNELS } from '../channels.ts'

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

const bridge: StudioBridge = {
  platform: process.platform,
  call: (name, input) => ipcRenderer.invoke(CHANNELS.call, name, input),
  onJobs: subscribe<Job[]>(CHANNELS.jobs),
  onAi: subscribe<AiRun>(CHANNELS.ai),
  openArtifact: (url) => ipcRenderer.invoke(CHANNELS.openArtifact, url),
  openExternal: (url) => ipcRenderer.invoke(CHANNELS.openExternal, url),
}

contextBridge.exposeInMainWorld('studio', bridge)
