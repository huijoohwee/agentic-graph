import React from 'react'
import { Download, Hand, Link2, MousePointer2, Square, Ungroup, Upload } from 'lucide-react'

import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import {
  UI_RESPONSIVE_DEFAULT_GLYPH_CLASSNAME,
  UI_RESPONSIVE_MENU_ROW_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import { UI_TEXT_TRUNCATE } from '@/lib/ui/textLayout'
import { exportGraphEditorJson, importGraphEditorJsonLocal } from '@/features/graph-editor/editorIo'
import { listGraphEditorPluginTools } from '@/features/graph-editor/plugins/toolRegistry'
import { uiSelectedRowStateClassName } from 'grph-shared/ui/selectedRowClasses'

export type GraphEditorToolId = 'select' | 'pan' | 'node' | 'edge' | 'subgraph'

type ToolDef = {
  id: GraphEditorToolId
  label: string
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  hotkey: string
}

const TOOLS: ToolDef[] = [
  { id: 'select', label: 'Select', icon: MousePointer2, hotkey: 'V' },
  { id: 'pan', label: 'Pan', icon: Hand, hotkey: 'H' },
  { id: 'node', label: 'Node', icon: Square, hotkey: 'N' },
  { id: 'edge', label: 'Edge', icon: Link2, hotkey: 'E' },
  { id: 'subgraph', label: 'Subgraph', icon: Ungroup, hotkey: 'G' },
]

const graphEditorToolRailIconClassName = UI_RESPONSIVE_DEFAULT_GLYPH_CLASSNAME

export function GraphEditorToolRail(props: {
  activeToolId: GraphEditorToolId
  onSelectTool: (toolId: GraphEditorToolId) => void
  disabled?: boolean
}) {
  const { activeToolId, onSelectTool, disabled } = props
  const pluginTools = listGraphEditorPluginTools()

  return (
    <nav
      className={`rounded-xl border ${UI_THEME_TOKENS.panel.bg} ${UI_THEME_TOKENS.input.border} shadow-sm`}
      aria-label="Graph editor tools"
    >
      <section className="flex flex-col p-1">
        {TOOLS.map(t => {
          const Icon = t.icon
          const isActive = t.id === activeToolId
          return (
            <button
              key={t.id}
              type="button"
              className={`${UI_RESPONSIVE_MENU_ROW_CLASSNAME} gap-2 rounded-lg px-2 py-2 text-xs transition ${isActive ? uiSelectedRowStateClassName(true) : `${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`}`}
              onClick={() => onSelectTool(t.id)}
              aria-label={`Tool: ${t.label} (${t.hotkey})`}
              disabled={disabled}
            >
              <Icon className={graphEditorToolRailIconClassName} aria-hidden={true} />
              <span className={`flex-1 text-left ${UI_TEXT_TRUNCATE}`}>{t.label}</span>
              <span className={`shrink-0 rounded px-1.5 py-0.5 ${UI_THEME_TOKENS.badge.chip} ${UI_THEME_TOKENS.badge.text} ${UI_THEME_TOKENS.text.tertiary}`}>{t.hotkey}</span>
            </button>
          )
        })}
      </section>

      {pluginTools.length > 0 ? (
        <>
          <section className={`border-t ${UI_THEME_TOKENS.panel.divider}`} />
          <section className="flex flex-col p-1">
            {pluginTools.map(t => {
              const Icon = t.icon
              const isActive = t.id === activeToolId
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`${UI_RESPONSIVE_MENU_ROW_CLASSNAME} gap-2 rounded-lg px-2 py-2 text-xs transition ${isActive ? uiSelectedRowStateClassName(true) : `${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`}`}
                  onClick={() => onSelectTool(t.id as GraphEditorToolId)}
                  aria-label={`Tool: ${t.label}${t.hotkey ? ` (${t.hotkey})` : ''}`}
                  disabled={disabled}
                >
                  {Icon ? <Icon className={graphEditorToolRailIconClassName} aria-hidden={true} /> : <span className={graphEditorToolRailIconClassName} />}
                  <span className={`flex-1 text-left ${UI_TEXT_TRUNCATE}`}>{t.label}</span>
                  {t.hotkey ? (
                    <span className={`shrink-0 rounded px-1.5 py-0.5 ${UI_THEME_TOKENS.badge.chip} ${UI_THEME_TOKENS.badge.text} ${UI_THEME_TOKENS.text.tertiary}`}>{t.hotkey}</span>
                  ) : null}
                </button>
              )
            })}
          </section>
        </>
      ) : null}

      <section className={`border-t ${UI_THEME_TOKENS.panel.divider}`} />
      <section className="flex flex-col p-1">
        <button
          type="button"
          className={`${UI_RESPONSIVE_MENU_ROW_CLASSNAME} gap-2 rounded-lg px-2 py-2 text-xs transition ${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`}
          onClick={() => {
            void importGraphEditorJsonLocal()
          }}
          aria-label="Import JSON"
          disabled={disabled}
        >
          <Upload className={graphEditorToolRailIconClassName} aria-hidden="true" />
          <span className={`flex-1 text-left ${UI_TEXT_TRUNCATE}`}>Import JSON</span>
        </button>
        <button
          type="button"
          className={`${UI_RESPONSIVE_MENU_ROW_CLASSNAME} gap-2 rounded-lg px-2 py-2 text-xs transition ${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`}
          onClick={() => {
            exportGraphEditorJson()
          }}
          aria-label="Export JSON"
          disabled={disabled}
        >
          <Download className={graphEditorToolRailIconClassName} aria-hidden="true" />
          <span className={`flex-1 text-left ${UI_TEXT_TRUNCATE}`}>Export JSON</span>
        </button>
      </section>
    </nav>
  )
}
