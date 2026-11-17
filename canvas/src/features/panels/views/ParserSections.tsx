import React from 'react'
import CollapsibleSection from '@/features/panels/ui/CollapsibleSection'
import Tooltip from 'agentic-design-system/react/hover'
import { ORCHESTRATOR_AGENTIC_COPY, PARSER_STEP_COPY, PIPELINE_STAGE_COPY } from '@/features/panels/config'
import { noParserMatchMessage, firstWarningText } from '@/features/parsers/uiUtils'
import { useGraphStore } from '@/hooks/useGraphStore'
import { validateGraphDataWithSchema } from '@/lib/graph/validation'
import { getJsonLdGraphMappingSummary, getAgenticRagContextComparison } from '@/lib/graph/jsonld/index'
import type { GraphData, JSONValue, JsonLdGraphMappingConfig } from '@/lib/graph/types'
import type { ParserSelectionSectionProps, ParserDataSectionProps } from '@/features/panels/views/ParserSectionsModel'
import {
  AGENTIC_RAG_CONTEXT_URL,
  AGENTIC_RAG_EDGE_TYPE_IRI,
  AGENTIC_RAG_GRAPH_RAG_PATH_IRI,
  AGENTIC_RAG_NODE_TYPE_IRI,
  AGENTIC_RAG_SCHEMA_URL,
} from '@/lib/agenticrag'
import {
  PARSER_JSONLD_EDGE_MAPPING_PIPELINE_DESCRIPTION,
} from '@/lib/config'
import { getPillClass, getChipClass } from '@/lib/ui'
import {
  uiPrimaryToggleActiveClassName,
  uiPrimaryIconInactiveClassName,
} from '@/features/toolbar/ui/toolbarStyles'
import { UI_RESPONSIVE_BADGE_CHIP_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

export function ParserSelectionSection({
  parsersCollapsed,
  onParsersCollapsedChange,
  detection,
  embedded,
}: ParserSelectionSectionProps) {
  const parserMessage = noParserMatchMessage(detection.attemptedAutoDetect, detection.inputText)
  const warningText = firstWarningText(detection.warnings)
  const hasSelectedSpec = detection.hasSelectedSpec

  const copy = PARSER_STEP_COPY.parserSelection
  const uiPanelKeyValueTextSizeClass = useGraphStore(
    s => s.uiPanelKeyValueTextSizeClass || 'text-sm',
  )
  const uiPanelTextFontClass = useGraphStore(
    s => s.uiPanelTextFontClass || 'font-sans',
  )
  const badgeClassName = [
    uiPanelKeyValueTextSizeClass,
    uiPanelTextFontClass,
    `font-semibold ${UI_THEME_TOKENS.text.tertiary}`,
  ].join(' ')
  const titleClassName = `text-xs font-semibold ${UI_THEME_TOKENS.text.primary}`
  const descriptionClassName = [
    uiPanelKeyValueTextSizeClass,
    uiPanelTextFontClass,
    UI_THEME_TOKENS.text.secondary,
  ].join(' ')

  const info = (
    <>
      {!hasSelectedSpec && parserMessage && (
        <section className={`text-xs mb-2 px-2 py-1 rounded border ${UI_THEME_TOKENS.status.warning}`}>
          {parserMessage}
        </section>
      )}
      {warningText && <section className="text-xs text-amber-700">{warningText}</section>}
    </>
  )

  if (embedded) {
    return (
      <section className="mt-1">
        <section className="mt-2">{info}</section>
      </section>
    )
  }

  return (
    <CollapsibleSection
      title={
        <section className="flex flex-col">
          <span className="inline-flex items-center gap-2">
            <span className={badgeClassName}>
              {copy.badge}
            </span>
            {copy.tooltip ? (
              <Tooltip
                content={copy.tooltip}
                maxWidthPx={260}

              >
                <span className={titleClassName}>
                  {copy.title}
                </span>
              </Tooltip>
            ) : (
              <span className={titleClassName}>
                {copy.title}
              </span>
            )}
          </span>
          {copy.descriptionShort && (
            <span className={descriptionClassName}>
              {copy.descriptionShort}
            </span>
          )}
        </section>
      }
      collapsed={parsersCollapsed}
      onToggle={v => onParsersCollapsedChange(v)}
    >
      {info}
    </CollapsibleSection>
  )
}

export function ParserDataSection({
  inputCollapsed,
  onInputCollapsedChange,
  embedded,
  showMetrics = true,
}: ParserDataSectionProps) {
  const schema = useGraphStore(s => s.schema)
  const data = useGraphStore(s => s.graphData)
  const setGraphData = useGraphStore(s => s.setGraphData)
  const uiIconPillBadgeTextSizeClass = useGraphStore(s => s.uiIconPillBadgeTextSizeClass)
  const uiPanelMonospaceTextClass = useGraphStore(
    s => s.uiPanelMonospaceTextClass || 'font-mono text-xs',
  )
  const uiPanelKeyValueTextSizeClass = useGraphStore(
    s => s.uiPanelKeyValueTextSizeClass || 'text-sm',
  )
  const uiPanelTextFontClass = useGraphStore(
    s => s.uiPanelTextFontClass || 'font-sans',
  )
  const badgeClassName = [
    uiPanelKeyValueTextSizeClass,
    uiPanelTextFontClass,
    `font-semibold ${UI_THEME_TOKENS.text.tertiary}`,
  ].join(' ')
  const titleClassName = `text-xs font-semibold ${UI_THEME_TOKENS.text.primary}`
  const descriptionClassName = [
    uiPanelKeyValueTextSizeClass,
    uiPanelTextFontClass,
    UI_THEME_TOKENS.text.secondary,
  ].join(' ')
  const bodyTextClassName = [
    'mt-1 space-y-1',
    uiPanelKeyValueTextSizeClass,
    uiPanelTextFontClass,
    UI_THEME_TOKENS.text.secondary,
  ].join(' ')
  const tertiaryTextClassName = UI_THEME_TOKENS.text.tertiary

  const validation = React.useMemo(() => validateGraphDataWithSchema(data, schema), [data, schema])

  const jsonLdMapping = React.useMemo(
    () => getJsonLdGraphMappingSummary(data as GraphData | null),
    [data],
  )

  const agenticContext = React.useMemo(
    () => getAgenticRagContextComparison(data as GraphData | null),
    [data],
  )

  const handleToggleJsonLdEdgeProp = React.useCallback(
    (key: string, nextChecked: boolean) => {
      if (!data || data.type !== 'Graph') return
      if (!key || !key.trim()) return
      const current = data as GraphData
      const meta = isRecord(current.metadata)
        ? (current.metadata as Record<string, unknown>)
        : {}
      const rawCfg = meta.jsonLdMapping
      const cfg: JsonLdGraphMappingConfig = isRecord(rawCfg)
        ? (rawCfg as JsonLdGraphMappingConfig)
        : {}
      const existingList = Array.isArray(cfg.contextEdgeProperties)
        ? cfg.contextEdgeProperties.filter(entry => typeof entry === 'string')
        : []
      const nextList = (() => {
        if (nextChecked) {
          if (existingList.includes(key)) return existingList
          return [...existingList, key]
        }
        return existingList.filter(entry => entry !== key)
      })()
      const nextCfg: JsonLdGraphMappingConfig = {
        ...cfg,
        contextEdgeProperties: nextList,
      }
      const nextMeta: Record<string, JSONValue> = {
        ...meta,
        jsonLdMapping: nextCfg as JSONValue,
      }
      const nextData: GraphData = {
        ...current,
        metadata: nextMeta,
      }
      setGraphData(nextData)
    },
    [data, setGraphData],
  )

  const copy = PARSER_STEP_COPY.parserData

  const content = (
    <>
      <section className="mt-2">
        <section className={bodyTextClassName}>
          {showMetrics && (
            <>
              <section>
                Metrics:
                {' '}
                {validation.metrics.nodeCount}
                {' '}
                nodes ·
                {' '}
                {validation.metrics.edgeCount}
                {' '}
                edges
                {validation.metrics.duplicateNodeIdCount > 0 && (
                  <>
                    {' · '}
                    {validation.metrics.duplicateNodeIdCount}
                    {' '}
                    duplicate IDs
                  </>
                )}
                {validation.metrics.danglingEdgeCount > 0 && (
                  <>
                    {' · '}
                    {validation.metrics.danglingEdgeCount}
                    {' '}
                    dangling edges
                  </>
                )}
                {validation.metrics.maxDegree > 0 && (
                  <>
                    {' · max degree '}
                    {validation.metrics.maxDegree}
                  </>
                )}
                {validation.metrics.nodesWithoutTypeCount > 0 && (
                  <>
                    {' · '}
                    {validation.metrics.nodesWithoutTypeCount}
                    {' '}
                    nodes without type
                  </>
                )}
                {validation.metrics.edgesWithoutLabelCount > 0 && (
                  <>
                    {' · '}
                    {validation.metrics.edgesWithoutLabelCount}
                    {' '}
                    edges without label
                  </>
                )}
              </section>
              {(Object.keys(validation.metrics.nodeTypeCounts || {}).length > 0 ||
                Object.keys(validation.metrics.edgeLabelCounts || {}).length > 0 ||
                (validation.metrics.degreeHistogram || []).length > 0) && (
                <section>
                  Distribution:
                  {' '}
                  {Object.keys(validation.metrics.nodeTypeCounts || {}).length}
                  {' '}
                  node types ·
                  {' '}
                  {Object.keys(validation.metrics.edgeLabelCounts || {}).length}
                  {' '}
                  edge labels
                  {Array.isArray(validation.metrics.degreeHistogram) && validation.metrics.degreeHistogram.length > 0 && (() => {
                    const entries = validation.metrics.degreeHistogram
                      .map((count, degree) => ({ degree, count }))
                      .filter(entry => entry.count && entry.degree >= 0)
                      .slice(0, 3)
                    if (!entries.length) return null
                    const text = entries
                      .map(entry => `${entry.degree}:${entry.count}`)
                      .join(', ')
                    return (
                      <>
                        {' · degree '}
                        {text}
                      </>
                    )
                  })()}
                </section>
              )}
            </>
          )}
          {jsonLdMapping && (
            <section className={`mt-1 space-y-0.5 ${UI_THEME_TOKENS.text.secondary}`}>
              <section>
                JSON-LD graph mapping:
                {' '}
                {jsonLdMapping.nodeCount}
                {' '}
                nodes ·
                {' '}
                {jsonLdMapping.edgeCount}
                {' '}
                edges
              </section>
              {jsonLdMapping.edgeProps.length > 0 && (
                <section className="space-y-0.5">
                  <section>
                    Edge properties from @context (@id):
                  </section>
                  <section className="flex flex-wrap gap-1">
                    {jsonLdMapping.edgeProps.map(key => {
                      const checked = jsonLdMapping.selectedEdgeProps.includes(key)
                      const baseClass = `focus-visible:outline-none ${UI_THEME_TOKENS.focus.primaryRing}`
                      const variantClassOptions = checked
                        ? {
                            textColorClass: 'text-blue-700',
                            extraClassName: uiPrimaryToggleActiveClassName,
                          }
                        : {
                          textColorClass: `${uiPrimaryIconInactiveClassName} ${UI_THEME_TOKENS.text.secondary}`,
                          extraClassName: `${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.panel.bg}`,
                          }
                      return (
                        <button
                          key={key}
                          type="button"
                          className={getChipClass(checked ? 'selected' : 'default', {
                            baseClass,
                            textSizeClass: uiPanelKeyValueTextSizeClass,
                            ...variantClassOptions,
                          })}
                          onClick={() => handleToggleJsonLdEdgeProp(key, !checked)}
                        >
                          {checked ? '✓ ' : ''}
                          {key}
                        </button>
                      )
                    })}
                  </section>
                </section>
              )}
              {jsonLdMapping.sampleNodes.length > 0 && (
                <section>
                  Sample node mapping:
                  {' '}
                  {jsonLdMapping.sampleNodes
                    .map(sample => `${sample.id} ⟶ type=${sample.type}, label=${sample.label}`)
                    .join(' · ')}
                </section>
              )}
                  {jsonLdMapping.edgeProps.length > 0 && (
                <>
                  <section className={`mt-0.5 ${tertiaryTextClassName}`}>
                    {PARSER_JSONLD_EDGE_MAPPING_PIPELINE_DESCRIPTION}
                  </section>
                  <section className={`mt-0.5 ${tertiaryTextClassName}`}>
                    {ORCHESTRATOR_AGENTIC_COPY.schemaLabel}
                    {' '}
                    <span className={`${uiPanelMonospaceTextClass} break-all`}>
                      {AGENTIC_RAG_SCHEMA_URL}
                    </span>
                  </section>
                  <section className={tertiaryTextClassName}>
                    <span
                      className={getPillClass('badge', {
                        baseClass:
                          `inline-flex items-center ${UI_RESPONSIVE_BADGE_CHIP_CLASSNAME} mr-1 rounded border ${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.button.neutralSubtle}`,
                        badgeTextSizeClass: uiIconPillBadgeTextSizeClass,
                        textColorClass: UI_THEME_TOKENS.text.secondary,
                      })}
                    >
                      {PIPELINE_STAGE_COPY.ingestValidate.badge}
                    </span>
                    AgenticRAG edge context:
                    {' '}
                    <span className={`${uiPanelMonospaceTextClass} break-all`}>
                      {AGENTIC_RAG_CONTEXT_URL}
                    </span>
                    {agenticContext && agenticContext.graphContextUrl && (
                      <>
                        {' '}
                        {ORCHESTRATOR_AGENTIC_COPY.datasetContextVocabLabel}
                        {' '}
                        <span className={`${uiPanelMonospaceTextClass} break-all`}>
                          {agenticContext.graphContextUrl}
                        </span>
                        {agenticContext.isCanonicalMatch === true && ' (matches)'}
                        {agenticContext.isCanonicalMatch === false && ' (differs)'}
                      </>
                    )}
                  </section>
                  <section className={tertiaryTextClassName}>
                    {ORCHESTRATOR_AGENTIC_COPY.graphRagPathIriLabel}
                    {' '}
                    <span className={`${uiPanelMonospaceTextClass} break-all`}>
                      {AGENTIC_RAG_GRAPH_RAG_PATH_IRI}
                    </span>
                  </section>
                  <section className={tertiaryTextClassName}>
                    Node type IRI:
                    {' '}
                    <span className={`${uiPanelMonospaceTextClass} break-all`}>
                      {AGENTIC_RAG_NODE_TYPE_IRI}
                    </span>
                  </section>
                  <section className={tertiaryTextClassName}>
                    Edge type IRI:
                    {' '}
                    <span className={`${uiPanelMonospaceTextClass} break-all`}>
                      {AGENTIC_RAG_EDGE_TYPE_IRI}
                    </span>
                  </section>
                </>
              )}
            </section>
          )}
          {(validation.errors.length > 0 || validation.warnings.length > 0) && (
            <section className="space-y-0.5">
              {validation.errors.length > 0 && (
                <section
                  className={[
                    uiPanelKeyValueTextSizeClass,
                    uiPanelTextFontClass,
                    'text-red-600',
                  ].join(' ')}
                >
                  Errors:
                  {' '}
                  {validation.errors.slice(0, 3).join('; ')}
                  {validation.errors.length > 3 && '; …'}
                </section>
              )}
              {validation.warnings.length > 0 && (
                <section
                  className={[
                    uiPanelKeyValueTextSizeClass,
                    uiPanelTextFontClass,
                    'text-amber-700',
                  ].join(' ')}
                >
                  Warnings:
                  {' '}
                  {validation.warnings.slice(0, 3).join('; ')}
                  {validation.warnings.length > 3 && '; …'}
                </section>
              )}
            </section>
          )}
        </section>
      </section>
    </>
  )

  if (embedded) {
    return <section className="mt-1">{content}</section>
  }

  return (
    <CollapsibleSection
      title={
        <section className="flex flex-col">
          <span className="inline-flex items-center gap-2">
            <span className={badgeClassName}>
              {copy.badge}
            </span>
            {copy.tooltip ? (
              <Tooltip
                content={copy.tooltip}
                maxWidthPx={260}

              >
                <span className={titleClassName}>
                  {copy.title}
                </span>
              </Tooltip>
            ) : (
              <span className={titleClassName}>
                {copy.title}
              </span>
            )}
          </span>
          {copy.descriptionShort && (
            <span className={descriptionClassName}>
              {copy.descriptionShort}
            </span>
          )}
        </section>
      }
      collapsed={inputCollapsed}
      onToggle={v => onInputCollapsedChange(v)}
    >
      {content}
    </CollapsibleSection>
  )
}
