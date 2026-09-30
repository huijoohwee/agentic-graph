import { useLayoutEffect, useSyncExternalStore } from 'react'
import { emitFloatingPanelOpen } from '@/features/canvas/utils'
import type { DocumentSignalIndex, DocumentSignalKind } from '@/lib/websites/signalTokens'

export type DocumentInsightsSource = {
  key: string
  text: string
  signals: DocumentSignalIndex | null
  revealLine: (line: number) => void
}
type InsightsSnapshot = { source: DocumentInsightsSource | null; kind: DocumentSignalKind | null; request: number }
let snapshot: InsightsSnapshot = { source: null, kind: null, request: 0 }
const listeners = new Set<() => void>()
const publish = (next: InsightsSnapshot) => { snapshot = next; listeners.forEach(listener => listener()) }
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
export const readDocumentInsights = () => snapshot
export const useDocumentInsights = () => useSyncExternalStore(subscribe, readDocumentInsights, readDocumentInsights)

export function registerDocumentInsightsSource(source: DocumentInsightsSource): () => void {
  publish({ ...snapshot, source })
  return () => { if (snapshot.source === source) publish({ ...snapshot, source: null }) }
}

export function useDocumentInsightsSource(source: DocumentInsightsSource) {
  useLayoutEffect(() => registerDocumentInsightsSource(source), [source.key, source.text, source.signals, source.revealLine])
}

export function openDocumentInsights(kind: DocumentSignalKind) {
  publish({ ...snapshot, kind, request: snapshot.request + 1 })
  emitFloatingPanelOpen({ tab: 'preview', open: true })
}

export function jumpToDocumentInsight(source: DocumentInsightsSource, line: number): boolean {
  if (snapshot.source !== source || !source.signals || !Number.isInteger(line) || line < 1 || line > source.signals.scannedLines) return false
  source.revealLine(line)
  return true
}
