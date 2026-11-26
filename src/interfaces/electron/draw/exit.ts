/**
 * How the drawing host ends at once. Node's own exit, `process.reallyExit`,
 * ends the process with no shutdown, and Electron leaves it as it is:
 * Electron's `app.exit` and `process.exit` both shut the browser down, which
 * writes its settings back into a new profile folder of the same name after
 * the host's last line has run. It is no documented part of Node, so where a
 * Node has none, `process.exit` ends the host, shut down or not.
 */
interface Exits {
  reallyExit?: unknown
  exit: (code?: number) => never
}

export function exitNowOf(host: Exits): (code: number) => never {
  const { reallyExit } = host
  return typeof reallyExit === 'function'
    ? (code) => (reallyExit as (code: number) => never).call(host, code)
    : (code) => host.exit(code)
}
