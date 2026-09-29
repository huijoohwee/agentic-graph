import './graph-fields/graphFieldLayout.css'
import { PanelSelect } from '@/lib/ui/panelFormControls'
import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { UI_ANCHORS, UI_COPY } from '@/lib/config'
import MainPanelBody from '@/features/panels/ui/MainPanelBody'
import MainPanelGraphFieldsHeader, { type MainPanelGraphFieldsLegendEntry } from '@/features/panels/ui/MainPanelGraphFieldsHeader'
import {
  AGENTIC_RAG_FIELD_KIND_META,
  getAgenticRagFieldKind,
  getCachedDerivedFields,
  parseGraphFieldId,
  type GraphField,
  type GraphFieldId,
} from '@/features/graph-fields/graphFields'
import GraphFieldsListPanel from '@/features/panels/views/graph-fields/GraphFieldsListPanel'
import FieldSettingsPanel from '@/features/panels/views/graph-fields/FieldSettingsPanel'
import { normalized } from '@/features/panels/utils/json'
import { useActiveGraphRenderData } from '@/hooks/useActiveGraphData'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import {
  GRAPH_FIELDS_MAIN_LIST_PANE_CLASS_NAME,
  GRAPH_FIELDS_MAIN_SETTINGS_PANE_CLASS_NAME,
  GRAPH_FIELDS_MAIN_SPLIT_GRID_CLASS_NAME,
} from '@/features/panels/views/graph-fields/graphFieldResponsiveClasses'
import {
  isGraphFieldsSelectionInspectorEntryLabel,
  resolveGraphFieldsEntryCommandTarget,
} from '@/features/panels/views/graph-fields/graphFieldsEntryCommands'

export type GraphFieldsSelectedView =
  | { kind: 'globalSchema' }
  | {
      kind: 'localSchema'
      facet: 'template' | 'properties' | 'validation' | 'localRules'
      category: 'global' | 'base' | 'custom' | 'derived'
      scope: 'node' | 'edge'
      ownerKey: string
    }
  | { kind: 'selectionInspector' }
  | null

const GraphRecordSelectionInspectorLazy = React.lazy(
  () => import('@/features/graph-inspector/ui/GraphRecordSelectionInspector'),
)

type GraphFieldsViewProps = {
  onStatusChange: (msg: string) => void
  searchQuery?: string
  embedded?: boolean
  entryShortcutLabels?: ReadonlyArray<string>
  onEntryShortcutClick?: ((label: string) => void) | null
  entryOpenRequest?: {
    token: number
    entryLabel: string
  } | null
}

export default function GraphFieldsView({
  onStatusChange,
  searchQuery,
  embedded = false,
  entryShortcutLabels = [],
  onEntryShortcutClick = null,
  entryOpenRequest = null,
}: GraphFieldsViewProps) {
  const graphData = useActiveGraphRenderData()
  const graphDataRevision = useGraphStore(s => s.graphDataRevision)
  const upsertUiToast = useGraphStore(s => s.upsertUiToast)
  const dismissUiToast = useGraphStore(s => s.dismissUiToast)
  const settingsById = useGraphStore(s => s.graphFieldSettingsById)
  const patchGraphFieldSetting = useGraphStore(s => s.patchGraphFieldSetting)
  const removeGraphFieldSetting = useGraphStore(s => s.removeGraphFieldSetting)
  const graphDataTableVisibleColumns = useGraphStore(s => s.graphDataTableVisibleColumns)
  const graphDataTableColumnOrder = useGraphStore(s => s.graphDataTableColumnOrder)
  const setGraphDataTableVisibleColumns = useGraphStore(s => s.setGraphDataTableVisibleColumns)
  const setGraphDataTableColumnOrder = useGraphStore(s => s.setGraphDataTableColumnOrder)
  const selectedFieldId = useGraphStore(s => s.selectedGraphFieldId)
  const setSelectedFieldId = useGraphStore(s => s.setSelectedGraphFieldId)
  const [selectedGlobalView, setSelectedGlobalView] = React.useState<GraphFieldsSelectedView>(null)
  const fieldSettingsPaneRef = React.useRef<HTMLElement | null>(null)
  const handledEntryOpenTokenRef = React.useRef<number | null>(null)

  const derivedFields = React.useMemo<ReadonlyArray<GraphField>>(() => {
    if (!graphData) return []
    return getCachedDerivedFields({
      graphData,
      graphRevision: graphDataRevision,
    })
  }, [graphData, graphDataRevision])

  const fields = React.useMemo<ReadonlyArray<GraphField>>(() => {
    if (!graphData) return []
    const derivedIds = new Set<string>(derivedFields.map(f => f.id))
    const custom: GraphField[] = []
    for (const [id, v] of Object.entries(settingsById)) {
      if (!v || v.isCustom !== true) continue
      if (derivedIds.has(id)) continue
      const parsed = parseGraphFieldId(id)
      if (!parsed) continue
      custom.push({
        id: `${parsed.scope}:${parsed.key}` as GraphFieldId,
        scope: parsed.scope,
        key: parsed.key,
        kind: 'unknown',
        samples: 0,
      })
    }
    const merged = [...derivedFields, ...custom]
    merged.sort((a, b) => {
      if (a.scope !== b.scope) return a.scope === 'node' ? -1 : 1
      return a.key.localeCompare(b.key)
    })
    return merged
  }, [derivedFields, graphData, settingsById])

  const agenticLegend = React.useMemo<ReadonlyArray<MainPanelGraphFieldsLegendEntry> | null>(() => {
    const kinds = new Set<string>()
    for (const field of fields) {
      const kind = getAgenticRagFieldKind(field)
      if (!kind) continue
      kinds.add(kind)
    }
    if (kinds.size === 0) return null
    return Object.entries(AGENTIC_RAG_FIELD_KIND_META)
      .filter(([kind]) => kinds.has(kind))
      .map(([kind, meta]) => ({
        kind: kind as MainPanelGraphFieldsLegendEntry['kind'],
        label: meta.legendLabel,
      }))
  }, [fields])

  const normalizedQuery = normalized(searchQuery).trim()

  const visibleFieldIds = React.useMemo<ReadonlySet<GraphFieldId> | null>(() => {
    if (!normalizedQuery) return null
    const ids = new Set<GraphFieldId>()
    for (const field of fields) {
      const scopeText = normalized(field.scope)
      const keyText = normalized(field.key)
      if (scopeText.includes(normalizedQuery) || keyText.includes(normalizedQuery)) {
        ids.add(field.id)
      }
    }
    return ids
  }, [fields, normalizedQuery])

  React.useEffect(() => {
    if (!graphData) {
      if (selectedFieldId !== null) setSelectedFieldId(null)
      setSelectedGlobalView(prev => (prev === null ? prev : null))
      onStatusChange(UI_COPY.noGraphLoaded)
      return
    }
    if (selectedGlobalView) {
      if (selectedFieldId !== null) setSelectedFieldId(null)
      return
    }
    if (!selectedFieldId || !fields.some(f => f.id === selectedFieldId)) {
      const nextId = fields.length > 0 ? fields[0].id : null
      if (selectedFieldId !== nextId) setSelectedFieldId(nextId)
    }
    if (fields.length > 0) {
      onStatusChange(UI_COPY.syncedFieldsStatus(fields.length))
    } else {
      onStatusChange(UI_COPY.syncedNoFieldsFoundStatus)
    }
  }, [fields, graphData, onStatusChange, selectedFieldId, selectedGlobalView, setSelectedFieldId])

  const selectedField = React.useMemo(() => {
    if (!selectedFieldId) return null
    return fields.find(f => f.id === selectedFieldId) || null
  }, [fields, selectedFieldId])

  React.useEffect(() => {
    if (!entryOpenRequest || !graphData || fields.length === 0) return
    if (handledEntryOpenTokenRef.current === entryOpenRequest.token) return
    if (isGraphFieldsSelectionInspectorEntryLabel(entryOpenRequest.entryLabel)) {
      handledEntryOpenTokenRef.current = entryOpenRequest.token
      setSelectedGlobalView(prev => (prev?.kind === 'selectionInspector' ? prev : { kind: 'selectionInspector' }))
      if (selectedFieldId !== null) setSelectedFieldId(null)
      try {
        upsertUiToast({
          id: `graphFields:entryOpen:${entryOpenRequest.token}`,
          kind: 'neutral',
          message: `Opened selected record inspector via ${entryOpenRequest.entryLabel}`,
          ttlMs: 1800,
        })
      } catch {
        void 0
      }
      try {
        fieldSettingsPaneRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
      } catch {
        void 0
      }
      onStatusChange(`Opened selected record inspector via ${entryOpenRequest.entryLabel}`)
      return
    }
    const target = resolveGraphFieldsEntryCommandTarget({
      entryLabel: entryOpenRequest.entryLabel,
      fields,
      selectedFieldId,
    })
    if (!target) return

    handledEntryOpenTokenRef.current = entryOpenRequest.token
    setSelectedGlobalView(prev => (prev === null ? prev : null))
    if (selectedFieldId !== target.id) setSelectedFieldId(target.id)
    try {
      upsertUiToast({
        id: `graphFields:entryOpen:${entryOpenRequest.token}`,
        kind: 'neutral',
        message: `Opened Field Settings via ${entryOpenRequest.entryLabel}: ${target.id}`,
        ttlMs: 1800,
      })
    } catch {
      void 0
    }
    try {
      fieldSettingsPaneRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
    } catch {
      void 0
    }
    onStatusChange(`Opened Field Settings via ${entryOpenRequest.entryLabel}: ${target.id}`)
  }, [entryOpenRequest, fields, graphData, onStatusChange, selectedFieldId, setSelectedFieldId, upsertUiToast])

  const resync = React.useCallback(() => {
    if (!graphData) return
    if (fields.length > 0) {
      onStatusChange(UI_COPY.syncedFieldsStatus(fields.length))
    } else {
      onStatusChange(UI_COPY.syncedNoFieldsFoundStatus)
    }
  }, [fields, graphData, onStatusChange])

  const lastRawNodesEdgesToastRevisionRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    const isRawNodesEdges = graphData && graphData.context === 'raw-nodes-edges'
    const toastId = 'graphFields:raw-nodes-edges'

    if (!isRawNodesEdges) {
      lastRawNodesEdgesToastRevisionRef.current = null
      dismissUiToast(toastId)
      return
    }

    if (lastRawNodesEdgesToastRevisionRef.current === graphDataRevision) return
    lastRawNodesEdgesToastRevisionRef.current = graphDataRevision

    const message = `${UI_COPY.graphFieldsRawNodesEdgesToastTitle}\n${UI_COPY.graphFieldsRawNodesEdgesToastBody}`
    upsertUiToast({
      id: toastId,
      kind: 'warning',
      message,
      ttlMs: 10_000,
      dismissible: true,
    })
  }, [dismissUiToast, graphData, graphDataRevision, upsertUiToast])

  const content = (
    <article
      className="kg-graph-fields-surface h-full min-h-0 min-w-0 flex flex-col"
      data-kg-anchor={UI_ANCHORS.graphFields}
    >
      <section className="h-full min-h-0">
        <section className={GRAPH_FIELDS_MAIN_SPLIT_GRID_CLASS_NAME}>
          <section className={GRAPH_FIELDS_MAIN_LIST_PANE_CLASS_NAME}>
            <GraphFieldsListPanel
            graphData={graphData}
            graphDataRevision={graphDataRevision}
            fields={fields}
            visibleFieldIds={visibleFieldIds}
            selectedFieldId={selectedFieldId}
            setSelectedFieldId={setSelectedFieldId}
            selectedGlobalView={selectedGlobalView}
            setSelectedGlobalView={setSelectedGlobalView}
            settingsById={settingsById}
            patchGraphFieldSetting={patchGraphFieldSetting}
            graphDataTableVisibleColumns={graphDataTableVisibleColumns}
            graphDataTableColumnOrder={graphDataTableColumnOrder}
            setGraphDataTableVisibleColumns={setGraphDataTableVisibleColumns}
            setGraphDataTableColumnOrder={setGraphDataTableColumnOrder}
            onStatusChange={onStatusChange}
            />
          </section>
          <section ref={fieldSettingsPaneRef} className={GRAPH_FIELDS_MAIN_SETTINGS_PANE_CLASS_NAME}>
            {selectedGlobalView?.kind === 'selectionInspector' ? (
              <React.Suspense fallback={null}>
                <GraphRecordSelectionInspectorLazy />
              </React.Suspense>
            ) : (
              <FieldSettingsPanel
              graphData={graphData}
              selectedField={selectedField}
              selectedGlobalView={selectedGlobalView}
              setSelectedGlobalView={setSelectedGlobalView}
              settingsById={settingsById}
              patchGraphFieldSetting={patchGraphFieldSetting}
              removeGraphFieldSetting={removeGraphFieldSetting}
              onResync={resync}
              onStatusChange={onStatusChange}
              />
            )}
          </section>
        </section>
      </section>
    </article>
  )

  if (embedded) {
    return (
      <section className="h-full min-h-0 flex flex-col">
        <section className="mb-2">
          <MainPanelGraphFieldsHeader agenticLegend={agenticLegend} />
        </section>
        {entryShortcutLabels.length > 0 && onEntryShortcutClick ? (
          <nav className="mb-2 flex min-w-0 items-center gap-2" aria-label="Graph Fields entry shortcuts">
            <PanelSelect aria-label="Open Field Settings" value="" onValueChange={onEntryShortcutClick}>
              <option value="">Field shortcuts…</option>
              {entryShortcutLabels.map(label => <option key={label} value={label}>{label}</option>)}
            </PanelSelect>
          </nav>
        ) : null}
        <section className="flex-1 min-h-0 w-full overflow-hidden">
          {content}
        </section>
      </section>
    )
  }

  return (
    <MainPanelBody header={<MainPanelGraphFieldsHeader agenticLegend={agenticLegend} />} scrollable={false}>
      {content}
    </MainPanelBody>
  )
}
