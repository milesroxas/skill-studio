/**
 * Who a CLI is signed in as, kept for a short while. Asking is a run of the
 * CLI, and every assistant request needs the answer, so a request made soon
 * after another reuses it. Only a signed-in answer is kept: one that says
 * signed out, or says nothing, is asked for again, so signing in shows at once.
 */
import type { CliAccount } from '@domain/ai.ts'

const KEPT_MS = 30_000

export function keptAccount(
  ask: () => Promise<CliAccount | null>,
  now: () => number = Date.now,
): (fresh?: boolean) => Promise<CliAccount | null> {
  let held: { at: number; account: CliAccount } | null = null
  /** A question under way, so two askers share one run. */
  let asking: Promise<CliAccount | null> | null = null
  return (fresh = false) => {
    if (!fresh && held && now() - held.at < KEPT_MS) return Promise.resolve(held.account)
    asking ??= ask()
      // A CLI that cannot say who it is stays usable, as it was before it could.
      .catch(() => null)
      .then((account) => {
        held = account?.signedIn ? { at: now(), account } : null
        return account
      })
      .finally(() => {
        asking = null
      })
    return asking
  }
}
