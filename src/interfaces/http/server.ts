/**
 * `st serve`: the operations table over HTTP, bound to 127.0.0.1, with the
 * built renderer served beside it. Every operation is `POST /api/<name>` with
 * a JSON body; the two operations that answer with bytes are also `GET
 * /api/artifact` and `GET /api/image`, so images and frames can load them by
 * URL. Every request passes the guard first: it comes from this machine's own
 * pages, or from the tailnet with the owner's Tailscale login, and it carries
 * the token this start made.
 */
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { ARTIFACT_OPERATION, ARTIFACT_POLICY, IMAGE_OPERATION } from '@application/api/contract.ts'
import {
  CONTENT_TYPES,
  contentTypeOf,
  createOperations,
  invoke,
  isOperation,
} from '@application/api/operations.ts'
import { isDir } from '@infrastructure/fs.ts'
// The same policy the desktop app's scheme sends; the module imports nothing of Electron's.
import { contentSecurityPolicy, withStyleNonce } from '../electron/main/csp.ts'
import { RENDERER_DIST } from '../host.ts'
import { rendererFile } from '../renderer-files.ts'
import {
  type Access,
  decide,
  newToken,
  type Remote,
  TICKET_PARAM,
  TOKEN_PARAM,
  ticketBook,
} from './guard.ts'

export const DEFAULT_PORT = 4400

/**
 * The most one request body may hold. The largest thing the page sends is a
 * picture, 16 MB at most, which base64 makes a third larger.
 */
const MAX_BODY_BYTES = 32 * 1024 * 1024

export interface ServerOptions {
  skills: string[]
  /** 0 takes any free port. */
  port?: number
  /** A tailnet host name to answer too, for the listed Tailscale logins only. */
  remote?: Remote | null
  /** The built renderer; the checkout's own when left out. */
  rendererDir?: string
  /** Bytes one request body may hold; 32 MB when left out. */
  maxBodyBytes?: number
}

export interface Server {
  port: number
  /** What a local request must carry, made new at every start. */
  token: string
  /** The address to open: it carries the token, which the first page load trades for a cookie. */
  url: string
  /**
   * An address for a browser started from here: in place of the token it
   * carries a ticket that one page load within a minute trades for the cookie.
   */
  ticketUrl(): string
  close(): Promise<void>
}

/** A body over the limit: answered with 413, not as a bad request. */
class BodyTooLarge extends Error {}

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

/** An API call reads an error as JSON; a person at a page address reads the sentence itself. */
const sendError = (res: ServerResponse, status: number, error: string, api: boolean) =>
  api ? send(res, status, { error }) : send(res, status, `${error}\n`, CONTENT_TYPES['.txt'])

async function bodyOf(req: IncomingMessage, limit: number): Promise<unknown> {
  // A length said up front is refused before a byte of it is read.
  if (Number(req.headers['content-length']) > limit) throw new BodyTooLarge()
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length
    if (size > limit) throw new BodyTooLarge()
    chunks.push(chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : {}
}

const query = (url: URL): Record<string, string> => Object.fromEntries(url.searchParams)

export function startServer(options: ServerOptions): Promise<Server> {
  const port = options.port ?? DEFAULT_PORT
  const rendererDir = options.rendererDir ?? RENDERER_DIST
  const maxBody = options.maxBodyBytes ?? MAX_BODY_BYTES
  const tickets = ticketBook()
  const access: Access = { token: newToken(), remote: options.remote, tickets }
  const operations = createOperations({ skills: options.skills })
  const server = createServer(async (req, res) => {
    const api = (req.url ?? '').startsWith('/api/')
    const decision = decide({ method: req.method, url: req.url, headers: req.headers }, access)
    if (decision.kind === 'refuse') return sendError(res, decision.status, decision.error, api)
    if (decision.kind === 'sign-in') {
      res.writeHead(302, {
        location: decision.location,
        'set-cookie': decision.cookie,
        'cache-control': 'no-store',
        // The address that held the token is never passed on to another page.
        'referrer-policy': 'no-referrer',
      })
      return res.end()
    }
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
    try {
      const bytes =
        req.method !== 'GET'
          ? null
          : url.pathname === '/api/artifact'
            ? ARTIFACT_OPERATION
            : url.pathname === '/api/image'
              ? IMAGE_OPERATION
              : null
      if (bytes) {
        const file = await invoke(operations, bytes, query(url))
        return send(res, 200, file.bytes, file.type, { 'content-security-policy': ARTIFACT_POLICY })
      }
      if (api) {
        const name = url.pathname.slice('/api/'.length)
        if (!isOperation(name)) return send(res, 404, { error: 'No such operation.' })
        if (req.method !== 'POST') return send(res, 405, { error: 'Operations are POST.' })
        return send(res, 200, await invoke(operations, name, await bodyOf(req, maxBody)))
      }
      if (req.method !== 'GET') return sendError(res, 405, 'Method not allowed.', false)
      if (!isDir(rendererDir))
        return send(
          res,
          200,
          'Skill Studio API is up. Build the app (pnpm build) to browse it.',
          CONTENT_TYPES['.txt'],
        )
      const file = rendererFile(rendererDir, url.pathname)
      if (!file) return sendError(res, 404, 'No such page.', false)
      if (file.html) {
        // The page gets the app's policy, with a style nonce of its own for the editor's one style tag.
        const styleNonce = randomBytes(16).toString('base64')
        return send(
          res,
          200,
          withStyleNonce(readFileSync(file.path, 'utf8'), styleNonce),
          contentTypeOf(file.path),
          { 'content-security-policy': contentSecurityPolicy({ styleNonce, web: true }) },
        )
      }
      return send(
        res,
        200,
        readFileSync(file.path),
        contentTypeOf(file.path),
        file.hashed ? { 'cache-control': 'private, max-age=31536000, immutable' } : {},
      )
    } catch (error) {
      if (error instanceof BodyTooLarge)
        // The rest of the body is not read: the connection ends with this answer.
        return send(
          res,
          413,
          { error: `A request may carry ${Math.floor(maxBody / (1024 * 1024))} MB at most.` },
          CONTENT_TYPES['.json'],
          { connection: 'close' },
        )
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
    server.listen(port, '127.0.0.1', () => {
      const address = server.address()
      const listening = address && typeof address === 'object' ? address.port : port
      done({
        port: listening,
        token: access.token,
        url: `http://localhost:${listening}/?${TOKEN_PARAM}=${access.token}`,
        ticketUrl: () => `http://localhost:${listening}/?${TICKET_PARAM}=${tickets.issue()}`,
        close: () =>
          new Promise((closed) => {
            server.close(() => closed())
            server.closeAllConnections()
          }),
      })
    })
  })
}
