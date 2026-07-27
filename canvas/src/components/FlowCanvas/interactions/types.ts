import type React from 'react'
import type * as d3 from 'd3'

import type { FlowNativeDrawArgs, FlowNativeRuntime } from '@/components/FlowCanvas/nativeRuntime'
import type { GraphData } from '@/lib/graph/types'
import type { GraphSchema } from '@/lib/graph/schema'
import type { FlowConfig } from '@/components/FlowCanvas/config'
import type { ViewportControlsPreset } from '@/lib/config.viewport-controls'
import type { ZoomWheelGuardState } from '@/lib/canvas/zoom-wheel-guard'
import type { SnapGridConfig } from '@/lib/canvas/gridSnap'
import type { StoryboardWidgetScreenAuthorityPanSnapshot } from '@/lib/storyboardWidget/screenAuthorityCollectivePan'

export type FlowCanvasDrag =
  | null
  | {
      type: 'pan'
      startSx: number
      startSy: number
      startTx: number
      startTy: number
      interactionSpeed: number
      pointerId: number
      useStoryboardWidgetScreenAuthorityPan?: boolean
      storyboardWidgetScreenAuthorityPan?: StoryboardWidgetScreenAuthorityPanSnapshot | null
    }
  | {
      type: 'pinch'
      pointerIdA: number
      pointerIdB: number
      startTransform: d3.ZoomTransform
      startA: { sx: number; sy: number }
      startB: { sx: number; sy: number }
      scaleExtent: { minK: number; maxK: number }
      zoomExponentMultiplier: number
      pointerId: number
    }
  | {
      type: 'nodes'
      memberNodeIds: string[]
      startWorldX: number
      startWorldY: number
      startNodePosById: Record<string, { x: number; y: number }>
      deltaClamp: null | { minDx: number; maxDx: number; minDy: number; maxDy: number }
      snapGrid: SnapGridConfig
      edgeScrollEnabled: boolean
      pointerId: number
    }
  | {
      type: 'node'
      nodeId: string
      startWorldX: number
      startWorldY: number
      startNodeX: number
      startNodeY: number
      clamp: null | { minX: number; maxX: number; minY: number; maxY: number }
      snapGrid: SnapGridConfig
      edgeScrollEnabled: boolean
      pointerId: number
    }
  | {
      type: 'group'
      groupId: string
      memberNodeIds: string[]
      startWorldX: number
      startWorldY: number
      startNodePosById: Record<string, { x: number; y: number }>
      deltaClamp: null | { minDx: number; maxDx: number; minDy: number; maxDy: number }
      snapGrid: SnapGridConfig
      edgeScrollEnabled: boolean
      pointerId: number
    }
  | {
      type: 'groupResize'
      groupId: string
      startWorldX: number
      startWorldY: number
      startBounds: { x: number; y: number; width: number; height: number }
      minWidth: number
      minHeight: number
      snapGrid: SnapGridConfig
      dragSensitivity: number
      dragDeadzonePx: number
      pointerId: number
    }
  | {
      type: 'lasso'
      startSx: number
      startSy: number
      lastSx: number
      lastSy: number
      pointerId: number
      mode: 'replace' | 'add' | 'remove'
      edgeScrollEnabled: boolean
    }

export type BindFlowCanvasNativeInteractionsArgs = {
  active: boolean
  storyboardWidgetSurfaceId?: string
  canvasEl: HTMLCanvasElement
  runtime: FlowNativeRuntime
  viewportControlsPreset: ViewportControlsPreset
  selectionOnDrag: boolean
  allowNodeDragOverride?: boolean
  collisionDuringDrag: boolean
  requestCommit: () => void
  buildDrawArgs: () => FlowNativeDrawArgs
  setSelectionBox: (next: null | { left: number; top: number; width: number; height: number }) => void
  onInteractionFrame?: () => void
  dragRef: React.MutableRefObject<FlowCanvasDrag>
  lastPointerInCanvasRef: React.MutableRefObject<null | { sx: number; sy: number; ts: number }>
  lastWheelIntentRef: React.MutableRefObject<null | { dir: 'in' | 'out'; ts: number }>
  zoomWheelGuardRef: React.MutableRefObject<ZoomWheelGuardState>
  userSelectLockPointerIdRef: React.MutableRefObject<number | null>
  positionsDirtySinceCommitRef: React.MutableRefObject<boolean>
  collisionSchemaRef: React.MutableRefObject<GraphSchema | null>
  collisionGraphDataRef: React.MutableRefObject<GraphData | null>
  collisionFlowConfigRef: React.MutableRefObject<FlowConfig | null>
  collisionPresentationRef: React.MutableRefObject<
    | {
        portHandles: { enabled: boolean; sizePx: number; offsetPx: number }
      }
    | null
  >
}
