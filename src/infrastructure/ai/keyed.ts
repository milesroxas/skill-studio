/**
 * A value made from a key and kept while the key stays the same: an SDK
 * client, or the list of models a key may call. When the key changes in
 * Settings the next call makes it again; a failed attempt is never kept.
 */
export function keyed<T>(key: () => string | undefined, make: (key: string) => T): () => T {
  let held: { key: string; value: T } | null = null
  return () => {
    const now = key()
    if (!now) throw new Error('No API key is set. Add one in Settings.')
    if (held?.key !== now) {
      const value = make(now)
      held = { key: now, value }
      // A list that failed to load is asked for again next time.
      if (value instanceof Promise)
        value.catch(() => {
          if (held?.value === value) held = null
        })
    }
    return held.value
  }
}
