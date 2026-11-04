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
}

export function contentSecurityPolicy({ nonce }: CspOptions = {}): string {
  const scripts = nonce ? `'self' 'nonce-${nonce}'` : "'self'"
  const styles = nonce ? "'self' 'unsafe-inline'" : "'self'"
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
