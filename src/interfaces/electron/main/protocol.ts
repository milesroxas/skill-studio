/**
 * The two schemes the window loads from: `studio://app/` serves the built
 * renderer, `artifact://sample/<skill>/<run>/<sample>/<file>` serves a sample's
 * file through the backend with a sandbox policy, so agent-written HTML runs
 * its own scripts but can never script the app.
 */
import { randomBytes } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { sampleRequest, servedFile } from '@application/api/artifact-page.ts'
import {
  ARTIFACT_OPERATION,
  type ArtifactFile,
  IMAGE_OPERATION,
  type OperationName,
} from '@application/api/contract.ts'
import { net, protocol } from 'electron'
import { rendererFile } from '../../renderer-files.ts'
import { APP_HOST, APP_SCHEME, ARTIFACT_HOST, ARTIFACT_SCHEME, IMAGE_HOST } from '../channels.ts'
import type { Backend } from './backend.ts'
import { contentSecurityPolicy, withStyleNonce } from './csp.ts'

/** Must run before `ready`. */
export function registerSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true },
    },
    { scheme: ARTIFACT_SCHEME, privileges: { standard: true, secure: true } },
  ])
}

const notFound = (what: string): Response =>
  new Response(`No such ${what}.`, { status: 404, headers: { 'content-type': 'text/plain' } })

/** Serve the renderer from `rendererDir`; a path that names no file gets index.html (the app routes by hash). */
function serveApp(rendererDir: string): (request: Request) => Promise<Response> {
  return async (request) => {
    const url = new URL(request.url)
    if (url.host !== APP_HOST) return notFound('page')
    const file = rendererFile(rendererDir, url.pathname)
    if (!file) return notFound('page')
    const response = await net.fetch(pathToFileURL(file.path).toString())
    const headers = new Headers(response.headers)
    if (file.html) {
      // Each page load gets its own style nonce, so a stale or guessed one is useless.
      const styleNonce = randomBytes(16).toString('base64')
      headers.set('content-security-policy', contentSecurityPolicy({ styleNonce }))
      headers.delete('content-length')
      const html = withStyleNonce(await response.text(), styleNonce)
      return new Response(html, { status: response.status, headers })
    }
    // Vite names built assets by content hash, so they never change under one URL.
    if (file.hashed) headers.set('cache-control', 'private, max-age=31536000, immutable')
    return new Response(response.body, { status: response.status, headers })
  }
}

function serveArtifacts(backend: Backend): (request: Request) => Promise<Response> {
  return async (request) => {
    const url = new URL(request.url)
    // A sample's file is named by its path, so a page loads the files beside it by their relative names.
    const sample = url.host === ARTIFACT_HOST ? sampleRequest(url.pathname, url.searchParams) : null
    const asked: { operation: OperationName; input: unknown } | null =
      url.host === ARTIFACT_HOST
        ? sample && { operation: ARTIFACT_OPERATION, input: sample.address }
        : url.host === IMAGE_HOST
          ? { operation: IMAGE_OPERATION, input: Object.fromEntries(url.searchParams) }
          : null
    if (!asked) return notFound('artifact')
    const reply = await backend.call(asked.operation, asked.input)
    if (!reply.ok) return notFound('artifact')
    const file = servedFile(reply.value as ArtifactFile, {
      stage: sample?.stage ?? false,
      own: `${ARTIFACT_SCHEME}:`,
    })
    return new Response(file.bytes, { headers: file.headers })
  }
}

/** Must run after `ready`. */
export function handleSchemes(backend: Backend, rendererDir: string): void {
  protocol.handle(APP_SCHEME, serveApp(rendererDir))
  protocol.handle(ARTIFACT_SCHEME, serveArtifacts(backend))
}
