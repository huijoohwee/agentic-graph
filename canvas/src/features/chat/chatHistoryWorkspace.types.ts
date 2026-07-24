import type { ChatResponseStructuredSource } from './chatResponseWidgetPaletteContract'

export type ChatHistoryWorkspaceAppendArgs = {
  requestedPath: string | null
  onResolvedPath?: (path: string) => void
  timestampMs: number
  providerSummary: string
  userText: string
  assistantText: string
  storageType?: 'chatKnowgrph' | 'chatHistory'
  defaultLocalRootPath?: string | null
  title?: string
  traceId?: string | null
  structuredResponseSource?: ChatResponseStructuredSource
}

export type ChatHistoryWorkspaceDraftArgs = {
  requestedPath: string | null
  onResolvedPath?: (path: string) => void
  timestampMs: number
  providerSummary: string
  userText: string
  assistantText: string
  storageType?: 'chatKnowgrph' | 'chatHistory'
  defaultLocalRootPath?: string | null
  title?: string
  traceId?: string | null
  structuredResponseSource?: ChatResponseStructuredSource
}
