export const STORYBOARD_CARD_PROVENANCE_FOCUS_EVENT = 'kg-storyboard-card-provenance-focus'

export type StoryboardCardProvenanceFocus = {
  sourceNodeId: string
  edgeId: string
  documentPath: string
  selectedText: string
  startLine: number
  endLine: number
}

const normalizeLine = (value: unknown, fallback: number): number => {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : fallback
}

export function emitStoryboardCardProvenanceFocus(
  focus: StoryboardCardProvenanceFocus,
): void {
  if (typeof window === 'undefined' || typeof window.CustomEvent === 'undefined') return
  const sourceNodeId = String(focus.sourceNodeId || '').trim()
  if (!sourceNodeId) return
  const startLine = normalizeLine(focus.startLine, 1)
  const endLine = Math.max(startLine, normalizeLine(focus.endLine, startLine))
  window.dispatchEvent(new window.CustomEvent<StoryboardCardProvenanceFocus>(
    STORYBOARD_CARD_PROVENANCE_FOCUS_EVENT,
    {
      detail: {
        sourceNodeId,
        edgeId: String(focus.edgeId || '').trim(),
        documentPath: String(focus.documentPath || '').trim(),
        selectedText: String(focus.selectedText || ''),
        startLine,
        endLine,
      },
    },
  ))
}

export function subscribeStoryboardCardProvenanceFocus(
  listener: (focus: StoryboardCardProvenanceFocus) => void,
): () => void {
  if (typeof window === 'undefined') return () => void 0
  const handleFocus = (event: Event) => {
    const detail = (event as CustomEvent<StoryboardCardProvenanceFocus>).detail
    if (!detail || !String(detail.sourceNodeId || '').trim()) return
    listener(detail)
  }
  window.addEventListener(STORYBOARD_CARD_PROVENANCE_FOCUS_EVENT, handleFocus)
  return () => window.removeEventListener(STORYBOARD_CARD_PROVENANCE_FOCUS_EVENT, handleFocus)
}
