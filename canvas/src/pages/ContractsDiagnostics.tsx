import React from 'react'
import { Link } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { useGraphStore } from '@/hooks/useGraphStore'
import { LS_KEYS } from '@/lib/config'
import { CANVAS_2D_RENDERER_ORDER } from '@/lib/renderer/canvas2dRendererRegistry'
import { buildActive2dZoomViewKey } from '@/lib/canvas/active-2d-zoom-view-key'
import { buildDocumentKey, buildDocumentRef } from '@/lib/persistence/perDocumentUiState'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { UI_RESPONSIVE_COMPACT_VIEWPORT_SCROLL_PANEL_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { CONTRACTS_DIAGNOSTICS_PAGE_CONTENT_CLASS_NAME } from '@/pages/pageResponsiveClasses'

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export default function ContractsDiagnostics() {
  const s = useGraphStore(
    useShallow(state => ({
      canvasRenderMode: state.canvasRenderMode,
      canvas2dRenderer: state.canvas2dRenderer,
      viewportControlsPreset: state.viewportControlsPreset,
      storyboardWidgetSelectionOnDrag: state.storyboardWidgetSelectionOnDrag === true,
      documentStructureBaselineLock: state.documentStructureBaselineLock,
      viewPinned: state.viewPinned,
      fitToScreenMode: state.fitToScreenMode,
      zoomToSelectionMode: state.zoomToSelectionMode,
      documentSemanticMode: state.documentSemanticMode,
      frontmatterModeEnabled: state.frontmatterModeEnabled,
      markdownDocumentName: state.markdownDocumentName,
      markdownDocumentSourceUrl: state.markdownDocumentSourceUrl,
      schema: state.schema,
      graphData: state.graphData,
      renderMediaAsNodes: state.renderMediaAsNodes,
      mediaPanelDensity: state.mediaPanelDensity,
      collapsedGroupIds: state.collapsedGroupIds,
      selectedNodeId: state.selectedNodeId,
      selectedEdgeId: state.selectedEdgeId,
      selectedGroupId: state.selectedGroupId,
      selectedNodeIds: state.selectedNodeIds,
      selectedEdgeIds: state.selectedEdgeIds,
      selectedGroupIds: state.selectedGroupIds,
      zoomStateByKey: state.zoomStateByKey,
    })),
  )

  const docRef = buildDocumentRef({ name: s.markdownDocumentName, sourceUrl: s.markdownDocumentSourceUrl })
  const docKey = buildDocumentKey({ name: s.markdownDocumentName, sourceUrl: s.markdownDocumentSourceUrl })
  const selectionOnDrag = s.canvasRenderMode === '2d' && s.canvas2dRenderer === 'storyboard' && s.storyboardWidgetSelectionOnDrag === true
  const effectivePreset = s.viewportControlsPreset

  const zoomViewKey = buildActive2dZoomViewKey({
    canvasRenderMode: s.canvasRenderMode,
    canvas2dRenderer: s.canvas2dRenderer,
    schema: s.schema,
    graphData: s.graphData,
    documentSemanticMode: s.documentSemanticMode,
    frontmatterModeEnabled: s.frontmatterModeEnabled,
    documentStructureBaselineLock: s.documentStructureBaselineLock,
    renderMediaAsNodes: s.renderMediaAsNodes,
    mediaPanelDensity: s.mediaPanelDensity,
    collapsedGroupIds: s.collapsedGroupIds,
  })

  const zoomState = zoomViewKey ? s.zoomStateByKey?.[zoomViewKey] ?? null : null

  const contract = {
    kind: 'agenticgraph.contracts.renderer',
    v: 1,
    nowIso: new Date().toISOString(),
    canvasRenderMode: s.canvasRenderMode,
    canvas2dRenderer: s.canvasRenderMode === '2d' ? s.canvas2dRenderer : null,
    rendererIds: {
      canvas2d: CANVAS_2D_RENDERER_ORDER,
      canvas3d: ['three'],
    },
    viewportControlsPreset: {
      stored: s.viewportControlsPreset,
      effective: effectivePreset,
      selectionOnDrag,
    },
    persistence: {
      localStorageKeys: {
        canvas2dRenderer: LS_KEYS.canvas2dRenderer,
        viewportControlsPreset: LS_KEYS.viewportControlsPreset,
        storyboardWidgetSelectionOnDrag: LS_KEYS.storyboardWidgetSelectionOnDrag,
        viewportPinned: LS_KEYS.viewportPinned,
        viewportFitToScreen: LS_KEYS.viewportFitToScreen,
        viewportZoomToSelection: LS_KEYS.viewportZoomToSelection,
        perDocumentUiStateMap: LS_KEYS.perDocumentUiStateMap,
      },
      documentKey: docKey,
    },
  }

  const diagnostics = {
    kind: 'agenticgraph.diagnostics.canvas',
    v: 1,
    nowIso: new Date().toISOString(),
    document: {
      ref: docRef,
      key: docKey,
    },
    mode: {
      documentSemanticMode: s.documentSemanticMode,
      frontmatterModeEnabled: s.frontmatterModeEnabled,
      documentStructureBaselineLock: s.documentStructureBaselineLock,
    },
    canvas: {
      canvasRenderMode: s.canvasRenderMode,
      canvas2dRenderer: s.canvas2dRenderer,
      viewPinned: s.viewPinned,
      fitToScreenMode: s.fitToScreenMode,
      zoomToSelectionMode: s.zoomToSelectionMode,
      zoomViewKey,
      zoomState,
    },
    selection: {
      selectedNodeId: s.selectedNodeId,
      selectedEdgeId: s.selectedEdgeId,
      selectedGroupId: s.selectedGroupId,
      selectedNodeIds: s.selectedNodeIds,
      selectedEdgeIds: s.selectedEdgeIds,
      selectedGroupIds: s.selectedGroupIds,
    },
  }

  return (
    <main className={`min-h-screen bg-[var(--kg-canvas-bg)] ${UI_THEME_TOKENS.text.primary}`} aria-label="Contracts & Diagnostics">
      <section className={CONTRACTS_DIAGNOSTICS_PAGE_CONTENT_CLASS_NAME}>
        <header className="flex items-center justify-between gap-4">
          <section>
            <h1 className="text-lg font-semibold">Contracts & Diagnostics</h1>
            <p className={`mt-1 text-sm ${UI_THEME_TOKENS.text.secondary}`}>Renderer contract + current runtime snapshot.</p>
          </section>
          <Link to="/" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
            Back to Canvas
          </Link>
        </header>

        <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <section className="rounded-lg border border-[var(--kg-border)] bg-[var(--kg-panel-bg)] p-4">
            <h2 className="text-sm font-semibold">Contract</h2>
            <section className={`mt-2 text-xs ${UI_THEME_TOKENS.text.secondary}`}>
              <section>Mode: {String(s.canvasRenderMode)}</section>
              <section>2D Renderer: {String(s.canvasRenderMode === '2d' ? s.canvas2dRenderer : 'n/a')}</section>
              <section>Viewport preset: {String(s.viewportControlsPreset)} (effective: {String(effectivePreset)})</section>
              <section>Document key: {docKey}</section>
            </section>
            <button
              className={`mt-3 inline-flex items-center justify-center rounded-md bg-black/80 px-3 py-2 text-xs font-medium text-white ${UI_THEME_TOKENS.button.inverseHoverBg}`}
              onClick={() => downloadJson('agenticgraph-contract.json', contract)}
              type="button"
            >
              Download contract JSON
            </button>
          </section>

          <section className="rounded-lg border border-[var(--kg-border)] bg-[var(--kg-panel-bg)] p-4">
            <h2 className="text-sm font-semibold">Diagnostics</h2>
            <section className={`mt-2 text-xs ${UI_THEME_TOKENS.text.secondary}`}>
              <section>Doc: {docRef || '(none)'}</section>
              <section>Semantic mode: {String(s.documentSemanticMode)}</section>
              <section>Frontmatter mode: {String(s.frontmatterModeEnabled)}</section>
              <section>Baseline lock: {String(s.documentStructureBaselineLock)}</section>
              <section>Zoom view key: {zoomViewKey || '(none)'}</section>
            </section>
            <button
              className={`mt-3 inline-flex items-center justify-center rounded-md bg-black/80 px-3 py-2 text-xs font-medium text-white ${UI_THEME_TOKENS.button.inverseHoverBg}`}
              onClick={() => downloadJson('agenticgraph-diagnostics.json', diagnostics)}
              type="button"
            >
              Download diagnostics JSON
            </button>
          </section>
        </section>

        <section className="mt-4 rounded-lg border border-[var(--kg-border)] bg-[var(--kg-panel-bg)] p-4">
          <h2 className="text-sm font-semibold">Full Snapshot</h2>
          <pre className={`mt-2 ${UI_RESPONSIVE_COMPACT_VIEWPORT_SCROLL_PANEL_CLASSNAME} rounded-md bg-black/10 p-3 text-[11px] leading-relaxed ${UI_THEME_TOKENS.text.secondary}`}>
            {JSON.stringify({ contract, diagnostics }, null, 2)}
          </pre>
        </section>
      </section>
    </main>
  )
}
