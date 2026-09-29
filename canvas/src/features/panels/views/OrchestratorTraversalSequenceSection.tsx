import React from 'react'
import { ChevronDown } from 'lucide-react'
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
import IconButton from '@/components/IconButton'
import Tooltip from '@/features/panels/ui/Tooltip'
import { useGraphStore } from '@/hooks/useGraphStore'
import { getIconSizeClass } from '@/lib/ui/icons'
import {
  TRAVERSAL_SEQUENCE_TOOLTIP,
  TRAVERSAL_SEQUENCE_MODE_LABEL_GRAPH_RAG,
  TRAVERSAL_SEQUENCE_MODE_LABEL_GENERIC,
  UI_COPY,
} from '@/lib/config'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'

const traversalSectionPanelClassName = `mt-2 rounded border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} px-2 py-1`

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
  const uiIconScale = useGraphStore(s => s.uiIconScale)
  const iconSizeClass = getIconSizeClass(uiIconScale)
  const uiPanelKeyValueTextSizeClass = useGraphStore(
    s => s.uiPanelKeyValueTextSizeClass || 'text-sm',
  )
  const uiPanelTextFontClass = useGraphStore(
    s => s.uiPanelTextFontClass || 'font-sans',
  )
  const uiPanelMonospaceTextClass = useGraphStore(
    s => s.uiPanelMonospaceTextClass || 'font-mono text-xs',
  )
  const [traversalExpanded, setTraversalExpanded] = React.useState(false)
  const graphRagTraversal =
    lastTraversal && lastTraversal.mode === 'graphRag' ? lastTraversal : null
  const genericTraversal =
    lastTraversal && lastTraversal.mode === 'generic' ? lastTraversal : null

  return (
    <section className={traversalSectionPanelClassName}>
      <section className="flex items-center justify-between mb-1">
        <section className="flex flex-col">
          <Tooltip
            content={TRAVERSAL_SEQUENCE_TOOLTIP}
            maxWidthPx={260}
            contentClassName={`${UI_THEME_TOKENS.tooltip.bg} ${UI_THEME_TOKENS.tooltip.text}`}
          >
            <section
              className={[
                `flex items-center gap-1 font-semibold uppercase tracking-normal ${UI_THEME_TOKENS.text.tertiary}`,
                uiPanelKeyValueTextSizeClass,
                uiPanelTextFontClass,
              ].join(' ')}
            >
              <span>{UI_COPY.orchestratorTraversalSequenceTitle}</span>
            </section>
          </Tooltip>
          {lastTraversal && (
            <section
              className={[
                UI_THEME_TOKENS.text.tertiary,
                uiPanelKeyValueTextSizeClass,
                uiPanelTextFontClass,
              ].join(' ')}
            >
              {lastTraversal.mode === 'graphRag'
                ? TRAVERSAL_SEQUENCE_MODE_LABEL_GRAPH_RAG
                : TRAVERSAL_SEQUENCE_MODE_LABEL_GENERIC}
            </section>
          )}
        </section>
        <IconButton
          className="App-toolbar__btn flex items-center justify-center"
          title={
            traversalExpanded
              ? UI_COPY.orchestratorTraversalSequenceCollapseTitle
              : UI_COPY.orchestratorTraversalSequenceExpandTitle
          }
          onClick={() => setTraversalExpanded(prev => !prev)}
          showTooltip
        >
          <ChevronDown
            className={`${iconSizeClass} ${UI_THEME_TOKENS.text.secondary} transition-transform ${
              traversalExpanded ? 'rotate-180' : ''
            }`}
            aria-hidden="true"
          />
        </IconButton>
      </section>
      {!lastTraversal && traversalExpanded && null}
      {lastTraversal && traversalExpanded && (
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
  </section>
  )
}

interface GenericTraversalDetailsProps {
  lastTraversal: TraversalSummary
}

function GenericTraversalDetails({ lastTraversal }: GenericTraversalDetailsProps) {
  const uiPanelKeyValueTextSizeClass = useGraphStore(
    s => s.uiPanelKeyValueTextSizeClass || 'text-sm',
  )
  const uiPanelTextFontClass = useGraphStore(
    s => s.uiPanelTextFontClass || 'font-sans',
  )
  const uiPanelRowDensityCompactClass = useGraphStore(
    s => s.uiPanelRowDensityCompactClass || 'py-0.5',
  )
  const uiPanelMonospaceTextClass = useGraphStore(
    s => s.uiPanelMonospaceTextClass || 'font-mono text-xs',
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
