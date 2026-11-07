import React from 'react'
import type { GraphEdge, GraphNode } from '@/lib/graph/types'
import { UI_COPY } from '@/lib/config'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import { UI_RESPONSIVE_CARD_MULTILINE_EDITOR_CLASSNAME, UI_RESPONSIVE_CARD_TITLE_EDITOR_CLASSNAME, UI_RESPONSIVE_PANEL_CODE_EDITOR_COMPACT_FRAME_CLASSNAME, UI_RESPONSIVE_PANEL_CODE_EDITOR_FRAME_CLASSNAME, UI_RESPONSIVE_PANEL_CODE_EDITOR_LARGE_FRAME_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { cn } from '@/lib/utils'
import { readFlowEdgeDisplayLabel } from '@/lib/graph/flowPorts'
import type { UserSubgraph } from '@/lib/graph/subgraphs'
import { PlainTextInputEditor } from '@/components/ui/PlainTextInputEditor'
import { CardInlineTextEditor } from '@/lib/cards/CardInlineTextEditor'
import { buildInlineMediaCommandContextFromRecord } from '@/lib/command-menu/inlineMediaCommandContext'
import {
  GRAPH_NODE_CARD_TEXT_FIELDS,
  buildGraphNodeCanonicalTextPatch,
  readGraphNodeCanonicalTextProperty,
  readGraphNodeCardTitle,
  readGraphNodeProperties,
} from '@/lib/cards/graphNodeCardFields'
import { StoryboardWidgetInspectorTabs, type InspectorTab } from './StoryboardWidgetInspectorTabs'
import {
  StoryboardWidgetInspectorJsonButton,
  type StoryboardWidgetInspectorJsonTarget,
} from './StoryboardWidgetInspectorJsonButton'
import { StoryboardWidgetInspectorWorkflowTab } from './StoryboardWidgetInspectorWorkflowTab'
import { StoryboardWidgetInspectorGroupsTab } from './StoryboardWidgetInspectorGroupsTab'

export type { InspectorTab } from './StoryboardWidgetInspectorTabs'

export default function StoryboardWidgetInspector({
  active,
  tab,
  setTab,
  selectedNode,
  selectedEdge,
  subgraphs,
  selectedNodeIds,
  collapsedGroupIds,
  onCreateSubgraphFromSelection,
  onSetSubgraphKind,
  onRenameSubgraph,
  onDeleteSubgraph,
  onSetSubgraphParent,
  onAddSelectionToSubgraph,
  onRemoveSelectionFromSubgraph,
  onToggleSubgraphCollapsed,
  onSelectSubgraph,
  workflowNodes,
  workflowSelectedNodeId,
  onWorkflowSelectNode,
  onWorkflowRunNode,
  onWorkflowExportBundle,
  jsonError,
  nodePropsJson,
  setNodePropsJson,
  nodeMetaJson,
  setNodeMetaJson,
  edgePropsJson,
  setEdgePropsJson,
  edgeMetaJson,
  setEdgeMetaJson,
  workflowMetaJson,
  setWorkflowMetaJson,
  workflowContextJson,
  setWorkflowContextJson,
  onSetNodeLabel,
  onPatchSelectedNodeProperties,
  onSetNodeType,
  onSetEdgeLabel,
  onApplyJson,
}: {
  active: boolean
  tab: InspectorTab
  setTab: (tab: InspectorTab) => void
  selectedNode: GraphNode | null
  selectedEdge: GraphEdge | null
  subgraphs: UserSubgraph[]
  selectedNodeIds: string[]
  collapsedGroupIds: string[]
  onCreateSubgraphFromSelection: (args: { label?: string; kind?: 'subgraph' | 'cluster' }) => void
  onSetSubgraphKind: (id: string, kind: 'subgraph' | 'cluster') => void
  onRenameSubgraph: (id: string, label: string) => void
  onDeleteSubgraph: (id: string) => void
  onSetSubgraphParent: (id: string, parentId: string | null) => void
  onAddSelectionToSubgraph: (id: string) => void
  onRemoveSelectionFromSubgraph: (id: string) => void
  onToggleSubgraphCollapsed: (id: string) => void
  onSelectSubgraph: (id: string) => void
  workflowNodes?: GraphNode[]
  workflowSelectedNodeId?: string | null
  onWorkflowSelectNode?: (nodeId: string) => void
  onWorkflowRunNode?: (nodeId: string) => void
  onWorkflowExportBundle?: () => void
  jsonError: string | null
  nodePropsJson: string
  setNodePropsJson: (v: string) => void
  nodeMetaJson: string
  setNodeMetaJson: (v: string) => void
  edgePropsJson: string
  setEdgePropsJson: (v: string) => void
  edgeMetaJson: string
  setEdgeMetaJson: (v: string) => void
  workflowMetaJson: string
  setWorkflowMetaJson: (v: string) => void
  workflowContextJson: string
  setWorkflowContextJson: (v: string) => void
  onSetNodeLabel: (label: string) => void
  onPatchSelectedNodeProperties: (patch: Record<string, unknown>) => void
  onSetNodeType: (type: string) => void
  onSetEdgeLabel: (label: string) => void
  onApplyJson: (target: StoryboardWidgetInspectorJsonTarget) => void
}) {
  const { panelTextClass, microLabelClass, monospaceTextClass, keyValueInputClass, textSizeClass, keyLabelClass } = usePanelTypography()
  const [newSubgraphLabel, setNewSubgraphLabel] = React.useState('')
  const [newSubgraphKind, setNewSubgraphKind] = React.useState<'subgraph' | 'cluster'>('subgraph')
  const selectedNodeProperties = React.useMemo(() => readGraphNodeProperties(selectedNode), [selectedNode])
  const selectedNodeInlineMediaCommandContext = React.useMemo(
    () => buildInlineMediaCommandContextFromRecord(selectedNode),
    [selectedNode],
  )
  const selectedNodeCardTitle = React.useMemo(() => readGraphNodeCardTitle(selectedNode), [selectedNode])
  const selectedNodeCardFields = React.useMemo(
    () => GRAPH_NODE_CARD_TEXT_FIELDS.map(field => ({
      ...field,
      value: readGraphNodeCanonicalTextProperty(selectedNodeProperties, field.propertyKeys),
    })),
    [selectedNodeProperties],
  )
  const canEditSelectedNodeCard = active && !!selectedNode

  return (
    <section
      aria-label="Storyboard Widget Inspector"
      className={cn('h-full min-h-0 overflow-auto p-3', UI_THEME_TOKENS.panel.bg, UI_THEME_TOKENS.text.primary, panelTextClass)}
    >
      <header className="flex items-center justify-between gap-2">
        <h2 className={cn('font-semibold', UI_THEME_TOKENS.text.primary)}>Inspector</h2>
        <StoryboardWidgetInspectorTabs active={active} tab={tab} setTab={setTab} />
      </header>

      {jsonError && <p className={cn('mt-2 text-red-300', microLabelClass)}>{jsonError}</p>}

      {tab === 'node' && (
        <section aria-label="Node editor">
          <p className={cn('mt-2', microLabelClass, UI_THEME_TOKENS.text.secondary)}>
            {selectedNode ? selectedNode.id : 'No selection'}
          </p>
          <section
            className={cn(
              'mt-3 rounded-lg border p-3',
              UI_THEME_TOKENS.panel.border,
              UI_THEME_TOKENS.panel.bg,
            )}
            aria-label="Shared card editor"
          >
            <p className={cn(microLabelClass, UI_THEME_TOKENS.text.tertiary)}>Card</p>
            <CardInlineTextEditor
              value={selectedNodeCardTitle}
              ariaLabel={selectedNode ? `Card title for ${selectedNode.id}` : 'Card title'}
              placeholder="Add title"
              canEdit={canEditSelectedNodeCard}
              editActivation="click"
              onCommit={onSetNodeLabel}
              displayClassName={cn('mt-2 text-sm font-semibold leading-5', UI_THEME_TOKENS.text.primary)}
              editorClassName={`mt-2 ${UI_RESPONSIVE_CARD_TITLE_EDITOR_CLASSNAME} text-sm font-semibold leading-5`}
            />
            <section className="mt-3 flex flex-col gap-2">
              {selectedNodeCardFields.map(field => (
                <section key={field.id} className="rounded-md border border-black/5 bg-black/[0.025] px-2.5 py-2">
                  <p className={cn('m-0 text-xs font-semibold uppercase tracking-normal', UI_THEME_TOKENS.text.tertiary)}>
                    {field.label}
                  </p>
                  <CardInlineTextEditor
                    value={field.value}
                    ariaLabel={selectedNode ? `${field.label} for ${selectedNode.id}` : field.label}
                    placeholder={field.placeholder}
                    canEdit={canEditSelectedNodeCard}
                    editActivation="click"
                    multiline
                    markdownPreview="auto"
                    markdownCommandContextText={selectedNodeInlineMediaCommandContext}
                    rows={3}
                    onCommit={nextValue => {
                      onPatchSelectedNodeProperties(
                        buildGraphNodeCanonicalTextPatch({
                          currentProperties: selectedNodeProperties,
                          propertyKeys: field.propertyKeys,
                          canonicalKey: field.canonicalKey,
                          nextValue,
                        }),
                      )
                    }}
                    displayClassName={cn('m-0 mt-1 text-xs leading-5', UI_THEME_TOKENS.text.secondary)}
                    editorClassName={`mt-1 ${UI_RESPONSIVE_CARD_MULTILINE_EDITOR_CLASSNAME} text-xs leading-5`}
                  />
                </section>
              ))}
            </section>
          </section>
          <label className={cn('mt-3 block', keyLabelClass, UI_THEME_TOKENS.text.secondary)} htmlFor="storyboard-widget-type">
            Type
          </label>
          <PlainTextInputEditor
            id="storyboard-widget-type"
            className={cn(
              'mt-1 w-full rounded-md',
              keyValueInputClass,
              textSizeClass,
              UI_THEME_TOKENS.input.bg,
              UI_THEME_TOKENS.input.border,
              UI_THEME_TOKENS.input.text,
            )}
            value={String(selectedNode?.type || 'Node')}
            onChange={onSetNodeType}
            disabled={!active || !selectedNode}
          />
          <label
            className={cn('mt-3 block', keyLabelClass, UI_THEME_TOKENS.text.secondary)}
            htmlFor="storyboard-widget-node-props"
          >
            Properties (JSON)
          </label>
          <PlainTextInputEditor
            id="storyboard-widget-node-props"
            className={cn(
              'mt-1 px-2 py-1 rounded-md border',
              UI_RESPONSIVE_PANEL_CODE_EDITOR_LARGE_FRAME_CLASSNAME,
              monospaceTextClass,
              UI_THEME_TOKENS.input.bg,
              UI_THEME_TOKENS.input.border,
              UI_THEME_TOKENS.input.text,
            )}
            value={nodePropsJson}
            onChange={setNodePropsJson}
            multiline
            disabled={!active || !selectedNode}
          />
          <StoryboardWidgetInspectorJsonButton label="Apply properties" target="nodeProps" disabled={!active || !selectedNode} onApplyJson={onApplyJson} />
          <label
            className={cn('mt-3 block', keyLabelClass, UI_THEME_TOKENS.text.secondary)}
            htmlFor="storyboard-widget-node-meta"
          >
            Metadata (JSON)
          </label>
          <PlainTextInputEditor
            id="storyboard-widget-node-meta"
            className={cn(
              'mt-1 px-2 py-1 rounded-md border',
              UI_RESPONSIVE_PANEL_CODE_EDITOR_FRAME_CLASSNAME,
              monospaceTextClass,
              UI_THEME_TOKENS.input.bg,
              UI_THEME_TOKENS.input.border,
              UI_THEME_TOKENS.input.text,
            )}
            value={nodeMetaJson}
            onChange={setNodeMetaJson}
            multiline
            disabled={!active || !selectedNode}
          />
          <StoryboardWidgetInspectorJsonButton label="Apply metadata" target="nodeMeta" disabled={!active || !selectedNode} onApplyJson={onApplyJson} />
        </section>
      )}

      {tab === 'edge' && (
        <section aria-label="Edge editor">
          {(() => {
            const displayLabel = selectedEdge ? readFlowEdgeDisplayLabel(selectedEdge) : null
            if (!displayLabel) return null
            if (displayLabel === String(selectedEdge?.label || '').trim()) return null
            return (
              <p className={cn('mt-2', microLabelClass, UI_THEME_TOKENS.text.secondary)}>
                Display: {displayLabel}
              </p>
            )
          })()}
          <p className={cn('mt-2', microLabelClass, UI_THEME_TOKENS.text.secondary)}>
            {selectedEdge ? selectedEdge.id : 'No selection'}
          </p>
          <p className={cn('mt-1', microLabelClass, UI_THEME_TOKENS.text.secondary)}>
            {selectedEdge ? `${String(selectedEdge.source)} → ${String(selectedEdge.target)}` : '—'}
          </p>
          <label
            className={cn('mt-3 block', keyLabelClass, UI_THEME_TOKENS.text.secondary)}
            htmlFor="storyboard-widget-edge-label"
          >
            Label
          </label>
          <PlainTextInputEditor
            id="storyboard-widget-edge-label"
            className={cn(
              'mt-1 w-full rounded-md',
              keyValueInputClass,
              textSizeClass,
              UI_THEME_TOKENS.input.bg,
              UI_THEME_TOKENS.input.border,
              UI_THEME_TOKENS.input.text,
            )}
            value={String(selectedEdge?.label || '')}
            onChange={onSetEdgeLabel}
            disabled={!active || !selectedEdge}
          />
          <label
            className={cn('mt-3 block', keyLabelClass, UI_THEME_TOKENS.text.secondary)}
            htmlFor="storyboard-widget-edge-props"
          >
            Properties (JSON)
          </label>
          <PlainTextInputEditor
            id="storyboard-widget-edge-props"
            className={cn(
              'mt-1 px-2 py-1 rounded-md border',
              UI_RESPONSIVE_PANEL_CODE_EDITOR_FRAME_CLASSNAME,
              monospaceTextClass,
              UI_THEME_TOKENS.input.bg,
              UI_THEME_TOKENS.input.border,
              UI_THEME_TOKENS.input.text,
            )}
            value={edgePropsJson}
            onChange={setEdgePropsJson}
            multiline
            disabled={!active || !selectedEdge}
          />
          <StoryboardWidgetInspectorJsonButton label="Apply properties" target="edgeProps" disabled={!active || !selectedEdge} onApplyJson={onApplyJson} />
          <label
            className={cn('mt-3 block', keyLabelClass, UI_THEME_TOKENS.text.secondary)}
            htmlFor="storyboard-widget-edge-meta"
          >
            Metadata (JSON)
          </label>
          <PlainTextInputEditor
            id="storyboard-widget-edge-meta"
            className={cn(
              'mt-1 px-2 py-1 rounded-md border',
              UI_RESPONSIVE_PANEL_CODE_EDITOR_COMPACT_FRAME_CLASSNAME,
              monospaceTextClass,
              UI_THEME_TOKENS.input.bg,
              UI_THEME_TOKENS.input.border,
              UI_THEME_TOKENS.input.text,
            )}
            value={edgeMetaJson}
            onChange={setEdgeMetaJson}
            multiline
            disabled={!active || !selectedEdge}
          />
          <StoryboardWidgetInspectorJsonButton label="Apply metadata" target="edgeMeta" disabled={!active || !selectedEdge} onApplyJson={onApplyJson} />
        </section>
      )}

      {tab === 'workflow' && (
        <StoryboardWidgetInspectorWorkflowTab
          active={active}
          workflowNodes={workflowNodes}
          workflowSelectedNodeId={workflowSelectedNodeId}
          onWorkflowSelectNode={onWorkflowSelectNode}
          onWorkflowRunNode={onWorkflowRunNode}
          onWorkflowExportBundle={onWorkflowExportBundle}
          workflowMetaJson={workflowMetaJson}
          setWorkflowMetaJson={setWorkflowMetaJson}
          workflowContextJson={workflowContextJson}
          setWorkflowContextJson={setWorkflowContextJson}
          onApplyJson={onApplyJson}
          microLabelClass={microLabelClass}
          monospaceTextClass={monospaceTextClass}
          keyLabelClass={keyLabelClass}
        />
      )}

      {tab === 'groups' && (
        <StoryboardWidgetInspectorGroupsTab
          active={active}
          subgraphs={subgraphs}
          selectedNodeIds={selectedNodeIds}
          collapsedGroupIds={collapsedGroupIds}
          newSubgraphLabel={newSubgraphLabel}
          setNewSubgraphLabel={setNewSubgraphLabel}
          newSubgraphKind={newSubgraphKind}
          setNewSubgraphKind={setNewSubgraphKind}
          onCreateSubgraphFromSelection={onCreateSubgraphFromSelection}
          onSetSubgraphKind={onSetSubgraphKind}
          onRenameSubgraph={onRenameSubgraph}
          onDeleteSubgraph={onDeleteSubgraph}
          onSetSubgraphParent={onSetSubgraphParent}
          onAddSelectionToSubgraph={onAddSelectionToSubgraph}
          onRemoveSelectionFromSubgraph={onRemoveSelectionFromSubgraph}
          onToggleSubgraphCollapsed={onToggleSubgraphCollapsed}
          onSelectSubgraph={onSelectSubgraph}
          microLabelClass={microLabelClass}
          keyValueInputClass={keyValueInputClass}
          textSizeClass={textSizeClass}
          keyLabelClass={keyLabelClass}
        />
      )}
    </section>
  )
}
