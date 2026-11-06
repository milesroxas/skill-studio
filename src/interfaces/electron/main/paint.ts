/**
 * The page color (--background in styles.css) as hex, for what paints before
 * CSS loads: a window's background and index.html's theme-color. paint.test.ts
 * holds these to the stylesheet, so a theme change cannot miss them.
 */
export const BACKGROUND = { light: '#F4F2EB', dark: '#0A0C11' } as const
