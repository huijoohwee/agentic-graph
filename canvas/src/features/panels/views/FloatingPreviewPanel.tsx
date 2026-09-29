import React from 'react'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import { FloatingPanelCatalogHeader, floatingPanelCatalogBodyClassName, floatingPanelCatalogSurfaceClassName } from '@/lib/ui/floatingPanelCatalogLayout'
import { DocumentInsights } from './DocumentInsights'

const PreviewPanelView = React.lazy(() => import('@/lib/panels/views/PreviewPanelView.impl'))
const MediaCatalogPanel = React.lazy(() => import('@/features/command-menu/MediaCatalogPanel'))

export default function FloatingPreviewPanel() {
  const typography = usePanelTypography()
  return (
    <section aria-label="Preview Panel" className={floatingPanelCatalogSurfaceClassName(typography.panelTextClass)}>
      <FloatingPanelCatalogHeader title="Preview Panel" subtitle="Document insights, selected media, and Media library" actionsLabel="Preview controls" />
      <section className={floatingPanelCatalogBodyClassName('space-y-2')} aria-label="Preview Panel content">
        <DocumentInsights />
        <section className="h-72 min-w-0" aria-label="Preview selection">
          <React.Suspense fallback={<p role="status">Loading preview…</p>}><PreviewPanelView /></React.Suspense>
        </section>
        <section className="h-96 min-w-0" aria-label="Preview Media library">
          <React.Suspense fallback={<p role="status">Loading Media…</p>}><MediaCatalogPanel /></React.Suspense>
        </section>
      </section>
    </section>
  )
}
