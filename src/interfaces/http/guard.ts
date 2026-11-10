/**
 * Who may call `st serve`, decided in this one place. The API writes skills,
 * links agent folders, starts agents and spends money on runs, so a request
 * has to pass two checks.
 *
 * Where it comes from. The server answers only this machine's own pages: a
 * page on another site can send a plain-text POST to 127.0.0.1 without a CORS
 * preflight, and DNS rebinding can make another host name resolve here. With
 * `st serve --tailscale` it also answers one tailnet host name, for requests
 * Tailscale has signed in as one of the allowed users. Tailscale Serve sets
 * `Tailscale-User-Login` itself and drops any copy the client sent; Funnel
 * (public) traffic and tagged devices carry no login, so they are refused.
 *
 * Who sent it. Any account on this machine can reach 127.0.0.1, and with
 * `--tailscale` it can also send the headers `tailscale serve` adds, so every
 * request, local or from the tailnet, needs the token this start of the server
 * made: in the address the first time, which trades it for a cookie, and in
 * the cookie from then on. On the tailnet the login is checked as well. A
 * one-use ticket, good for a minute, stands in for the token in the address
 * `--open` hands the browser, since that address is on a command line other
 * accounts can list.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { IncomingHttpHeaders } from 'node:http'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])
const SAME_SITE = new Set(['same-origin', 'none'])
const PROXY_HEADERS = [
  'x-forwarded-for',
  'x-forwarded-host',
  'forwarded',
  'tailscale-headers-info',
  'tailscale-user-login',
]

/** The query parameter the printed address carries the token in. */
export const TOKEN_PARAM = 'token'
/** The query parameter a one-use address carries its ticket in. */
export const TICKET_PARAM = 'ticket'
/** How long a ticket can be traded for the cookie. */
const TICKET_MS = 60_000

/** What a refused reader is told to do. The token itself is never repeated. */
const NO_TOKEN =
  'Open the address `st serve` printed when it started: it carries the token this server needs.'
const USED_TICKET =
  'This address works once, within a minute of `st serve --open`. Open the address `st serve` printed when it started.'

/** A tailnet host name the server may answer, and the logins allowed on it. */
export interface Remote {
  host: string
  users: string[]
}

/** One-use tickets for the token: each is traded for the cookie once, within its minute. */
export interface Tickets {
  issue(): string
  /** True when `ticket` was issued, is unused and has not expired. It is used up either way. */
  redeem(ticket: string): boolean
}

/** What a request is checked against: this start's token, its tickets, and the tailnet name when one is served. */
export interface Access {
  token: string
  remote?: Remote | null
  tickets?: Tickets
}

/** The part of a request the decision reads. `url` is the path and query, as Node gives it. */
export interface Asked {
  method: string | undefined
  url: string | undefined
  headers: IncomingHttpHeaders
}

export type Decision =
  | { kind: 'serve' }
  /** The token came in the address of a page: keep it in a cookie and go on without it. */
  | { kind: 'sign-in'; cookie: string; location: string }
  | { kind: 'refuse'; status: 401 | 403; error: string }

/** A token for one start of the server: 32 random bytes, safe in a URL and a cookie. */
export const newToken = (): string => randomBytes(32).toString('base64url')

const digestOf = (value: string): Buffer => createHash('sha256').update(value).digest()

/**
 * The tickets of one start of the server. Each is as long as the token and is
 * kept by its digest only, so a lookup's timing says nothing of a guess.
 */
export function ticketBook(lifetimeMs = TICKET_MS, now: () => number = Date.now): Tickets {
  const live = new Map<string, number>()
  return {
    issue() {
      const at = now()
      for (const [key, until] of live) if (until <= at) live.delete(key)
      const ticket = newToken()
      live.set(digestOf(ticket).toString('hex'), at + lifetimeMs)
      return ticket
    },
    redeem(ticket) {
      const key = digestOf(ticket).toString('hex')
      const until = live.get(key)
      live.delete(key)
      return until !== undefined && until > now()
    },
  }
}

const hostOf = (value: string): URL | null => {
  try {
    return new URL(value.includes('://') ? value : `http://${value}`)
  } catch {
    return null
  }
}

/**
 * The cookie's name. Browsers keep one jar per host name whatever the port, so
 * the port is in the name and two servers on one machine do not sign each
 * other out. That jar is also why the browser sends every one of these cookies
 * to any server on `localhost` it visits, whatever its port.
 */
const cookieName = (host: URL, via: Via): string =>
  `st_token_${host.port || (via === 'tailnet' ? '443' : '80')}`

function cookieOf(header: string | undefined, name: string): string | null {
  for (const part of (header ?? '').split(';')) {
    const at = part.indexOf('=')
    if (at > 0 && part.slice(0, at).trim() === name) return part.slice(at + 1).trim()
  }
  return null
}

/** Compared by digest, so neither the length of a guess nor how much of it matched shows in the time taken. */
function sameToken(given: string | null, token: string): boolean {
  if (!given) return false
  return timingSafeEqual(digestOf(given), digestOf(token))
}

type Via = 'local' | 'tailnet'

/** Where a request comes from: this machine, the tailnet, or nowhere the server answers. */
function origin(
  method: string | undefined,
  headers: IncomingHttpHeaders,
  remote: Remote | null | undefined,
): { via: Via; host: URL } | { refused: string } {
  const host = hostOf(headers.host ?? '')
  if (!host) return { refused: 'Only localhost may call this server.' }
  // A proxy passes the client's Host header through, so a proxied request
  // claiming to be localhost is still remote. Tailscale always sets these.
  const proxied = PROXY_HEADERS.some((name) => headers[name] !== undefined)
  const tailnet = proxied || !LOCAL_HOSTS.has(host.hostname)
  if (tailnet) {
    if (!remote || host.hostname !== remote.host)
      return { refused: 'Only localhost may call this server.' }
    const login = headers['tailscale-user-login']
    if (typeof login !== 'string' || !remote.users.includes(login))
      return { refused: 'This Tailscale user may not call this server.' }
  }
  const site = headers['sec-fetch-site']
  if (site && !SAME_SITE.has(String(site)))
    return { refused: 'Requests from other sites are refused.' }
  const from = headers.origin
  if (from && hostOf(from)?.host !== host.host)
    return { refused: 'Requests from other sites are refused.' }
  if (method === 'POST' && !headers['content-type']?.startsWith('application/json'))
    return { refused: 'Send POST bodies as application/json.' }
  return { via: tailnet ? 'tailnet' : 'local', host }
}

/**
 * Serve the request, trade its token or ticket for a cookie, or refuse it and
 * say why. Where it comes from is checked first, then what it carries, on the
 * tailnet as on this machine.
 */
export function decide({ method, url, headers }: Asked, access: Access): Decision {
  const from = origin(method, headers, access.remote)
  if ('refused' in from) return { kind: 'refuse', status: 403, error: from.refused }
  const name = cookieName(from.host, from.via)
  const asked = new URL(url ?? '/', 'http://localhost')
  const signIn = (): Decision => {
    asked.searchParams.delete(TOKEN_PARAM)
    asked.searchParams.delete(TICKET_PARAM)
    return {
      kind: 'sign-in',
      // The tailnet address is HTTPS, so its cookie is never sent over plain HTTP.
      cookie: `${name}=${access.token}; HttpOnly; SameSite=Strict; Path=/${from.via === 'tailnet' ? '; Secure' : ''}`,
      // One leading slash, so the way on can only be a path on this server.
      location: `${asked.pathname.replace(/^\/+/, '/')}${asked.search}`,
    }
  }
  if (sameToken(asked.searchParams.get(TOKEN_PARAM), access.token))
    // A tool that sends the token with each call is served as it is.
    return method === 'GET' ? signIn() : { kind: 'serve' }
  const signedIn = sameToken(cookieOf(headers.cookie, name), access.token)
  // A ticket is used up by its first load, so a copy of its address read elsewhere is worth nothing after.
  const ticket = method === 'GET' ? asked.searchParams.get(TICKET_PARAM) : null
  if (ticket !== null) {
    const redeemed = access.tickets?.redeem(ticket) ?? false
    if (redeemed || signedIn) return signIn()
    return { kind: 'refuse', status: 401, error: USED_TICKET }
  }
  if (signedIn) return { kind: 'serve' }
  return { kind: 'refuse', status: 401, error: NO_TOKEN }
}
