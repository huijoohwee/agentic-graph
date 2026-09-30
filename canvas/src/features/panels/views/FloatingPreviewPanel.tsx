import React from 'react'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import { FloatingPanelCatalogHeader, floatingPanelCatalogBodyClassName, floatingPanelCatalogSurfaceClassName } from '@/lib/ui/floatingPanelCatalogLayout'
import { DocumentInsights } from './DocumentInsights'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useCommandMenuRichMediaInventory } from '@/lib/command-menu/commandMenuRichMediaInventory'
import { MediaCatalogModeControls } from '@/features/command-menu/MediaCatalogModeControls'
import { setMediaCatalogMode, type MediaCatalogMode } from '@/features/command-menu/mediaCatalogModeRuntime'
import { emitFloatingPanelOpen } from '@/features/canvas/utils'
import { scopePreviewItems } from './preview-context/previewContext'

const PreviewPanelView = React.lazy(() => import('@/lib/panels/views/PreviewPanelView.impl'))
const PreviewMediaCatalog = React.lazy(() => import('./preview-context/PreviewMediaCatalog'))
const PreviewVoicePanel = React.lazy(() => import('./preview-context/PreviewVoicePanel'))

export default function FloatingPreviewPanel() {
  const typography = usePanelTypography()
  const documentName = useGraphStore(state => state.markdownDocumentName || '')
  const documentText = useGraphStore(state => state.markdownDocumentText || '')
  const selectedNodeId = useGraphStore(state => state.selectedNodeId)
  const activeKey = useGraphStore(state => state.markdownPreviewActiveMediaKey)
  const { items } = useCommandMenuRichMediaInventory()
  const scopedItems = React.useMemo(() => scopePreviewItems(items, selectedNodeId), [items, selectedNodeId])
  const [mode, setMode] = React.useState<MediaCatalogMode>('media')
  const visibleItems = React.useMemo(() => scopedItems.filter(item => mode === 'xr-3d' ? item.kind === 'model' : item.kind !== 'model'), [mode, scopedItems])
  const selectedItem = scopedItems.find(item => item.key === activeKey)
  const openLibrary = () => { setMediaCatalogMode(mode); emitFloatingPanelOpen({ tab: 'media', open: true }) }
  return (
    <section aria-label="Preview Panel" className={floatingPanelCatalogSurfaceClassName(typography.panelTextClass)}>
      <FloatingPanelCatalogHeader title="Preview Panel" subtitle={documentName || 'Current selection'} actionsLabel="Preview controls" />
      <section className={floatingPanelCatalogBodyClassName('space-y-2')} aria-label="Preview Panel content">
        <DocumentInsights />
        <MediaCatalogModeControls mode={mode} onChange={setMode} context="preview" />
        <React.Suspense fallback={<p role="status">Loading preview…</p>}>
          {mode === 'voice-studio' ? <PreviewVoicePanel key={documentName} documentText={documentText} selectionText={selectedItem?.alt || selectedItem?.label || ''} /> : <>
            {visibleItems.length ? <section className="h-72 min-w-0" aria-label="Preview selection"><PreviewPanelView items={visibleItems} clearOnUnmount={false} /></section> : null}
            <PreviewMediaCatalog key={`${documentName}:${mode}`} items={visibleItems} models={mode === 'xr-3d'} />
            <button type="button" className="rounded border px-2 py-1 text-xs" onClick={openLibrary}>{mode === 'xr-3d' ? 'Open 3D for XR library' : 'Open Media library'}</button>
          </>}
        </React.Suspense>
      </section>
    </section>
  )
}
