/**
 * The environment a generating agent runs with. Claude Code refuses to start
 * inside another Claude Code session unless its guard variable is gone; the
 * guard is for interactive terminals and a subprocess is safe.
 */
export function agentEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(process.env))
    if (!key.startsWith('CLAUDECODE')) env[key] = value
  return env
}
