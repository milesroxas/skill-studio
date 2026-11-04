/**
 * The bridge between the page and the main process. Runs sandboxed, so it is
 * plain CommonJS with `electron` as its only import. It exposes one function
 * per message and never the IPC objects themselves.
 */
import type { StudioBridge } from '@application/api/contract.ts'
import type { Job } from '@domain/views.ts'
import { contextBridge, ipcRenderer } from 'electron'
import { CHANNELS } from '../channels.ts'

const bridge: StudioBridge = {
  platform: process.platform,
  call: (name, input) => ipcRenderer.invoke(CHANNELS.call, name, input),
  onJobs: (listener) => {
    const handler = (_event: unknown, jobs: Job[]) => listener(jobs)
    ipcRenderer.on(CHANNELS.jobs, handler)
    return () => {
      ipcRenderer.removeListener(CHANNELS.jobs, handler)
    }
  },
  openArtifact: (url) => ipcRenderer.invoke(CHANNELS.openArtifact, url),
  openExternal: (url) => ipcRenderer.invoke(CHANNELS.openExternal, url),
}

contextBridge.exposeInMainWorld('studio', bridge)
