import type { ComponentType } from 'react'
import type {
  CanvasViewportGeospatialOverlayProps,
} from '@/components/CanvasViewportGeospatialOverlay'

export function loadCanvasViewportGeospatialOverlay(): Promise<{
  default: ComponentType<CanvasViewportGeospatialOverlayProps>
}> {
  return import('@/components/CanvasViewportGeospatialOverlay')
    .then(module => ({
      default: module.CanvasViewportGeospatialOverlay,
    }))
}
