/**
 * The two schemes the window loads from: `studio://app/` serves the built
 * renderer, `artifact://sample?...` serves a sample's file through the backend
 * with a sandbox policy, so agent-written HTML can never script the app.
 */
import { randomBytes } from 'node:crypto'
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  ARTIFACT_OPERATION,
  ARTIFACT_POLICY,
  type ArtifactFile,
  IMAGE_OPERATION,
} from '@application/api/contract.ts'
import { isWithin } from '@domain/paths.ts'
import { net, protocol } from 'electron'
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

/** Serve the renderer from `rendererDir`; unknown paths get index.html (the app routes by hash). */
function serveApp(rendererDir: string): (request: Request) => Promise<Response> {
  return async (request) => {
    const url = new URL(request.url)
    if (url.host !== APP_HOST) return notFound('page')
    let file = join(
      rendererDir,
      url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1)),
    )
    if (!isWithin(file, rendererDir)) return notFound('page')
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(rendererDir, 'index.html')
    const response = await net.fetch(pathToFileURL(file).toString())
    const headers = new Headers(response.headers)
    if (file.endsWith('.html')) {
      // Each page load gets its own style nonce, so a stale or guessed one is useless.
      const styleNonce = randomBytes(16).toString('base64')
      headers.set('content-security-policy', contentSecurityPolicy({ styleNonce }))
      headers.delete('content-length')
      const html = withStyleNonce(await response.text(), styleNonce)
      return new Response(html, { status: response.status, headers })
    }
    // Vite names built assets by content hash, so they never change under one URL.
    if (isWithin(file, join(rendererDir, 'assets')))
      headers.set('cache-control', 'private, max-age=31536000, immutable')
    return new Response(response.body, { status: response.status, headers })
  }
}

function serveArtifacts(backend: Backend): (request: Request) => Promise<Response> {
  return async (request) => {
    const url = new URL(request.url)
    const operation =
      url.host === ARTIFACT_HOST
        ? ARTIFACT_OPERATION
        : url.host === IMAGE_HOST
          ? IMAGE_OPERATION
          : null
    if (!operation) return notFound('artifact')
    const reply = await backend.call(operation, Object.fromEntries(url.searchParams))
    if (!reply.ok) return notFound('artifact')
    const { bytes, type } = reply.value as ArtifactFile
    return new Response(bytes, {
      headers: { 'content-type': type, 'content-security-policy': ARTIFACT_POLICY },
    })
  }
}

/** Must run after `ready`. */
export function handleSchemes(backend: Backend, rendererDir: string): void {
  protocol.handle(APP_SCHEME, serveApp(rendererDir))
  protocol.handle(ARTIFACT_SCHEME, serveArtifacts(backend))
}
