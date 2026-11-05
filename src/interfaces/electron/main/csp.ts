/**
 * The renderer's Content Security Policy, in one place for the header the app
 * scheme sends and the meta tag the dev server page carries.
 */
import { ARTIFACT_SCHEME } from '../channels.ts'

export interface CspOptions {
  /**
   * A nonce for the scripts the dev server injects; the built app has none. Vite's
   * client also styles its error overlay inline, so development allows inline styles.
   */
  nonce?: string
  /**
   * A fresh nonce for each built page, for the one style tag the Markdown
   * editor (CodeMirror) writes its base styles into. The page reads it from
   * its `csp-nonce` meta tag. Any other inline style tag stays blocked.
   */
  styleNonce?: string
}

export function contentSecurityPolicy({ nonce, styleNonce }: CspOptions = {}): string {
  const scripts = nonce ? `'self' 'nonce-${nonce}'` : "'self'"
  const styles = nonce
    ? "'self' 'unsafe-inline'"
    : styleNonce
      ? `'self' 'nonce-${styleNonce}'`
      : "'self'"
  return [
    "default-src 'self'",
    `script-src ${scripts}`,
    `style-src ${styles}`,
    "style-src-attr 'unsafe-inline'",
    `img-src 'self' data: ${ARTIFACT_SCHEME}:`,
    `frame-src ${ARTIFACT_SCHEME}:`,
    "connect-src 'self'",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ')
}

/**
 * The page with its style nonce in a `csp-nonce` meta tag, the same tag Vite
 * writes in development, so the renderer finds it the same way in both.
 */
export function withStyleNonce(html: string, styleNonce: string): string {
  return html.replace(/<head>/i, `<head><meta property="csp-nonce" nonce="${styleNonce}" />`)
}
