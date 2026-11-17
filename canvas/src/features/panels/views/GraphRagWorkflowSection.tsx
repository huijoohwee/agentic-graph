import React from 'react'
import CollapsibleSection from '@/features/panels/ui/CollapsibleSection'
import Tooltip from 'agentic-design-system/react/hover'
import {
  KeyTypeValueStaticRow,
  RightAlignedValueCell,
} from 'grph-shared/react/keyTypeValueRow'
import {
  AGENTIC_RAG_CONTEXT_IRI_TOOLTIP,
  GRAPHRAG_WORKFLOW_SUMMARY_TOOLTIP,
  ORCHESTRATOR_TRACING_OPTIONS_TOOLTIP,
  UI_COPY,
  UI_ANCHORS,
} from '@/lib/config'
import type { GraphRagWorkflowJsonLd } from '@/features/panels/utils/graphragConfig'
import type { TraversalSummary } from '@/features/panels/utils/orchestratorTraversal'
import type { AgenticRagContextComparison } from '@/lib/graph/jsonld/index'
import { GraphRagWorkflowIndexingSection } from '@/features/panels/views/GraphRagWorkflowIndexingSection'
import { emitGraphTraversalFloatingPanelOpen } from '@/features/panels/utils/graphTraversalFloatingPanel'
import { useGraphStore } from '@/hooks/useGraphStore'
import { MonacoTextEditor } from '@/features/monaco/MonacoTextEditor'
import { OrchestratorTraversalDelayRow } from '@/features/panels/ui/OrchestratorTraversalDelayRow'
import {
  UI_RESPONSIVE_GRAPH_RAG_WORKFLOW_COMPACT_TOKEN_CLASSNAME,
  UI_RESPONSIVE_GRAPH_RAG_WORKFLOW_TOKEN_CLASSNAME,
  UI_RESPONSIVE_PANEL_CODE_EDITOR_FRAME_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'

export interface AgenticContextGraphContextUrlRowProps {
  agenticContext: AgenticRagContextComparison | null
  onChangeAgenticContextUrl: (value: string) => void
  mode: 'edit' | 'redirect'
}

import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { PANEL_TYPOGRAPHY_DEFAULTS } from 'grph-shared/ui/panelTypography'

const graphRagWorkflowSummaryClassName = `space-y-0.5 text-xs ${UI_THEME_TOKENS.text.secondary}`
const graphRagWorkflowRowClassName = `border-b ${UI_THEME_TOKENS.panel.divider}`
const graphRagWorkflowSummaryContentClassName = `flex min-w-0 flex-wrap items-center gap-1 text-xs ${UI_THEME_TOKENS.text.secondary} w-full`
const graphRagWorkflowDelimiterClassName = UI_THEME_TOKENS.text.tertiary

export function AgenticContextGraphContextUrlRow({
  agenticContext,
  onChangeAgenticContextUrl,
  mode,
}: AgenticContextGraphContextUrlRowProps) {
  const uiPanelKeyValueTextSizeClass = useGraphStore(
    s => s.uiPanelKeyValueTextSizeClass || 'text-sm',
  )
  const uiPanelTextFontClass = useGraphStore(
    s => s.uiPanelTextFontClass || 'font-sans',
  )
  const uiPanelRowDensityDefaultClass = useGraphStore(
    s => s.uiPanelRowDensityDefaultClass || 'py-1',
  )
  const uiPanelMonospaceTextClass = useGraphStore(
    s => s.uiPanelMonospaceTextClass || 'font-mono text-xs',
  )
  return (
    <KeyTypeValueStaticRow
      layout="keyIconValue"
      keyNode={(
        <Tooltip
          content={AGENTIC_RAG_CONTEXT_IRI_TOOLTIP}
          maxWidthPx={260}
          contentClassName={UI_THEME_TOKENS.tooltip.bg}
        >
          <span className={`text-xs ${UI_THEME_TOKENS.text.primary} break-words`}>
            agenticContext.graphContextUrl
          </span>
        </Tooltip>
      )}
      typeNode={null}
      valueNode={(
        <section className="space-y-1 w-full">
          {mode === 'edit' ? (
            <RightAlignedValueCell className="mt-0.5">
              <Tooltip
                content={AGENTIC_RAG_CONTEXT_IRI_TOOLTIP}
                maxWidthPx={260}
                contentClassName={UI_THEME_TOKENS.tooltip.bg}
                className="w-full h-full"
              >
                <section className={`${UI_RESPONSIVE_PANEL_CODE_EDITOR_FRAME_CLASSNAME} border ${UI_THEME_TOKENS.input.border} rounded overflow-hidden bg-transparent`}>
                  <MonacoTextEditor
                    value={agenticContext?.graphContextUrl || ''}
                    onChange={(val) => onChangeAgenticContextUrl(val)}
                    language="text"
                    uri="inmemory://graphrag/agentic-context-url"
                    themeMode="light"
                    wordWrap
                    className={`w-full h-full ${uiPanelMonospaceTextClass} ${UI_THEME_TOKENS.input.text}`}
                  />
                </section>
              </Tooltip>
            </RightAlignedValueCell>
          ) : (
            <section className="flex items-center justify-start">
              <button
                type="button"
                className={`App-toolbar__btn ${UI_THEME_TOKENS.button.hoverBg} ${UI_THEME_TOKENS.text.primary}`}
                onClick={() => {
                  emitGraphTraversalFloatingPanelOpen()
                }}
              >
                {UI_COPY.graphRagOpenOrchestratorAgenticContextButtonLabel}
              </button>
            </section>
          )}
        </section>
      )}
      align="start"
      textSizeClassName={uiPanelKeyValueTextSizeClass}
      fontClassName={uiPanelTextFontClass}
      densityClassName={uiPanelRowDensityDefaultClass}
      activeClassName={UI_THEME_TOKENS.table.rowHoverHighlight}
    />
  )
}

interface GraphRagWorkflowSectionProps {
  workflowDoc: GraphRagWorkflowJsonLd
  workflowSource: 'loaded' | 'generated' | 'invalid' | 'parse-error'
  workflowError: string | null
  workflowValidationErrors: string[]
  traversalDelayMs: number
  onChangeTraversalDelayMs: (value: number) => void
  lastTraversal: TraversalSummary | null
  onUpdateWorkflow: (updater: (current: GraphRagWorkflowJsonLd) => GraphRagWorkflowJsonLd) => void
  indexingCollapsed: boolean
  onToggleIndexingCollapsed: (next: boolean) => void
  tracingCollapsed: boolean
  onToggleTracingCollapsed: (next: boolean) => void
  agenticContext: AgenticRagContextComparison | null
  onChangeAgenticContextUrl: (value: string) => void
}

export function GraphRagWorkflowSection({
  workflowDoc,
  workflowSource,
  workflowError,
  workflowValidationErrors,
  traversalDelayMs,
  onChangeTraversalDelayMs,
  lastTraversal,
  onUpdateWorkflow,
  indexingCollapsed,
  onToggleIndexingCollapsed,
  tracingCollapsed,
  onToggleTracingCollapsed,
  agenticContext,
  onChangeAgenticContextUrl,
}: GraphRagWorkflowSectionProps) {
  const uiPanelMonospaceTextClass = useGraphStore(
    s => s.uiPanelMonospaceTextClass || 'font-mono text-xs',
  )
  const uiPanelKeyValueTextSizeClass = useGraphStore(
    s => s.uiPanelKeyValueTextSizeClass || 'text-sm',
  )
  const uiPanelTextFontClass = useGraphStore(
    s => s.uiPanelTextFontClass || 'font-sans',
  )
  const uiPanelRowDensityDefaultClass = useGraphStore(
    s => s.uiPanelRowDensityDefaultClass || 'py-1',
  )
  const uiPanelKeyValueInputClass = useGraphStore(
    s =>
      s.uiPanelKeyValueInputClass ||
      PANEL_TYPOGRAPHY_DEFAULTS.keyValueInputClass,
  )

  return (
    <section
      data-kg-anchor={UI_ANCHORS.ragGraphRAGWorkflow}
      className={graphRagWorkflowSummaryClassName}
    >
      <KeyTypeValueStaticRow
        layout="keyValue"
        className={graphRagWorkflowRowClassName}
        keyNode={<span className="break-words">{UI_COPY.graphRagWorkflowRowLabel}</span>}
        valueNode={(
          <Tooltip
            content={GRAPHRAG_WORKFLOW_SUMMARY_TOOLTIP}
            maxWidthPx={260}
            contentClassName={`${UI_THEME_TOKENS.tooltip.bg} ${UI_THEME_TOKENS.tooltip.text}`}
            className="w-full"
          >
            <section className={graphRagWorkflowSummaryContentClassName}>
              <span className="whitespace-nowrap">
                {UI_COPY.graphRagWorkflowGraphIdLabel}
              </span>
              <span
                className={`${uiPanelMonospaceTextClass} ${UI_RESPONSIVE_GRAPH_RAG_WORKFLOW_TOKEN_CLASSNAME}`}
                title={workflowDoc.graphId}
              >
                {workflowDoc.graphId}
              </span>
              <span className={graphRagWorkflowDelimiterClassName}>
                ·
              </span>
              <span className="whitespace-nowrap">
                {UI_COPY.graphRagWorkflowRetrievalLabel}
              </span>
              <span
                className={`${uiPanelMonospaceTextClass} ${UI_RESPONSIVE_GRAPH_RAG_WORKFLOW_COMPACT_TOKEN_CLASSNAME}`}
                title={workflowDoc.retrievalMethod}
              >
                {workflowDoc.retrievalMethod}
              </span>
              <span className={graphRagWorkflowDelimiterClassName}>
                ·
              </span>
              <span className={UI_THEME_TOKENS.text.tertiary}>
                {workflowSource === 'loaded' && UI_COPY.graphRagWorkflowSourceLoadedLabel}
                {workflowSource === 'generated' && UI_COPY.graphRagWorkflowSourceGeneratedLabel}
                {workflowSource === 'invalid' && UI_COPY.graphRagWorkflowSourceInvalidLabel}
                {workflowSource === 'parse-error' && UI_COPY.graphRagWorkflowSourceParseErrorLabel}
              </span>
            </section>
          </Tooltip>
        )}
        textSizeClassName={uiPanelKeyValueTextSizeClass}
        fontClassName={uiPanelTextFontClass}
        densityClassName={uiPanelRowDensityDefaultClass}
        activeClassName={UI_THEME_TOKENS.table.rowHoverHighlight}
      />
      <OrchestratorTraversalDelayRow
        traversalDelayMs={traversalDelayMs}
        onChangeTraversalDelayMs={onChangeTraversalDelayMs}
        uiPanelKeyValueInputClass={uiPanelKeyValueInputClass}
      />
      <AgenticContextGraphContextUrlRow
        agenticContext={agenticContext}
        onChangeAgenticContextUrl={onChangeAgenticContextUrl}
        mode="edit"
      />
      {workflowError && (
        <section className="mt-1 text-red-600">
          {workflowError}
        </section>
      )}
      {workflowValidationErrors && workflowValidationErrors.length > 0 && (
        <section className="mt-1 text-amber-700">
          {workflowValidationErrors.slice(0, 3).join('; ')}
          {workflowValidationErrors.length > 3 && '; …'}
        </section>
      )}
      <GraphRagWorkflowIndexingSection
        workflowDoc={workflowDoc}
        indexingCollapsed={indexingCollapsed}
        onToggleIndexingCollapsed={onToggleIndexingCollapsed}
        onUpdateWorkflow={onUpdateWorkflow}
      />
      <CollapsibleSection
        title={(
          <Tooltip
            content={ORCHESTRATOR_TRACING_OPTIONS_TOOLTIP}
            maxWidthPx={260}
            contentClassName={`${UI_THEME_TOKENS.tooltip.bg} ${UI_THEME_TOKENS.tooltip.text}`}
          >
            <span className="inline-flex items-center gap-1">
              <span>{UI_COPY.graphRagWorkflowTracingOptionsTitle}</span>
            </span>
          </Tooltip>
        )}
        headerClassName="px-0"
        collapsed={tracingCollapsed}
        onToggle={onToggleTracingCollapsed}
        stickyOffsetClassName="top-6"
      >
        <section className={`space-y-2 text-xs ${UI_THEME_TOKENS.text.secondary}`}>
          <section>
            {UI_COPY.graphRagWorkflowLastTraversalLabel}{' '}
            {lastTraversal
              ? `${lastTraversal.edgeIds.length} ${UI_COPY.graphRagWorkflowEdgesUnitLabel} · ${
                  lastTraversal.mode === 'graphRag'
                    ? `${lastTraversal.traverseNodeIds.length} ${UI_COPY.graphRagWorkflowTraverseNodesUnitLabel} · ${lastTraversal.hops.length} ${UI_COPY.graphRagWorkflowHopsUnitLabel}`
                    : `${UI_COPY.graphRagWorkflowMaxDepthLabel} ${lastTraversal.maxDepth}`
                }`
              : UI_COPY.graphRagWorkflowNoTraversalYetLabel}
          </section>
        </section>
      </CollapsibleSection>
    </section>
  )
}
