import StoryboardWidgetCanvasRuntime from '@/components/StoryboardWidgetCanvas.runtime'
import type { GraphNode } from '@/lib/graph/types'

export default function StoryboardWidgetCanvas(props: {
  active?: boolean
  storyboardWidgetSurfaceId?: string
  storyboardCardsMode?: boolean
  widgetDropCaptureEnabled?: boolean
  geospatialWidgetPanelMode?: boolean
  geospatialPoiPreviewNode?: GraphNode | null
}) {
  const active = props.active !== false
  const storyboardWidgetViewActive = active
  const documentStructureBaselineLock = false
  const canEdit = active && !documentStructureBaselineLock
  void storyboardWidgetViewActive
  void canEdit
  return <StoryboardWidgetCanvasRuntime {...props} />
}
