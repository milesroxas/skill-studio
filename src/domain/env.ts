/**
 * The environment a generating agent, or an assistant CLI, runs with. It is
 * the backend's own environment less what no child should see:
 *
 * - `CLAUDECODE*`: Claude Code refuses to start inside another Claude Code
 *   session unless its guard variable is gone; the guard is for interactive
 *   terminals and a subprocess is safe.
 * - `TYPESAFE_API_KEY` and every `SKILL_STUDIO_*` variable: the app's own keys.
 *   An agent runs with Bash, so a skill from someone else could read its
 *   environment and send it away. The assistant's SDK providers read these
 *   from the backend's `process.env`, never from here.
 *
 * Windows reads a variable's name in any case, so there `typesafe_api_key` is
 * the same key and is hidden too. Elsewhere a name in another case is another
 * variable, and is left alone.
 */
const isHiddenFromAgents = (key: string): boolean =>
  key.startsWith('CLAUDECODE') || key.startsWith('SKILL_STUDIO_') || key === 'TYPESAFE_API_KEY'

/** An environment as a process holds it. */
export type Env = Record<string, string | undefined>

/** Windows sets `OS=Windows_NT` in every process, under a name in any case. */
const isWindows = (source: Env): boolean =>
  Object.entries(source).some(
    ([key, value]) => key.toUpperCase() === 'OS' && value === 'Windows_NT',
  )

export function agentEnv(source: Env, windows: boolean = isWindows(source)): Env {
  const env: Env = {}
  for (const [key, value] of Object.entries(source))
    if (!isHiddenFromAgents(windows ? key.toUpperCase() : key)) env[key] = value
  return env
}
