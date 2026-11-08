import React from 'react'
import { useShallow } from 'zustand/react/shallow'

import { useGraphStore } from '@/hooks/useGraphStore'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'

import { GraphEditorOutlineTab } from '@/features/graph-editor/panels/GraphEditorOutlineTab'
import { GraphEditorInspectorTab } from '@/features/graph-editor/panels/GraphEditorInspectorTab'
import { GraphEditorHistoryTab } from '@/features/graph-editor/panels/GraphEditorHistoryTab'

type TabId = 'outline' | 'inspector' | 'history'

function TabButton(props: { id: TabId; active: boolean; onClick: () => void; children: string }) {
  const { id, active, onClick, children } = props
  return (
    <button
      type="button"
      className={`rounded-md px-2 py-1 text-xs ${active ? `${UI_THEME_TOKENS.button.activeBg} ${UI_THEME_TOKENS.button.activeText}` : `${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`}`}
      onClick={onClick}
      aria-label={`Tab: ${children}`}
      data-tab={id}
    >
      {children}
    </button>
  )
}

export function GraphEditorRightPanel() {
  const { undoHistory, redoHistory } = useGraphStore(
    useShallow(s => ({
      undoHistory: s.undoHistory,
      redoHistory: s.redoHistory,
    })),
  )

  const [tab, setTab] = React.useState<TabId>('inspector')

  return (
    <aside className={`flex h-full min-h-0 min-w-0 max-w-full flex-col rounded-xl border ${UI_THEME_TOKENS.panel.bg} ${UI_THEME_TOKENS.input.border} shadow-none`} aria-label="Graph editor panel">
      <header className={`flex min-w-0 shrink-0 flex-wrap items-center justify-between gap-2 border-b px-3 py-2 ${UI_THEME_TOKENS.panel.divider}`} aria-label="Graph editor panel header">
        <section className="flex min-w-0 max-w-full flex-wrap items-center gap-1">
          <TabButton id="outline" active={tab === 'outline'} onClick={() => setTab('outline')}>Outline</TabButton>
          <TabButton id="inspector" active={tab === 'inspector'} onClick={() => setTab('inspector')}>Inspector</TabButton>
          <TabButton id="history" active={tab === 'history'} onClick={() => setTab('history')}>History</TabButton>
        </section>
        <section className="flex min-w-0 max-w-full flex-wrap items-center gap-1">
          <button
            type="button"
            className={`rounded-md px-2 py-1 text-xs ${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`}
            onClick={() => undoHistory()}
            aria-label="Undo"
          >
            Undo
          </button>
          <button
            type="button"
            className={`rounded-md px-2 py-1 text-xs ${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`}
            onClick={() => redoHistory()}
            aria-label="Redo"
          >
            Redo
          </button>
        </section>
      </header>

      <section className="min-h-0 min-w-0 max-w-full flex-1 overflow-y-auto overflow-x-hidden [overflow-wrap:anywhere] px-3 py-3" aria-label="Graph editor panel content">
        {tab === 'outline' ? <GraphEditorOutlineTab /> : tab === 'history' ? <GraphEditorHistoryTab /> : <GraphEditorInspectorTab />}
      </section>
    </aside>
  )
}
