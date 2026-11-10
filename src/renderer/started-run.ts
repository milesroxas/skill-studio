/**
 * One request to the assistant and the reply it starts, for the control that
 * asked: "Write with AI", Auto refine, Suggest changes. The reply is that
 * control's alone, so letting go of it stops the writing: a new request, a
 * discard, or the control leaving the screen. A request still on its way when
 * it is let go is stopped as it arrives, so no reply is written for nobody.
 */
import type { AiRun } from '@domain/ai.ts'
import { useCallback, useEffect, useRef, useState } from 'react'
import { stopRun, useRun } from './ai.ts'

export interface HeldRun<T> {
  /** What the request answered; null until it has, and after it is let go. */
  result: T | null
  /** The reply the request started, as it stands now; null when it started none. */
  run: AiRun | null
  /** The request is on its way and has not answered yet. */
  starting: boolean
  /** The request is on its way, or its reply is being written. */
  running: boolean
  /** Why the request or its reply failed; null when neither did. */
  error: string | null
  /** Make a request, letting go of the one in hand. */
  start: (begin: () => Promise<T>) => Promise<void>
  /** A reply being written stops where it is; a request still starting is let go. */
  stop: () => void
  /** Let go of the request in hand and its reply. */
  discard: () => void
}

/**
 * A request made when the caller says so. `runOf` reads the reply a request
 * started out of its answer; null when it started none.
 */
export function useHeldRun<T>(runOf: (result: T) => AiRun | null | undefined): HeldRun<T> {
  const [held, setHeld] = useState<{ result: T; runId: string | null } | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const runId = held?.runId ?? null
  const run = useRun(runId)
  const reads = useRef(runOf)
  reads.current = runOf
  /**
   * Counts the requests made and the times one was let go. A request whose
   * count has moved on by the time it answers has nobody waiting for it.
   */
  const asked = useRef(0)

  useEffect(() => {
    if (runId === null) return
    return () => stopRun(runId)
  }, [runId])
  // A request still starting when the screen goes is stopped as it arrives.
  useEffect(
    () => () => {
      asked.current += 1
    },
    [],
  )

  const discard = useCallback(() => {
    asked.current += 1
    setStarting(false)
    setHeld(null)
    setFailure(null)
  }, [])

  const start = useCallback(
    async (begin: () => Promise<T>) => {
      discard()
      const mine = asked.current
      setStarting(true)
      try {
        const result = await begin()
        const started = reads.current(result) ?? null
        if (asked.current !== mine) {
          if (started) stopRun(started.id)
          return
        }
        setHeld({ result, runId: started?.id ?? null })
      } catch (e) {
        if (asked.current !== mine) return
        setFailure((e as Error).message)
      }
      setStarting(false)
    },
    [discard],
  )

  return {
    result: held?.result ?? null,
    run,
    starting,
    running: starting || run?.status === 'running',
    error: failure ?? (run?.status === 'failed' ? run.error : null),
    start,
    stop: () => (run ? stopRun(run.id) : discard()),
    discard,
  }
}

/**
 * A request made as the control appears, and again whenever `deps` change:
 * the one before it is let go first.
 */
export function useStartedRun<T>(
  begin: () => Promise<T>,
  runOf: (result: T) => AiRun | null | undefined,
  deps: unknown[],
): HeldRun<T> {
  const work = useHeldRun(runOf)
  const { start, discard } = work
  const latest = useRef(begin)
  latest.current = begin
  // Run again when the caller's `deps` change: biome cannot read a spread list, so it has nothing to check here.
  useEffect(() => {
    void start(() => latest.current())
    return discard
  }, [...deps, start, discard])
  return work
}
