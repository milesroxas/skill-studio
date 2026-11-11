/**
 * How a file a sample wrote is served, by the app's `artifact:` scheme and by
 * `st serve` alike: the policy every response carries and, for a page Results
 * shows on its stage, the small script that lets two frames scroll together.
 *
 * An agent's page runs its own scripts, so a page built by a script shows as
 * it would in a browser. It runs sandboxed, in an origin of its own: it
 * cannot reach the app's page, its storage or its windows, cannot navigate
 * the window, submit a form or open another, and loads nothing from the
 * network. It may load the files beside it from the same sample.
 */
import { type ArtifactAddress, artifactAddress, STAGE_PARAM } from '@domain/artifact-address.ts'
import type { ArtifactFile } from './contract.ts'

/**
 * The policy for one response. `own` is where the page's own files come
 * from: `artifact:` in the app, `'self'` on the web server.
 */
export function artifactPolicy(own: string): string {
  return [
    // Scripts run, in an opaque origin: no allow-same-origin, forms, popups or top navigation.
    'sandbox allow-scripts',
    "default-src 'none'",
    `script-src 'unsafe-inline' 'unsafe-eval' ${own} blob:`,
    `style-src 'unsafe-inline' ${own}`,
    `img-src ${own} data: blob:`,
    `font-src ${own} data:`,
    `media-src ${own} data: blob:`,
    "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ].join('; ')
}

/**
 * What the stage adds to a page it shows: the page tells Results where it
 * scrolled and which of A or B was pressed while it had the focus, and
 * scrolls where Results asks. A message comes only from the frame's parent,
 * and carries nothing but numbers and a letter.
 */
const STAGE_BRIDGE = `<script data-skill-studio-stage>(function(){
var quiet=0;
addEventListener('scroll',function(){if(Date.now()-quiet<150)return;parent.postMessage({studioStage:'scroll',x:scrollX,y:scrollY},'*')},{passive:true});
addEventListener('message',function(e){var d=e.data;if(e.source!==parent||!d||d.studioStage!=='scrollTo')return;quiet=Date.now();scrollTo(Number(d.x)||0,Number(d.y)||0)});
addEventListener('keydown',function(e){var t=e.target;if(e.defaultPrevented||e.metaKey||e.ctrlKey||e.altKey||(t&&(t.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))))return;var k=e.key.toLowerCase();if(k==='a'||k==='b')parent.postMessage({studioStage:'key',key:k},'*')});
})()</script>`

/** The page with the stage's script before its last `</body>`, or at its end when it has none. */
export function withStageBridge(html: string): string {
  const at = html.toLowerCase().lastIndexOf('</body')
  return at < 0 ? html + STAGE_BRIDGE : html.slice(0, at) + STAGE_BRIDGE + html.slice(at)
}

/** True for an HTML response, which is the only kind the stage's script goes into. */
const isHtmlType = (type: string): boolean => type.startsWith('text/html')

/** The file a request names by its path, and whether the stage asked for it; null when the path names none. */
export function sampleRequest(
  pathname: string,
  params: URLSearchParams,
): { address: ArtifactAddress; stage: boolean } | null {
  const address = artifactAddress(pathname)
  return address ? { address, stage: params.get(STAGE_PARAM) === '1' } : null
}

/** A file as it is sent: its bytes, with the stage's script in a page the stage asked for, and its headers. */
export function servedFile(
  file: ArtifactFile,
  { stage, own }: { stage: boolean; own: string },
): { bytes: Uint8Array; headers: Record<string, string> } {
  const bytes =
    stage && isHtmlType(file.type)
      ? new TextEncoder().encode(withStageBridge(new TextDecoder().decode(file.bytes)))
      : file.bytes
  return {
    bytes,
    headers: { 'content-type': file.type, 'content-security-policy': artifactPolicy(own) },
  }
}
