import React from 'react'

export type TextSelectionWidgetLinkAction = {
  selectedText: string
  startLine: number
  endLine: number
}

export type TextSelectionWidgetLinkContextValue = {
  createLinkedWidget: (selection: TextSelectionWidgetLinkAction) => void
}

export const TextSelectionWidgetLinkContext =
  React.createContext<TextSelectionWidgetLinkContextValue | null>(null)

export function useTextSelectionWidgetLinkAction(): TextSelectionWidgetLinkContextValue | null {
  return React.useContext(TextSelectionWidgetLinkContext)
}
