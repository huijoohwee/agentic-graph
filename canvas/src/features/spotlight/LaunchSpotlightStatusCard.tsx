import React from 'react'
import { CheckCircle, AlertTriangle } from 'lucide-react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useParserUIState } from '@/features/parsers/uiState'
import { useSpotlightAnchor } from '@/features/spotlight/useSpotlightAnchor'
import { getSpotlightCardStyle } from '@/features/spotlight/positioning'
import StatusBadge from '@/features/panels/ui/StatusBadge'
import SchemaSummary from '@/features/panels/ui/SchemaSummary'
import { UI_LABELS } from '@/lib/config'
import { getLocalStorage } from '@/lib/persistence'
import { emitFlowResetZoomFloorCache } from '@/components/FlowCanvas/shared'
import { getBadgeChipClass, getIconSizeClass } from '@/lib/ui'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import {
  UI_RESPONSIVE_FLOATING_NOTICE_CARD_CLASSNAME,
  UI_RESPONSIVE_PANEL_TEXT_ACTION_BUTTON_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import { openSchemaConfigWorkspaceFile } from '@/features/panels/utils/schemaWorkspaceFiles'
import { formatSignedPx, formatZoomPercent } from '@/lib/canvas/viewport-format'
import { getCachedGraphLookup } from '@/lib/graph/lookupCache'
import { buildScopedGraphSemanticKey } from '@/lib/graph/semanticKey'
import { __canvasStartupDebug } from '@/features/canvas/canvasStartupDebug'
import { LAUNCH_SPOTLIGHT_VIEWPORT_STATUS_GRID_CLASS_NAME } from '@/features/spotlight/launchSpotlightResponsiveClasses'

type FlowWidgetTraceEntry = {
  ts?: number
  doc?: string
  graphNodes?: number
  graphEdges?: number
  openWidgetCount?: number
  overlayCount?: number
  overlayIdsHead?: string
}

const FLOW_QE_TRACE_LS_KEY = 'kg:debug:storyboardWidgetTrace'
const EMPTY_STRING_ARRAY: string[] = []
const spotlightCardClassName = `pointer-events-auto rounded-xl border ${UI_THEME_TOKENS.panel.border} bg-[color:var(--kg-panel-bg)]/95 shadow-lg px-4 py-3 ${UI_RESPONSIVE_FLOATING_NOTICE_CARD_CLASSNAME}`
const spotlightGhostButtonClassName = `${UI_THEME_TOKENS.text.tertiary} ${UI_THEME_TOKENS.button.hoverBg}`
const spotlightActionButtonBaseClassName = `${UI_RESPONSIVE_PANEL_TEXT_ACTION_BUTTON_CLASSNAME} inline-flex items-center justify-center rounded border`
const spotlightGhostActionButtonClassName = `${spotlightActionButtonBaseClassName} border-transparent ${spotlightGhostButtonClassName}`
const spotlightSecondaryActionButtonClassName = `${spotlightActionButtonBaseClassName} ${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.text.secondary} ${UI_THEME_TOKENS.button.hoverBg}`
const spotlightPrimaryActionButtonClassName = `${spotlightActionButtonBaseClassName} border-blue-600 text-blue-600 ${UI_THEME_TOKENS.button.hoverBg}`

type LaunchSpotlightStatusCardProps = {
  dismissed: boolean
  ready: boolean
  minimized: boolean
  setMinimized: (next: boolean) => void
}

export function resolveLaunchSpotlightRendererLabel(args: {
  canvasRenderMode: unknown
  canvas2dRenderer?: unknown
  canvas3dMode?: unknown
}): string {
  const canvasRenderMode = String(args.canvasRenderMode || '')
  if (canvasRenderMode === '2d') {
    const canvas2dRenderer = String(args.canvas2dRenderer || '').trim()
    return `2d${canvas2dRenderer ? `/${canvas2dRenderer}` : ''}`
  }
  if (canvasRenderMode === '3d') {
    const canvas3dMode = String(args.canvas3dMode || '').trim()
    if (canvas3dMode === 'xr') return 'XR'
    if (canvas3dMode === 'voxel') return 'Voxel'
    return '3d'
  }
  return canvasRenderMode
}

export function LaunchSpotlightStatusCard({
  dismissed,
  ready,
  minimized,
  setMinimized,
}: LaunchSpotlightStatusCardProps) {
  const enableSpotlight = useGraphStore(s => s.enableLaunchSpotlight)
  const graphData = useGraphStore(s => s.graphData)
  const graphDataRevision = useGraphStore(s => s.graphDataRevision || 0)
  const selectedNodeId = useGraphStore(s => s.selectedNodeId)
  const selectedNodeIds = useGraphStore(s => s.selectedNodeIds ?? EMPTY_STRING_ARRAY)
  const selectedEdgeIds = useGraphStore(s => s.selectedEdgeIds ?? EMPTY_STRING_ARRAY)
  const selectedGroupIds = useGraphStore(s => s.selectedGroupIds ?? EMPTY_STRING_ARRAY)
  const zoomState = useGraphStore(s => s.zoomState)
  const canvasRenderMode = useGraphStore(s => s.canvasRenderMode)
  const canvas3dMode = useGraphStore(s => s.canvas3dMode)
  const canvas2dRenderer = useGraphStore(s => s.canvas2dRenderer)
  const schema = useGraphStore(s => s.schema)
  const schemaImportLabel = useGraphStore(s => s.schemaImportLabel)
  const schemaOpOk = useGraphStore(s => s.schemaOpOk)
  const schemaOpMsg = useGraphStore(s => s.schemaOpMsg)
  const schemaLintCount = useGraphStore(s => s.schemaLintCount)
  const graphFieldsOpOk = useGraphStore(s => s.graphFieldsOpOk)
  const graphFieldsOpMsg = useGraphStore(s => s.graphFieldsOpMsg)
  const orchestratorOpOk = useGraphStore(s => s.orchestratorOpOk)
  const orchestratorOpMsg = useGraphStore(s => s.orchestratorOpMsg)
  const renderOpOk = useGraphStore(s => s.renderOpOk)
  const renderOpMsg = useGraphStore(s => s.renderOpMsg)
  const graphValidationStatus = useGraphStore(s => s.graphValidationStatus)
  const graphValidationTimestamp = useGraphStore(s => s.graphValidationTimestamp)
  const setEnableLaunchSpotlight = useGraphStore(s => s.setEnableLaunchSpotlight)
  const parserLoadOk = useParserUIState(s => s.parserLoadOk)
  const parserLoadMsg = useParserUIState(s => s.parserLoadMsg)
  const dataLoadOk = useParserUIState(s => s.dataLoadOk)
  const dataLoadMsg = useParserUIState(s => s.dataLoadMsg)

  const uiIconScale = useGraphStore(s => s.uiIconScale)
  const uiIconStrokeWidth = useGraphStore(s => s.uiIconStrokeWidth)
  const iconSizeClass = getIconSizeClass(uiIconScale)
  const uiPanelKeyValueTextSizeClass = useGraphStore(
    s => s.uiPanelKeyValueTextSizeClass || 'text-xs',
  )
  const uiIconBadgeChipClass = useGraphStore(s => s.uiIconBadgeChipClass)
  const uiIconBadgeChipTextSizeClass = useGraphStore(
    s => s.uiIconBadgeChipTextSizeClass || s.uiPanelMicroLabelTextSizeClass || 'text-[9px]',
  )

  const selectionCount =
    (Array.isArray(selectedNodeIds) ? selectedNodeIds.length : 0)
    + (Array.isArray(selectedEdgeIds) ? selectedEdgeIds.length : 0)
    + (Array.isArray(selectedGroupIds) ? selectedGroupIds.length : 0)

  const rendererLabel = resolveLaunchSpotlightRendererLabel({ canvasRenderMode, canvas2dRenderer, canvas3dMode })

  const graphValidationStatusText = React.useMemo(() => {
    const status = graphValidationStatus
    const ts = graphValidationTimestamp
    if (!ts || !graphData) {
      return 'Graph validation not run'
    }
    const now = Date.now()
    const diffMs = now - ts
    const safeDiffMs = Number.isFinite(diffMs) && diffMs > 0 ? diffMs : 0
    const diffMinutes = Math.floor(safeDiffMs / 60000)
    const diffSeconds = Math.floor(safeDiffMs / 1000)
    const timePhrase = diffMinutes > 0 ? `${diffMinutes}m ago` : diffSeconds <= 5 ? 'just now' : `${diffSeconds}s ago`
    const statusPhrase = status === 'invalid' ? 'completed with errors' : 'completed'
    return `Graph validation ${statusPhrase} ${timePhrase}`
  }, [graphValidationStatus, graphValidationTimestamp, graphData])
  const [debugNowMs, setDebugNowMs] = React.useState(() => Date.now())
  React.useEffect(() => {
    const id = window.setInterval(() => {
      setDebugNowMs(Date.now())
    }, 1000)
    return () => {
      window.clearInterval(id)
    }
  }, [])
  const workspaceSeedSyncDebugText = React.useMemo(() => {
    const ts = __canvasStartupDebug.workspaceSeedLastSyncAtMs
    const source = String(__canvasStartupDebug.workspaceSeedLastSyncSource || '').trim() || 'unknown'
    if (!ts) return 'Seed sync: pending'
    const diffMs = Math.max(0, debugNowMs - ts)
    const diffSeconds = Math.floor(diffMs / 1000)
    const diffMinutes = Math.floor(diffSeconds / 60)
    const ageLabel = diffMinutes > 0 ? `${diffMinutes}m ago` : diffSeconds <= 2 ? 'just now' : `${diffSeconds}s ago`
    return `Seed sync: ${ageLabel} · ${source}`
  }, [debugNowMs])

  const ingestionMetricsRecord = React.useMemo(() => {
    if (!graphData || !graphData.metadata || typeof graphData.metadata !== 'object' || Array.isArray(graphData.metadata)) {
      return null
    }
    const ingestionMetrics = (graphData.metadata as Record<string, unknown>).ingestionMetrics
    if (!ingestionMetrics || typeof ingestionMetrics !== 'object' || Array.isArray(ingestionMetrics)) {
      return null
    }
    return ingestionMetrics as Record<string, unknown>
  }, [graphData])

  const ingestionKindRaw = React.useMemo(() => {
    if (!ingestionMetricsRecord) return null
    const kind = ingestionMetricsRecord.kind
    return typeof kind === 'string' ? kind : null
  }, [ingestionMetricsRecord])

  const ingestionKindLabel = React.useMemo(() => {
    if (!ingestionKindRaw) return null
    if (ingestionKindRaw === 'markdown') return 'Markdown'
    if (ingestionKindRaw === 'markdown-large') return 'Markdown (summary)'
    if (ingestionKindRaw === 'jsonld') return 'JSON-LD'
    if (ingestionKindRaw === 'rawJson') return 'JSON'
    if (ingestionKindRaw === 'html') return 'HTML'
    if (ingestionKindRaw === 'csv') return 'CSV'
    return ingestionKindRaw
  }, [ingestionKindRaw])

  const ingestionKindChipClass = React.useMemo(
    () =>
      getBadgeChipClass('selected', {
        baseClass: uiIconBadgeChipClass,
        textSizeClass: uiIconBadgeChipTextSizeClass,
      }),
    [uiIconBadgeChipClass, uiIconBadgeChipTextSizeClass],
  )

  const { anchor, dragPos, cardRef, handleCardPointerDown } = useSpotlightAnchor({
    enabled: enableSpotlight,
    dismissed,
    ready,
    selector: null,
  })
  const shouldRender = enableSpotlight && !dismissed && ready

  const graphLookup = React.useMemo(() => {
    if (!graphData) return null
    const graphSemanticKey = buildScopedGraphSemanticKey('launch-spotlight-status-card-graph', {
      graphData,
      graphRevision: graphDataRevision,
    })
    return getCachedGraphLookup({
      cacheScope: 'launch-spotlight-status-card-graph',
      graphData,
      graphRevision: graphDataRevision,
      graphSemanticKey,
      preferCurrentGraphDataRefs: true,
    })
  }, [graphData, graphDataRevision])

  const selectedLabel = React.useMemo(() => {
    if (!selectedNodeId) return 'None'
    const found = graphLookup?.nodeById.get(selectedNodeId) || null
    return found && typeof found.label === 'string' && found.label.trim() ? found.label : selectedNodeId
  }, [graphLookup, selectedNodeId])

  const catalog = schema && schema.catalog
  const catalogNodeTypes = catalog && Array.isArray(catalog.nodeTypes) ? catalog.nodeTypes.length : 0
  const catalogEdgeLabels = catalog && Array.isArray(catalog.edgeLabels) ? catalog.edgeLabels.length : 0
  const fallbackNodeTypes =
    schema && schema.nodeStyles && typeof schema.nodeStyles === 'object' ? Object.keys(schema.nodeStyles).length : 0
  const fallbackEdgeLabels =
    schema && schema.edgeStyles && typeof schema.edgeStyles === 'object' ? Object.keys(schema.edgeStyles).length : 0
  const nodeTypes = catalogNodeTypes > 0 ? catalogNodeTypes : fallbackNodeTypes
  const edgeLabels = catalogEdgeLabels > 0 ? catalogEdgeLabels : fallbackEdgeLabels
  const nodesCount = graphData && Array.isArray(graphData.nodes) ? graphData.nodes.length : 0
  const edgesCount = graphData && Array.isArray(graphData.edges) ? graphData.edges.length : 0
  const hasValidationRun = !!graphValidationTimestamp && !!graphData
  const validationIcon = hasValidationRun
    ? graphValidationStatus === 'invalid'
      ? <AlertTriangle className={`${iconSizeClass} text-red-500`} strokeWidth={uiIconStrokeWidth} aria-hidden="true" />
      : <CheckCircle className={`${iconSizeClass} text-green-500`} strokeWidth={uiIconStrokeWidth} aria-hidden="true" />
    : null
  const validationTextClass =
    !hasValidationRun ? UI_THEME_TOKENS.text.primary : graphValidationStatus === 'invalid' ? UI_THEME_TOKENS.status.error : UI_THEME_TOKENS.status.success

  const handleClose = () => {
    setEnableLaunchSpotlight(false)
  }

  const handleMinimizeStatus = () => {
    setMinimized(true)
  }

  const handleReopenStatus = () => {
    setMinimized(false)
  }

  const cardStyle = getSpotlightCardStyle(anchor, dragPos, minimized)
  const schemaImport = typeof schemaImportLabel === 'string' ? schemaImportLabel.trim() : ''
  const schemaDetails = `${nodeTypes} node types · ${edgeLabels} edge labels`
  const devTraceEnabled = React.useMemo(() => {
    if (!import.meta.env.DEV) return false
    if (typeof window === 'undefined') return false
    try {
      return getLocalStorage()?.getItem(FLOW_QE_TRACE_LS_KEY) === '1'
    } catch {
      return false
    }
  }, [])

  const handleSummarizeWidgetTrace = React.useCallback(() => {
    if (typeof window === 'undefined') return
    const w = window as Window & { __AG_STORYBOARD_WIDGET_QE_TRACE__?: Array<Record<string, unknown>> }
    const rows = Array.isArray(w.__AG_STORYBOARD_WIDGET_QE_TRACE__) ? w.__AG_STORYBOARD_WIDGET_QE_TRACE__ : []
    const normalized = rows.map(r => ({
      ts: typeof r.ts === 'number' ? r.ts : 0,
      doc: typeof r.doc === 'string' ? r.doc : '',
      graphNodes: typeof r.graphNodes === 'number' ? r.graphNodes : 0,
      graphEdges: typeof r.graphEdges === 'number' ? r.graphEdges : 0,
      openWidgetCount: typeof r.openWidgetCount === 'number' ? r.openWidgetCount : 0,
      overlayCount: typeof r.overlayCount === 'number' ? r.overlayCount : 0,
      overlayIdsHead: typeof r.overlayIdsHead === 'string' ? r.overlayIdsHead : '',
    })) as FlowWidgetTraceEntry[]
    let drops = 0
    let spikes = 0
    for (let i = 1; i < normalized.length; i += 1) {
      const prev = normalized[i - 1]
      const curr = normalized[i]
      if ((prev.overlayCount || 0) > 0 && (curr.overlayCount || 0) === 0) drops += 1
      if ((prev.overlayCount || 0) === 0 && (curr.overlayCount || 0) > 0) spikes += 1
    }
    const last = normalized.length > 0 ? normalized[normalized.length - 1] : null
    const summary = {
      samples: normalized.length,
      drops,
      spikes,
      lastDoc: last?.doc || '',
      lastGraphNodes: last?.graphNodes || 0,
      lastGraphEdges: last?.graphEdges || 0,
      lastOpenWidgets: last?.openWidgetCount || 0,
      lastOverlayCount: last?.overlayCount || 0,
      lastOverlayIdsHead: last?.overlayIdsHead || '',
      latestEntries: normalized.slice(-8),
    }
    console.info('[StoryboardWidget][WidgetTrace][Summary]', summary)
  }, [])
  const handleResetZoomFloorCache = React.useCallback(() => {
    if (typeof window === 'undefined') return
    try {
      emitFlowResetZoomFloorCache()
      console.info('[StoryboardWidget][ZoomFloorCache] reset requested')
    } catch {
      void 0
    }
  }, [])
  const widgetTraceBadge = React.useMemo(() => {
    if (!devTraceEnabled) return null
    if (typeof window === 'undefined') return null
    const w = window as Window & { __AG_STORYBOARD_WIDGET_QE_TRACE__?: Array<Record<string, unknown>> }
    const rows = Array.isArray(w.__AG_STORYBOARD_WIDGET_QE_TRACE__) ? w.__AG_STORYBOARD_WIDGET_QE_TRACE__ : []
    let drops = 0
    let spikes = 0
    for (let i = 1; i < rows.length; i += 1) {
      const prev = rows[i - 1]
      const curr = rows[i]
      const prevOverlay = typeof prev?.overlayCount === 'number' ? prev.overlayCount : 0
      const currOverlay = typeof curr?.overlayCount === 'number' ? curr.overlayCount : 0
      if (prevOverlay > 0 && currOverlay === 0) drops += 1
      if (prevOverlay === 0 && currOverlay > 0) spikes += 1
    }
    const last = rows.length > 0 ? rows[rows.length - 1] : null
    const lastOverlayCount = typeof last?.overlayCount === 'number' ? last.overlayCount : 0
    return { drops, spikes, samples: rows.length, lastOverlayCount }
  }, [devTraceEnabled])

  if (!shouldRender) return null

  return (
    <section className="fixed inset-0 z-[2000] pointer-events-none">
      <section
        ref={cardRef}
        className={`${spotlightCardClassName} ${minimized ? 'cursor-default' : 'cursor-move'}`}
        onPointerDown={minimized ? undefined : handleCardPointerDown}
        style={cardStyle}
      >
        {minimized ? (
          <section className="flex items-center justify-between">
            <span className={`${uiPanelKeyValueTextSizeClass} ${UI_THEME_TOKENS.text.secondary}`}>Status</span>
            <section className="flex items-center gap-2">
              <button
                type="button"
                className={`${uiPanelKeyValueTextSizeClass} ${spotlightGhostActionButtonClassName}`}
                onClick={handleClose}
              >
                Close
              </button>
              <button
                type="button"
                className={`${uiPanelKeyValueTextSizeClass} ${spotlightPrimaryActionButtonClassName}`}
                onClick={handleReopenStatus}
              >
                Reopen
              </button>
            </section>
          </section>
        ) : (
          <>
            <section className="flex items-start justify-between mb-2">
              <section className="flex flex-col gap-0.5">
                <span className={`${uiPanelKeyValueTextSizeClass} font-medium uppercase tracking-wide ${UI_THEME_TOKENS.text.tertiary}`}>Status Panel</span>
                <section className={`text-sm font-semibold ${UI_THEME_TOKENS.text.primary}`}>Status</section>
              </section>
              <button
                type="button"
                className={`${uiPanelKeyValueTextSizeClass} ${spotlightGhostActionButtonClassName}`}
                onClick={handleMinimizeStatus}
              >
                Minimize
              </button>
            </section>
            <section className="space-y-2">
              <section className="flex flex-wrap items-start gap-2">
                <StatusBadge label={UI_LABELS.data} ok={dataLoadOk} msg={dataLoadMsg} />
                <StatusBadge label={UI_LABELS.parser} ok={parserLoadOk} msg={parserLoadMsg} />
                <StatusBadge
                  label="Schema Configurator"
                  ok={schemaOpOk}
                  msg={schemaOpMsg}
                  details={schemaDetails}
                  below
                />
                <StatusBadge label={UI_LABELS.graphFields} ok={graphFieldsOpOk} msg={graphFieldsOpMsg} />
                <StatusBadge label={UI_LABELS.orchestrator} ok={orchestratorOpOk} msg={orchestratorOpMsg} />
                <StatusBadge label={UI_LABELS.renderer} ok={renderOpOk} msg={renderOpMsg} />
                {ingestionKindLabel && (
                  <span className={ingestionKindChipClass}>
                    {ingestionKindLabel}
                  </span>
                )}
              </section>
              <section className={`text-xs ${UI_THEME_TOKENS.text.primary} space-y-2`}>
                <section>
                  <section className={`${uiPanelKeyValueTextSizeClass} font-medium uppercase tracking-wide ${UI_THEME_TOKENS.text.tertiary} mb-0.5`}>
                    Graph state
                  </section>
                  <section>
                    GraphData: {nodesCount.toLocaleString()} nodes · {edgesCount.toLocaleString()} edges
                  </section>
                  <section className={`${UI_THEME_TOKENS.text.tertiary}`}>{workspaceSeedSyncDebugText}</section>
                  <section>Selected: {selectedLabel}</section>
                  {schemaImport ? <section>Import: {schemaImport}</section> : null}
                  {widgetTraceBadge ? (
                    <section className="mt-1">
                      <span className={ingestionKindChipClass}>
                        QE d/s {widgetTraceBadge.drops}/{widgetTraceBadge.spikes} · n={widgetTraceBadge.samples}
                      </span>
                      <span className={`${ingestionKindChipClass} ml-1`}>
                        g/o {nodesCount.toLocaleString()}/{widgetTraceBadge.lastOverlayCount.toLocaleString()}
                      </span>
                    </section>
                  ) : null}
                  {devTraceEnabled ? (
                    <section className="mt-1">
                      <button
                        type="button"
                        className={`${uiPanelKeyValueTextSizeClass} ${spotlightSecondaryActionButtonClassName} mr-1`}
                        onClick={handleResetZoomFloorCache}
                      >
                        Reset Zoom Floor (dev)
                      </button>
                      <button
                        type="button"
                        className={`${uiPanelKeyValueTextSizeClass} ${spotlightSecondaryActionButtonClassName}`}
                        onClick={handleSummarizeWidgetTrace}
                      >
                        QE Trace Summary (dev)
                      </button>
                    </section>
                  ) : null}

                  <section className="mt-2" aria-label="Viewport status">
                    <h3 className={`${uiPanelKeyValueTextSizeClass} font-medium uppercase tracking-wide ${UI_THEME_TOKENS.text.tertiary} mb-0.5`}>
                      Viewport
                    </h3>
                    <dl className={LAUNCH_SPOTLIGHT_VIEWPORT_STATUS_GRID_CLASS_NAME}>
                      <dt className="font-semibold">Zoom</dt>
                      <dd className="font-mono">{formatZoomPercent(zoomState?.k)}</dd>
                      <dt className="font-semibold">Pan</dt>
                      <dd className="font-mono">
                        {formatSignedPx(zoomState?.x)} {formatSignedPx(zoomState?.y)}
                      </dd>
                      <dt className="font-semibold">Selection</dt>
                      <dd className="font-mono">{selectionCount.toLocaleString()}</dd>
                      <dt className="font-semibold">Renderer</dt>
                      <dd className="font-mono">{rendererLabel}</dd>
                    </dl>
                  </section>
                </section>
                <section>
                  <section className={`${uiPanelKeyValueTextSizeClass} font-medium uppercase tracking-wide ${UI_THEME_TOKENS.text.tertiary} mb-0.5`}>
                    Validation
                  </section>
                  <section className="flex items-center gap-1 mb-1">
                    {validationIcon}
                    <span className={validationTextClass}>{graphValidationStatusText}</span>
                  </section>
                  <section className={`${uiPanelKeyValueTextSizeClass} ${UI_THEME_TOKENS.text.secondary}`}>
                    <SchemaSummary
                      variant="full"
                      showTitle={false}
                      showSchemaSummary={false}
                      showDataSummary={false}
                      showLintSummary
                      onOpenSchemaUiEditor={() => openSchemaConfigWorkspaceFile()}
                    />
                  </section>
                  {typeof schemaLintCount === 'number' && schemaLintCount > 0 && (
                    <section className={`mt-1 ${uiPanelKeyValueTextSizeClass} ${UI_THEME_TOKENS.text.secondary}`}>
                      {schemaLintCount.toLocaleString()} schema lint issue{schemaLintCount === 1 ? '' : 's'} detected
                    </section>
                  )}
                </section>
              </section>
            </section>
            <section className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                className={`${uiPanelKeyValueTextSizeClass} ${spotlightSecondaryActionButtonClassName}`}
                onClick={handleClose}
              >
                Close
              </button>
            </section>
          </>
        )}
      </section>
    </section>
  )
}
