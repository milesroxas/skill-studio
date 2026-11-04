/**
 * The API writes skills, links agent folders and spends money on runs, so it
 * answers only this machine's own pages. A page on another site can send a
 * plain-text POST to 127.0.0.1 without a CORS preflight, and DNS rebinding
 * can make another host name resolve here.
 *
 * With `st serve --tailscale` it also answers one tailnet host name, but only
 * for requests Tailscale has signed in as one of the allowed users. Tailscale
 * Serve sets `Tailscale-User-Login` itself and drops any copy the client sent;
 * Funnel (public) traffic and tagged devices carry no login, so they are refused.
 */
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

/** A tailnet host name the server may answer, and the logins allowed on it. */
export interface Remote {
  host: string
  users: string[]
}

const hostOf = (value: string): URL | null => {
  try {
    return new URL(value.includes('://') ? value : `http://${value}`)
  } catch {
    return null
  }
}

/** Why a request is refused, or null to serve it. */
export function refusal(
  method: string | undefined,
  headers: IncomingHttpHeaders,
  remote?: Remote | null,
): string | null {
  const host = hostOf(headers.host ?? '')
  if (!host) return 'Only localhost may call this server.'
  // A proxy passes the client's Host header through, so a proxied request
  // claiming to be localhost is still remote. Tailscale always sets these.
  const proxied = PROXY_HEADERS.some((name) => headers[name] !== undefined)
  if (proxied || !LOCAL_HOSTS.has(host.hostname)) {
    if (!remote || host.hostname !== remote.host) return 'Only localhost may call this server.'
    const login = headers['tailscale-user-login']
    if (typeof login !== 'string' || !remote.users.includes(login))
      return 'This Tailscale user may not call this server.'
  }
  const site = headers['sec-fetch-site']
  if (site && !SAME_SITE.has(String(site))) return 'Requests from other sites are refused.'
  const origin = headers.origin
  if (origin && hostOf(origin)?.host !== host.host) return 'Requests from other sites are refused.'
  if (method === 'POST' && !headers['content-type']?.startsWith('application/json'))
    return 'Send POST bodies as application/json.'
  return null
}
