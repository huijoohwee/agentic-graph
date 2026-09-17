import { lazy, Suspense, Fragment, useEffect, useMemo, useRef, useState, type ElementType } from 'react'
import type { GraphRecordColumnDoc } from '@/lib/graph-record-db'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { SELECTION_INSPECTOR_EMPTY_TEXT } from '@/lib/config'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import { cn } from '@/lib/utils'
import { useGraphStore } from '@/hooks/useGraphStore'
import type { GraphEdge, GraphNode } from '@/lib/graph/types'
import { WorkspaceModeSelect } from '@/features/markdown-workspace/WorkspaceModeSelect'
import { normalizeWorkspacePath } from '@/features/workspace-fs/path'
import type { WorkspacePath } from '@/features/workspace-fs/types'
import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import { parseWebpageFrontmatterMeta, upsertWebpageFrontmatterMeta, type WebpageViewMode } from '@/lib/markdown/frontmatter'
import { WidgetEditorPanel } from '@/components/StoryboardWidget/WidgetEditorPanel'
import { computeFlowConnectedValuesBySchemaPath, type FlowConnectedValuesBySchemaPath } from '@/lib/storyboardWidget/flowDataflow'
import {
  isWidgetCandidateNode,
  resolveWidgetRegistryEntry,
} from '@/features/storyboard-widget-manager/resolveWidgetRegistry'
import type { WidgetRegistryEntry } from '@/features/storyboard-widget-manager/widgetRegistryTypes'
import { buildWidgetBundleJsonText } from '@/lib/graph/io/widgetBundle'
import { getCachedGraphLookup } from '@/lib/graph/lookupCache'
import { buildScopedGraphSemanticKey } from '@/lib/graph/semanticKey'
import { useShallow } from 'zustand/react/shallow'
import { PlainTextInputEditor } from '@/components/ui/PlainTextInputEditor'
import { uiToolbarRowScrollClassName, uiToolbarRowScrollJustifyBetweenClassName, uiToolbarRowScrollJustifyEndClassName } from '@/features/toolbar/ui/toolbarStyles'
import { readMarkdownSigilDisplayText } from '@/lib/markdown/markdownSigil'
import { renderMarkdownSigilInlineText } from '@/lib/ui/MarkdownSigilText'
import { UI_RESPONSIVE_GRAPH_DATA_TABLE_CODE_EDITOR_CLASSNAME, UI_RESPONSIVE_VIEWPORT_SCROLL_PANEL_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import {
  GRAPH_RECORD_INSPECTOR_DETAIL_GRID_CLASS_NAME,
  GRAPH_RECORD_INSPECTOR_ROOT_CLASS_NAME,
} from '@/features/graph-inspector/ui/graphInspectorResponsiveMetrics'

const NodeImpactInspector = lazy(() => import('./NodeImpactInspector'))

const EMPTY_WIDGET_REGISTRY: WidgetRegistryEntry[] = []
const EMPTY_STRING_ARRAY: string[] = []

export type GraphRecordInspectorRow = {
  tableId: 'nodes' | 'edges'
  rowId: string
  order: number
  data: Record<string, unknown>
}

type GraphRecordInspectorProps = {
  columns: GraphRecordColumnDoc[]
  row: GraphRecordInspectorRow | null
  widthPx?: number
  scrollMode?: 'internal' | 'parent'
  onClose: () => void
  onChangeCell: (columnId: string, next: unknown) => void
  onDeleteRow: () => void
}

const coreColumnOrder = (id: string): number => {
  if (id === 'id') return 1
  if (id === 'label') return 2
  if (id === 'type') return 3
  if (id === 'source') return 4
  if (id === 'target') return 5
  return 1000
}

export function GraphRecordInspector({
  columns,
  row,
  widthPx,
  scrollMode = 'internal',
  onClose,
  onChangeCell,
  onDeleteRow,
}: GraphRecordInspectorProps) {
  const { panelTextClass, microLabelClass, textSizeClass, keyValueInputClass, monospaceTextClass } = usePanelTypography()
  const {
    graphData,
    sourceFiles,
    schema,
    effectiveWidgetRegistry,
    openWidgetNodeIds,
    selectedNodeId,
    uiIconScale,
    uiIconStrokeWidth,
    graphDataRevision,
    upsertUiToast,
    updateNode,
  } = useGraphStore(
    useShallow(s => ({
      graphData: s.graphData,
      sourceFiles: s.sourceFiles,
      schema: s.schema,
      effectiveWidgetRegistry: s.effectiveWidgetRegistry ?? EMPTY_WIDGET_REGISTRY,
      openWidgetNodeIds: s.openWidgetNodeIds ?? EMPTY_STRING_ARRAY,
      selectedNodeId: s.selectedNodeId,
      uiIconScale: s.uiIconScale,
      uiIconStrokeWidth: s.uiIconStrokeWidth,
      graphDataRevision: s.graphDataRevision || 0,
      upsertUiToast: s.upsertUiToast,
      updateNode: s.updateNode,
    })),
  )
  const edgesRaw = graphData?.edges
  const allEdges: GraphEdge[] = useMemo(() => {
    if (!Array.isArray(edgesRaw)) return []
    return edgesRaw as GraphEdge[]
  }, [edgesRaw])
  const graphSemanticKey = useMemo(
    () => buildScopedGraphSemanticKey('graph-record-inspector', { graphData: graphData ?? null, graphRevision: graphDataRevision }),
    [graphData, graphDataRevision],
  )
  const graphLookup = useMemo(
    () => getCachedGraphLookup({
      cacheScope: 'graph-record-inspector',
      graphData,
      graphRevision: graphDataRevision,
      graphSemanticKey,
      preferCurrentGraphDataRefs: true,
    }),
    [graphData, graphDataRevision, graphSemanticKey],
  )
  const graphNodeById = graphLookup?.nodeById || null
  const graphEdgesByNodeId = graphLookup?.incidentEdgesByNodeId || null
  const node: GraphNode | null = useMemo(() => {
    if (!row || row.tableId !== 'nodes') return null
    const id = String(row.rowId || '').trim()
    if (!id || !graphNodeById) return null
    return graphNodeById.get(id) || null
  }, [graphNodeById, row])
  const registryEntry = useMemo(
    () => (node ? resolveWidgetRegistryEntry({ node, registry: effectiveWidgetRegistry }) : null),
    [effectiveWidgetRegistry, node],
  )
  const openWidgetNodeIdSet = useMemo(() => new Set(openWidgetNodeIds), [openWidgetNodeIds])
  const showWidget = useMemo(() => {
    if (!node) return false
    const id = String(node.id || '').trim()
    if (!id) return false
    const isSelected = id === String(selectedNodeId || '')
    const isPinned = openWidgetNodeIdSet.has(id)
    const isWidgetNode = isWidgetCandidateNode({ node, registry: effectiveWidgetRegistry })
    return isWidgetNode && (isSelected || isPinned)
  }, [effectiveWidgetRegistry, node, openWidgetNodeIdSet, selectedNodeId])

  const connectedValuesBySchemaPath: FlowConnectedValuesBySchemaPath | undefined = useMemo(() => {
    if (!node || !showWidget) return undefined
    const nodeId = String(node.id || '').trim()
    if (!nodeId) return undefined
    const byNodeId = computeFlowConnectedValuesBySchemaPath({
      graphData,
      registry: Array.isArray(effectiveWidgetRegistry) ? effectiveWidgetRegistry : [],
      targetNodeIds: new Set([nodeId]),
      graphRevision: graphDataRevision,
      graphSemanticKey,
    })
    return byNodeId.get(nodeId)
  }, [effectiveWidgetRegistry, graphData, graphDataRevision, graphSemanticKey, node, showWidget])

  const [codeFormat, setCodeFormat] = useState<'json' | 'markdown'>('json')
  const widgetBundleGraphSemanticKey = useMemo(() => {
    const nodeId = String(node?.id || '').trim()
    if (!nodeId) return ''
    return buildScopedGraphSemanticKey('graph-record-inspector-widget-bundle', {
      graphRevision: graphDataRevision,
      graphSemanticKey: `${graphSemanticKey}:${nodeId}`,
    })
  }, [graphDataRevision, graphSemanticKey, node])
  const widgetCodeText = useMemo(() => {
    if (!node || !showWidget) return ''
    const nodeId = String(node.id || '').trim()
    if (!nodeId) return ''

    const safeType = String(node.type || '').trim()
    const registryForType = (effectiveWidgetRegistry || []).filter((e: unknown) => {
      if (!e || typeof e !== 'object') return false
      const rec = e as { isEnabled?: unknown; nodeTypeId?: unknown }
      if (rec.isEnabled !== true) return false
      return String(rec.nodeTypeId || '').trim() === safeType
    })

    const edges = graphEdgesByNodeId?.get(nodeId) || []
    const graph = {
      context: '',
      type: 'Graph',
      nodes: [node],
      edges,
    }
    const bundleText = buildWidgetBundleJsonText({
      registryEntries: registryForType,
      graphData: graph as never,
      graphRevision: graphDataRevision,
      graphSemanticKey: widgetBundleGraphSemanticKey,
    })
    if (codeFormat === 'markdown') return `\`\`\`json\n${bundleText}\n\`\`\``
    return bundleText
  }, [codeFormat, effectiveWidgetRegistry, graphDataRevision, graphEdgesByNodeId, node, showWidget, widgetBundleGraphSemanticKey])

  const copyWidgetCode = () => {
    const text = widgetCodeText
    if (!text) return
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      upsertUiToast({ id: 'qe-code-copy-unavailable', kind: 'neutral', message: 'Clipboard not available.', ttlMs: 2200 })
      return
    }
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        upsertUiToast({ id: 'qe-code-copied', kind: 'success', message: 'Copied.', ttlMs: 1400 })
      })
      .catch(() => {
        upsertUiToast({ id: 'qe-code-copy-failed', kind: 'neutral', message: 'Copy failed.', ttlMs: 2200 })
      })
  }

  const [panelMinimized, setPanelMinimized] = useState(false)
  const [panelHideFields, setPanelHideFields] = useState(false)
  const labelInputRef = useRef<HTMLInputElement | null>(null)

  const [webpageDoc, setWebpageDoc] = useState<
    | null
    | {
        workspacePath: WorkspacePath
        url: string
        view: WebpageViewMode
      }
  >(null)
  const sourceFilesById = useMemo(() => {
    const byId = new Map<string, (typeof sourceFiles)[number]>()
    for (let i = 0; i < sourceFiles.length; i += 1) {
      const item = sourceFiles[i]
      const id = String(item?.id || '').trim()
      if (!id) continue
      byId.set(id, item)
    }
    return byId
  }, [sourceFiles])

  useEffect(() => {
    if (!node) {
      setWebpageDoc(null)
      return
    }
    const meta = (node.metadata || {}) as Record<string, unknown>
    const sourceLayerId = typeof meta.sourceLayerId === 'string' ? String(meta.sourceLayerId || '').trim() : ''
    if (!sourceLayerId) {
      setWebpageDoc(null)
      return
    }
    const src = sourceFilesById.get(sourceLayerId) || null
    const srcPath = String(src?.source?.path || '').trim()
    if (!srcPath.startsWith('workspace:')) {
      setWebpageDoc(null)
      return
    }
    const workspacePath = normalizeWorkspacePath(srcPath.slice('workspace:'.length))

    let cancelled = false
    void (async () => {
      const fs = await getWorkspaceFs()
      const text = await fs.readFileText(workspacePath).catch(() => '')
      const fm = parseWebpageFrontmatterMeta(text)
      const url = String(fm?.url || (typeof meta.documentUrl === 'string' ? meta.documentUrl : '') || '').trim()
      if (!url) {
        if (!cancelled) setWebpageDoc(null)
        return
      }
      const view: WebpageViewMode = fm?.view || 'markdown'
      if (!cancelled) setWebpageDoc({ workspacePath, url, view })
    })()

    return () => {
      cancelled = true
    }
  }, [node, sourceFilesById])

  const switchWebpageView = async (next: WebpageViewMode) => {
    const doc = webpageDoc
    if (!doc) return
    const url = String(doc.url || '').trim()
    if (!url) return
    const fs = await getWorkspaceFs()
    const prevText = await fs.readFileText(doc.workspacePath)
    const nextText = upsertWebpageFrontmatterMeta(prevText, { url, view: next })
    if (nextText !== prevText) await fs.writeFileText(doc.workspacePath, nextText)
    setWebpageDoc({ ...doc, view: next })
  }

  const handleSetLabel = (label: string) => {
    if (!node) return
    const id = String(node.id || '').trim()
    if (!id) return
    updateNode(id, { label: String(label || '') })
  }
  const handleSetType = (type: string) => {
    if (!node) return
    const id = String(node.id || '').trim()
    if (!id) return
    const trimmed = String(type || '').trim() || 'Node'
    updateNode(id, { type: trimmed })
  }
  const handlePatchProperties = (patch: Record<string, unknown>) => {
    if (!node) return
    const id = String(node.id || '').trim()
    if (!id) return
    const prevProps = (node.properties || {}) as Record<string, unknown>
    const nextProps: Record<string, unknown> = { ...prevProps }
    for (const [k, v] of Object.entries(patch)) {
      if (typeof v === 'undefined') delete nextProps[k]
      else nextProps[k] = v
    }
    updateNode(id, { properties: nextProps as never })
  }
  const handleSetProperties = (props: Record<string, unknown>) => {
    if (!node) return
    const id = String(node.id || '').trim()
    if (!id) return
    updateNode(id, { properties: (props || {}) as never })
  }
  const handleValidate = () => {
    if (!node) return
    upsertUiToast({ id: `table-node-validate-${node.id}`, kind: 'success', message: 'Node validated.', ttlMs: 2000 })
  }
  const ordered = useMemo(() => {
    const visible = columns.filter(c => !c.hidden)
    return visible
      .slice()
      .sort((a, b) => {
        const ak = coreColumnOrder(a.columnId)
        const bk = coreColumnOrder(b.columnId)
        if (ak !== bk) return ak - bk
        if (a.order !== b.order) return a.order - b.order
        return a.columnId.localeCompare(b.columnId)
      })
  }, [columns])

  const isEmpty = !row
  const headerKind = row ? row.tableId : 'selection'
  const headerLabel = row ? row.rowId : SELECTION_INSPECTOR_EMPTY_TEXT
  const headerDisplayLabel = readMarkdownSigilDisplayText(headerLabel)
  const RootTag: ElementType = scrollMode === 'internal' ? 'section' : 'div'
  const TitleTag: ElementType = scrollMode === 'internal' ? 'section' : 'div'
  const FieldsTag: ElementType = scrollMode === 'internal' ? 'section' : 'div'

  return (
    <RootTag
      className={cn(
        `${GRAPH_RECORD_INSPECTOR_ROOT_CLASS_NAME} min-w-0 max-w-full`,
        scrollMode === 'internal' ? 'h-full min-h-0 overflow-hidden flex flex-col' : 'flex flex-col',
        scrollMode === 'internal' ? UI_THEME_TOKENS.panel.bg : null,
        panelTextClass,
      )}
      style={widthPx ? { width: `${widthPx}px` } : undefined}
      aria-label="Record inspector"
    >
      <header className={`${uiToolbarRowScrollJustifyBetweenClassName} px-3 py-2 border-b gap-2 ${UI_THEME_TOKENS.panel.divider}`}>
        <TitleTag className="min-w-0" aria-label="Record title">
          <p className={cn(microLabelClass, UI_THEME_TOKENS.text.tertiary)}>{headerKind}</p>
          <p className={`font-semibold ${UI_THEME_TOKENS.text.primary} truncate`} title={headerDisplayLabel}>
            {renderMarkdownSigilInlineText(headerLabel)}
          </p>
        </TitleTag>
        <nav className={`${uiToolbarRowScrollJustifyEndClassName} gap-1.5`} aria-label="Inspector actions">
          <button
            type="button"
            className={`App-toolbar__btn ${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`}
            onClick={onDeleteRow}
            disabled={isEmpty}
          >
            Delete
          </button>
          <button
            type="button"
            className={`App-toolbar__btn ${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`}
            onClick={onClose}
            disabled={isEmpty}
          >
            Close
          </button>
        </nav>
      </header>

      {webpageDoc ? (
        <section
          className={cn(uiToolbarRowScrollJustifyBetweenClassName, 'px-3 py-2 border-b gap-2', UI_THEME_TOKENS.panel.divider)}
          aria-label="Webpage view"
        >
          <p className={cn(microLabelClass, UI_THEME_TOKENS.text.secondary)}>Webpage view</p>
          <WorkspaceModeSelect<WebpageViewMode>
            ariaLabel="Webpage view mode"
            value={webpageDoc.view}
            isActive={true}
            options={[
              { value: 'markdown', label: 'Markdown' },
              { value: 'html', label: 'HTML' },
              { value: 'json', label: 'JSON' },
            ]}
            onChange={next => void switchWebpageView(next)}
          />
        </section>
      ) : null}

      <FieldsTag
        className={scrollMode === 'internal' ? `${UI_RESPONSIVE_VIEWPORT_SCROLL_PANEL_CLASSNAME} flex-1 min-h-0` : undefined}
        aria-label="Record fields"
      >
        <Suspense fallback={<p className="px-3 py-2 text-xs">Loading graph inspection…</p>}>
          <NodeImpactInspector nodeId={row?.tableId === 'nodes' ? row.rowId : null} />
        </Suspense>
        {isEmpty ? (
          <p className={cn('px-3 py-2', microLabelClass, UI_THEME_TOKENS.text.tertiary)}>{SELECTION_INSPECTOR_EMPTY_TEXT}</p>
        ) : (
          <>
            {row?.tableId === 'nodes' && node && showWidget ? (
              <section className="px-3 py-2" aria-label="Widget">
                <WidgetEditorPanel
                  active={true}
                  node={node}
                  registryEntry={registryEntry}
                  registryEntries={effectiveWidgetRegistry}
                  minimized={panelMinimized}
                  hideFields={panelHideFields}
                  pinned={false}
                  showPinToggle={false}
                  uiPanelOpacity={1}
                  panelTextClass={panelTextClass}
                  monospaceTextClass={monospaceTextClass}
                  microLabelClass={microLabelClass}
                  uiIconScale={uiIconScale}
                  uiIconStrokeWidth={uiIconStrokeWidth}
                  labelInputRef={labelInputRef}
                  onHeaderPointerDown={() => void 0}
                  onToggleHideFields={() => setPanelHideFields(v => !v)}
                  onToggleMinimized={() => setPanelMinimized(v => !v)}
                  onSetLabel={handleSetLabel}
                  onSetType={handleSetType}
                  onPatchProperties={handlePatchProperties}
                  onSetProperties={handleSetProperties}
                  onValidate={handleValidate}
                  connectedValuesBySchemaPath={connectedValuesBySchemaPath}
                  portHandleEdges={allEdges}
                  schema={schema}
                />

                <section className={cn('mt-3 min-w-0 max-w-full rounded border overflow-hidden', UI_THEME_TOKENS.panel.border)} aria-label="Widget codes">
                  <header className={cn(uiToolbarRowScrollJustifyBetweenClassName, 'px-2 py-2 border-b gap-2', UI_THEME_TOKENS.panel.border)}>
                    <p className={cn(microLabelClass, UI_THEME_TOKENS.text.secondary)}>Codes</p>
                    <section className={`${uiToolbarRowScrollClassName} gap-1`} aria-label="Code format">
                      <button
                        type="button"
                        className={cn(
                          'App-toolbar__btn',
                          microLabelClass,
                          codeFormat === 'json' ? `${UI_THEME_TOKENS.button.activeBg} ${UI_THEME_TOKENS.button.activeText}` : `${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`,
                        )}
                        onClick={() => setCodeFormat('json')}
                      >
                        JSON
                      </button>
                      <button
                        type="button"
                        className={cn(
                          'App-toolbar__btn',
                          microLabelClass,
                          codeFormat === 'markdown'
                            ? `${UI_THEME_TOKENS.button.activeBg} ${UI_THEME_TOKENS.button.activeText}`
                            : `${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`,
                        )}
                        onClick={() => setCodeFormat('markdown')}
                      >
                        Markdown
                      </button>
                      <button
                        type="button"
                        className={cn('App-toolbar__btn', microLabelClass, UI_THEME_TOKENS.button.text, UI_THEME_TOKENS.button.hoverBg)}
                        onClick={copyWidgetCode}
                        disabled={!widgetCodeText}
                      >
                        Copy
                      </button>
                    </section>
                  </header>
                  <section className="p-2" aria-label="Code">
                    <PlainTextInputEditor
                      className={cn(
                        UI_RESPONSIVE_GRAPH_DATA_TABLE_CODE_EDITOR_CLASSNAME,
                        'rounded border px-2 py-1',
                        monospaceTextClass,
                        textSizeClass,
                        UI_THEME_TOKENS.input.bg,
                        UI_THEME_TOKENS.input.border,
                        UI_THEME_TOKENS.input.text,
                      )}
                      multiline
                      value={widgetCodeText}
                      readOnly
                      spellCheck={false}
                    />
                  </section>
                </section>
              </section>
            ) : null}
          <dl className={GRAPH_RECORD_INSPECTOR_DETAIL_GRID_CLASS_NAME}>
            {ordered.map(col => {
              const value = (row.data || {})[col.columnId]
              const raw = value == null ? '' : String(value)
              const disabled = col.columnId === 'id'
              return (
                <Fragment key={col.pk}>
                  <dt className={cn(textSizeClass, UI_THEME_TOKENS.text.tertiary, 'truncate')}>{col.name}</dt>
                  <dd>
                    <PlainTextInputEditor
                      className={cn(
                        'w-full',
                        keyValueInputClass,
                        textSizeClass,
                        UI_THEME_TOKENS.input.border,
                        UI_THEME_TOKENS.input.bg,
                        UI_THEME_TOKENS.input.text,
                      )}
                      value={raw}
                      disabled={disabled}
                      onChange={next => onChangeCell(col.columnId, next)}
                    />
                  </dd>
                </Fragment>
              )
            })}
          </dl>
          </>
        )}
      </FieldsTag>
    </RootTag>
  )
}
