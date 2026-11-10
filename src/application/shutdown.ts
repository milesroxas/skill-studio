/**
 * Ending everything the application has started, for a process that is about
 * to go: quitting the app, or Ctrl-C on the CLI. The jobs and replies are
 * stopped first, so no worker starts another agent as the one it had ends;
 * then the processes still running are ended and waited for.
 */
import { stopAll } from '@infrastructure/exec.ts'
import { stopAllRuns } from './ai.ts'
import { stopAllJobs } from './jobs.ts'

export async function shutdown(): Promise<void> {
  stopAllJobs()
  stopAllRuns()
  await stopAll()
}
