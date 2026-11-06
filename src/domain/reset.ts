/**
 * Starting over: the app put back to how a newcomer meets it, to test a
 * release from its first launch. Only a copy made for testing offers it, so
 * nobody on a finished release clears their setup by a slip.
 */

/** A version ahead of its release, such as `1.2.0-beta.1`: the suffix is what marks it. */
export const isPrerelease = (version: string): boolean => /^\d+\.\d+\.\d+-./.test(version)

/** A development build can start over, and so can a packaged prerelease. A finished release cannot. */
export const canReset = ({ version, packaged }: { version: string; packaged: boolean }): boolean =>
  !packaged || isPrerelease(version)
