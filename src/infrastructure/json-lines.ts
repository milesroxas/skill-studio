/**
 * One line of a CLI's JSON-lines output as an object; null for a line that is
 * not JSON, or is JSON of another kind (`null`, a number, a list). A reader
 * that takes `event.type` of whatever parsed would throw on those, inside the
 * handler of a child's stdout.
 */
export function jsonLine(line: string): Record<string, unknown> | null {
  let value: unknown
  try {
    value = JSON.parse(line)
  } catch {
    return null
  }
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}
