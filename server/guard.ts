/**
 * The API writes skills, links agent folders and spends money on runs, so it
 * answers only this machine's own pages. A page on another site can send a
 * plain-text POST to 127.0.0.1 without a CORS preflight, and DNS rebinding
 * can make another host name resolve here.
 */
import type { IncomingHttpHeaders } from 'node:http'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])
const SAME_SITE = new Set(['same-origin', 'none'])

const hostOf = (value: string): URL | null => {
  try {
    return new URL(value.includes('://') ? value : `http://${value}`)
  } catch {
    return null
  }
}

/** Why a request is refused, or null to serve it. */
export function refusal(method: string | undefined, headers: IncomingHttpHeaders): string | null {
  const host = hostOf(headers.host ?? '')
  if (!host || !LOCAL_HOSTS.has(host.hostname)) return 'Only localhost may call this server.'
  const site = headers['sec-fetch-site']
  if (site && !SAME_SITE.has(String(site))) return 'Requests from other sites are refused.'
  const origin = headers.origin
  if (origin && hostOf(origin)?.host !== host.host) return 'Requests from other sites are refused.'
  if (method === 'POST' && !headers['content-type']?.startsWith('application/json'))
    return 'Send POST bodies as application/json.'
  return null
}
