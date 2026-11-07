import React from 'react'
import type { GraphData } from '@/lib/graph/types'
import { importWithRetry } from '@/lib/react/importWithRetry'
import { useGeospatialPoiPreviewNode } from '@/features/geospatial/useGeospatialPoiPreviewNode'

const StoryboardWidgetCanvas = React.lazy(() => importWithRetry(() => import('@/components/StoryboardWidgetCanvas'), { retries: 2, retryDelayMs: 50 }))

export function GeospatialStoryboardWidgetPanels(props: { active: boolean; graphData: GraphData; documentKey: string }) {
  const previewNode = useGeospatialPoiPreviewNode(props.documentKey, props.graphData)
  if (!props.active) return null
  return (
    <section className="absolute inset-0 z-[30] pointer-events-none" aria-label="Storyboard widget panels" data-kg-geospatial-storyboard-widget-panels="1">
      <StoryboardWidgetCanvas active storyboardWidgetSurfaceId="storyboard" geospatialWidgetPanelMode geospatialPoiPreviewNode={previewNode} />
    </section>
  )
}
