import React from 'react'
import { useShallow } from 'zustand/react/shallow'

import { useGraphStore } from '@/hooks/useGraphStore'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { uiSelectedRowStateClassName } from 'grph-shared/ui/selectedRowClasses'

export function GraphEditorHistoryTab() {
  const { history, historyIndex, restoreHistory } = useGraphStore(
    useShallow(s => ({
      history: s.history,
      historyIndex: s.historyIndex,
      restoreHistory: s.restoreHistory,
    })),
  )

  if (history.length === 0) {
    return <p className={`text-sm ${UI_THEME_TOKENS.text.secondary}`}>No history yet.</p>
  }

  return (
    <section className="space-y-1" aria-label="History list">
      {history
        .slice()
        .reverse()
        .map(h => {
          const idx = history.findIndex(x => x.id === h.id)
          const isActive = idx === historyIndex
          return (
            <button
              key={h.id}
              type="button"
              className={`w-full rounded-md px-2 py-2 text-left text-xs ${isActive ? uiSelectedRowStateClassName(true) : `${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`}`}
              onClick={() => restoreHistory(idx)}
              aria-label={`Restore ${h.label}`}
            >
              <section className="truncate">{h.label}</section>
              <section className={`mt-0.5 font-mono ${UI_THEME_TOKENS.text.tertiary}`}>{new Date(h.timestamp).toLocaleString()}</section>
            </button>
          )
        })}
    </section>
  )
}
