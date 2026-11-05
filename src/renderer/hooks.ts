import { useCallback, useEffect, useState } from 'react'

/** The hash route: `#/<screen>?a=...&b=...`. */
export interface Route {
  screen: string
  params: URLSearchParams
}

const parse = (): Route => {
  const hash = window.location.hash.replace(/^#\/?/, '')
  const [screen, query = ''] = hash.split('?')
  return { screen: screen || 'home', params: new URLSearchParams(query) }
}

export function useRoute(): [Route, (screen: string, params?: Record<string, string>) => void] {
  const [route, setRoute] = useState<Route>(parse)
  useEffect(() => {
    const onChange = () => setRoute(parse())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  const go = useCallback((screen: string, params: Record<string, string> = {}) => {
    const query = new URLSearchParams(params).toString()
    window.location.hash = `#/${screen}${query ? `?${query}` : ''}`
  }, [])
  return [route, go]
}

/**
 * A value fetched once per `deps`, with its error. The last value stays in
 * view while the next one loads, so a refresh never flashes; a success clears
 * an earlier error.
 */
export function useFetch<T>(
  load: () => Promise<T>,
  deps: unknown[],
): { data: T | null; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  // biome-ignore lint/correctness/useExhaustiveDependencies: deps come from the caller
  useEffect(() => {
    let live = true
    load().then(
      (value) => {
        if (!live) return
        setData(value)
        setError(null)
      },
      (e: Error) => live && setError(e.message),
    )
    return () => {
      live = false
    }
  }, [...deps, tick])
  return { data, error, reload: () => setTick((t) => t + 1) }
}

/** A set and a toggle for one member, for checkbox and filter groups. */
export function useToggleSet<T>(initial: Iterable<T>): [Set<T>, (value: T) => void] {
  const [set, setSet] = useState(() => new Set(initial))
  const toggle = (value: T) =>
    setSet((prev) => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  return [set, toggle]
}

/** Long enough to read: a floor for short lines, then about 200 words a minute. */
const toastMs = (message: string): number =>
  Math.max(2600, message.split(/\s+/).length * 300 + 1000)

export function useToast(): [string | null, (message: string) => void] {
  const [message, setMessage] = useState<string | null>(null)
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(null), toastMs(message))
    return () => clearTimeout(timer)
  }, [message])
  return [message, setMessage]
}
