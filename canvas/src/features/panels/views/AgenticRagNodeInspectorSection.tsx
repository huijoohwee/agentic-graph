import { CollapsibleSection } from 'agentic-design-system/react/panels'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import React from 'react'
import {
  AGENTIC_RAG_CONTEXT_URL,
  AGENTIC_RAG_SCHEMA_URL,
  AGENTIC_RAG_GRAPH_RAG_PATH_IRI,
} from '@/lib/agenticrag'
import type { AgenticRagNodeView } from '@/lib/graph/types'
import { ORCHESTRATOR_AGENTIC_COPY } from '@/features/panels/config'
import { type AgenticPathInfo } from '@/features/panels/views/AgenticRagNodeInspectorSectionModel'
import { SimpleKeyValueRow } from 'grph-shared/react/keyTypeValueRow'
import { useGraphStore } from '@/hooks/useGraphStore'
import { getChipClass } from '@/lib/ui/icons'
import {
  AGENTIC_RAG_SCHEMA_LABEL,
  AGENTIC_RAG_CONTEXT_LABEL,
  GRAPHRAG_PATH_IRI_LABEL,
  AGENTIC_RAG_NODE_JSON_COPY_LABEL,
} from '@/lib/config'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'

const AGENTIC_RAG_NODE_INSPECTOR_DENSE_GRID_CLASS_NAME = 'grid min-w-0 grid-cols-1 gap-1 sm:grid-cols-2'

interface AgenticRagNodeInspectorSectionProps {
  selectedAgenticNode: AgenticRagNodeView | null
  agenticCopyStatus: string | null
  onCopyAgenticRagNodeJson: () => void
  agenticPathInfo: AgenticPathInfo | null
}

export function AgenticRagNodeInspectorSection({
  selectedAgenticNode,
  agenticCopyStatus,
  onCopyAgenticRagNodeJson,
  agenticPathInfo,
}: AgenticRagNodeInspectorSectionProps) {
  const {
    textSizeClass: uiPanelKeyValueTextSizeClass,
    fontClass: uiPanelTextFontClass,
    monospaceTextClass: uiPanelMonospaceTextClass,
  } = usePanelTypography()
  const uiIconPillBadgeTextSizeClass = useGraphStore(s => s.uiIconPillBadgeTextSizeClass)
  const uiPanelRowDensityCompactClass = useGraphStore(
    s => s.uiPanelRowDensityCompactClass || 'py-0.5',
  )
  const inspectorMutedTextClassName = `${uiPanelKeyValueTextSizeClass} ${uiPanelTextFontClass} ${UI_THEME_TOKENS.text.tertiary}`
  const inspectorBodyClassName = `text-xs ${UI_THEME_TOKENS.text.primary} space-y-1`
  const inspectorLabelClassName = UI_THEME_TOKENS.text.secondary

  return (
    <CollapsibleSection headingAs="h4" defaultCollapsed={false} stickyHeader={false}
      title={<span title={ORCHESTRATOR_AGENTIC_COPY.nodeInspectorTooltip}>{ORCHESTRATOR_AGENTIC_COPY.nodeInspectorTitle}</span>}
      actions={selectedAgenticNode && (
        <button
          type="button"
          className={[
            'App-toolbar__btn',
            UI_THEME_TOKENS.button.neutralMuted,
            UI_THEME_TOKENS.button.hoverBg,
            uiPanelKeyValueTextSizeClass,
            uiPanelTextFontClass,
          ].join(' ')}
          onClick={onCopyAgenticRagNodeJson}
        >
          {AGENTIC_RAG_NODE_JSON_COPY_LABEL}
        </button>
      )}
    >
      {agenticCopyStatus && selectedAgenticNode && (
        <section
          className={`${inspectorMutedTextClassName} mb-1`}
        >
          {agenticCopyStatus}
        </section>
      )}
      {!selectedAgenticNode && (
        <section className={`text-xs ${UI_THEME_TOKENS.text.tertiary} space-y-[2px]`}>
          <section>
            {ORCHESTRATOR_AGENTIC_COPY.nodeInspectorEmptyIntro}
          </section>
          <section>
            {ORCHESTRATOR_AGENTIC_COPY.nodeInspectorEmptyExample}
          </section>
          <section>
            {ORCHESTRATOR_AGENTIC_COPY.nodeInspectorEmptyProvenance}
          </section>
        </section>
      )}
      {selectedAgenticNode && (
        <section className={inspectorBodyClassName}>
          <section className={AGENTIC_RAG_NODE_INSPECTOR_DENSE_GRID_CLASS_NAME}>
            <SimpleKeyValueRow
              label={<span className={inspectorLabelClassName}>Id</span>}
              textSizeClassName={uiPanelKeyValueTextSizeClass}
              fontClassName={uiPanelTextFontClass}
              densityClassName={uiPanelRowDensityCompactClass}
            >
              <span className={`${uiPanelMonospaceTextClass} break-all`}>
                {selectedAgenticNode.id}
              </span>
            </SimpleKeyValueRow>
            <SimpleKeyValueRow
              label={<span className={inspectorLabelClassName}>Labels</span>}
              textSizeClassName={uiPanelKeyValueTextSizeClass}
              fontClassName={uiPanelTextFontClass}
              densityClassName={uiPanelRowDensityCompactClass}
            >
              <span className={`${uiPanelMonospaceTextClass} break-words`}>
                {selectedAgenticNode.labels.join(', ')}
              </span>
            </SimpleKeyValueRow>
          </section>
          <section className={AGENTIC_RAG_NODE_INSPECTOR_DENSE_GRID_CLASS_NAME}>
            {selectedAgenticNode.chunkText && (
              <SimpleKeyValueRow
                align="start"
                label={<span className={inspectorLabelClassName}>chunk_text</span>}
                textSizeClassName={uiPanelKeyValueTextSizeClass}
                fontClassName={uiPanelTextFontClass}
                densityClassName={uiPanelRowDensityCompactClass}
              >
                <span className={`${uiPanelMonospaceTextClass} break-words`}>
                  {String(selectedAgenticNode.chunkText).slice(0, 240)}
                  {String(selectedAgenticNode.chunkText).length > 240 ? '…' : ''}
                </span>
              </SimpleKeyValueRow>
            )}
            {selectedAgenticNode.embedding && (
              <SimpleKeyValueRow
                label={<span className={inspectorLabelClassName}>embedding</span>}
                textSizeClassName={uiPanelKeyValueTextSizeClass}
                fontClassName={uiPanelTextFontClass}
                densityClassName={uiPanelRowDensityCompactClass}
              >
                <span className={`${uiPanelMonospaceTextClass} break-words`}>
                  [{selectedAgenticNode.embedding.length} values]
                </span>
              </SimpleKeyValueRow>
            )}
            {selectedAgenticNode.geo && (
              <SimpleKeyValueRow
                label={<span className={inspectorLabelClassName}>geo</span>}
                textSizeClassName={uiPanelKeyValueTextSizeClass}
                fontClassName={uiPanelTextFontClass}
                densityClassName={uiPanelRowDensityCompactClass}
              >
                <span className={`${uiPanelMonospaceTextClass} break-words`}>
                  lat={selectedAgenticNode.geo.lat}, lng={selectedAgenticNode.geo.lng}
                </span>
              </SimpleKeyValueRow>
            )}
            {selectedAgenticNode.mediaKind && (
              <SimpleKeyValueRow
                label={<span className={inspectorLabelClassName}>media.kind</span>}
                textSizeClassName={uiPanelKeyValueTextSizeClass}
                fontClassName={uiPanelTextFontClass}
                densityClassName={uiPanelRowDensityCompactClass}
              >
                <span className={`${uiPanelMonospaceTextClass} break-words`}>
                  {selectedAgenticNode.mediaKind}
                </span>
              </SimpleKeyValueRow>
            )}
            {selectedAgenticNode.mediaUrl && (
              <SimpleKeyValueRow
                label={<span className={inspectorLabelClassName}>media.url</span>}
                textSizeClassName={uiPanelKeyValueTextSizeClass}
                fontClassName={uiPanelTextFontClass}
                densityClassName={uiPanelRowDensityCompactClass}
              >
                <span className={`${uiPanelMonospaceTextClass} break-all`}>
                  {selectedAgenticNode.mediaUrl}
                </span>
              </SimpleKeyValueRow>
            )}
          </section>
          {selectedAgenticNode.provenance && (
            <section className={AGENTIC_RAG_NODE_INSPECTOR_DENSE_GRID_CLASS_NAME}>
              {Object.entries(selectedAgenticNode.provenance).map(([key, value]) => {
                return (
                  <SimpleKeyValueRow
                    key={key}
                    align="start"
                    label={(
                      <span className={inspectorLabelClassName}>
                        provenance.{key}
                      </span>
                    )}
                    textSizeClassName={uiPanelKeyValueTextSizeClass}
                    fontClassName={uiPanelTextFontClass}
                    densityClassName={uiPanelRowDensityCompactClass}
                  >
                    <span className={`${uiPanelMonospaceTextClass} break-all`}>
                      {typeof value === 'string' ? value : JSON.stringify(value)}
                    </span>
                  </SimpleKeyValueRow>
                )
              })}
            </section>
          )}
          <section className={AGENTIC_RAG_NODE_INSPECTOR_DENSE_GRID_CLASS_NAME}>
            {selectedAgenticNode.graphRAGPath && (
              <SimpleKeyValueRow
                align="start"
                label={<span className={inspectorLabelClassName}>graphRAGPath</span>}
                textSizeClassName={uiPanelKeyValueTextSizeClass}
                fontClassName={uiPanelTextFontClass}
                densityClassName={uiPanelRowDensityCompactClass}
              >
                <span className={`${uiPanelMonospaceTextClass} break-words`}>
                  {JSON.stringify(selectedAgenticNode.graphRAGPath)}
                </span>
              </SimpleKeyValueRow>
            )}
            {agenticPathInfo && (
              <>
                <SimpleKeyValueRow
                  label={<span className={inspectorLabelClassName}>graphRAGPath type</span>}
                  textSizeClassName={uiPanelKeyValueTextSizeClass}
                  fontClassName={uiPanelTextFontClass}
                  densityClassName={uiPanelRowDensityCompactClass}
                >
                  <span
                    className={getChipClass('selected', {
                      textSizeClass: uiIconPillBadgeTextSizeClass,
                      textColorClass: UI_THEME_TOKENS.status.info,
                    })}
                  >
                    {agenticPathInfo.pathType}
                  </span>
                </SimpleKeyValueRow>
                {agenticPathInfo.query && (
                  <SimpleKeyValueRow
                    align="start"
                    label={<span className={inspectorLabelClassName}>query</span>}
                    textSizeClassName={uiPanelKeyValueTextSizeClass}
                    fontClassName={uiPanelTextFontClass}
                    densityClassName={uiPanelRowDensityCompactClass}
                  >
                    <span className={`${uiPanelMonospaceTextClass} break-words`}>
                      {agenticPathInfo.query}
                    </span>
                  </SimpleKeyValueRow>
                )}
                {agenticPathInfo.example && (
                  <SimpleKeyValueRow
                    align="start"
                    label={<span className={inspectorLabelClassName}>example</span>}
                    textSizeClassName={uiPanelKeyValueTextSizeClass}
                    fontClassName={uiPanelTextFontClass}
                    densityClassName={uiPanelRowDensityCompactClass}
                  >
                    <span className={`${uiPanelMonospaceTextClass} break-words`}>
                      {agenticPathInfo.example}
                    </span>
                  </SimpleKeyValueRow>
                )}
                {agenticPathInfo.traverse.length > 0 && (
                  <SimpleKeyValueRow
                    align="start"
                    label={<span className={inspectorLabelClassName}>traverse</span>}
                    textSizeClassName={uiPanelKeyValueTextSizeClass}
                    fontClassName={uiPanelTextFontClass}
                    densityClassName={uiPanelRowDensityCompactClass}
                  >
                    <span className="flex flex-wrap gap-1 mt-[1px]">
                      {agenticPathInfo.traverse.map(id => (
                        <span
                          key={`traverse-${String(id)}`}
                          className={getChipClass('default', {
                            textSizeClass: uiIconPillBadgeTextSizeClass,
                            textColorClass: UI_THEME_TOKENS.text.primary,
                            extraClassName: uiPanelMonospaceTextClass,
                          })}
                        >
                          {String(id)}
                        </span>
                      ))}
                    </span>
                  </SimpleKeyValueRow>
                )}
                {agenticPathInfo.hops.length > 0 && (
                  <SimpleKeyValueRow
                    align="start"
                    label={<span className={inspectorLabelClassName}>hops</span>}
                    textSizeClassName={uiPanelKeyValueTextSizeClass}
                    fontClassName={uiPanelTextFontClass}
                    densityClassName={uiPanelRowDensityCompactClass}
                  >
                    <span className="flex flex-wrap gap-1 mt-[1px]">
                      {agenticPathInfo.hops.map((hop, index) => (
                        <span
                          key={`hop-${index}-${hop}`}
                          className={getChipClass('default', {
                            textSizeClass: uiIconPillBadgeTextSizeClass,
                            textColorClass: UI_THEME_TOKENS.text.primary,
                            extraClassName: uiPanelMonospaceTextClass,
                          })}
                        >
                          {hop}
                        </span>
                      ))}
                    </span>
                  </SimpleKeyValueRow>
                )}
                {agenticPathInfo.multiHop.length > 0 && (
                  <SimpleKeyValueRow
                    align="start"
                    label={<span className={inspectorLabelClassName}>multiHop</span>}
                    textSizeClassName={uiPanelKeyValueTextSizeClass}
                    fontClassName={uiPanelTextFontClass}
                    densityClassName={uiPanelRowDensityCompactClass}
                  >
                    <span className="flex flex-wrap gap-1 mt-[1px]">
                      {agenticPathInfo.multiHop.map((hop, index) => (
                        <span
                          key={`multiHop-${index}-${hop}`}
                          className={getChipClass('default', {
                            textSizeClass: uiIconPillBadgeTextSizeClass,
                            textColorClass: UI_THEME_TOKENS.text.primary,
                            extraClassName: uiPanelMonospaceTextClass,
                          })}
                        >
                          {hop}
                        </span>
                      ))}
                    </span>
                  </SimpleKeyValueRow>
                )}
              </>
            )}
          </section>
          <section className={AGENTIC_RAG_NODE_INSPECTOR_DENSE_GRID_CLASS_NAME}>
            <SimpleKeyValueRow
              align="start"
              label={(
                <span className={inspectorLabelClassName}>
                  {AGENTIC_RAG_SCHEMA_LABEL}
                </span>
              )}
              textSizeClassName={uiPanelKeyValueTextSizeClass}
              fontClassName={uiPanelTextFontClass}
              densityClassName={uiPanelRowDensityCompactClass}
            >
              <span className={`${uiPanelMonospaceTextClass} break-all`}>
                {AGENTIC_RAG_SCHEMA_URL}
              </span>
            </SimpleKeyValueRow>
            <SimpleKeyValueRow
              align="start"
              label={(
                <span className={inspectorLabelClassName}>
                  {AGENTIC_RAG_CONTEXT_LABEL}
                </span>
              )}
              textSizeClassName={uiPanelKeyValueTextSizeClass}
              fontClassName={uiPanelTextFontClass}
              densityClassName={uiPanelRowDensityCompactClass}
            >
              <span className={`${uiPanelMonospaceTextClass} break-all`}>
                {AGENTIC_RAG_CONTEXT_URL}
              </span>
            </SimpleKeyValueRow>
            <SimpleKeyValueRow
              align="start"
              label={(
                <span className={inspectorLabelClassName}>
                  {GRAPHRAG_PATH_IRI_LABEL}
                </span>
              )}
              textSizeClassName={uiPanelKeyValueTextSizeClass}
              fontClassName={uiPanelTextFontClass}
              densityClassName={uiPanelRowDensityCompactClass}
            >
              <span className={`${uiPanelMonospaceTextClass} break-all`}>
                {AGENTIC_RAG_GRAPH_RAG_PATH_IRI}
              </span>
            </SimpleKeyValueRow>
          </section>
        </section>
      )}
    </CollapsibleSection>
  )
}
