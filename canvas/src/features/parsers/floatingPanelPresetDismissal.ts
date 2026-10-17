const SESSION_KEY = 'kg:ui:markdown:workspace:floatingPanelPresetDismissedDocument'

const readStorage = (): Storage | null => {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  } catch {
    return null
  }
}

export function recordFloatingPanelPresetDismissal(documentName: unknown): void {
  const name = typeof documentName === 'string' ? documentName.trim() : ''
  if (!name) return
  try {
    readStorage()?.setItem(SESSION_KEY, name)
  } catch {
    // A closed panel remains closed in live state if session storage is unavailable.
  }
}

export function wasFloatingPanelPresetDismissedForDocument(documentName: unknown): boolean {
  const name = typeof documentName === 'string' ? documentName.trim() : ''
  if (!name) return false
  try {
    return readStorage()?.getItem(SESSION_KEY) === name
  } catch {
    return false
  }
}
