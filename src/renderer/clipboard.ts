/**
 * Put text on the clipboard. The desktop app grants a page no permissions, the
 * clipboard's among them, so the asynchronous API is refused there and the
 * copy command, which a click alone allows, does it.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const holder = document.createElement('textarea')
    holder.value = text
    holder.readOnly = true
    holder.className = 'sr-only'
    document.body.append(holder)
    holder.select()
    try {
      return document.execCommand('copy')
    } finally {
      holder.remove()
    }
  }
}
