import { CollapsibleSection } from 'agentic-design-system/react/panels'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import React from 'react'
import { type TraversalSummary } from '@/features/panels/utils/orchestratorTraversal'
import type { OrchestratorTraversalSectionViewModel } from '@/features/panels/views/OrchestratorTraversalSectionModel'
import { SimpleKeyValueRow } from 'grph-shared/react/keyTypeValueRow'
import {
  TraversalQueryExampleEditor,
  TraverseNodesListEditor,
  HopsListEditor,
  MultiHopListEditor,
  AddHopInputs,
} from '@/features/panels/views/TraversalSequenceGraphRagEditors'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  TRAVERSAL_SEQUENCE_TOOLTIP,
  TRAVERSAL_SEQUENCE_MODE_LABEL_GRAPH_RAG,
  TRAVERSAL_SEQUENCE_MODE_LABEL_GENERIC,
  UI_COPY,
} from '@/lib/config'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'


interface TraversalSequenceSectionProps {
  graphNodesById: OrchestratorTraversalSectionViewModel['graphNodesById']
  previewEdgeIds: string[]
  lastTraversal: TraversalSummary | null
  setLastTraversal: React.Dispatch<React.SetStateAction<TraversalSummary | null>>
  selectNode: (id: string | null) => void
  editState: OrchestratorTraversalSectionViewModel['editState']
  editPaths: OrchestratorTraversalSectionViewModel['editPaths']
}

export function TraversalSequenceSection({
  graphNodesById,
  previewEdgeIds,
  lastTraversal,
  setLastTraversal,
  selectNode,
  editState,
  editPaths,
}: TraversalSequenceSectionProps) {
  const {
    textSizeClass: uiPanelKeyValueTextSizeClass,
    fontClass: uiPanelTextFontClass,
    monospaceTextClass: uiPanelMonospaceTextClass,
  } = usePanelTypography()
  const graphRagTraversal =
    lastTraversal && lastTraversal.mode === 'graphRag' ? lastTraversal : null
  const genericTraversal =
    lastTraversal && lastTraversal.mode === 'generic' ? lastTraversal : null

  return (
    <>
      <CollapsibleSection headingAs="h4" stickyHeader={false}
        title={<span title={TRAVERSAL_SEQUENCE_TOOLTIP}>{UI_COPY.orchestratorTraversalSequenceTitle}</span>}
        actions={lastTraversal && <span className={UI_THEME_TOKENS.text.tertiary}>
          {lastTraversal.mode === 'graphRag' ? TRAVERSAL_SEQUENCE_MODE_LABEL_GRAPH_RAG : TRAVERSAL_SEQUENCE_MODE_LABEL_GENERIC}
        </span>}
      >
        {lastTraversal && (
          <section
            className={[
              `${UI_THEME_TOKENS.text.secondary} space-y-1`,
              uiPanelKeyValueTextSizeClass,
              uiPanelTextFontClass,
            ].join(' ')}
          >
            {graphRagTraversal && (
              <>
                <TraversalQueryExampleEditor
                  lastTraversal={graphRagTraversal}
                  editState={editState}
                  setLastTraversal={setLastTraversal}
                />
                {graphRagTraversal.traverseNodeIds.length > 0 && (
                  <TraverseNodesListEditor
                    lastTraversal={graphRagTraversal}
                    graphNodesById={graphNodesById}
                    editPaths={editPaths}
                    setLastTraversal={setLastTraversal}
                    selectNode={selectNode}
                  />
                )}
                {graphRagTraversal.hops && graphRagTraversal.hops.length > 0 && (
                  <HopsListEditor
                    lastTraversal={graphRagTraversal}
                    editPaths={editPaths}
                    setLastTraversal={setLastTraversal}
                  />
                )}
                {graphRagTraversal.multiHop && graphRagTraversal.multiHop.length > 0 && (
                  <MultiHopListEditor
                    lastTraversal={graphRagTraversal}
                    editPaths={editPaths}
                    setLastTraversal={setLastTraversal}
                  />
                )}
                {graphRagTraversal && (
                  <AddHopInputs
                    lastTraversal={graphRagTraversal}
                    editPaths={editPaths}
                    setLastTraversal={setLastTraversal}
                  />
                )}
              </>
            )}
            {genericTraversal && (
              <GenericTraversalDetails lastTraversal={genericTraversal} />
            )}
          </section>
        )}
      </CollapsibleSection>
      {previewEdgeIds.length > 0 && (
        <section
          className={[
            `mt-1 ${UI_THEME_TOKENS.text.tertiary}`,
            uiPanelKeyValueTextSizeClass,
            uiPanelTextFontClass,
        ].join(' ')}
      >
        {UI_COPY.orchestratorTraversalSequencePreviewingPrefix}{' '}
        <span className={uiPanelMonospaceTextClass}>{previewEdgeIds.length}</span>
        {' '}
        {UI_COPY.orchestratorTraversalSequencePreviewingSuffix}
      </section>
    )}
    </>
  )
}

interface GenericTraversalDetailsProps {
  lastTraversal: TraversalSummary
}

function GenericTraversalDetails({ lastTraversal }: GenericTraversalDetailsProps) {
  const {
    textSizeClass: uiPanelKeyValueTextSizeClass,
    fontClass: uiPanelTextFontClass,
    monospaceTextClass: uiPanelMonospaceTextClass,
  } = usePanelTypography()
  const uiPanelRowDensityCompactClass = useGraphStore(
    s => s.uiPanelRowDensityCompactClass || 'py-0.5',
  )
  if (lastTraversal.mode !== 'generic') return null
  return (
    <section className="space-y-1">
      <SimpleKeyValueRow
        label={<span className={UI_THEME_TOKENS.text.tertiary}>{UI_COPY.orchestratorTraversalGenericStartNodeLabel}</span>}
        textSizeClassName={uiPanelKeyValueTextSizeClass}
        fontClassName={uiPanelTextFontClass}
        densityClassName={uiPanelRowDensityCompactClass}
      >
        <span className={`${uiPanelMonospaceTextClass} break-words`}>
          {lastTraversal.startNodeId}
        </span>
      </SimpleKeyValueRow>
      <SimpleKeyValueRow
        label={<span className={UI_THEME_TOKENS.text.tertiary}>{UI_COPY.orchestratorTraversalGenericMaxDepthLabel}</span>}
        textSizeClassName={uiPanelKeyValueTextSizeClass}
        fontClassName={uiPanelTextFontClass}
        densityClassName={uiPanelRowDensityCompactClass}
      >
        <span className={`${uiPanelMonospaceTextClass} break-words`}>
          {lastTraversal.maxDepth}
        </span>
      </SimpleKeyValueRow>
      {lastTraversal.labelFilter.trim().length > 0 && (
        <SimpleKeyValueRow
          label={<span className={UI_THEME_TOKENS.text.tertiary}>{UI_COPY.orchestratorTraversalGenericEdgeLabelsLabel}</span>}
          textSizeClassName={uiPanelKeyValueTextSizeClass}
          fontClassName={uiPanelTextFontClass}
          densityClassName={uiPanelRowDensityCompactClass}
        >
          <span className={`${uiPanelMonospaceTextClass} break-words`}>
            {lastTraversal.labelFilter}
          </span>
        </SimpleKeyValueRow>
      )}
    </section>
  )
}
