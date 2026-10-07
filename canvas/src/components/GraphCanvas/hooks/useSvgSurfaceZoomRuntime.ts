import React from 'react'
import * as d3 from 'd3'
import { useShallow } from 'zustand/react/shallow'
import { createZoom } from '@/components/GraphCanvas/zoom'
import { useZoomEffects } from '@/components/GraphCanvas/hooks/useZoomEffects'
import { fitAllTransform } from '@/components/GraphCanvas/fit'
import { readFitAllOptions, readLayoutMode } from '@/components/GraphCanvas/layout/fitConfig'
import { useAutoZoomModes2d } from '@/features/zoom/useAutoZoomModes2d'
import { useContainerDims } from '@/hooks/useContainerDims'
import { useGraphStore } from '@/hooks/useGraphStore'
import { buildActive2dZoomViewKey } from '@/lib/canvas/active-2d-zoom-view-key'
import { commitZoomTransformToStore } from '@/lib/canvas/zoom-commit'
import type { Canvas2dRendererId } from '@/lib/config.render'
import { defaultSchema, type GraphSchema } from '@/lib/graph/schema'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import { createRafLatestScheduler } from '@/lib/react/rafLatestScheduler'
import { pickZoomStateForView } from '@/lib/canvas/zoom-effective'
import { pickInitialZoomTransform } from '@/lib/zoom/viewport'

import { prepareSvgForInteractiveViewport, buildSvgSurfaceGraphData, svgSurfaceGraphLayoutSignature, readSvgSurfaceFitViewportRect, computeSvgSurfaceWideTimelineFitTransform, type SvgSurfaceFitMode, type SvgSurfaceRuntime } from './svgSurfaceGeometry'
import { installSvgElementSelection, type SvgElementSelectionController, type SvgElementSelectionOptions } from './svgSurfaceSelection'
export { computeSvgSurfaceWideTimelineFitTransform, type SvgSurfaceFitMode } from './svgSurfaceGeometry'

type UseSvgSurfaceZoomRuntimeArgs = SvgElementSelectionOptions & {
  active: boolean
  rootRef: React.RefObject<HTMLElement | null>
  svgHostRef: React.RefObject<HTMLElement | null>
  svgMarkup: string
  rendererId: Canvas2dRendererId
  graphData: GraphData | null
  graphDataRevision: number
  svgSurfaceKey?: string
  svgFitMode?: SvgSurfaceFitMode
  selectedElementLabel?: string
  readRenderGraph?: (svgEl: SVGSVGElement, graphData: GraphData | null) => GraphData | null
  rendererOwnsSelection?: boolean
}

const normalizeSvgSurfaceZoomKey = (value: string | null | undefined): string => {
  return String(value || '').trim().replace(/[^\w:.-]+/g, '-').replace(/-+/g, '-')
}

export function useSvgSurfaceZoomRuntime(args: UseSvgSurfaceZoomRuntimeArgs): { selectedElementLabel: string } {
  const {
    active,
    rootRef,
    svgHostRef,
    svgMarkup,
    rendererId,
    graphData,
    graphDataRevision,
    svgSurfaceKey,
    svgFitMode = 'auto',
    selectedElementLabel,
    readSelectedElementLabel,
    resolveSelectedElementByLabel,
    readSelectedElementPeers,
    onSelectedElementLabelChange,
    readRenderGraph,
    rendererOwnsSelection = false,
  } = args
  const dims = useContainerDims(rootRef)
  const svgRef = React.useRef<SVGSVGElement | null>(null)
  const groupRef = React.useRef<SVGGElement | null>(null)
  const zoomRef = React.useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const selectionControllerRef = React.useRef<SvgElementSelectionController | null>(null)
  const labelsSelRef = React.useRef<d3.Selection<SVGTextElement, GraphNode, SVGGElement, unknown> | null>(null)
  const [runtime, setRuntime] = React.useState<SvgSurfaceRuntime | null>(null)
  const [renderGraphData, setRenderGraphData] = React.useState<GraphData | null>(null)
  const [internalSelectedElementLabel, setInternalSelectedElementLabel] = React.useState('')
  const selectedLabel = typeof selectedElementLabel === 'string' ? selectedElementLabel : internalSelectedElementLabel

  const {
    canvasRenderMode,
    canvas2dRenderer,
    collapsedGroupIds,
    documentSemanticMode,
    documentStructureBaselineLock,
    frontmatterModeEnabled,
    mediaPanelDensity,
    renderMediaAsNodes,
    schema,
    viewportControlsPreset,
  } = useGraphStore(useShallow(s => ({
    canvasRenderMode: s.canvasRenderMode,
    canvas2dRenderer: s.canvas2dRenderer,
    collapsedGroupIds: s.collapsedGroupIds,
    documentSemanticMode: s.documentSemanticMode,
    documentStructureBaselineLock: s.documentStructureBaselineLock,
    fitToScreenMode: s.fitToScreenMode,
    frontmatterModeEnabled: s.frontmatterModeEnabled,
    mediaPanelDensity: s.mediaPanelDensity,
    renderMediaAsNodes: s.renderMediaAsNodes,
    schema: s.schema,
    viewportControlsPreset: s.viewportControlsPreset,
  })))

  const effectiveSchema = (schema || defaultSchema) as GraphSchema
  const visualGraphData = React.useMemo(
    () => buildSvgSurfaceGraphData({ bounds: runtime?.bounds || null, graphData, rendererId, renderGraphData }),
    [graphData, rendererId, runtime?.bounds, renderGraphData],
  )
  const graphLayoutSignature = React.useMemo(() => svgSurfaceGraphLayoutSignature(visualGraphData), [visualGraphData])
  const viewportWidth = runtime?.viewport.width || dims.width
  const viewportHeight = runtime?.viewport.height || dims.height

  const zoomViewKey = React.useMemo(
    () => {
      const base = buildActive2dZoomViewKey({
        canvasRenderMode,
        canvas2dRenderer,
        schema: effectiveSchema,
        graphData,
        documentSemanticMode,
        frontmatterModeEnabled,
        documentStructureBaselineLock,
        renderMediaAsNodes,
        mediaPanelDensity,
        collapsedGroupIds,
      })
      const normalizedSurfaceKey = normalizeSvgSurfaceZoomKey(svgSurfaceKey)
      const normalizedFitMode = normalizeSvgSurfaceZoomKey(svgFitMode === 'wideTimeline' ? 'wideTimeline:v2' : svgFitMode)
      const suffix = [normalizedSurfaceKey, normalizedFitMode ? `fit:${normalizedFitMode}` : ''].filter(Boolean).join('::')
      return base && suffix ? `${base}::svg:${suffix}` : base
    },
    [
      canvas2dRenderer,
      canvasRenderMode,
      collapsedGroupIds,
      documentSemanticMode,
      documentStructureBaselineLock,
      effectiveSchema,
      frontmatterModeEnabled,
      graphData,
      mediaPanelDensity,
      renderMediaAsNodes,
      svgFitMode,
      svgSurfaceKey,
    ],
  )
  const zoomViewKeyRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    zoomViewKeyRef.current = zoomViewKey
  }, [zoomViewKey])
  const graphDataRevisionRef = React.useRef(graphDataRevision)
  React.useEffect(() => {
    graphDataRevisionRef.current = graphDataRevision
  }, [graphDataRevision])

  const dimsRef = React.useRef({ width: viewportWidth, height: viewportHeight })
  React.useEffect(() => {
    dimsRef.current = { width: viewportWidth, height: viewportHeight }
  }, [viewportHeight, viewportWidth])

  const zoomCommitSchedulerRef = React.useRef(
    createRafLatestScheduler<{ k: number; x: number; y: number }>(pending => {
      const store = useGraphStore.getState()
      const key = zoomViewKeyRef.current
      if (!key) return
      const currentDims = dimsRef.current
      commitZoomTransformToStore({
        state: {
          viewPinned: store.viewPinned,
          zoomState: store.zoomState,
          zoomStateByKey: store.zoomStateByKey,
          setZoomState: store.setZoomState,
          setZoomStateForKey: store.setZoomStateForKey,
        },
        zoomViewKey: key,
        transform: pending,
        viewportW: currentDims.width,
        viewportH: currentDims.height,
        graphDataRevision: graphDataRevisionRef.current,
      })
    }),
  )

  React.useLayoutEffect(() => {
    if (!active) return
    const host = svgHostRef.current
    const svgEl = host?.querySelector('svg')
    if (!(svgEl instanceof SVGSVGElement)) {
      svgRef.current = null
      groupRef.current = null
      setRuntime(null)
      return
    }
    const prepared = prepareSvgForInteractiveViewport({ svgEl, fitMode: svgFitMode })
    svgRef.current = svgEl
    groupRef.current = prepared.group
    setRuntime(prev => {
      const prevBounds = prev?.bounds
      if (
        prevBounds &&
        prevBounds.minX === prepared.bounds.minX &&
        prevBounds.minY === prepared.bounds.minY &&
        prevBounds.width === prepared.bounds.width &&
        prevBounds.height === prepared.bounds.height &&
        prev?.viewport.width === prepared.viewport.width &&
        prev?.viewport.height === prepared.viewport.height
      ) {
        return prev
      }
      return { revision: (prev?.revision || 0) + 1, bounds: prepared.bounds, viewport: prepared.viewport }
    })
  }, [active, dims.height, dims.width, svgFitMode, svgHostRef, svgMarkup])

  React.useEffect(() => {
    // Renderer layout effects can apply saved positions after viewport preparation.
    const svgEl = svgRef.current
    setRenderGraphData(active && svgEl && readRenderGraph ? readRenderGraph(svgEl, graphData) : null)
  }, [active, graphData, readRenderGraph, runtime, svgMarkup])

  useZoomEffects({
    svgRef,
    zoomRef,
    width: viewportWidth,
    height: viewportHeight,
    paused: !active,
    graphDataOverride: visualGraphData,
  })

  useAutoZoomModes2d({
    viewportW: viewportWidth,
    viewportH: viewportHeight,
    paused: !active,
    getGraph: React.useCallback(
      () => ({ graphData: visualGraphData, graphDataRevision, graphLayoutSignature }),
      [graphDataRevision, visualGraphData, graphLayoutSignature],
    ),
  })

  React.useEffect(() => {
    if (!active) return
    const svgEl = svgRef.current
    const groupEl = groupRef.current
    if (!svgEl || !groupEl || !runtime) return
    const svg = d3.select(svgEl)
    const group = d3.select(groupEl)
    const scheduler = zoomCommitSchedulerRef.current
    const zoom = createZoom(
      svg,
      group,
      labelsSelRef,
      effectiveSchema,
      viewportControlsPreset,
      transform => {
        if (!active) return
        svgEl.setAttribute('data-kg-svg-zoom-k', String(Number.isFinite(transform.k) ? transform.k : 1))
        svgEl.setAttribute('data-kg-svg-zoom-x', String(Number.isFinite(transform.x) ? transform.x : 0))
        svgEl.setAttribute('data-kg-svg-zoom-y', String(Number.isFinite(transform.y) ? transform.y : 0))
        scheduler.schedule({ k: transform.k, x: transform.x, y: transform.y })
      },
      undefined,
      () => active,
    )
    zoomRef.current = zoom

    const store = useGraphStore.getState()
    const initialZoomState = pickZoomStateForView({
      zoomViewKey,
      zoomStateByKey: store.zoomStateByKey,
      viewPinned: store.viewPinned === true,
      fitToScreenMode: store.fitToScreenMode === true,
      zoomToSelectionMode: store.zoomToSelectionMode === true,
    })
    const initial = pickInitialZoomTransform({
      zoomState: initialZoomState,
      pinned: store.viewPinned === true,
      graphDataRevision,
      nextViewportW: viewportWidth,
      nextViewportH: viewportHeight,
    })
    if (initial) {
      svg.call(zoom.transform as never, d3.zoomIdentity.translate(initial.x, initial.y).scale(initial.k))
    } else if (visualGraphData && viewportWidth > 80 && viewportHeight > 80) {
      const mode = readLayoutMode(effectiveSchema)
      const timelineFitted = svgFitMode === 'wideTimeline'
        ? (() => {
            const fitViewport = readSvgSurfaceFitViewportRect(svgEl, svgFitMode, {
              width: viewportWidth,
              height: viewportHeight,
            })
            svgEl.setAttribute('data-kg-svg-fit-viewport-w', String(fitViewport.width))
            svgEl.setAttribute('data-kg-svg-fit-viewport-h', String(fitViewport.height))
            return computeSvgSurfaceWideTimelineFitTransform({
              bounds: runtime.bounds,
              viewportWidth: fitViewport.width,
              viewportHeight: fitViewport.height,
            })
          })()
        : null
      const fitted = timelineFitted || fitAllTransform(visualGraphData.nodes, viewportWidth, viewportHeight, {
        ...readFitAllOptions({
          schema: effectiveSchema,
          mode,
          intent: 'fitToScreen',
          targetFillRatioOverride: store.viewportFitFillRatio,
        }),
        graphData: visualGraphData,
      })
      svgEl.setAttribute('data-kg-svg-fit-mode', svgFitMode)
      svgEl.setAttribute('data-kg-svg-fit-policy', timelineFitted ? 'wideTimeline' : 'fitAll')
      svg.call(zoom.transform as never, fitted)
    } else {
      svg.call(zoom.transform as never, d3.zoomIdentity)
    }

    const selectionController = rendererOwnsSelection ? null : installSvgElementSelection({
      svgEl,
      readSelectedElementLabel,
      resolveSelectedElementByLabel,
      readSelectedElementPeers,
      onSelectedElementLabelChange: label => {
        setInternalSelectedElementLabel(label)
        onSelectedElementLabelChange?.(label)
      },
    })
    selectionControllerRef.current = selectionController
    if (typeof selectedElementLabel === 'string') {
      selectionController?.setSelectedElementByLabel(selectedElementLabel, { notify: false })
    }

    return () => {
      if (selectionControllerRef.current === selectionController) {
        selectionControllerRef.current = null
      }
      selectionController?.cleanup()
      const any = svgEl as unknown as { __kgViewportControllerDestroy?: (() => void) | null; __kgWindowGestureDestroy?: (() => void) | null }
      if (typeof any.__kgViewportControllerDestroy === 'function') {
        try {
          any.__kgViewportControllerDestroy()
        } catch {
          void 0
        }
        any.__kgViewportControllerDestroy = null
      }
      if (typeof any.__kgWindowGestureDestroy === 'function') {
        try {
          any.__kgWindowGestureDestroy()
        } catch {
          void 0
        }
        any.__kgWindowGestureDestroy = null
      }
      try {
        svg.on('.zoom', null)
        svg.on('.kgInfiniteViewport', null)
        svg.on('.kgGestureZoom', null)
      } catch {
        void 0
      }
      scheduler.cancel()
      zoomRef.current = null
    }
  }, [
    active,
    effectiveSchema,
    graphDataRevision,
    onSelectedElementLabelChange,
    readSelectedElementLabel,
    readSelectedElementPeers,
    resolveSelectedElementByLabel,
    rendererOwnsSelection,
    runtime,
    svgFitMode,
    svgMarkup,
    viewportHeight,
    viewportControlsPreset,
    viewportWidth,
    visualGraphData,
    zoomViewKey,
  ])

  React.useEffect(() => {
    if (!active) return
    const selectionController = selectionControllerRef.current
    if (!selectionController || typeof selectedElementLabel !== 'string') return
    selectionController.setSelectedElementByLabel(selectedElementLabel, { notify: false })
  }, [active, selectedElementLabel, svgMarkup])

  return { selectedElementLabel: selectedLabel }
}
