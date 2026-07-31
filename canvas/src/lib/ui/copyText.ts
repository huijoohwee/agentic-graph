/**
 * Copy plain text without coupling callers to a particular UI surface.
 * The native Clipboard API is preferred; the textarea fallback keeps this
 * interaction available in browser contexts that do not expose it.
 */
export async function copyTextToClipboard(value: unknown): Promise<boolean> {
  const text = String(value ?? '')
  if (!text) return false

  try {
    const clipboard = typeof window === 'undefined' ? null : window.navigator?.clipboard
    if (clipboard?.writeText) {
      await clipboard.writeText(text)
      return true
    }
  } catch {
    // Fall through to the browser-native selection fallback.
  }

  if (typeof document === 'undefined' || !document.body || typeof document.execCommand !== 'function') return false

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('aria-label', 'Clipboard copy fallback')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  try {
    textarea.focus()
    textarea.select()
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    textarea.remove()
  }
}
