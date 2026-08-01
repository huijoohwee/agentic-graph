import React from 'react'

export const DeferredFlowCanvas = React.lazy(() => import('@/components/FlowCanvas'))

export const DeferredStoryboardCardOverlayLayer2d = React.lazy(async () => ({
  default: (await import('@/components/StoryboardWidgetCanvas/StoryboardCardOverlayLayer2d')).StoryboardCardOverlayLayer2d,
}))

export const DeferredStoryboardGroupPanelLayer2d = React.lazy(async () => ({
  default: (await import('@/components/StoryboardWidgetCanvas/StoryboardGroupPanelLayer2d')).StoryboardGroupPanelLayer2d,
}))

export const DeferredStoryboardEdgeNodeInsertionMenu = React.lazy(async () => ({
  default: (await import('@/components/StoryboardWidgetCanvas/runtime/StoryboardEdgeNodeInsertionMenu')).StoryboardEdgeNodeInsertionMenu,
}))
