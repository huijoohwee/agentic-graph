import React from 'react'
import type { GraphNode } from '@/lib/graph/types'
import { UI_COPY } from '@/lib/config'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { UI_RESPONSIVE_PANEL_CODE_EDITOR_FRAME_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { cn } from '@/lib/utils'
import { PlainTextInputEditor } from '@/components/ui/PlainTextInputEditor'
import {
  StoryboardWidgetInspectorJsonButton,
  type StoryboardWidgetInspectorJsonTarget,
} from './StoryboardWidgetInspectorJsonButton'
import { uiSelectedRowStateClassName } from 'grph-shared/ui/selectedRowClasses'

export function StoryboardWidgetInspectorWorkflowTab(props: {
  active: boolean
  workflowNodes?: GraphNode[]
  workflowSelectedNodeId?: string | null
  onWorkflowSelectNode?: (nodeId: string) => void
  onWorkflowRunNode?: (nodeId: string) => void
  onWorkflowExportBundle?: () => void
  workflowMetaJson: string
  setWorkflowMetaJson: (v: string) => void
  workflowContextJson: string
  setWorkflowContextJson: (v: string) => void
  onApplyJson: (target: StoryboardWidgetInspectorJsonTarget) => void
  microLabelClass: string
  monospaceTextClass: string
  keyLabelClass: string
}) {
  const {
    active,
    workflowNodes,
    workflowSelectedNodeId,
    onWorkflowSelectNode,
    onWorkflowRunNode,
    onWorkflowExportBundle,
    workflowMetaJson,
    setWorkflowMetaJson,
    workflowContextJson,
    setWorkflowContextJson,
    onApplyJson,
    microLabelClass,
    monospaceTextClass,
    keyLabelClass,
  } = props

  return (
    <section aria-label="Workflow editor">
      <menu className="mt-2 flex items-center gap-2" aria-label="Workflow actions">
        <button
          type="button"
          className={`App-toolbar__btn ${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`}
          onClick={() => onWorkflowExportBundle?.()}
          disabled={!active || !onWorkflowExportBundle}
        >
          {UI_COPY.storyboardWidgetExportBundleButton}
        </button>
      </menu>
      {Array.isArray(workflowNodes) && workflowNodes.length > 0 && (
        <nav className="mt-2" aria-label="Workflow node list">
          <ul className="flex flex-col gap-2">
            {workflowNodes.map(n => {
              const id = String(n.id || '')
              const isSelected = !!id && id === String(workflowSelectedNodeId || '')
              return (
                <li key={id}>
                  <article className={`w-full rounded-lg px-2 py-2 ${isSelected ? uiSelectedRowStateClassName(true) : `border ${UI_THEME_TOKENS.panel.bg} ${UI_THEME_TOKENS.input.border}`}`}>
                    <header className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        className={`min-w-0 flex-1 text-left ${UI_THEME_TOKENS.text.primary}`}
                        onClick={() => onWorkflowSelectNode?.(id)}
                        disabled={!active || !onWorkflowSelectNode}
                      >
                        <span className="block truncate">{String(n.label || id)}</span>
                        <span className={cn('block truncate', microLabelClass, UI_THEME_TOKENS.text.secondary)}>
                          {String(n.type || 'Node')}
                        </span>
                      </button>
                      <button
                        type="button"
                        className={`App-toolbar__btn ${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`}
                        onClick={() => onWorkflowRunNode?.(id)}
                        aria-label={`Run node ${id}`}
                        disabled={!active || !onWorkflowRunNode}
                      >
                        ▶
                      </button>
                    </header>
                  </article>
                </li>
              )
            })}
          </ul>
        </nav>
      )}

      <p className={cn('mt-3', microLabelClass, UI_THEME_TOKENS.text.secondary)}>Draft graph</p>
      <label className={cn('mt-3 block', keyLabelClass, UI_THEME_TOKENS.text.secondary)} htmlFor="storyboard-widget-workflow-meta">
        Metadata (JSON)
      </label>
      <PlainTextInputEditor
        id="storyboard-widget-workflow-meta"
        className={cn('mt-1 px-2 py-1 rounded-md border', UI_RESPONSIVE_PANEL_CODE_EDITOR_FRAME_CLASSNAME, monospaceTextClass, UI_THEME_TOKENS.input.bg, UI_THEME_TOKENS.input.border, UI_THEME_TOKENS.input.text)}
        value={workflowMetaJson}
        onChange={setWorkflowMetaJson}
        multiline
        disabled={!active}
      />
      <StoryboardWidgetInspectorJsonButton label="Apply workflow metadata" target="workflowMeta" disabled={!active} onApplyJson={onApplyJson} />
      <label className={cn('mt-3 block', keyLabelClass, UI_THEME_TOKENS.text.secondary)} htmlFor="storyboard-widget-workflow-context">
        Context (JSON)
      </label>
      <PlainTextInputEditor
        id="storyboard-widget-workflow-context"
        className={cn('mt-1 px-2 py-1 rounded-md border', UI_RESPONSIVE_PANEL_CODE_EDITOR_FRAME_CLASSNAME, monospaceTextClass, UI_THEME_TOKENS.input.bg, UI_THEME_TOKENS.input.border, UI_THEME_TOKENS.input.text)}
        value={workflowContextJson}
        onChange={setWorkflowContextJson}
        multiline
        disabled={!active}
      />
      <StoryboardWidgetInspectorJsonButton label="Apply workflow context" target="workflowContext" disabled={!active} onApplyJson={onApplyJson} />
    </section>
  )
}
