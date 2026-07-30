import React from 'react'
import type { SsotSurface } from 'grph-shared/ssot/types'

export type MarkdownInlineSelectionActions = {
  onShowOnCanvas?: (startLine: number, endLine: number) => void
  canShowOnCanvas?: (startLine: number, endLine: number) => boolean
  onShowInViewer?: (line: number) => void
  onShowInEditor?: (line: number) => void
  onShowInPresentation?: (line: number) => void
  onShowInGallery?: (line: number) => void
  onShowInGraphDataTable?: (line: number) => void
  currentView: SsotSurface
}

export const MarkdownInlineSelectionActionsContext = React.createContext<MarkdownInlineSelectionActions | null>(null)

export const useMarkdownInlineSelectionActions = (): MarkdownInlineSelectionActions | null =>
  React.useContext(MarkdownInlineSelectionActionsContext)
