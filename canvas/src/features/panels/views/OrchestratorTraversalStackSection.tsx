import CollapsibleSection from '@/features/panels/ui/CollapsibleSection'
import Tooltip from '@/features/panels/ui/Tooltip'
import {
  UI_COPY,
  UI_LABELS,
  AGENTIC_REASONING_LABELS_TOOLTIP,
  AGENTIC_GRAPH_RAG_PIPELINE_DESCRIPTION,
  TRAVERSAL_EDITOR_AND_LAYERS_SECTION_TOOLTIP,
  TRAVERSAL_PRESETS_SECTION_TOOLTIP,
} from '@/lib/config'
import { getOrchestratorSectionListLabel } from '@/features/panels/config'
import { useGraphStore } from '@/hooks/useGraphStore'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import type { GraphSchema } from '@/lib/graph/schema'
import type { GraphRagWorkflowJsonLd, DuckDbQueryConfig } from '@/features/panels/utils/graphragConfig'
import type { TraversalSummary } from '@/features/panels/utils/orchestratorTraversal'
import { GraphRagWorkflowSection } from '@/features/panels/views/GraphRagWorkflowSection'
import {
  OrchestratorTraversalPresetsSection,
  OrchestratorTraversalAndLayersSection,
} from '@/features/panels/views/OrchestratorTraversalPanels'
import type { GraphRagPathHelper } from '@/features/panels/views/OrchestratorTraversalPanelsModel'
import type { OrchestratorTraversalSectionViewModel } from '@/features/panels/views/OrchestratorTraversalSectionModel'
import type {
  AgenticRagContextComparison,
} from '@/lib/graph/jsonld/index'

interface OrchestratorTraversalWorkflowProps {
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

interface OrchestratorTraversalPresetsProps {
  runGraphRagTraversal: () => void
  traversalPlaneProgress?: number | null
  traversalStartNodeId: string
  setTraversalStartNodeId: (value: string) => void
  traversalMaxDepth: number
  setTraversalMaxDepth: (value: number) => void
  traversalLabelFilter: string
  setTraversalLabelFilter: (value: string) => void
  runGenericTraversalQuery: () => void
  selectedNodeId: string | null
  graphRagPathHelper: GraphRagPathHelper | null
  graphNodesById: Record<string, { label: string }>
  selectNode: (id: string | null) => void
  duckdbQueriesFromConfig?: DuckDbQueryConfig[]
}

interface OrchestratorTraversalEditorProps {
  traversalViewModel: OrchestratorTraversalSectionViewModel
  schema: GraphSchema
  setSchema: (schema: GraphSchema) => void
  setThreeConfig: (config: Partial<GraphSchema['three']>) => void
  setCharge: (value: number) => void
  setCollisionByType: (type: string, radius: number) => void
  traversalDelayMs: number
  onChangeTraversalDelayMs: (value: number) => void
}

interface OrchestratorTraversalSectionProps {
  graphRagCollapsed: boolean
  presetsCollapsed: boolean
  editorCollapsed: boolean
  setGraphRagCollapsed: (next: boolean) => void
  setPresetsCollapsed: (next: boolean) => void
  setEditorCollapsed: (next: boolean) => void
  workflowProps: OrchestratorTraversalWorkflowProps
  presetsProps: OrchestratorTraversalPresetsProps
  editorProps: OrchestratorTraversalEditorProps
}

export function OrchestratorTraversalSection({
  graphRagCollapsed,
  presetsCollapsed,
  editorCollapsed,
  setGraphRagCollapsed,
  setPresetsCollapsed,
  setEditorCollapsed,
  workflowProps,
  presetsProps,
  editorProps,
}: OrchestratorTraversalSectionProps) {
  const uiPanelKeyValueTextSizeClass = useGraphStore(
    s => s.uiPanelKeyValueTextSizeClass || 'text-sm',
  )
  const uiPanelTextFontClass = useGraphStore(
    s => s.uiPanelTextFontClass || 'font-sans',
  )
  return (
    <>
      <CollapsibleSection
        title={(
          <Tooltip
            content={AGENTIC_GRAPH_RAG_PIPELINE_DESCRIPTION}
            maxWidthPx={260}
            contentClassName={`${UI_THEME_TOKENS.tooltip.bg} ${UI_THEME_TOKENS.tooltip.text}`}
          >
            <span
              className={[
                'inline-flex items-center gap-1',
                uiPanelKeyValueTextSizeClass,
                uiPanelTextFontClass,
              ].join(' ')}
            >
              <span className="break-words">
                {UI_LABELS.ragGraphRAGWorkflow}
              </span>
            </span>
          </Tooltip>
        )}
        headerClassName="z-20"
        collapsed={graphRagCollapsed}
        onToggle={setGraphRagCollapsed}
      >
        <GraphRagWorkflowSection
          workflowDoc={workflowProps.workflowDoc}
          workflowSource={workflowProps.workflowSource}
          workflowError={workflowProps.workflowError}
          workflowValidationErrors={workflowProps.workflowValidationErrors}
          traversalDelayMs={workflowProps.traversalDelayMs}
          onChangeTraversalDelayMs={workflowProps.onChangeTraversalDelayMs}
          lastTraversal={workflowProps.lastTraversal}
          onUpdateWorkflow={workflowProps.onUpdateWorkflow}
          indexingCollapsed={workflowProps.indexingCollapsed}
          onToggleIndexingCollapsed={workflowProps.onToggleIndexingCollapsed}
          tracingCollapsed={workflowProps.tracingCollapsed}
          onToggleTracingCollapsed={workflowProps.onToggleTracingCollapsed}
          agenticContext={workflowProps.agenticContext}
          onChangeAgenticContextUrl={workflowProps.onChangeAgenticContextUrl}
        />
      </CollapsibleSection>
      <CollapsibleSection
          title={(
          <Tooltip
            content={TRAVERSAL_PRESETS_SECTION_TOOLTIP}
            maxWidthPx={260}
            contentClassName={`${UI_THEME_TOKENS.tooltip.bg} ${UI_THEME_TOKENS.tooltip.text}`}
          >
              <span className="inline-flex items-center gap-1">
                <span>{UI_COPY.orchestratorTraversalPresetsSectionTitle}</span>
              </span>
            </Tooltip>
          )}
          collapsed={presetsCollapsed}
          onToggle={setPresetsCollapsed}
        >
          <section className={`mb-1 ${UI_THEME_TOKENS.text.secondary}`}>
            {UI_COPY.orchestratorTraversalPresetsIntro(getOrchestratorSectionListLabel())}
          </section>
          <Tooltip
            content={AGENTIC_REASONING_LABELS_TOOLTIP}
            maxWidthPx={260}
            contentClassName={`${UI_THEME_TOKENS.tooltip.bg} ${UI_THEME_TOKENS.tooltip.text}`}
          >
            <section className={`mb-2 flex items-center gap-1 ${UI_THEME_TOKENS.text.secondary}`}>
              <section>
                {UI_COPY.orchestratorTraversalAgenticReasoningLabelsTitle}
              </section>
            </section>
          </Tooltip>
          <OrchestratorTraversalPresetsSection
            runGraphRagTraversal={presetsProps.runGraphRagTraversal}
            traversalStartNodeId={presetsProps.traversalStartNodeId}
            setTraversalStartNodeId={presetsProps.setTraversalStartNodeId}
            traversalMaxDepth={presetsProps.traversalMaxDepth}
            setTraversalMaxDepth={presetsProps.setTraversalMaxDepth}
            traversalLabelFilter={presetsProps.traversalLabelFilter}
            setTraversalLabelFilter={presetsProps.setTraversalLabelFilter}
            runGenericTraversalQuery={presetsProps.runGenericTraversalQuery}
            selectedNodeId={presetsProps.selectedNodeId}
            graphRagPathHelper={presetsProps.graphRagPathHelper}
            graphNodesById={presetsProps.graphNodesById}
            selectNode={presetsProps.selectNode}
            duckdbQueriesFromConfig={presetsProps.duckdbQueriesFromConfig}
          />
        </CollapsibleSection>
      <CollapsibleSection
          title={(
            <Tooltip
              content={TRAVERSAL_EDITOR_AND_LAYERS_SECTION_TOOLTIP}
              maxWidthPx={260}
              contentClassName={`${UI_THEME_TOKENS.tooltip.bg} ${UI_THEME_TOKENS.tooltip.text}`}
            >
              <span className="inline-flex items-center gap-1">
                <span>{UI_COPY.orchestratorTraversalEditorSectionTitle}</span>
              </span>
            </Tooltip>
          )}
          collapsed={editorCollapsed}
          onToggle={setEditorCollapsed}
        >
          <OrchestratorTraversalAndLayersSection
            traversalViewModel={editorProps.traversalViewModel}
          />
        </CollapsibleSection>
    </>
  )
}
