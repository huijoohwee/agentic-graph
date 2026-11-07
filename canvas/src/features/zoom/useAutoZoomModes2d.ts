import React from 'react'
import type { GraphSchema } from '@/lib/graph/schema'
import { useGraphStore } from '@/hooks/useGraphStore'
import { isWorkspaceGraphMutationBlocked } from '@/features/workspace-table/workspaceTableSsot'
import { shouldAutoFitToScreen2d, shouldAutoZoomSelection2d } from '@/features/zoom/autoZoom2dPolicy'
import type { GraphData } from '@/lib/graph/types'
import { buildAutoFitToScreenSignature, buildAutoZoomSelectionSignature } from '@/lib/zoom/autoModeSignatures'
import { resolveFitReferenceFrame } from '@/components/FlowCanvas/fitRuntime'
import { dispatchRuntimeFitIntentSoon, dispatchRuntimeZoomActionSoon } from '@/lib/canvas/runtimeZoomDispatch'
import { isStoryboardCanvas2dRenderer } from '@/lib/config.render'
import { buildOverlayTopologyLayoutSignature } from '@/lib/storyboardWidget/overlayTopologyLayoutSignature'

type AutoZoomGraph = { graphData: GraphData | null; graphDataRevision: number; graphLayoutSignature?: string }

export function useAutoZoomModes2d(args: {
  viewportW: number
  viewportH: number
  paused?: boolean
  getGraph?: () => AutoZoomGraph | null
}) {
  const arrayEq = (a: unknown, b: unknown): boolean => {
    const aa = Array.isArray(a) ? a : []
    const bb = Array.isArray(b) ? b : []
    if (aa.length !== bb.length) return false
    for (let i = 0; i < aa.length; i += 1) {
      if (String(aa[i] || '') !== String(bb[i] || '')) return false
    }
    return true
  }

  const scheduleFitRef = React.useRef<(() => void) | null>(null)
  const scheduleSelectionRef = React.useRef<(() => void) | null>(null)
  const dimsRef = React.useRef({ viewportW: args.viewportW, viewportH: args.viewportH })
  React.useEffect(() => {
    dimsRef.current = { viewportW: args.viewportW, viewportH: args.viewportH }
    const schedule = scheduleFitRef.current
    if (schedule) schedule()
    scheduleSelectionRef.current?.()
  }, [args.viewportH, args.viewportW])

  const pausedRef = React.useRef<boolean>(!!args.paused)
  React.useEffect(() => {
    pausedRef.current = !!args.paused
  }, [args.paused])

  const lastFitSigRef = React.useRef<string | null>(null)
  const lastAutoZoomSelRef = React.useRef<string | null>(null)
  const graphOverrideRef = React.useRef<(() => AutoZoomGraph | null) | null>(null)
  React.useEffect(() => {
    graphOverrideRef.current = typeof args.getGraph === 'function' ? args.getGraph : null
    lastFitSigRef.current = null
    const schedule = scheduleFitRef.current
    if (schedule) schedule()
    scheduleSelectionRef.current?.()
  }, [args.getGraph])

  React.useEffect(() => {
    if (pausedRef.current) {
      scheduleFitRef.current = null
      lastFitSigRef.current = null
      return
    }
    let rafId: number | null = null
    const schedule = () => {
      if (pausedRef.current) return
      if (rafId != null) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        if (pausedRef.current) return
        const state = useGraphStore.getState()
        if (isWorkspaceGraphMutationBlocked(state)) return
        if (
          !shouldAutoFitToScreen2d({
            canvas2dRenderer: String(state.canvas2dRenderer || ''),
            viewPinned: state.viewPinned === true,
            fitToScreenMode: state.fitToScreenMode === true,
            zoomToSelectionMode: state.zoomToSelectionMode === true,
          })
        ) {
          lastFitSigRef.current = null
          return
        }
        const override = graphOverrideRef.current ? graphOverrideRef.current() : null
        const graphData = override?.graphData ?? state.graphData
        const graphDataRevision = override?.graphDataRevision ?? state.graphDataRevision
        const nodes = Array.isArray(graphData?.nodes) ? graphData.nodes : []
        if (nodes.length === 0) return
        if (state.lifecycleStage !== 'rendering') {
          lastFitSigRef.current = null
          return
        }
        const panelDims = {
          ...resolveFitReferenceFrame({
            viewportW: dimsRef.current.viewportW,
            viewportH: dimsRef.current.viewportH,
            referenceWidth: state.viewportFitReferenceWidth,
            referenceHeight: state.viewportFitReferenceHeight,
          }),
        }
        const schema = state.schema as GraphSchema | null
        const graphLayoutSignature = override?.graphLayoutSignature || (isStoryboardCanvas2dRenderer(state.canvas2dRenderer)
          ? buildOverlayTopologyLayoutSignature(graphData)
          : '')
        const fitGraphDataRevision = graphLayoutSignature ? 0 : graphDataRevision
        const visibilityFrameKey = graphLayoutSignature ? '' : state.workspaceGraphMutationBlockKey
        const sig = buildAutoFitToScreenSignature({
          nodeCount: nodes.length,
          viewportW: panelDims.width,
          viewportH: panelDims.height,
          graphDataRevision: fitGraphDataRevision,
          graphLayoutSignature,
          schema,
          mediaPanelDensity: state.mediaPanelDensity,
          renderMediaAsNodes: state.renderMediaAsNodes === true,
          visibilityFrameKey,
        })
        if (lastFitSigRef.current === sig) return
        lastFitSigRef.current = sig
        dispatchRuntimeFitIntentSoon('fitToScreen')
      })
    }
    scheduleFitRef.current = schedule
    schedule()
    const unsub = useGraphStore.subscribe(
      s => ({
        canvas2dRenderer: s.canvas2dRenderer,
        fitToScreenMode: s.fitToScreenMode,
        zoomToSelectionMode: s.zoomToSelectionMode,
        viewPinned: s.viewPinned,
        lifecycleStage: s.lifecycleStage,
        graphDataRevision: s.graphDataRevision,
        graphNodeCount: Array.isArray(s.graphData?.nodes) ? s.graphData.nodes.length : 0,
        fitPadding: s.schema?.layout?.fitPadding,
        fitDetectClusters: s.schema?.layout?.fitDetectClusters,
        fitTargetAspectRatio: s.schema?.layout?.fitTargetAspectRatio,
        fitEnforceAspectRatio: s.schema?.layout?.fitEnforceAspectRatio,
        zoomMinScale: s.schema?.performance?.zoom?.minScale,
        zoomMaxScale: s.schema?.performance?.zoom?.maxScale,
        mediaPanelDensity: s.mediaPanelDensity,
        renderMediaAsNodes: s.renderMediaAsNodes,
        viewportFitReferenceWidth: s.viewportFitReferenceWidth,
        viewportFitReferenceHeight: s.viewportFitReferenceHeight,
        workspaceGraphMutationBlockKey: s.workspaceGraphMutationBlockKey,
      }),
      () => schedule(),
      {
        equalityFn: (a, b) => {
          if (a.canvas2dRenderer !== b.canvas2dRenderer) return false
          if (a.fitToScreenMode !== b.fitToScreenMode) return false
          if (a.zoomToSelectionMode !== b.zoomToSelectionMode) return false
          if (a.viewPinned !== b.viewPinned) return false
          if (a.lifecycleStage !== b.lifecycleStage) return false
          if (a.graphDataRevision !== b.graphDataRevision) return false
          if (a.graphNodeCount !== b.graphNodeCount) return false
          if (a.fitPadding !== b.fitPadding) return false
          if (a.fitDetectClusters !== b.fitDetectClusters) return false
          if (a.fitTargetAspectRatio !== b.fitTargetAspectRatio) return false
          if (a.fitEnforceAspectRatio !== b.fitEnforceAspectRatio) return false
          if (a.zoomMinScale !== b.zoomMinScale) return false
          if (a.zoomMaxScale !== b.zoomMaxScale) return false
          if (a.mediaPanelDensity !== b.mediaPanelDensity) return false
          if (a.renderMediaAsNodes !== b.renderMediaAsNodes) return false
          if (a.viewportFitReferenceWidth !== b.viewportFitReferenceWidth) return false
          if (a.viewportFitReferenceHeight !== b.viewportFitReferenceHeight) return false
          if (a.workspaceGraphMutationBlockKey !== b.workspaceGraphMutationBlockKey) return false
          return true
        },
      },
    )
    return () => {
      unsub()
      scheduleFitRef.current = null
      if (rafId != null) cancelAnimationFrame(rafId)
    }
  }, [args.paused])

  React.useEffect(() => {
    if (pausedRef.current) {
      scheduleSelectionRef.current = null
      lastAutoZoomSelRef.current = null
      return
    }
    let rafId: number | null = null
    let coveredRequestKey: string | null = null
    const readSelectionKey = (state: ReturnType<typeof useGraphStore.getState>): string | null => {
      const override = graphOverrideRef.current ? graphOverrideRef.current() : null
      const graphData = override?.graphData ?? state.graphData
      const graphLayoutSignature = override?.graphLayoutSignature || (isStoryboardCanvas2dRenderer(state.canvas2dRenderer)
        ? buildOverlayTopologyLayoutSignature(graphData)
        : '')
      const graphDataRevision = graphLayoutSignature ? 0 : (override?.graphDataRevision ?? state.graphDataRevision)
      const selectionKey = buildAutoZoomSelectionSignature({
        graphDataRevision,
        graphLayoutSignature,
        selectedNodeId: state.selectedNodeId,
        selectedEdgeId: state.selectedEdgeId,
        selectedGroupId: state.selectedGroupId,
        selectedNodeIds: state.selectedNodeIds,
        selectedEdgeIds: state.selectedEdgeIds,
        selectedGroupIds: state.selectedGroupIds,
      })
      return selectionKey ? `${selectionKey}|${dimsRef.current.viewportW}x${dimsRef.current.viewportH}` : null
    }
    const schedule = () => {
      if (pausedRef.current) return
      const state = useGraphStore.getState(), request = state.zoomRequest
      // A consumed request covers only the target observed while it was pending.
      if (request?.type === 'selection' && request.origin === 'selectionMode') coveredRequestKey = readSelectionKey(state)
      if (rafId != null) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        const alreadyRequestedKey = coveredRequestKey
        coveredRequestKey = null
        if (pausedRef.current) return
        const state = useGraphStore.getState()
        if (isWorkspaceGraphMutationBlocked(state)) return
        if (
          !shouldAutoZoomSelection2d({
            canvas2dRenderer: String(state.canvas2dRenderer || ''),
            viewPinned: state.viewPinned === true,
            zoomToSelectionMode: state.zoomToSelectionMode === true,
          })
        ) {
          lastAutoZoomSelRef.current = null
          return
        }
        const schema = state.schema as GraphSchema | null
        const expansionCfg = schema?.behavior?.expansion || {}
        const expansionEnabled = expansionCfg.enabled !== false
        const zoomOnSelection = expansionEnabled && expansionCfg.zoomOnSelection !== false
        if (!zoomOnSelection) return
        const key = readSelectionKey(state)
        if (!key) return
        if (lastAutoZoomSelRef.current === key) return
        lastAutoZoomSelRef.current = key
        if (alreadyRequestedKey !== key) dispatchRuntimeZoomActionSoon('selection', { origin: 'selectionMode' })
      })
    }
    scheduleSelectionRef.current = schedule
    schedule()
    const unsub = useGraphStore.subscribe(
      s => ({
        canvas2dRenderer: s.canvas2dRenderer,
        zoomToSelectionMode: s.zoomToSelectionMode,
        selectedNodeId: s.selectedNodeId,
        selectedEdgeId: s.selectedEdgeId,
        selectedGroupId: s.selectedGroupId,
        selectedNodeIds: s.selectedNodeIds,
        selectedEdgeIds: s.selectedEdgeIds,
        selectedGroupIds: s.selectedGroupIds,
        graphDataRevision: s.graphDataRevision,
        viewPinned: s.viewPinned,
      }),
      () => schedule(),
      {
        equalityFn: (a, b) => {
          if (a.canvas2dRenderer !== b.canvas2dRenderer) return false
          if (a.zoomToSelectionMode !== b.zoomToSelectionMode) return false
          if (a.selectedNodeId !== b.selectedNodeId) return false
          if (a.selectedEdgeId !== b.selectedEdgeId) return false
          if (a.selectedGroupId !== b.selectedGroupId) return false
          if (!arrayEq(a.selectedNodeIds, b.selectedNodeIds)) return false
          if (!arrayEq(a.selectedEdgeIds, b.selectedEdgeIds)) return false
          if (!arrayEq(a.selectedGroupIds, b.selectedGroupIds)) return false
          if (a.graphDataRevision !== b.graphDataRevision) return false
          if (a.viewPinned !== b.viewPinned) return false
          return true
        },
      },
    )
    return () => {
      unsub()
      scheduleSelectionRef.current = null
      if (rafId != null) cancelAnimationFrame(rafId)
    }
  }, [args.paused])
}
