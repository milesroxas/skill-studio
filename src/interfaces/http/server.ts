/**
 * `st serve`: the operations table over HTTP, bound to 127.0.0.1, with the
 * built renderer served beside it. Every operation is `POST /api/<name>` with
 * a JSON body; the artifact operation is also `GET /api/artifact` so images
 * and frames can load it by URL.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { join } from 'node:path'
import { ARTIFACT_OPERATION, ARTIFACT_POLICY } from '@application/api/contract.ts'
import {
  CONTENT_TYPES,
  contentTypeOf,
  createOperations,
  invoke,
  isOperation,
} from '@application/api/operations.ts'
import { isWithin } from '@domain/paths.ts'
import { isDir } from '@infrastructure/fs.ts'
import { loadEnv, RENDERER_DIST } from '../host.ts'
import { type Remote, refusal } from './guard.ts'

export const DEFAULT_PORT = 4400

export interface ServerOptions {
  skills: string[]
  port?: number
  /** A tailnet host name to answer too, for the listed Tailscale logins only. */
  remote?: Remote | null
}

const send = (
  res: ServerResponse,
  status: number,
  body: unknown,
  type = CONTENT_TYPES['.json'],
  headers: Record<string, string> = {},
) => {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', ...headers })
  res.end(typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body))
}

async function bodyOf(req: IncomingMessage): Promise<unknown> {
  let raw = ''
  for await (const chunk of req) raw += chunk
  return raw ? JSON.parse(raw) : {}
}

const query = (url: URL): Record<string, string> => Object.fromEntries(url.searchParams)

export function startServer(options: ServerOptions): Promise<number> {
  loadEnv()
  const port = options.port ?? DEFAULT_PORT
  const operations = createOperations({ skills: options.skills })
  const server = createServer(async (req, res) => {
    const refused = refusal(req.method, req.headers, options.remote)
    if (refused) return send(res, 403, { error: refused })
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
    try {
      if (req.method === 'GET' && url.pathname === '/api/artifact') {
        const file = await invoke(operations, ARTIFACT_OPERATION, query(url))
        return send(res, 200, file.bytes, file.type, { 'content-security-policy': ARTIFACT_POLICY })
      }
      if (url.pathname.startsWith('/api/')) {
        const name = url.pathname.slice('/api/'.length)
        if (!isOperation(name)) return send(res, 404, { error: 'No such operation.' })
        if (req.method !== 'POST') return send(res, 405, { error: 'Operations are POST.' })
        return send(res, 200, await invoke(operations, name, await bodyOf(req)))
      }
      if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed.' })
      if (!isDir(RENDERER_DIST))
        return send(
          res,
          200,
          'Skill Studio API is up. Build the app (pnpm build) to browse it.',
          CONTENT_TYPES['.txt'],
        )
      let path = join(RENDERER_DIST, url.pathname === '/' ? 'index.html' : url.pathname.slice(1))
      if (!isWithin(path, RENDERER_DIST) || !existsSync(path) || statSync(path).isDirectory())
        path = join(RENDERER_DIST, 'index.html')
      // Vite names built assets by content hash, so they never change under one URL.
      const hashed = isWithin(path, join(RENDERER_DIST, 'assets'))
      return send(
        res,
        200,
        readFileSync(path),
        contentTypeOf(path),
        hashed ? { 'cache-control': 'private, max-age=31536000, immutable' } : {},
      )
    } catch (error) {
      return send(res, 400, { error: (error as Error).message })
    }
  })
  return new Promise((done, fail) => {
    server.on('error', (error: NodeJS.ErrnoException) => {
      fail(
        error.code === 'EADDRINUSE'
          ? new Error(
              `Port ${port} is taken. Stop what holds it (lsof -nP -iTCP:${port} -sTCP:LISTEN) or pass --port.`,
            )
          : error,
      )
    })
    server.listen(port, '127.0.0.1', () => done(port))
  })
}
